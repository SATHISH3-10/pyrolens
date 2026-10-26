/**
 * Types for the harmonized Burning Activity Index (BAI) pipeline.
 */

export type ActivityClass = 'none' | 'low' | 'moderate' | 'high' | 'very_high' | 'extreme'

/** Where a day's harmonized value comes from. */
export type DataSource = 'combined' | 'viirs' | 'modis_scaled' | 'modis_unscaled' | 'none'

export type ObservationQuality = 'good' | 'limited' | 'no_coverage'

export type AnomalyLevel = 'none' | 'above_normal' | 'extreme'

export interface BaiWeights {
  count: number
  frp: number
  clusters: number
}

export interface DailyActivity {
  date: string
  year: number
  month: number // 1-12
  /** Day of year on a 365-day calendar (Feb 29 folds onto Feb 28). */
  doy: number

  modisCount: number
  viirsCount: number
  modisFrp: number
  viirsFrp: number
  modisSats: number
  viirsSats: number
  modisClusters: number
  viirsClusters: number
  dayDetections: number
  nightDetections: number
  lowConfidenceRemoved: number
  maxFrp: number | null

  /** VIIRS-equivalent detections per satellite overpass-day. */
  harmonizedCount: number
  harmonizedCountLow: number
  harmonizedCountHigh: number
  harmonizedFrp: number
  harmonizedClusters: number
  source: DataSource

  bai: number // 0-100
  /** Percentile of this day's BAI among all active days in the area record. */
  percentile: number | null
  cls: ActivityClass
  quality: ObservationQuality
  qualityScore: number // 0-1

  climP50: number
  climP90: number
  climP97: number
  anomaly: AnomalyLevel
  criticalPeriodId: number | null
}

export interface MonthlyFactor {
  month: number
  countRatio: number
  countQ25: number
  countQ75: number
  frpRatio: number
  clusterRatio: number
  samples: number
  fallback: boolean
}

export interface ValidationPoint {
  year: number
  month: number
  observed: number
  predicted: number
  predictedPooled: number
}

export interface HarmonizationModel {
  available: boolean
  viirsStart: string | null
  modisStart: string | null
  overlapStart: string | null
  overlapEnd: string | null
  overlapYears: number
  factors: MonthlyFactor[]
  pooledCountRatio: number
  pooledFrpRatio: number
  validation: {
    points: ValidationPoint[]
    mapeMonthly: number | null
    mapePooled: number | null
    r2Monthly: number | null
    r2Pooled: number | null
  }
}

export interface DoyClimatology {
  doy: number
  p10: number
  p50: number
  p90: number
  p97: number
  mean: number
  countP50: number
}

export interface MonthClimatology {
  month: number
  meanBai: number
  p10: number
  p50: number
  p90: number
  meanDailyCount: number
  share: number // share of annual harmonized detections
}

export interface CriticalPeriod {
  id: number
  start: string
  end: string
  days: number
  peakDate: string
  peakBai: number
  meanBai: number
  totalCount: number
}

export type SeasonFlag = 'early' | 'late' | 'intense' | 'prolonged' | 'weak'

export interface FireSeason {
  label: string
  startYear: number
  rangeStart: string
  rangeEnd: string
  start: string
  peak: string
  end: string
  durationDays: number
  total: number
  peak7: number
  anomalousDays: number
  criticalDays: number
  source: DataSource
  flags: SeasonFlag[]
  complete: boolean
}

export interface SeasonNorms {
  fireYearStartMonth: number
  medianStartOffset: number
  medianPeakOffset: number
  medianEndOffset: number
  medianDuration: number
  typicalStart: string // "Feb 12"
  typicalPeak: string
  typicalEnd: string
  topMonths: number[]
}

export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'critical'

export interface OutlookWeek {
  label: string
  start: string
  end: string
  p50: number
  p90: number
}

export interface CriticalOutlook {
  referenceDate: string
  latestBai: number
  latestClass: ActivityClass
  mean7: number
  trendPerDay: number
  trend: 'rising' | 'stable' | 'falling'
  normalP50: number
  normalP90: number
  highDaysLast7: number
  risk: RiskLevel
  score: number
  reasons: string[]
  upcoming: OutlookWeek[]
  recent: Array<{ date: string; bai: number; p50: number; p90: number }>
}

export interface ActivityAnalysis {
  days: DailyActivity[]
  dayIndex: Map<string, number>
  firstDate: string
  lastDate: string
  model: HarmonizationModel
  weights: BaiWeights
  climatology: DoyClimatology[] // index 0 → doy 1
  months: MonthClimatology[]
  criticalPeriods: CriticalPeriod[]
  seasons: FireSeason[]
  seasonNorms: SeasonNorms | null
  activeDays: number
  totals: {
    modis: number
    viirs: number
    lowConfidenceRemoved: number
    duplicatesRemoved: number
  }
}

export interface FireEvent {
  id: string
  centroid: [number, number] // [lat, lng]
  start: string
  end: string
  durationDays: number
  count: number
  modisCount: number
  viirsCount: number
  totalFrp: number
  maxFrp: number | null
  hull: Array<[number, number]> // [lat, lng]
  areaKm2: number
  satellites: string[]
}
