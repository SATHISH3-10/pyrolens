import { describe, expect, it } from 'vitest'
import type { FireObservation, ObservationFilter } from '@/types/fire'
import {
  aggregateByDate,
  aggregateByMonth,
  aggregateSpatialGrid,
  calculateSummaryMetrics,
  filterObservations,
} from '@/utils/aggregation'
import { detectUnusualActivity } from '@/utils/anomalyDetection'
import { parseFirmsCsv } from '@/data/firmsCsvImporter'
import { generateSyntheticObservations } from '@/data/syntheticData'

// Mock fixture observations
const mockObservations: FireObservation[] = [
  {
    id: 'MODIS-1',
    latitude: 11.45,
    longitude: 76.75,
    acqDate: '2024-03-15',
    acqTime: '0530',
    satellite: 'Terra',
    instrument: 'MODIS',
    confidence: 85,
    frp: 35.0,
    daynight: 'D',
    regionId: 'tamil_nadu',
    regionName: 'Tamil Nadu',
    provenance: 'synthetic-demo',
  },
  {
    id: 'VIIRS-2',
    latitude: 11.46,
    longitude: 76.76,
    acqDate: '2024-03-15',
    acqTime: '0610',
    satellite: 'Suomi-NPP',
    instrument: 'VIIRS',
    confidence: 'nominal',
    frp: 12.0,
    daynight: 'D',
    regionId: 'tamil_nadu',
    regionName: 'Tamil Nadu',
    provenance: 'synthetic-demo',
  },
  {
    id: 'VIIRS-3',
    latitude: 11.47,
    longitude: 76.77,
    acqDate: '2024-03-15',
    acqTime: '0610',
    satellite: 'Suomi-NPP',
    instrument: 'VIIRS',
    confidence: 'high',
    frp: null, // Test null FRP handling
    daynight: 'D',
    regionId: 'tamil_nadu',
    regionName: 'Tamil Nadu',
    provenance: 'synthetic-demo',
  },
  {
    id: 'MODIS-4',
    latitude: 15.75,
    longitude: 78.95,
    acqDate: '2024-03-16',
    acqTime: '0815',
    satellite: 'Aqua',
    instrument: 'MODIS',
    confidence: 72,
    frp: 25.0,
    daynight: 'D',
    regionId: 'andhra_pradesh',
    regionName: 'Andhra Pradesh',
    provenance: 'synthetic-demo',
  },
  {
    id: 'VIIRS-5',
    latitude: 14.5,
    longitude: 75.5,
    acqDate: '2024-04-10',
    acqTime: '1830',
    satellite: 'NOAA-20',
    instrument: 'VIIRS',
    confidence: 'low',
    frp: 8.5,
    daynight: 'N',
    regionId: 'karnataka',
    regionName: 'Karnataka',
    provenance: 'synthetic-demo',
  },
]

describe('1. Filtering Logic (filterObservations)', () => {
  it('filters by sensor instrument accurately', () => {
    const modisFilter: ObservationFilter = {
      sensor: 'MODIS',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      regionId: 'all',
    }
    const modisResult = filterObservations(mockObservations, modisFilter)
    expect(modisResult.length).toBe(2)
    expect(modisResult.every((o) => o.instrument === 'MODIS')).toBe(true)

    const viirsFilter: ObservationFilter = {
      sensor: 'VIIRS',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      regionId: 'all',
    }
    const viirsResult = filterObservations(mockObservations, viirsFilter)
    expect(viirsResult.length).toBe(3)
    expect(viirsResult.every((o) => o.instrument === 'VIIRS')).toBe(true)
  })

  it('filters by date range accurately', () => {
    const dateFilter: ObservationFilter = {
      sensor: 'ALL',
      startDate: '2024-03-16',
      endDate: '2024-03-31',
      regionId: 'all',
    }
    const res = filterObservations(mockObservations, dateFilter)
    expect(res.length).toBe(1)
    expect(res[0]?.id).toBe('MODIS-4')
  })

  it('filters by region bounds accurately', () => {
    const tnFilter: ObservationFilter = {
      sensor: 'ALL',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      regionId: 'tamil_nadu',
    }
    const res = filterObservations(mockObservations, tnFilter)
    expect(res.length).toBe(3)
    expect(res.every((o) => o.regionId === 'tamil_nadu')).toBe(true)
  })

  it('filters by Day/Night pass accurately', () => {
    const nightFilter: ObservationFilter = {
      sensor: 'ALL',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      regionId: 'all',
      daynight: 'N',
    }
    const res = filterObservations(mockObservations, nightFilter)
    expect(res.length).toBe(1)
    expect(res[0]?.daynight).toBe('N')
  })
})

describe('2. Summary Metrics Calculations (calculateSummaryMetrics)', () => {
  it('computes counts and safely calculates average FRP excluding nulls', () => {
    const metrics = calculateSummaryMetrics(mockObservations)
    expect(metrics.totalCount).toBe(5)
    expect(metrics.modisCount).toBe(2)
    expect(metrics.viirsCount).toBe(3)
    expect(metrics.distinctDatesCount).toBe(3) // 2024-03-15, 2024-03-16, 2024-04-10
    expect(metrics.validFrpCount).toBe(4) // 4 valid, 1 null

    // Valid FRP sum = 35 + 12 + 25 + 8.5 = 80.5; 80.5 / 4 = 20.125 -> 20.1
    expect(metrics.avgFrp).toBe(20.1)
    expect(metrics.maxFrp).toBe(35.0)
    expect(metrics.minFrp).toBe(8.5)
  })

  it('returns null for avgFrp when all observations have null FRP', () => {
    const nullFrpObs: FireObservation[] = [
      {
        ...mockObservations[0]!,
        frp: null,
      },
      {
        ...mockObservations[1]!,
        frp: null,
      },
    ]
    const metrics = calculateSummaryMetrics(nullFrpObs)
    expect(metrics.avgFrp).toBeNull()
    expect(metrics.validFrpCount).toBe(0)
  })

  it('aggregates observations by calendar date and month correctly', () => {
    const dates = aggregateByDate(mockObservations)
    expect(dates.length).toBe(3)
    expect(dates[0]?.date).toBe('2024-03-15')
    expect(dates[0]?.total).toBe(3)
    expect(dates[0]?.modis).toBe(1)
    expect(dates[0]?.viirs).toBe(2)

    const months = aggregateByMonth(mockObservations)
    expect(months.length).toBe(2) // March and April
    expect(months[0]?.monthKey).toBe('2024-03')
    expect(months[0]?.total).toBe(4)
    expect(months[1]?.monthKey).toBe('2024-04')
    expect(months[1]?.total).toBe(1)
  })
})

describe('3. Spatiotemporal Grid Aggregation (aggregateSpatialGrid)', () => {
  it('bins coordinates into spatial cells and determines coincidence', () => {
    // MODIS-1 (11.45, 76.75) and VIIRS-2 (11.46, 76.76) fall in same 0.25° grid cell [11.25, 76.5] to [11.5, 76.75]
    const { cells, metrics } = aggregateSpatialGrid(mockObservations, 0.25)

    expect(cells.length).toBeGreaterThan(0)
    expect(metrics.totalActiveCells).toBe(cells.length)

    // Check coincidence detection
    const coincidentCell = cells.find((c) => c.category === 'BOTH_COINCIDENT')
    expect(coincidentCell).toBeDefined()
    if (coincidentCell) {
      expect(coincidentCell.modisCount).toBeGreaterThan(0)
      expect(coincidentCell.viirsCount).toBeGreaterThan(0)
    }
  })
})

describe('4. Statistical Anomaly Detection (detectUnusualActivity)', () => {
  it('returns insufficient_baseline when fewer than 10 observation days exist', () => {
    const report = detectUnusualActivity(mockObservations, 2.5)
    expect(report.status).toBe('insufficient_baseline')
    expect(report.anomalies.length).toBe(0)
  })

  it('detects anomalous spike periods with sufficient baseline data', () => {
    const syntheticData = generateSyntheticObservations(1500)
    const report = detectUnusualActivity(syntheticData, 2.5)

    expect(report.status).toBe('ok')
    expect(report.totalDaysAnalyzed).toBeGreaterThanOrEqual(10)
    expect(report.baselineMedian).toBeGreaterThan(0)
    expect(report.thresholdValue).toBeGreaterThan(report.baselineMedian)

    // Verify all flagged anomalies exceed the threshold
    for (const anom of report.anomalies) {
      expect(anom.observedCount).toBeGreaterThan(report.thresholdValue)
      expect(anom.anomalyScore).toBeGreaterThanOrEqual(2.0)
    }
  })
})

describe('5. NASA FIRMS CSV Importer (parseFirmsCsv)', () => {
  it('parses valid FIRMS CSV with MODIS and VIIRS records', () => {
    const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
11.4521,76.7821,332.4,1.1,1.0,2024-03-15,0530,Terra,MODIS,85,6.1NRT,308.2,34.8,D
11.4682,76.7915,340.1,0.4,0.38,2024-03-15,0610,Suomi-NPP,VIIRS,nominal,2.0NRT,312.4,12.5,D`

    const res = parseFirmsCsv(csv, 'test_firms.csv')
    expect(res.success).toBe(true)
    expect(res.observations.length).toBe(2)
    expect(res.metadata.modisCount).toBe(1)
    expect(res.metadata.viirsCount).toBe(1)
    expect(res.observations[0]?.confidence).toBe(85)
    expect(res.observations[1]?.confidence).toBe('nominal')
  })

  it('handles invalid coordinates and missing dates gracefully', () => {
    const invalidCsv = `latitude,longitude,acq_date
95.0,76.0,2024-03-15
11.0,76.0,
12.0,77.0,2024-03-15`

    const res = parseFirmsCsv(invalidCsv, 'invalid.csv')
    expect(res.success).toBe(true)
    expect(res.observations.length).toBe(1) // only row 3 is valid
    expect(res.rejectedCount).toBe(2)
  })

  it('rejects empty or malformed files', () => {
    const emptyRes = parseFirmsCsv('', 'empty.csv')
    expect(emptyRes.success).toBe(false)
  })
})

describe('6. Deterministic Synthetic Dataset (generateSyntheticObservations)', () => {
  it('generates reproducible observations for the same seed', () => {
    const run1 = generateSyntheticObservations(100, 42)
    const run2 = generateSyntheticObservations(100, 42)
    expect(run1.length).toBe(100)
    expect(run2.length).toBe(100)
    expect(run1[0]?.id).toBe(run2[0]?.id)
    expect(run1[0]?.latitude).toBe(run2[0]?.latitude)
    expect(run1[0]?.longitude).toBe(run2[0]?.longitude)
  })
})
