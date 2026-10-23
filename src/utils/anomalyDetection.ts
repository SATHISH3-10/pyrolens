import type { AnomalyRecord, AnomalyReport, FireObservation } from '@/types/fire'
import { aggregateByDate } from './aggregation'

export const ANOMALY_SCIENTIFIC_DISCLAIMER =
  'STATISTICAL NOTICE: Flagged periods represent statistical observation anomalies in satellite-detected thermal anomalies relative to the baseline. They do NOT represent confirmed wildfires, fire perimeters, ignition causes, or predictive fire-risk forecasts.'

export const MIN_OBSERVATION_DAYS_REQUIRED = 10

/**
 * Robust statistical anomaly detection using Median and Median Absolute Deviation (MAD).
 * MAD is resilient to extreme outliers compared to standard deviation.
 */
export function detectUnusualActivity(
  records: readonly FireObservation[],
  thresholdMultiplier = 2.5,
): AnomalyReport {
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

  const dailyAggs = aggregateByDate(records)
  const totalDays = dailyAggs.length

  if (totalDays < MIN_OBSERVATION_DAYS_REQUIRED) {
    return {
      status: 'insufficient_baseline',
      baselineMethod: 'Median Absolute Deviation (MAD)',
      baselineMedian: 0,
      madValue: 0,
      thresholdMultiplier,
      thresholdValue: 0,
      totalDaysAnalyzed: totalDays,
      anomalies: [],
      disclaimer: ANOMALY_SCIENTIFIC_DISCLAIMER,
    }
  }

  // Extract daily counts
  const counts = dailyAggs.map((d) => d.total).sort((a, b) => a - b)

  // Calculate Median
  const mid = Math.floor(counts.length / 2)
  const baselineMedian =
    counts.length % 2 !== 0
      ? counts[mid]!
      : Number(((counts[mid - 1]! + counts[mid]!) / 2).toFixed(1))

  // Calculate Absolute Deviations from Median
  const deviations = counts
    .map((c) => Math.abs(c - baselineMedian))
    .sort((a, b) => a - b)

  const devMid = Math.floor(deviations.length / 2)
  const rawMad =
    deviations.length % 2 !== 0
      ? deviations[devMid]!
      : Number(((deviations[devMid - 1]! + deviations[devMid]!) / 2).toFixed(1))

  // Normal scale factor for MAD is ~1.4826
  // Ensure non-zero divisor
  const effectiveMad = Math.max(rawMad * 1.4826, 1.5)

  // Threshold: Median + (multiplier * effectiveMad)
  const thresholdValue = Number((baselineMedian + thresholdMultiplier * effectiveMad).toFixed(1))

  const anomalies: AnomalyRecord[] = []

  for (const day of dailyAggs) {
    if (day.total > thresholdValue) {
      const score = Number(((day.total - baselineMedian) / effectiveMad).toFixed(2))

      let severity: 'moderate' | 'high' | 'extreme' = 'moderate'
      if (score >= 4.0) severity = 'extreme'
      else if (score >= 3.0) severity = 'high'

      const ratio =
        baselineMedian > 0 ? (day.total / baselineMedian).toFixed(1) : 'N/A'

      const explanation = `On ${day.date}, ${day.total} hotspots were detected (${ratio}x baseline median of ${baselineMedian} hotspots). This exceeds the statistical threshold of ${thresholdValue} (Score: +${score}).`

      anomalies.push({
        date: day.date,
        observedCount: day.total,
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
    totalDaysAnalyzed: totalDays,
    anomalies,
    disclaimer: ANOMALY_SCIENTIFIC_DISCLAIMER,
  }
}
