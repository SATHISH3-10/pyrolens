import type { AnomalyRecord, AnomalyReport, FireObservation, PrimaryMetricType } from '@/types/fire'
import { aggregateByDate } from './aggregation'

export const ANOMALY_SCIENTIFIC_DISCLAIMER =
  'STATISTICAL NOTICE: Flagged periods represent statistical observation surges in satellite-detected thermal radiance relative to the reference baseline. They do NOT represent confirmed wildfire perimeters, fire-spread predictions, or emergency response directives.'

export const MIN_OBSERVATION_DAYS_REQUIRED = 10

export interface AnomalyDetectionOptions {
  thresholdMultiplier?: number // 2.0 (Sensitive), 2.5 (Standard), 3.0 (Extreme)
  metricType?: PrimaryMetricType // 'harmonized' (recommended) | 'modis' | 'viirs' | 'raw_total'
  referenceRecords?: readonly FireObservation[] // Historical reference baseline period
  baselinePeriodLabel?: string
}

/**
 * Robust non-parametric statistical anomaly detection using Median and Median Absolute Deviation (MAD).
 * Unlike standard deviation (mean ± k*sigma), MAD is resilient against extreme wildfire outliers
 * which would otherwise artificially inflate the mean and mask genuine surges.
 */
export function detectUnusualActivity(
  records: readonly FireObservation[],
  options: number | AnomalyDetectionOptions = 2.5,
  legacyReferenceRecords?: readonly FireObservation[],
): AnomalyReport {
  // Support both legacy number argument and new options object
  const opts: AnomalyDetectionOptions =
    typeof options === 'number'
      ? {
          thresholdMultiplier: options,
          metricType: 'raw_total',
          referenceRecords: legacyReferenceRecords,
        }
      : options

  const thresholdMultiplier = opts.thresholdMultiplier ?? 2.5
  const metricType = opts.metricType ?? (typeof options === 'number' ? 'raw_total' : 'harmonized')
  const referenceRecords = legacyReferenceRecords ?? opts.referenceRecords ?? records
  const baselineLabel = opts.baselinePeriodLabel ?? 'Active Window Baseline'

  if (records.length === 0) {
    return {
      status: 'no_data',
      baselineMethod: 'Median Absolute Deviation (MAD)',
      baselineMedian: 0,
      madValue: 0,
      thresholdMultiplier,
      thresholdValue: 0,
      totalDaysAnalyzed: 0,
      anomalies: [],
      disclaimer: ANOMALY_SCIENTIFIC_DISCLAIMER,
    }
  }

  // 1. Compute reference daily metrics
  const refDailyAggs = aggregateByDate(referenceRecords)
  if (refDailyAggs.length < MIN_OBSERVATION_DAYS_REQUIRED) {
    return {
      status: 'insufficient_baseline',
      baselineMethod: 'Median Absolute Deviation (MAD)',
      baselineMedian: 0,
      madValue: 0,
      thresholdMultiplier,
      thresholdValue: 0,
      totalDaysAnalyzed: refDailyAggs.length,
      anomalies: [],
      disclaimer: ANOMALY_SCIENTIFIC_DISCLAIMER,
    }
  }

  // Extract reference values based on selected metricType
  const getVal = (d: (typeof refDailyAggs)[0]) =>
    metricType === 'harmonized'
      ? d.harmonizedActiveCells
      : metricType === 'modis'
      ? d.modis
      : metricType === 'viirs'
      ? d.viirs
      : d.total

  const refValues = refDailyAggs.map(getVal).sort((a, b) => a - b)

  // 2. Calculate Median
  const mid = Math.floor(refValues.length / 2)
  const baselineMedian =
    refValues.length % 2 !== 0
      ? refValues[mid]!
      : Number(((refValues[mid - 1]! + refValues[mid]!) / 2).toFixed(1))

  // 3. Calculate Absolute Deviations from Median
  const deviations = refValues
    .map((v) => Math.abs(v - baselineMedian))
    .sort((a, b) => a - b)

  const devMid = Math.floor(deviations.length / 2)
  const rawMad =
    deviations.length % 2 !== 0
      ? deviations[devMid]!
      : Number(((deviations[devMid - 1]! + deviations[devMid]!) / 2).toFixed(1))

  // Normal scale factor for asymptotic normal consistency: 1.4826
  // Ensure non-zero divisor to prevent infinite score on quiet days
  const effectiveMad = Math.max(rawMad * 1.4826, 1.5)

  // Cutoff threshold: Median + (multiplier * effectiveMad)
  const thresholdValue = Number((baselineMedian + thresholdMultiplier * effectiveMad).toFixed(1))

  // 4. Evaluate target observation days against the reference threshold
  const targetDailyAggs = aggregateByDate(records)
  const anomalies: AnomalyRecord[] = []

  const metricUnit =
    metricType === 'harmonized'
      ? 'active grid cells'
      : metricType === 'modis'
      ? 'MODIS hotspots'
      : metricType === 'viirs'
      ? 'VIIRS hotspots'
      : 'raw hotspots'

  for (const day of targetDailyAggs) {
    const observed = getVal(day)

    if (observed > thresholdValue) {
      const score = Number(((observed - baselineMedian) / effectiveMad).toFixed(2))

      // Severity classification based on statistical distance from normal distribution
      let severity: 'moderate' | 'high' | 'extreme' = 'moderate'
      if (score >= 4.0) severity = 'extreme'
      else if (score >= 3.0) severity = 'high'

      const ratio =
        baselineMedian > 0 ? (observed / baselineMedian).toFixed(1) : 'N/A'

      const explanation = `On ${day.date}, ${observed} ${metricUnit} were detected (${ratio}x the ${baselineLabel} median of ${baselineMedian}). This exceeds the statistical surge threshold of ${thresholdValue} (Anomaly Score: +${score} MAD). Sensor breakdown: ${day.modis} MODIS, ${day.viirs} VIIRS.`

      anomalies.push({
        date: day.date,
        observedCount: observed,
        baselineValue: baselineMedian,
        thresholdValue,
        anomalyScore: score,
        severity,
        explanation,
      })
    }
  }

  // Sort by highest anomaly score descending
  anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore)

  return {
    status: 'ok',
    baselineMethod: 'Median Absolute Deviation (MAD)',
    baselineMedian,
    madValue: Number(rawMad.toFixed(1)),
    thresholdMultiplier,
    thresholdValue,
    totalDaysAnalyzed: targetDailyAggs.length,
    anomalies,
    disclaimer: ANOMALY_SCIENTIFIC_DISCLAIMER,
  }
}
