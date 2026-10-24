import type {
  CriticalPeriodsReport,
  CriticalPeriodWeek,
  FireObservation,
  PrimaryMetricType,
} from '@/types/fire'
import { getGridCellKey } from '@/utils/aggregation'

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Calculates day of year (1..366) for a given YYYY-MM-DD date string.
 */
export function getDayOfYear(dateStr: string): number {
  const parts = dateStr.split('-')
  if (parts.length < 3) return 1
  const y = parseInt(parts[0]!, 10)
  const m = parseInt(parts[1]!, 10)
  const d = parseInt(parts[2]!, 10)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return 1

  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const daysBeforeMonth = [
    0,
    31,
    isLeap ? 60 : 59,
    isLeap ? 91 : 90,
    isLeap ? 121 : 120,
    isLeap ? 152 : 151,
    isLeap ? 182 : 181,
    isLeap ? 213 : 212,
    isLeap ? 244 : 243,
    isLeap ? 274 : 273,
    isLeap ? 305 : 304,
    isLeap ? 335 : 334,
  ]
  return (daysBeforeMonth[m - 1] ?? 0) + d
}

/**
 * Calculates calendar week (1..52) for a given date.
 */
export function getWeekOfYear(dateStr: string): number {
  const doy = getDayOfYear(dateStr)
  return Math.min(52, Math.max(1, Math.ceil(doy / 7)))
}

/**
 * Generates an accessible, human-readable label for a week number (1..52).
 */
export function getWeekLabel(weekNumber: number): {
  label: string
  monthNumber: number
} {
  const midDayOfYear = Math.min(365, (weekNumber - 1) * 7 + 4)
  const approxMonth = Math.min(12, Math.max(1, Math.ceil(midDayOfYear / 30.5)))
  const monthName = MONTH_SHORT[approxMonth - 1] ?? 'Jan'
  const dayInMonth = midDayOfYear - (approxMonth - 1) * 30
  const timing = dayInMonth <= 10 ? 'Early' : dayInMonth <= 20 ? 'Mid' : 'Late'

  return {
    label: `Week ${weekNumber} (${timing} ${monthName})`,
    monthNumber: approxMonth,
  }
}

/**
 * Computes a standard percentile (0..100) from an array of numbers using linear interpolation.
 */
export function calculatePercentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]!

  const sorted = [...values].sort((a, b) => a - b)
  const p = Math.max(0, Math.min(100, percentile))
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower

  if (lower === upper) {
    return sorted[lower]!
  }
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight
}

export interface CriticalPeriodOptions {
  thresholdPercentile?: number // default 75
  minSampleYearsRequired?: number // default 1
  minActiveWeeksRequired?: number // default 3
  metricType?: PrimaryMetricType // default 'harmonized'
  gridResolution?: number // default 0.25
}

/**
 * Identifies historically high-activity critical periods using valid historical satellite observations.
 * Groups observations by calendar week across all available observed years.
 */
export function identifyCriticalPeriods(
  records: readonly FireObservation[],
  options: number | CriticalPeriodOptions = {},
  minYearsArg?: number,
): CriticalPeriodsReport {
  let thresholdPercentile = 75
  let minSampleYearsRequired = 1
  let minActiveWeeksRequired = 1
  let metricType: PrimaryMetricType = typeof options === 'number' ? 'raw_total' : 'harmonized'
  let gridResolution = 0.25

  if (typeof options === 'number') {
    thresholdPercentile = options
    if (typeof minYearsArg === 'number') {
      minSampleYearsRequired = minYearsArg
    }
  } else if (typeof options === 'object' && options !== null) {
    thresholdPercentile = options.thresholdPercentile ?? 75
    minSampleYearsRequired = options.minSampleYearsRequired ?? minYearsArg ?? 1
    minActiveWeeksRequired = options.minActiveWeeksRequired ?? 1
    metricType = options.metricType ?? 'harmonized'
    gridResolution = options.gridResolution ?? 0.25
  }

  if (records.length === 0) {
    return {
      status: 'no_data',
      thresholdPercentile,
      percentileThreshold: thresholdPercentile,
      thresholdCutoffValue: 0,
      thresholdValue: 0,
      minSampleYearsRequired,
      sampleYearsAvailable: 0,
      totalYearsAnalyzed: 0,
      criticalWeeks: [],
      allWeeks: [],
      peakSeasonSummary: 'No observation data available in current selection.',
      disclaimer:
        'Insufficient observation data. Critical period identification requires active satellite observations.',
    }
  }

  // 1. Group records by year and week
  const yearsSet = new Set<number>()
  // Map of weekNumber -> Map of year -> observations
  const weekYearMap = new Map<number, Map<number, FireObservation[]>>()

  for (let w = 1; w <= 52; w++) {
    weekYearMap.set(w, new Map())
  }

  for (const obs of records) {
    const y = parseInt(obs.acqDate.slice(0, 4), 10)
    if (isNaN(y)) continue
    yearsSet.add(y)

    const w = getWeekOfYear(obs.acqDate)
    const yearMap = weekYearMap.get(w)!
    if (!yearMap.has(y)) {
      yearMap.set(y, [])
    }
    yearMap.get(y)!.push(obs)
  }

  const sampleYearsAvailable = yearsSet.size

  // 2. Compute weekly statistics
  const weeklyMetrics: Array<{
    weekNumber: number
    label: string
    monthNumber: number
    meanActiveMetric: number
    medianActiveMetric: number
    maxActiveMetric: number
    totalDetections: number
    observedYearsCount: number
  }> = []

  for (let w = 1; w <= 52; w++) {
    const yearMap = weekYearMap.get(w)!
    const { label, monthNumber } = getWeekLabel(w)

    let totalDetections = 0
    const yearlyMetricValues: number[] = []

    for (const [, yearObs] of yearMap.entries()) {
      totalDetections += yearObs.length
      if (metricType === 'harmonized') {
        const cells = new Set<string>()
        for (const obs of yearObs) {
          cells.add(getGridCellKey(obs.latitude, obs.longitude, gridResolution))
        }
        yearlyMetricValues.push(cells.size)
      } else if (metricType === 'modis') {
        yearlyMetricValues.push(yearObs.filter((o) => o.instrument === 'MODIS').length)
      } else if (metricType === 'viirs') {
        yearlyMetricValues.push(yearObs.filter((o) => o.instrument === 'VIIRS').length)
      } else {
        yearlyMetricValues.push(yearObs.length)
      }
    }

    const observedYearsCount = yearlyMetricValues.length
    const meanActiveMetric =
      observedYearsCount > 0
        ? Number(
            (yearlyMetricValues.reduce((sum, v) => sum + v, 0) / observedYearsCount).toFixed(1),
          )
        : 0

    const medianActiveMetric =
      observedYearsCount > 0 ? calculatePercentile(yearlyMetricValues, 50) : 0

    const maxActiveMetric =
      observedYearsCount > 0 ? Math.max(...yearlyMetricValues) : 0

    weeklyMetrics.push({
      weekNumber: w,
      label,
      monthNumber,
      meanActiveMetric,
      medianActiveMetric,
      maxActiveMetric,
      totalDetections,
      observedYearsCount,
    })
  }

  // 3. Evaluate active weeks for statistical validity
  const activeWeeks = weeklyMetrics.filter((w) => w.totalDetections > 0)

  if (
    sampleYearsAvailable < minSampleYearsRequired ||
    activeWeeks.length < minActiveWeeksRequired
  ) {
    return {
      status: 'insufficient_history',
      thresholdPercentile,
      percentileThreshold: thresholdPercentile,
      thresholdCutoffValue: 0,
      thresholdValue: 0,
      minSampleYearsRequired,
      sampleYearsAvailable,
      totalYearsAnalyzed: sampleYearsAvailable,
      criticalWeeks: [],
      allWeeks: weeklyMetrics.map((w) => ({
        weekNumber: w.weekNumber,
        label: w.label,
        monthNumber: w.monthNumber,
        historicalMeanActiveCells: w.meanActiveMetric,
        historicalMedianActiveCells: w.medianActiveMetric,
        historicalMaxActiveCells: w.maxActiveMetric,
        totalDetections: w.totalDetections,
        observedYearsCount: w.observedYearsCount,
        isCritical: false,
        isCriticalPeriod: false,
        criticalityTier: 'baseline',
      })),
      peakSeasonSummary: `Insufficient historical observation coverage (${sampleYearsAvailable} year(s), ${activeWeeks.length} active week(s)). A minimum of ${minSampleYearsRequired} year(s) and ${minActiveWeeksRequired} active weeks are required to reliably identify climatological critical periods.`,
      disclaimer:
        'Historical critical-period classification requires multi-week active observation baselines to avoid misrepresenting transient detections as climatological burning seasons.',
    }
  }

  // 4. Calculate threshold cutoff based on valid active weeks
  const activeMetricValues = activeWeeks.map((w) => w.meanActiveMetric)
  const thresholdCutoffValue = Number(
    calculatePercentile(activeMetricValues, thresholdPercentile).toFixed(1),
  )
  const p90Cutoff = Number(calculatePercentile(activeMetricValues, 90).toFixed(1))
  const p50Cutoff = Number(calculatePercentile(activeMetricValues, 50).toFixed(1))

  // 5. Build full weekly report
  const allWeeks: CriticalPeriodWeek[] = weeklyMetrics.map((w) => {
    const isCritical =
      thresholdCutoffValue > 0 && w.meanActiveMetric >= thresholdCutoffValue && w.totalDetections > 0

    let tier: CriticalPeriodWeek['criticalityTier'] = 'baseline'
    if (w.meanActiveMetric >= p90Cutoff && p90Cutoff > 0) {
      tier = 'extreme'
    } else if (w.meanActiveMetric >= thresholdCutoffValue && thresholdCutoffValue > 0) {
      tier = 'high'
    } else if (w.meanActiveMetric >= p50Cutoff && p50Cutoff > 0) {
      tier = 'moderate'
    }

    return {
      weekNumber: w.weekNumber,
      label: w.label,
      monthNumber: w.monthNumber,
      historicalMeanActiveCells: w.meanActiveMetric,
      historicalMedianActiveCells: w.medianActiveMetric,
      historicalMaxActiveCells: w.maxActiveMetric,
      totalDetections: w.totalDetections,
      observedYearsCount: w.observedYearsCount,
      isCritical,
      isCriticalPeriod: isCritical,
      criticalityTier: tier,
    }
  })

  const criticalWeeks = allWeeks.filter((w) => w.isCritical)

  // 6. Generate peak season summary
  let peakSeasonSummary = `No recurring critical periods detected above the ${thresholdPercentile}th percentile threshold.`
  if (criticalWeeks.length > 0) {
    const peakWeek = [...criticalWeeks].sort(
      (a, b) => b.historicalMeanActiveCells - a.historicalMeanActiveCells,
    )[0]!
    const criticalWeekNumbers = criticalWeeks.map((w) => w.weekNumber).sort((a, b) => a - b)
    const startWeek = criticalWeekNumbers[0]!
    const endWeek = criticalWeekNumbers[criticalWeekNumbers.length - 1]!

    peakSeasonSummary = `Historically elevated fire activity clusters around Weeks ${startWeek}–${endWeek}, peaking at ${peakWeek.label} with an average of ${peakWeek.historicalMeanActiveCells} active cells per season.`
  }

  return {
    status: 'sufficient',
    thresholdPercentile,
    percentileThreshold: thresholdPercentile,
    thresholdCutoffValue,
    thresholdValue: thresholdCutoffValue,
    minSampleYearsRequired,
    sampleYearsAvailable,
    totalYearsAnalyzed: sampleYearsAvailable,
    criticalWeeks,
    allWeeks,
    peakSeasonSummary,
    disclaimer:
      `Historical critical periods identify recurring seasonal elevations in active-fire detections (≥ ${thresholdPercentile}th percentile of historical weeks). They represent climatological baseline windows, not real-time or predictive fire forecasts.`,
  }
}
