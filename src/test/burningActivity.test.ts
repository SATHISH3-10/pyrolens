import { describe, expect, it } from 'vitest'
import type { FireObservation } from '@/types/fire'
import { generateAreaArchive } from '@/data/demoArchive'
import { STUDY_AREAS, toFirmsBbox } from '@/data/studyAreas'
import {
  addDays,
  analyzeBurningActivity,
  buildOutlook,
  classifyPercentile,
  clusterFireEvents,
  convexHull,
  doy365,
  explainDay,
} from '@/utils/burningActivity'

function obs(p: Partial<FireObservation> & { acqDate: string }): FireObservation {
  return {
    id: Math.random().toString(36).slice(2),
    latitude: 11,
    longitude: 77,
    acqTime: '0530',
    satellite: 'Terra',
    instrument: 'MODIS',
    confidence: 80,
    frp: 10,
    daynight: 'D',
    regionId: 't',
    regionName: 't',
    provenance: 'synthetic-demo',
    ...p,
  }
}

describe('BAI helpers', () => {
  it('folds Feb 29 onto a 365-day calendar', () => {
    expect(doy365('2023-03-01')).toBe(60)
    expect(doy365('2024-03-01')).toBe(60)
    expect(doy365('2024-02-29')).toBe(59)
    expect(doy365('2024-12-31')).toBe(365)
  })

  it('classifies percentiles using the spec thresholds', () => {
    expect(classifyPercentile(null)).toBe('none')
    expect(classifyPercentile(10)).toBe('low')
    expect(classifyPercentile(40)).toBe('moderate')
    expect(classifyPercentile(70)).toBe('high')
    expect(classifyPercentile(90)).toBe('very_high')
    expect(classifyPercentile(97)).toBe('extreme')
  })

  it('formats FIRMS bbox as west,south,east,north', () => {
    expect(toFirmsBbox({ minLat: 8, maxLat: 13.5, minLng: 76.2, maxLng: 80.35 })).toBe('76.2,8,80.35,13.5')
  })

  it('adds days across month boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })
})

describe('Harmonization model', () => {
  it('learns a VIIRS:MODIS factor from overlap years and scales MODIS-only days', () => {
    const records: FireObservation[] = []
    // 2010-2011: MODIS only (Terra). 2012-2015: MODIS + VIIRS with exactly 3 VIIRS per MODIS detection.
    for (let y = 2010; y <= 2015; y++) {
      for (let d = 1; d <= 28; d++) {
        const date = `${y}-03-${String(d).padStart(2, '0')}`
        records.push(obs({ acqDate: date, latitude: 11 + d * 0.2 }))
        if (y >= 2012) {
          for (let k = 0; k < 3; k++) {
            records.push(obs({ acqDate: date, instrument: 'VIIRS', satellite: 'Suomi-NPP', confidence: 'nominal', latitude: 11 + d * 0.2 + k * 0.001, acqTime: '0815' }))
          }
        }
      }
    }
    const a = analyzeBurningActivity(records)!
    expect(a.model.available).toBe(true)
    expect(a.model.factors[2]!.countRatio).toBeCloseTo(3, 5)
    const pre = a.days[a.dayIndex.get('2010-03-10')!]!
    expect(pre.source).toBe('modis_scaled')
    expect(pre.harmonizedCount).toBeCloseTo(3, 5)
    const post = a.days[a.dayIndex.get('2013-03-10')!]!
    expect(post.source).toBe('combined')
    expect(post.harmonizedCount).toBe(3)
  })

  it('removes low-confidence and duplicate detections', () => {
    const base = obs({ acqDate: '2020-01-01' })
    const a = analyzeBurningActivity([
      base,
      { ...base, id: 'dup' },
      obs({ acqDate: '2020-01-01', confidence: 10, latitude: 12 }),
      obs({ acqDate: '2020-01-01', instrument: 'VIIRS', satellite: 'NOAA-20', confidence: 'low', latitude: 13 }),
    ])!
    expect(a.totals.duplicatesRemoved).toBe(1)
    expect(a.totals.lowConfidenceRemoved).toBe(2)
    expect(a.days[0]!.modisCount).toBe(1)
  })
})

describe('Full pipeline on a demo archive', () => {
  const archive = generateAreaArchive('tamil_nadu')
  const a = analyzeBurningActivity(archive)!

  it('generates a deterministic multi-year archive with the VIIRS transition', () => {
    expect(generateAreaArchive('tamil_nadu')).toBe(archive)
    expect(archive.some((o) => o.instrument === 'VIIRS' && o.acqDate < '2012-01-20')).toBe(false)
    expect(archive.some((o) => o.satellite === 'NOAA-21' && o.acqDate < '2024-01-17')).toBe(false)
    expect(a.firstDate.startsWith('2003')).toBe(true)
  })

  it('produces a BAI in 0-100 with all classes represented', () => {
    for (const d of a.days) {
      expect(d.bai).toBeGreaterThanOrEqual(0)
      expect(d.bai).toBeLessThanOrEqual(100)
    }
    const classes = new Set(a.days.map((d) => d.cls))
    for (const c of ['none', 'low', 'moderate', 'high', 'very_high', 'extreme']) expect(classes.has(c as never)).toBe(true)
  })

  it('harmonization is unbiased out-of-sample', () => {
    const pts = a.model.validation.points
    const ratio = pts.reduce((s, p) => s + p.predicted, 0) / pts.reduce((s, p) => s + p.observed, 0)
    expect(ratio).toBeGreaterThan(0.9)
    expect(ratio).toBeLessThan(1.1)
  })

  it('finds critical periods of at least 3 days and flags limited-observation days', () => {
    expect(a.criticalPeriods.length).toBeGreaterThan(0)
    expect(a.criticalPeriods.every((p) => p.days >= 3)).toBe(true)
    expect(a.days.some((d) => d.quality === 'limited')).toBe(true)
  })

  it('derives a dry-season peak for Tamil Nadu', () => {
    expect(a.seasonNorms).not.toBeNull()
    expect(a.seasonNorms!.topMonths).toContain(3)
  })

  it('builds an outlook with reasons and four upcoming weeks', () => {
    const o = buildOutlook(a, '2024-03-20')!
    expect(['low', 'moderate', 'elevated', 'critical']).toContain(o.risk)
    expect(o.reasons.length).toBeGreaterThan(0)
    expect(o.upcoming).toHaveLength(4)
  })

  it('explains zero-detection days without claiming there was no fire', () => {
    const zero = a.days.find((d) => d.harmonizedCount === 0 && d.source !== 'none')!
    expect(explainDay(zero, a).join(' ')).toMatch(/never prove|data gap/)
  })

  it('runs the full pipeline for every study area within budget', () => {
    for (const area of STUDY_AREAS) {
      const t = performance.now()
      const res = analyzeBurningActivity(generateAreaArchive(area.id))
      expect(res).not.toBeNull()
      expect(performance.now() - t).toBeLessThan(3000)
    }
  })
})

describe('Fire event clustering', () => {
  it('merges adjacent detections across consecutive days but keeps distant fires apart', () => {
    const events = clusterFireEvents([
      obs({ acqDate: '2024-03-01', latitude: 11.0, longitude: 77.0 }),
      obs({ acqDate: '2024-03-01', latitude: 11.01, longitude: 77.01 }),
      obs({ acqDate: '2024-03-02', latitude: 11.02, longitude: 77.03 }),
      obs({ acqDate: '2024-03-01', latitude: 12.5, longitude: 78.5 }),
      obs({ acqDate: '2024-03-10', latitude: 11.0, longitude: 77.0 }),
    ])
    expect(events).toHaveLength(3)
    const big = events.find((e) => e.count === 3)!
    expect(big.durationDays).toBe(2)
    expect(big.hull.length).toBe(3)
  })

  it('computes a convex hull', () => {
    const hull = convexHull([
      [0, 0],
      [0, 2],
      [2, 2],
      [2, 0],
      [1, 1],
    ])
    expect(hull).toHaveLength(4)
  })
})
