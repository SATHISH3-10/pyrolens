import { describe, expect, it } from 'vitest'
import type { CustomAoi, FireObservation, ObservationFilter } from '@/types/fire'
import {
  aggregateByDate,
  aggregateByMonth,
  aggregateMultiYearMonth,
  aggregateSpatialGrid,
  calculateSummaryMetrics,
  filterObservations,
  getGridCellKey,
  isPointInPolygon,
} from '@/utils/aggregation'
import { detectUnusualActivity } from '@/utils/anomalyDetection'
import {
  exportCustomAoiGeoJson,
  exportObservationsGeoJson,
  exportSpatialGridGeoJson,
} from '@/utils/exportUtils'
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

describe('7. Jordan Curve Theorem / Ray-Casting (isPointInPolygon)', () => {
  // Simple square polygon around (10, 70) to (12, 72)
  const polygon: Array<[number, number]> = [
    [10, 70],
    [12, 70],
    [12, 72],
    [10, 72],
  ]

  it('correctly determines that interior point is inside polygon', () => {
    expect(isPointInPolygon(11.0, 71.0, polygon)).toBe(true)
    expect(isPointInPolygon(10.5, 70.5, polygon)).toBe(true)
  })

  it('correctly determines that exterior point is outside polygon', () => {
    expect(isPointInPolygon(13.0, 71.0, polygon)).toBe(false)
    expect(isPointInPolygon(9.0, 71.0, polygon)).toBe(false)
    expect(isPointInPolygon(11.0, 73.0, polygon)).toBe(false)
    expect(isPointInPolygon(11.0, 69.0, polygon)).toBe(false)
  })

  it('handles degenerate polygons gracefully', () => {
    expect(isPointInPolygon(11.0, 71.0, [])).toBe(false)
    expect(isPointInPolygon(11.0, 71.0, [[10, 70], [12, 70]])).toBe(false)
  })
})

describe('8. Spatial Grid Cell Snapping (getGridCellKey)', () => {
  it('snaps coordinates to uniform grid corners invariant to sensor', () => {
    // Both points fall in the same 0.25° grid cell [11.25, 76.50]
    const key1 = getGridCellKey(11.45, 76.60, 0.25)
    const key2 = getGridCellKey(11.46, 76.65, 0.25)
    expect(key1).toBe('cell_11.250_76.500')
    expect(key2).toBe('cell_11.250_76.500')
    expect(key1).toBe(key2)

    // Point in a different cell
    const key3 = getGridCellKey(15.75, 78.95, 0.25)
    expect(key3).toBe('cell_15.750_78.750')
    expect(key3).not.toBe(key1)
  })
})

describe('9. Multi-Year Harmonization Aggregation (aggregateMultiYearMonth)', () => {
  const multiYearRecords: FireObservation[] = [
    {
      ...mockObservations[0]!,
      id: '2020-obs',
      acqDate: '2020-03-15',
    },
    {
      ...mockObservations[1]!,
      id: '2024-obs',
      acqDate: '2024-03-15',
    },
    {
      ...mockObservations[2]!,
      id: '2024-leap',
      acqDate: '2024-02-29', // Leap day
    },
    {
      ...mockObservations[3]!,
      id: '2026-obs',
      acqDate: '2026-03-20',
    },
  ]

  it('aggregates multi-year month data across available years correctly', () => {
    const res = aggregateMultiYearMonth(multiYearRecords, 3, 'harmonized')
    expect(res.years).toContain(2020)
    expect(res.years).toContain(2024)
    expect(res.years).toContain(2026)

    const summary2020 = res.monthSummary.find((s) => s.year === 2020)
    expect(summary2020?.totalCount).toBe(1)
    expect(summary2020?.harmonizedActiveCells).toBe(1)

    const summary2024 = res.monthSummary.find((s) => s.year === 2024)
    expect(summary2024?.totalCount).toBe(1)

    // Verify 31 days returned for March
    expect(res.days.length).toBe(31)
    // Day 15 should have value for 2020 and 2024
    const day15 = res.days.find((d) => d.dayOfMonth === 15)
    expect(day15?.byYear[2020]?.value).toBe(1)
    expect(day15?.byYear[2024]?.value).toBe(1)
  })

  it('handles leap day (Feb 29) correctly for leap vs non-leap years', () => {
    const febRes = aggregateMultiYearMonth(multiYearRecords, 2, 'harmonized')
    const feb29 = febRes.days.find((d) => d.dayOfMonth === 29)
    expect(feb29).toBeDefined()

    // 2020 and 2024 are leap years
    expect(feb29?.byYear[2024]?.isLeapDay).toBeFalsy()
    expect(feb29?.byYear[2024]?.value).toBe(1)

    // 2021 and 2023 are NOT leap years -> flagged isLeapDay: true
    expect(feb29?.byYear[2021]?.isLeapDay).toBe(true)
    expect(feb29?.byYear[2021]?.hasData).toBe(false)
  })
})

describe('10. Custom AOI Filtering (filterObservations with customAoi)', () => {
  it('filters out observations outside custom AOI polygon', () => {
    const aoi: CustomAoi = {
      name: 'Test AOI',
      points: [
        [11.0, 76.0],
        [12.0, 76.0],
        [12.0, 77.0],
        [11.0, 77.0],
      ],
      bounds: { minLat: 11.0, maxLat: 12.0, minLng: 76.0, maxLng: 77.0 },
      createdAt: '2026-10-23T00:00:00Z',
    }

    const filter: ObservationFilter = {
      sensor: 'ALL',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      regionId: 'all',
      customAoi: aoi,
    }

    const res = filterObservations(mockObservations, filter)
    // Only MODIS-1, VIIRS-2, VIIRS-3 are near (11.45, 76.75) which is inside [11..12, 76..77]
    expect(res.length).toBe(3)
    expect(res.every((o) => o.latitude >= 11.0 && o.latitude <= 12.0)).toBe(true)
  })
})

describe('11. Duplicate Record Suppression (parseFirmsCsv)', () => {
  it('detects and suppresses identical duplicate records in FIRMS CSV', () => {
    const duplicateCsv = `latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp
11.45,76.75,2024-03-15,0530,Terra,MODIS,85,35.0
11.45,76.75,2024-03-15,0530,Terra,MODIS,85,35.0
12.00,77.00,2024-03-15,0600,Terra,MODIS,80,20.0`

    const res = parseFirmsCsv(duplicateCsv, 'duplicates.csv')
    expect(res.success).toBe(true)
    expect(res.observations.length).toBe(2)
    expect(res.duplicateCount).toBe(1)
  })
})

describe('12. GeoJSON Export Utilities (exportUtils)', () => {
  it('safely generates GeoJSON for observations, grid cells, and custom AOI', () => {
    expect(() => exportObservationsGeoJson(mockObservations, 'test_obs.geojson')).not.toThrow()
    const { cells } = aggregateSpatialGrid(mockObservations, 0.25)
    expect(() => exportSpatialGridGeoJson(cells, 'test_grid.geojson')).not.toThrow()
    const aoi: CustomAoi = {
      name: 'Test AOI',
      points: [
        [11, 76],
        [12, 76],
        [12, 77],
        [11, 77],
      ],
      bounds: { minLat: 11, maxLat: 12, minLng: 76, maxLng: 77 },
      createdAt: '2026-10-23T00:00:00Z',
    }
    expect(() => exportCustomAoiGeoJson(aoi, 'test_aoi.geojson')).not.toThrow()
  })
})


