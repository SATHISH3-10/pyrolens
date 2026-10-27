/**
 * Core types for active-fire hotspot observations, filtering, aggregation, and metadata.
 */

export type SensorType = 'MODIS' | 'VIIRS'

export type SatelliteName =
  | 'Terra'
  | 'Aqua'
  | 'Suomi-NPP'
  | 'NOAA-20'
  | 'NOAA-21'
  | string

export type ConfidenceCategory = 'low' | 'nominal' | 'high'
export type FireConfidence = number | ConfidenceCategory | string

export type DayNight = 'D' | 'N'

export type DataProvenance = 'synthetic-demo' | 'imported-firms-csv' | 'firms-live-api'

export type PrimaryMetricType = 'harmonized' | 'modis' | 'viirs' | 'raw_total' | 'frp'

export interface FireObservation {
  id: string
  latitude: number
  longitude: number
  brightness?: number // 4-micron channel brightness temp (Kelvin)
  brightT31?: number // 11/12-micron channel brightness temp (Kelvin)
  scan?: number
  track?: number
  acqDate: string // YYYY-MM-DD
  acqTime: string // HHMM (UTC)
  satellite: SatelliteName
  instrument: SensorType
  confidence: FireConfidence
  version?: string
  frp: number | null // Fire Radiative Power (MW) - null when not retrievable
  daynight: DayNight
  regionId: string
  regionName: string
  provenance: DataProvenance
}

export interface RegionDefinition {
  id: string
  name: string
  bounds: {
    minLat: number
    maxLat: number
    minLng: number
    maxLng: number
  }
  description: string
}

export interface CustomAoi {
  name: string
  points: Array<[number, number]> // [lat, lng] vertices
  bounds: {
    minLat: number
    maxLat: number
    minLng: number
    maxLng: number
  }
  createdAt: string
}

export interface ObservationFilter {
  sensor: 'ALL' | 'MODIS' | 'VIIRS'
  metricType?: PrimaryMetricType
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  regionId: string // 'all', specific region ID, or 'custom'
  customPolygon?: Array<[number, number]> // optional custom polygon vertices [lat, lng]
  customAoi?: CustomAoi | null
  daynight?: 'ALL' | 'D' | 'N'
  minConfidence?: number | 'low' | 'nominal' | 'high' | 'ALL'
  minFrp?: number
  gridResolution?: 0.1 | 0.25 | 0.5
  /** Normalized satellite keys to keep (Terra, Aqua, S-NPP, NOAA-20, NOAA-21); null/undefined = all. */
  satellites?: string[] | null
}

export interface DatasetMeta {
  source: DataProvenance
  isSynthetic: boolean
  title: string
  recordCount: number
  modisCount: number
  viirsCount: number
  distinctDatesCount: number
  dateRange: {
    start: string
    end: string
  }
  loadedAt: string
  fileName?: string
  rejectedCount?: number
  rejectedReasons?: string[]
  duplicateCount?: number
  totalRowsInFile?: number
}

export interface SummaryMetrics {
  totalCount: number
  modisCount: number
  viirsCount: number
  harmonizedActiveCells: number // Number of distinct spatial grid cells with active fire detection
  distinctDatesCount: number
  avgFrp: number | null
  validFrpCount: number
  maxFrp: number | null
  minFrp: number | null
  dateRange: {
    min: string
    max: string
  }
  modisAvgFrp: number | null
  viirsAvgFrp: number | null
  dayCount: number
  nightCount: number
}

export interface DateAggregate {
  date: string // YYYY-MM-DD
  total: number // Raw count sum (for single sensor or reference)
  harmonizedActiveCells: number // Harmonized spatial grid cells active on this date (resolution invariant)
  modis: number
  viirs: number
  avgFrp: number | null
  modisAvgFrp: number | null
  viirsAvgFrp: number | null
}

export interface MonthAggregate {
  monthKey: string // YYYY-MM
  label: string // e.g. "Mar 2024"
  monthNumber: number // 1-12
  year: number
  total: number
  harmonizedActiveCells: number
  modis: number
  viirs: number
  avgFrp: number | null
}

export interface MultiYearComparisonDay {
  date: string
  day: number
  rawTotal: number
  modisCount: number
  viirsCount: number
  harmonizedActiveCells: number
  avgFrp: number | null
}

export interface MultiYearComparisonRecord {
  year: number
  month: number
  days: MultiYearComparisonDay[]
  totalRawCount: number
  harmonizedActiveCellsTotal: number
  activeDaysCount: number
  peakDay: { date: string; value: number }
}

export interface RegionAggregate {
  regionId: string
  regionName: string
  total: number
  harmonizedActiveCells: number
  modis: number
  viirs: number
  avgFrp: number | null
}

export interface SpatialGridCell {
  cellId: string
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  centerLat: number
  centerLng: number
  modisCount: number
  viirsCount: number
  totalCount: number
  modisFrpSum: number
  viirsFrpSum: number
  avgFrp: number | null
  category: 'MODIS_ONLY' | 'VIIRS_ONLY' | 'BOTH_COINCIDENT'
}

export interface HarmonizationMetrics {
  gridCellSizeDegrees: number
  temporalInterval: 'daily' | 'weekly' | 'monthly'
  totalActiveCells: number
  coincidentCellsCount: number
  modisOnlyCellsCount: number
  viirsOnlyCellsCount: number
  jaccardSimilarityIndex: number // coincident / (modisOnly + viirsOnly + coincident)
  viirsToModisRatio: number | null // total viirs / total modis
  coincidentViirsToModisRatio: number | null
  avgModisFrp: number | null
  avgViirsFrp: number | null
}

export interface AnomalyRecord {
  date: string
  observedCount: number
  baselineValue: number
  thresholdValue: number
  anomalyScore: number // (observed - baseline) / MAD
  severity: 'moderate' | 'high' | 'extreme'
  explanation: string
}

export interface AnomalyReport {
  status: 'ok' | 'insufficient_baseline' | 'no_data'
  baselineMethod: 'Median Absolute Deviation (MAD)'
  baselineMedian: number
  madValue: number
  thresholdMultiplier: number
  thresholdValue: number
  totalDaysAnalyzed: number
  anomalies: AnomalyRecord[]
  disclaimer: string
}

export interface MultiYearMonthData {
  year: number
  month: number
  totalCount: number
  harmonizedActiveCells: number
  modisCount: number
  viirsCount: number
  avgFrp: number | null
  activeDaysCount: number
  isPartial: boolean
  hasCoverage: boolean
  status: 'available' | 'no_data' | 'partial'
  firstObsDate?: string
  lastObsDate?: string
}

export interface MultiYearDayData {
  dayOfMonth: number // 1..31
  byYear: Record<
    number,
    {
      value: number | null
      rawCount: number | null
      harmonizedCells: number | null
      hasData: boolean
      status: 'observed_active' | 'observed_zero' | 'no_coverage' | 'leap_day'
      isLeapDay?: boolean
    }
  >
}

export interface CriticalPeriodWeek {
  weekNumber: number // 1..52
  label: string // e.g. "Week 12 (Mid-March)"
  monthNumber: number // 1..12
  historicalMeanActiveCells: number
  historicalMedianActiveCells: number
  historicalMaxActiveCells: number
  totalDetections: number
  observedYearsCount: number
  isCritical: boolean
  isCriticalPeriod: boolean
  criticalityTier: 'extreme' | 'high' | 'moderate' | 'baseline'
}

export interface CriticalPeriodsReport {
  status: 'sufficient' | 'insufficient_history' | 'no_data' | 'ok'
  thresholdPercentile: number // e.g. 75
  percentileThreshold: number
  thresholdCutoffValue: number
  thresholdValue: number
  minSampleYearsRequired: number
  sampleYearsAvailable: number
  totalYearsAnalyzed: number
  criticalWeeks: CriticalPeriodWeek[]
  allWeeks: CriticalPeriodWeek[]
  peakSeasonSummary: string
  disclaimer: string
}

export type AdvisoryLevel =
  | 'critical_season_active'
  | 'critical_season_approaching'
  | 'moderate_monitoring'
  | 'low_activity_season'
  | 'insufficient_history'
  | 'INSUFFICIENT_DATA'
  | 'ELEVATED'
  | 'HIGH'
  | 'EXTREME'
  | 'LOW'

export interface MonitoringAdvisory {
  status: 'ok' | 'active' | 'insufficient_data' | 'insufficient_history' | 'no_data'
  level: AdvisoryLevel
  title: string
  summary: string
  referenceDate: string
  upcomingWindowDays: number
  upcomingWindowLabel: string
  historicalBasis: {
    aoiName: string
    sensor: string
    yearsAnalyzed: number[]
    analyzedYearsCount: number
    historicalActivePeriods: number
    comparablePeriodsCount: number
    historicalAvgActiveCells: number
    historicalPeakActiveCells: number
    peakWeekLabel: string
    datasetDateRange: { start: string; end: string }
  }
  recommendedActions: string[]
  limitations: string[]
  limitationsNotice: string
}
