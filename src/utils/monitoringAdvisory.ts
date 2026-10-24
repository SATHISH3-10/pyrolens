import type {
  AdvisoryLevel,
  FireObservation,
  MonitoringAdvisory,
  PrimaryMetricType,
} from '@/types/fire'
import {
  getDayOfYear,
  getWeekOfYear,
  identifyCriticalPeriods,
} from '@/utils/criticalPeriods'

export interface MonitoringAdvisoryOptions {
  aoiName?: string
  sensor?: string
  referenceDate?: string
  upcomingWindowDays?: number // default 30
  thresholdPercentile?: number // default 75
  metricType?: PrimaryMetricType // default 'harmonized'
  gridResolution?: number // default 0.25
}

/**
 * Generates an evidence-based monitoring advisory based on historical recurring activity patterns.
 * NOTE: This is a historical pattern-based monitoring advisory, NOT an ML predictive model
 * for exact fire occurrences, spread, or ignition coordinates.
 */
export function generateMonitoringAdvisory(
  observations: readonly FireObservation[],
  optionsOrDate?: Date | string | MonitoringAdvisoryOptions,
  legacyOptions: MonitoringAdvisoryOptions = {},
): MonitoringAdvisory {
  let options: MonitoringAdvisoryOptions = {}
  if (optionsOrDate instanceof Date) {
    const y = optionsOrDate.getFullYear()
    const m = String(optionsOrDate.getMonth() + 1).padStart(2, '0')
    const d = String(optionsOrDate.getDate()).padStart(2, '0')
    options = { ...legacyOptions, referenceDate: `${y}-${m}-${d}` }
  } else if (typeof optionsOrDate === 'string') {
    options = { ...legacyOptions, referenceDate: optionsOrDate }
  } else if (optionsOrDate && typeof optionsOrDate === 'object') {
    options = optionsOrDate
  }

  const aoiName = options.aoiName ?? 'All India'
  const sensor = options.sensor ?? 'Harmonized MODIS + VIIRS'
  const upcomingWindowDays = options.upcomingWindowDays ?? 30
  const thresholdPercentile = options.thresholdPercentile ?? 75
  const metricType = options.metricType ?? 'harmonized'
  const gridResolution = options.gridResolution ?? 0.25

  const limitations = [
    'This advisory is an evidence-based synthesis of historical multi-year satellite observation patterns, and not a deterministic wildfire forecast of exact ignition timing, spread, or severity.',
    'Satellite active-fire hotspots represent detected mid-infrared thermal radiation anomalies, which may include agricultural stubble clearing, prescribed burns, or industrial flares.',
    'Cloud obscuration, smoke plumes, and fixed satellite overpass schedules can cause surface fires to go undetected.',
  ]
  const limitationsNotice = limitations.join(' ')

  if (observations.length === 0) {
    return {
      status: 'no_data',
      level: 'INSUFFICIENT_DATA',
      title: 'No Historical Data Available',
      summary:
        'No satellite fire observations are available for the current Area of Interest and filter criteria.',
      referenceDate: new Date().toISOString().slice(0, 10),
      upcomingWindowDays,
      upcomingWindowLabel: `Next ${upcomingWindowDays} Days`,
      historicalBasis: {
        aoiName,
        sensor,
        yearsAnalyzed: [],
        analyzedYearsCount: 0,
        historicalActivePeriods: 0,
        comparablePeriodsCount: 0,
        historicalAvgActiveCells: 0,
        historicalPeakActiveCells: 0,
        peakWeekLabel: 'N/A',
        datasetDateRange: { start: '', end: '' },
      },
      recommendedActions: [
        'Import or load satellite observation archives for this Area of Interest.',
        'Broaden temporal or geographic filters to include historical satellite records.',
      ],
      limitations,
      limitationsNotice,
    }
  }

  // 1. Determine dataset bounds and reference date
  let minDate = observations[0]!.acqDate
  let maxDate = observations[0]!.acqDate
  const yearsSet = new Set<number>()

  for (const obs of observations) {
    if (obs.acqDate < minDate) minDate = obs.acqDate
    if (obs.acqDate > maxDate) maxDate = obs.acqDate
    const y = parseInt(obs.acqDate.slice(0, 4), 10)
    if (!isNaN(y)) yearsSet.add(y)
  }

  const referenceDate = options.referenceDate ?? maxDate
  const yearsAnalyzed = Array.from(yearsSet).sort((a, b) => a - b)

  // Require minimum 2 distinct years for seasonal recurrence
  if (yearsAnalyzed.length < 2) {
    return {
      status: 'insufficient_data',
      level: 'INSUFFICIENT_DATA',
      title: 'Insufficient Historical Data',
      summary:
        'Insufficient historical data to generate a reliable monitoring advisory for this area of interest. Multi-year records are required to identify seasonal recurrence.',
      referenceDate,
      upcomingWindowDays,
      upcomingWindowLabel: `Next ${upcomingWindowDays} Days (${referenceDate} onward)`,
      historicalBasis: {
        aoiName,
        sensor,
        yearsAnalyzed,
        analyzedYearsCount: yearsAnalyzed.length,
        historicalActivePeriods: 0,
        comparablePeriodsCount: observations.length,
        historicalAvgActiveCells: 0,
        historicalPeakActiveCells: 0,
        peakWeekLabel: 'N/A',
        datasetDateRange: { start: minDate, end: maxDate },
      },
      recommendedActions: [
        'Historical observations in this selection do not span at least 2 distinct years to establish a seasonal recurrence baseline.',
        'Select a broader Area of Interest or import multi-year archive datasets.',
      ],
      limitations,
      limitationsNotice,
    }
  }

  // 2. Identify historical critical periods across observations
  const criticalReport = identifyCriticalPeriods(observations, {
    thresholdPercentile,
    metricType,
    gridResolution,
    minSampleYearsRequired: 2,
    minActiveWeeksRequired: 2,
  })

  if (criticalReport.status === 'insufficient_history') {
    return {
      status: 'insufficient_history',
      level: 'INSUFFICIENT_DATA',
      title: 'Insufficient Historical Data',
      summary:
        'Insufficient historical data to generate a reliable monitoring advisory for this area of interest.',
      referenceDate,
      upcomingWindowDays,
      upcomingWindowLabel: `Next ${upcomingWindowDays} Days (${referenceDate} onward)`,
      historicalBasis: {
        aoiName,
        sensor,
        yearsAnalyzed,
        analyzedYearsCount: yearsAnalyzed.length,
        historicalActivePeriods: 0,
        comparablePeriodsCount: observations.length,
        historicalAvgActiveCells: 0,
        historicalPeakActiveCells: 0,
        peakWeekLabel: 'N/A',
        datasetDateRange: { start: minDate, end: maxDate },
      },
      recommendedActions: [
        'Historical records in this selection do not span enough active weeks to establish a recurring seasonal baseline.',
        'Consult broader regional datasets or extend observation window.',
      ],
      limitations,
      limitationsNotice,
    }
  }

  // 3. Determine calendar weeks falling in upcoming window
  const refDoy = getDayOfYear(referenceDate)
  const upcomingWeeksSet = new Set<number>()

  for (let offset = 1; offset <= upcomingWindowDays; offset++) {
    let targetDoy = (refDoy + offset) % 365
    if (targetDoy === 0) targetDoy = 365
    const w = Math.min(52, Math.max(1, Math.ceil(targetDoy / 7)))
    upcomingWeeksSet.add(w)
  }

  const upcomingWeekNumbers = Array.from(upcomingWeeksSet).sort((a, b) => a - b)
  const upcomingWeeksData = criticalReport.allWeeks.filter((w) =>
    upcomingWeeksSet.has(w.weekNumber),
  )

  // Calculate historical baseline in upcoming window
  const activeUpcomingWeeks = upcomingWeeksData.filter((w) => w.totalDetections > 0)
  const peakUpcomingWeek =
    upcomingWeeksData.length > 0
      ? [...upcomingWeeksData].sort(
          (a, b) => b.historicalMeanActiveCells - a.historicalMeanActiveCells,
        )[0]!
      : null

  const historicalAvgActiveCells =
    activeUpcomingWeeks.length > 0
      ? Number(
          (
            activeUpcomingWeeks.reduce((acc, w) => acc + w.historicalMeanActiveCells, 0) /
            activeUpcomingWeeks.length
          ).toFixed(1),
        )
      : 0

  const historicalPeakActiveCells = peakUpcomingWeek?.historicalMaxActiveCells ?? 0
  const peakWeekLabel = peakUpcomingWeek?.label ?? 'None'

  // Count comparable historical records matching upcoming weeks
  let comparablePeriodsCount = 0
  for (const obs of observations) {
    const w = getWeekOfYear(obs.acqDate)
    if (upcomingWeeksSet.has(w)) {
      comparablePeriodsCount++
    }
  }

  // 4. Determine Advisory Level based on historical recurrence
  const hasExtremeWeek = upcomingWeeksData.some((w) => w.criticalityTier === 'extreme')
  const hasCriticalWeek = upcomingWeeksData.some((w) => w.isCritical)
  const hasModerateWeek = upcomingWeeksData.some((w) => w.criticalityTier === 'moderate')

  let level: AdvisoryLevel = 'LOW'
  let title = 'Low Historical Activity Season'
  let summary = `Historical satellite records indicate that the upcoming ${upcomingWindowDays}-day window (${upcomingWeekNumbers.map((w) => `W${w}`).join(', ')}) typically exhibits baseline or minimal active burning in ${aoiName}.`
  const recommendedActions: string[] = [
    'Maintain baseline satellite telemetry and automated alert feeds.',
    'Continue standard operational data collection across MODIS and VIIRS.',
  ]

  if (hasExtremeWeek) {
    level = 'EXTREME'
    title = 'Peak Historical Fire Activity Season Active'
    summary = `Historical satellite observations indicate the upcoming window coincides with the primary historical burning season in ${aoiName} (peak week: ${peakWeekLabel}), which historically ranks above the 90th percentile of annual fire activity.`
    recommendedActions.length = 0
    recommendedActions.push(
      'Verify daily high-resolution VIIRS (375 m) passes to monitor early sub-pixel thermal emergence.',
      'Cross-reference local agricultural harvesting schedules and crop residue clearance timetables.',
      'Inspect neighboring administrative subdivisions for regional smoke transport and air quality impacts.',
      'Check meteorological conditions (elevated wind speeds, low relative humidity, dry fuel moisture).',
    )
  } else if (hasCriticalWeek) {
    level = 'HIGH'
    title = 'Elevated Historical Fire Season Approaching'
    summary = `Historical observations indicate elevated burning activity during the upcoming period in ${aoiName} (≥ 75th percentile of historical calendar weeks, peak: ${peakWeekLabel}).`
    recommendedActions.length = 0
    recommendedActions.push(
      'Prioritize daily hotspot tracking and review high-confidence detections.',
      'Track Day vs. Night detection ratios to differentiate agricultural burns from uncontrolled nighttime spread.',
      'Verify spatial containment within designated agricultural zones vs. forest boundaries.',
    )
  } else if (hasModerateWeek) {
    level = 'ELEVATED'
    title = 'Moderate Historical Activity Period'
    summary = `The upcoming period historically exhibits moderate seasonal burning activity in ${aoiName} (50th–74th percentile of historical weeks).`
    recommendedActions.length = 0
    recommendedActions.push(
      'Monitor satellite passes for any unseasonal clustering or rapid daily rate-of-increase.',
      'Review sensor comparison metrics for VIIRS vs. MODIS detection discrepancies.',
    )
  }

  const historicalActivePeriods = upcomingWeeksData.filter((w) => w.totalDetections > 0).length

  return {
    status: 'active',
    level,
    title,
    summary,
    referenceDate,
    upcomingWindowDays,
    upcomingWindowLabel: `Next ${upcomingWindowDays} Days (${referenceDate} onward)`,
    historicalBasis: {
      aoiName,
      sensor,
      yearsAnalyzed,
      analyzedYearsCount: yearsAnalyzed.length,
      historicalActivePeriods,
      comparablePeriodsCount,
      historicalAvgActiveCells,
      historicalPeakActiveCells,
      peakWeekLabel,
      datasetDateRange: { start: minDate, end: maxDate },
    },
    recommendedActions,
    limitations,
    limitationsNotice,
  }
}
