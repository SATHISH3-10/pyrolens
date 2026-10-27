import { describe, expect, it } from 'vitest'
import type { FireObservation } from '@/types/fire'
import {
  ageBucket,
  buildDayBuckets,
  confidenceLevel,
  DEFAULT_MAP_FILTERS,
  detectionAgeHours,
  frpClass,
  matchesFilters,
  satelliteKey,
  sliceWindow,
  timeWindow,
} from '@/utils/mapFilters'
import { gibsTileUrl, selectGibsLayer, GIBS_MODIS_TERRA, GIBS_VIIRS_SNPP } from '@/components/map/gibs'
import { hotspotRadius, HOTSPOT_RADIUS } from '@/components/map/hotspotStyle'
import { toRGBA } from '@/components/map/colorUtils'
import { filterObservations } from '@/utils/aggregation'

function obs(p: Partial<FireObservation> & { acqDate: string }): FireObservation {
  return {
    id: Math.random().toString(36).slice(2),
    latitude: 11,
    longitude: 77,
    acqTime: '1200',
    satellite: 'N',
    instrument: 'VIIRS',
    confidence: 'nominal',
    frp: 10,
    daynight: 'D',
    regionId: 't',
    regionName: 't',
    provenance: 'synthetic-demo',
    ...p,
  }
}

const RANGE = { start: '2024-01-01', end: '2024-12-31' }
const FAR_FUTURE = Date.parse('2100-01-01T00:00:00Z')

describe('time windows', () => {
  it('"Selected day" spans exactly that UTC day', () => {
    const w = timeWindow('day', '2024-03-10', RANGE, FAR_FUTURE)
    expect(new Date(w.startMs).toISOString()).toBe('2024-03-10T00:00:00.000Z')
    expect(new Date(w.endMs).toISOString()).toBe('2024-03-11T00:00:00.000Z')
    expect([w.startDate, w.endDate]).toEqual(['2024-03-10', '2024-03-10'])
  })

  it('rolling windows end at the end of the playback day and reach back 24 h / 48 h / 7 days', () => {
    const w48 = timeWindow('48h', '2024-03-10', RANGE, FAR_FUTURE)
    expect(new Date(w48.startMs).toISOString()).toBe('2024-03-09T00:00:00.000Z')
    const w7 = timeWindow('7d', '2024-03-10', RANGE, FAR_FUTURE)
    expect(w7.startDate).toBe('2024-03-04')
    expect(w7.endDate).toBe('2024-03-10')
  })

  it('ends at "now" for a live day that has not finished yet', () => {
    const now = Date.parse('2024-03-10T09:30:00Z')
    const w = timeWindow('24h', '2024-03-10', RANGE, now)
    expect(w.endMs).toBe(now)
    expect(new Date(w.startMs).toISOString()).toBe('2024-03-09T09:30:00.000Z')
  })

  it('"All" covers the header date range', () => {
    const w = timeWindow('all', '2024-03-10', RANGE, FAR_FUTURE)
    expect([w.startDate, w.endDate]).toEqual(['2024-01-01', '2024-12-31'])
  })

  it('slices detections by acquisition time, not just by date', () => {
    const buckets = buildDayBuckets([
      obs({ acqDate: '2024-03-09', acqTime: '0800' }),
      obs({ acqDate: '2024-03-09', acqTime: '1000' }),
      obs({ acqDate: '2024-03-10', acqTime: '0900' }),
    ])
    const w = timeWindow('24h', '2024-03-10', RANGE, Date.parse('2024-03-10T09:30:00Z'))
    expect(sliceWindow(buckets, w).map((o) => `${o.acqDate} ${o.acqTime}`)).toEqual(['2024-03-09 1000', '2024-03-10 0900'])
  })
})

describe('detection age', () => {
  it('is measured from the window end, not from the real current time', () => {
    const o = obs({ acqDate: '2004-03-20', acqTime: '0830' })
    const end = timeWindow('day', '2004-03-20', RANGE, Date.now()).endMs
    expect(detectionAgeHours(o, end)).toBeCloseTo(15.5, 5)
  })

  it('buckets ages at the FIRMS boundaries', () => {
    expect(ageBucket(0.5)).toBe(0)
    expect(ageBucket(1)).toBe(1)
    expect(ageBucket(2.9)).toBe(1)
    expect(ageBucket(3)).toBe(2)
    expect(ageBucket(11.9)).toBe(3)
    expect(ageBucket(23.99)).toBe(4)
    expect(ageBucket(24)).toBe(5)
    expect(ageBucket(-2)).toBe(0) // after the window end counts as newest
  })
})

describe('FRP and confidence classes', () => {
  it('classifies per-pixel FRP and leaves missing FRP unclassified', () => {
    expect(frpClass(null)).toBeNull()
    expect(frpClass(5)).toBe('low')
    expect(frpClass(10)).toBe('moderate')
    expect(frpClass(30)).toBe('high')
    expect(frpClass(100)).toBe('extreme')
  })

  it('maps MODIS numeric and VIIRS letter confidence onto one scale', () => {
    expect(confidenceLevel({ confidence: 20 })).toBe('low')
    expect(confidenceLevel({ confidence: 50 })).toBe('nominal')
    expect(confidenceLevel({ confidence: 85 })).toBe('high')
    expect(confidenceLevel({ confidence: 'l' })).toBe('low')
    expect(confidenceLevel({ confidence: 'h' })).toBe('high')
  })

  it('clamps hotspot radius so very large fires do not hide neighbours', () => {
    expect(hotspotRadius(null)).toBe(HOTSPOT_RADIUS.min)
    expect(hotspotRadius(5000)).toBe(HOTSPOT_RADIUS.max)
    expect(hotspotRadius(40)).toBeGreaterThan(hotspotRadius(5))
  })
})

describe('satellite normalization', () => {
  it('maps real FIRMS codes and long names to one key', () => {
    expect(satelliteKey({ satellite: 'N', instrument: 'VIIRS' })).toBe('S-NPP')
    expect(satelliteKey({ satellite: 'Suomi-NPP', instrument: 'VIIRS' })).toBe('S-NPP')
    expect(satelliteKey({ satellite: 'N20', instrument: 'VIIRS' })).toBe('NOAA-20')
    expect(satelliteKey({ satellite: 'NOAA-21', instrument: 'VIIRS' })).toBe('NOAA-21')
    expect(satelliteKey({ satellite: 'T', instrument: 'MODIS' })).toBe('Terra')
    expect(satelliteKey({ satellite: 'Aqua', instrument: 'MODIS' })).toBe('Aqua')
  })
})

describe('filter combinations', () => {
  const data = [
    obs({ acqDate: '2024-03-10', satellite: 'N', confidence: 'high', frp: 50, daynight: 'D' }),
    obs({ acqDate: '2024-03-10', satellite: 'N20', confidence: 'low', frp: 5, daynight: 'N' }),
    obs({ acqDate: '2024-03-10', satellite: 'Terra', instrument: 'MODIS', confidence: 60, frp: null, daynight: 'D' }),
  ]
  const count = (f: Partial<typeof DEFAULT_MAP_FILTERS>) => data.filter((o) => matchesFilters(o, { ...DEFAULT_MAP_FILTERS, ...f })).length

  it('defaults keep everything', () => expect(count({})).toBe(3))
  it('combines satellite, confidence, FRP and day/night', () => {
    expect(count({ satellites: ['S-NPP', 'NOAA-20'] })).toBe(2)
    expect(count({ minConfidence: 'nominal' })).toBe(2)
    expect(count({ minFrp: 10 })).toBe(1) // null FRP never passes a minimum
    expect(count({ daynight: 'D', minConfidence: 'high' })).toBe(1)
    expect(count({ satellites: ['Terra'], daynight: 'N' })).toBe(0)
  })

  it('the shared filterObservations honours the same satellite and confidence fields', () => {
    const base = { sensor: 'ALL' as const, startDate: '', endDate: '', regionId: 'all' }
    expect(filterObservations(data, { ...base, satellites: ['Terra'] })).toHaveLength(1)
    expect(filterObservations(data, { ...base, minConfidence: 'high' })).toHaveLength(1)
  })
})

describe('NASA GIBS layer selection (ranges from GetCapabilities)', () => {
  it('prefers VIIRS S-NPP when it has imagery for the date', () => {
    expect(selectGibsLayer('2024-03-20')).toBe(GIBS_VIIRS_SNPP)
  })
  it('falls back to MODIS Terra before S-NPP imagery starts (2015-11-24), not at the 2012 launch', () => {
    expect(selectGibsLayer('2013-05-01')).toBe(GIBS_MODIS_TERRA)
    expect(selectGibsLayer('2015-11-23')).toBe(GIBS_MODIS_TERRA)
    expect(selectGibsLayer('2015-11-24')).toBe(GIBS_VIIRS_SNPP)
  })
  it('falls back to Terra inside an S-NPP gap and returns null when neither has imagery', () => {
    expect(selectGibsLayer('2022-08-01')).toBe(GIBS_MODIS_TERRA)
    expect(selectGibsLayer('1999-06-01')).toBeNull()
  })
  it('builds a GoogleMapsCompatible_Level9 WMTS URL for the date', () => {
    expect(gibsTileUrl(GIBS_VIIRS_SNPP, '2024-03-20')).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2024-03-20/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    )
  })
})

describe('colour tokens for deck.gl', () => {
  it('parses hex and rgb() token strings', () => {
    expect(toRGBA('#ff8a1f')).toEqual([255, 138, 31, 255])
    expect(toRGBA('rgb(57 135 229 / 0.2)')).toEqual([57, 135, 229, 51])
  })
})
