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

export type DataProvenance = 'synthetic-demo' | 'imported-firms-csv'

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

export interface ObservationFilter {
  sensor: 'ALL' | 'MODIS' | 'VIIRS'
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  regionId: string // 'all' or specific region ID
  daynight?: 'ALL' | 'D' | 'N'
  minConfidence?: number | 'low' | 'nominal' | 'high' | 'ALL'
  minFrp?: number
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
}

export interface SummaryMetrics {
  totalCount: number
  modisCount: number
  viirsCount: number
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
  total: number
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
  modis: number
  viirs: number
  avgFrp: number | null
}

export interface RegionAggregate {
  regionId: string
  regionName: string
  total: number
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
