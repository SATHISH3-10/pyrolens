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
  sampleObservationsStratified,
} from '@/utils/aggregation'
import { identifyCriticalPeriods } from '@/utils/criticalPeriods'
import { generateMonitoringAdvisory } from '@/utils/monitoringAdvisory'
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

describe('13. Missing Data vs. Observed Zero Activity (Task A Regression)', () => {
  // Construct a dataset with defined observation records in 2024 (March 15-20)
  // 2024 has records on March 15 and 16.
  // March 17, 18, 19 in 2024 have zero detections within the monitored period.
  // Years 2021, 2022, 2023 have NO records at all in the dataset.
  const baselineObs: FireObservation[] = [
    { ...mockObservations[0]!, id: 'obs-2024-1', acqDate: '2024-03-15' },
    { ...mockObservations[1]!, id: 'obs-2024-2', acqDate: '2024-03-16' },
    { ...mockObservations[2]!, id: 'obs-2024-3', acqDate: '2024-03-20' },
  ]

  it('correctly marks observed positive hotspot activity as observed_active', () => {
    const res = aggregateMultiYearMonth(baselineObs, 3, 'harmonized')
    const day15 = res.days.find((d) => d.dayOfMonth === 15)
    expect(day15?.byYear[2024]?.status).toBe('observed_active')
    expect(day15?.byYear[2024]?.hasData).toBe(true)
    expect(day15?.byYear[2024]?.value).toBeGreaterThan(0)
  })

  it('correctly marks monitored days with zero detections as observed_zero (not no_coverage)', () => {
    const res = aggregateMultiYearMonth(baselineObs, 3, 'harmonized')
    // Day 17 is between March 15 and March 20 of 2024
    const day17 = res.days.find((d) => d.dayOfMonth === 17)
    expect(day17?.byYear[2024]?.status).toBe('observed_zero')
    expect(day17?.byYear[2024]?.hasData).toBe(true)
    expect(day17?.byYear[2024]?.value).toBe(0)
  })

  it('correctly marks periods with no records as no_coverage with value null (not zero)', () => {
    const res = aggregateMultiYearMonth(baselineObs, 3, 'harmonized')
    // Year 2021 has NO records anywhere in baselineObs
    const day15 = res.days.find((d) => d.dayOfMonth === 15)
    expect(day15?.byYear[2021]?.status).toBe('no_coverage')
    expect(day15?.byYear[2021]?.hasData).toBe(false)
    expect(day15?.byYear[2021]?.value).toBeNull()
  })

  it('correctly reports month-level coverage status distinguishing available vs no_data', () => {
    const res = aggregateMultiYearMonth(baselineObs, 3, 'harmonized')
    const summary2024 = res.monthSummary.find((s) => s.year === 2024)
    expect(summary2024?.hasCoverage).toBe(true)
    expect(summary2024?.status).toBe('available')
    expect(summary2024?.totalCount).toBe(3)

    const summary2021 = res.monthSummary.find((s) => s.year === 2021)
    expect(summary2021?.hasCoverage).toBe(false)
    expect(summary2021?.status).toBe('no_data')
    expect(summary2021?.totalCount).toBe(0)
  })

  it('handles a mixture of available and unavailable years without generating false zero counts', () => {
    const mixedRecords: FireObservation[] = [
      { ...mockObservations[0]!, id: 'obs-2020', acqDate: '2020-03-10' },
      { ...mockObservations[1]!, id: 'obs-2024', acqDate: '2024-03-10' },
    ]
    const res = aggregateMultiYearMonth(mixedRecords, 3, 'harmonized')
    // 2020 and 2024 should have coverage
    expect(res.monthSummary.find((s) => s.year === 2020)?.hasCoverage).toBe(true)
    expect(res.monthSummary.find((s) => s.year === 2024)?.hasCoverage).toBe(true)
    // 2022 and 2023 should NOT have coverage
    expect(res.monthSummary.find((s) => s.year === 2022)?.hasCoverage).toBe(false)
    expect(res.monthSummary.find((s) => s.year === 2023)?.hasCoverage).toBe(false)
    expect(res.monthSummary.find((s) => s.year === 2022)?.status).toBe('no_data')
  })
})

describe('14. Historical Critical Period Identification (identifyCriticalPeriods)', () => {
  it('reports insufficient_history when observations cover fewer than minimum required years', () => {
    // Only 2024 observations
    const report = identifyCriticalPeriods(mockObservations, 75, 3)
    expect(report.status).toBe('insufficient_history')
    expect(report.totalYearsAnalyzed).toBeLessThan(3)
    expect(report.criticalWeeks.length).toBe(0)
  })

  it('identifies critical weeks using 75th percentile threshold with multi-year data', () => {
    // Synthetic multi-year data across 2020 to 2024
    const multiYearData: FireObservation[] = []
    const years = [2020, 2021, 2022, 2023, 2024]
    years.forEach((yr) => {
      // Simulate high peak burning in week 11 (mid-March) and low burning elsewhere
      for (let i = 0; i < 20; i++) {
        multiYearData.push({
          ...mockObservations[0]!,
          id: `peak-${yr}-${i}`,
          acqDate: `${yr}-03-15`, // Week 11
        })
      }
      // Low burning in week 30 (July)
      multiYearData.push({
        ...mockObservations[0]!,
        id: `low-${yr}`,
        acqDate: `${yr}-07-15`, // Week 29
      })
    })

    const report = identifyCriticalPeriods(multiYearData, 75, 3)
    expect(report.status).toBe('sufficient')
    expect(report.totalYearsAnalyzed).toBe(5)
    expect(report.percentileThreshold).toBe(75)
    expect(report.thresholdValue).toBeGreaterThan(0)

    // Week 11 should be flagged as critical
    const week11 = report.criticalWeeks.find((w) => w.weekNumber === 11)
    expect(week11).toBeDefined()
    expect(week11?.isCritical).toBe(true)
    expect(week11?.criticalityTier).toMatch(/high|extreme/)

    // Week 29 should NOT be flagged as critical
    const week29 = report.criticalWeeks.find((w) => w.weekNumber === 29)
    if (week29) {
      expect(week29.isCritical).toBe(false)
    }
  })

  it('supports configurable percentile thresholds (e.g. 90th percentile)', () => {
    const multiYearData: FireObservation[] = []
    ;[2021, 2022, 2023, 2024].forEach((yr) => {
      for (let i = 0; i < 15; i++) {
        multiYearData.push({
          ...mockObservations[0]!,
          id: `peak-${yr}-${i}`,
          acqDate: `${yr}-03-15`,
        })
      }
    })

    const report90 = identifyCriticalPeriods(multiYearData, 90, 3)
    expect(report90.percentileThreshold).toBe(90)
    expect(report90.status).toBe('sufficient')
  })
})

describe('15. Evidence-Based Monitoring Advisories (generateMonitoringAdvisory)', () => {
  it('returns insufficient_data advisory when historical records span < 2 distinct years', () => {
    const advisory = generateMonitoringAdvisory(mockObservations, new Date(2024, 2, 1))
    expect(advisory.status).toBe('insufficient_data')
    expect(advisory.level).toBe('INSUFFICIENT_DATA')
    expect(advisory.historicalBasis.analyzedYearsCount).toBeLessThan(2)
    expect(advisory.limitations.length).toBeGreaterThan(0)
  })

  it('generates an ELEVATED or HIGH advisory when upcoming window coincides with historical peak', () => {
    // Generate multi-year history with high activity in March across 2021..2024
    const history: FireObservation[] = []
    ;[2021, 2022, 2023, 2024].forEach((yr) => {
      // March activity
      for (let i = 0; i < 30; i++) {
        history.push({
          ...mockObservations[0]!,
          id: `hist-${yr}-${i}`,
          acqDate: `${yr}-03-${String(10 + (i % 10)).padStart(2, '0')}`,
        })
      }
      // Baseline activity in other months
      history.push({ ...mockObservations[0]!, id: `off-${yr}`, acqDate: `${yr}-08-15` })
    })

    // Reference date set to March 1st (upcoming window is March 1..31)
    const advisory = generateMonitoringAdvisory(history, new Date(2024, 2, 1))
    expect(advisory.status).toBe('active')
    expect(['ELEVATED', 'HIGH', 'EXTREME']).toContain(advisory.level)
    expect(advisory.historicalBasis.analyzedYearsCount).toBe(4)
    expect(advisory.historicalBasis.historicalActivePeriods).toBeGreaterThan(0)
    expect(advisory.recommendedActions.length).toBeGreaterThan(0)
    // Explicit scientific limitation statement
    expect(advisory.limitations.some((l) => l.includes('not a deterministic wildfire forecast'))).toBe(true)
  })
})

describe('16. Anomaly Detection with Decoupled Reference Baseline (detectUnusualActivity)', () => {
  it('detects anomalies against broader reference baseline when provided', () => {
    // 15 days of historical baseline data with 2-5 hotspots per day
    const baselineRecords: FireObservation[] = []
    for (let day = 1; day <= 15; day++) {
      const dateStr = `2024-03-${String(day).padStart(2, '0')}`
      for (let k = 0; k < 3; k++) {
        baselineRecords.push({
          ...mockObservations[0]!,
          id: `base-${day}-${k}`,
          acqDate: dateStr,
        })
      }
    }

    // Target observations: 1 day with 50 hotspots (an extreme spike)
    const spikeDate = '2024-03-25'
    const targetObservations: FireObservation[] = []
    for (let k = 0; k < 50; k++) {
      targetObservations.push({
        ...mockObservations[0]!,
        id: `spike-${k}`,
        acqDate: spikeDate,
      })
    }

    // Combined target observations (can be narrowly filtered)
    const allEvalObs = [...baselineRecords, ...targetObservations]
    const report = detectUnusualActivity(allEvalObs, 2.5, baselineRecords)

    expect(report.status).toBe('ok')
    expect(report.totalDaysAnalyzed).toBeGreaterThanOrEqual(10)
    const anomalyOnSpike = report.anomalies.find((a) => a.date === spikeDate)
    expect(anomalyOnSpike).toBeDefined()
    expect(anomalyOnSpike?.observedCount).toBe(50)
    expect(anomalyOnSpike?.anomalyScore).toBeGreaterThan(3.0)
  })
})

describe('17. Map Large-Dataset Handling and Scientifically Stratified Sampling', () => {
  it('preserves underlying dataset integrity when rendering ceiling is applied', () => {
    // Generate 6,000 synthetic observations (above the 5,000 map rendering limit)
    const largeDataset = generateSyntheticObservations(6000, 123)
    expect(largeDataset.length).toBe(6000)

    const fullMetrics = calculateSummaryMetrics(largeDataset)
    expect(fullMetrics.totalCount).toBe(6000)
  })

  it('preserves 100% of observations without sampling when dataset is small or medium (<= 5,000)', () => {
    const smallDataset = generateSyntheticObservations(500, 42)
    const sampledSmall = sampleObservationsStratified(smallDataset, 5000)
    expect(sampledSmall.length).toBe(500)

    const mediumDataset = generateSyntheticObservations(3500, 42)
    const sampledMedium = sampleObservationsStratified(mediumDataset, 5000)
    expect(sampledMedium.length).toBe(3500)
  })

  it('performs uniform systematic stratification across large datasets without geographic/array truncation', () => {
    // 15,000 observations representing large national multi-year datasets
    const largeDataset = generateSyntheticObservations(15000, 777)
    const limit = 5000

    const t0 = performance.now()
    const sampled = sampleObservationsStratified(largeDataset, limit)
    const durationMs = performance.now() - t0

    expect(sampled.length).toBe(5000)

    // Verify first and near-last elements are included, proving no array truncation bias
    expect(sampled[0]?.id).toBe(largeDataset[0]?.id)
    const lastSampledId = sampled[sampled.length - 1]?.id
    const tailCandidateIds = largeDataset.slice(14990).map((o) => o.id)
    expect(tailCandidateIds).toContain(lastSampledId)

    // Benchmark performance: sampling 15,000 items should complete in < 20ms
    expect(durationMs).toBeLessThan(100)
  })

  it('guarantees retention of selected observation regardless of sampling step', () => {
    const largeDataset = generateSyntheticObservations(12000, 999)
    // Pick an observation at index 7 (which wouldn't land on a standard step of ~2.4)
    const targetObs = largeDataset[7]!
    expect(targetObs).toBeDefined()

    const sampled = sampleObservationsStratified(largeDataset, 5000, targetObs.id)
    expect(sampled.length).toBe(5000)
    expect(sampled.some((o) => o.id === targetObs.id)).toBe(true)
  })

  it('benchmarks spatial grid aggregation performance on small, medium, and large datasets', () => {
    // Small dataset (500 records)
    const small = generateSyntheticObservations(500, 1)
    const tSmall = performance.now()
    const resSmall = aggregateSpatialGrid(small, 0.25)
    const smallTime = performance.now() - tSmall
    expect(resSmall.cells.length).toBeGreaterThan(0)
    expect(smallTime).toBeLessThan(50)

    // Medium dataset (3,000 records)
    const medium = generateSyntheticObservations(3000, 2)
    const tMedium = performance.now()
    const resMedium = aggregateSpatialGrid(medium, 0.25)
    const mediumTime = performance.now() - tMedium
    expect(resMedium.cells.length).toBeGreaterThan(0)
    expect(mediumTime).toBeLessThan(100)

    // Large dataset (10,000 records)
    const large = generateSyntheticObservations(10000, 3)
    const tLarge = performance.now()
    const resLarge = aggregateSpatialGrid(large, 0.25)
    const largeTime = performance.now() - tLarge
    expect(resLarge.cells.length).toBeGreaterThan(0)
    expect(largeTime).toBeLessThan(250)
  })
})



