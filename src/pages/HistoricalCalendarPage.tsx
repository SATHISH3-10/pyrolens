import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  Grid,
  Info,
  MapPin,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { FilterBar } from '@/components/shared/FilterBar'
import { Badge, Card, PageHeader } from '@/components/ui'
import {
  aggregateByDate,
  aggregateByMonth,
  aggregateMultiYearMonth,
  filterObservations,
  getWeekOfYear,
  identifyCriticalPeriods,
} from '@/utils/aggregation'
import { detectUnusualActivity } from '@/utils/anomalyDetection'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function HistoricalCalendarPage() {
  const navigate = useNavigate()
  const {
    filteredObservations,
    observations,
    metadata,
    filter,
    setFilter,
    customAoi,
  } = useFireData()

  // Calendar view state: dynamically initialize from active filter or available records
  const [viewYear, setViewYear] = useState<number>(() => {
    const d =
      filter.startDate ||
      (filteredObservations.length > 0
        ? filteredObservations[filteredObservations.length - 1]!.acqDate
        : observations.length > 0
          ? observations[observations.length - 1]!.acqDate
          : metadata.dateRange.end || '2024-03-15')
    const y = parseInt(d.slice(0, 4), 10)
    return !isNaN(y) ? y : 2024
  })

  const [viewMonth, setViewMonth] = useState<number>(() => {
    const d =
      filter.startDate ||
      (filteredObservations.length > 0
        ? filteredObservations[filteredObservations.length - 1]!.acqDate
        : observations.length > 0
          ? observations[observations.length - 1]!.acqDate
          : metadata.dateRange.end || '2024-03-15')
    const m = parseInt(d.slice(5, 7), 10)
    return !isNaN(m) ? m : 3
  })

  const [multiYearMonth, setMultiYearMonth] = useState<number>(() => {
    const d =
      filter.startDate ||
      (filteredObservations.length > 0
        ? filteredObservations[filteredObservations.length - 1]!.acqDate
        : observations.length > 0
          ? observations[observations.length - 1]!.acqDate
          : metadata.dateRange.end || '2024-03-15')
    const m = parseInt(d.slice(5, 7), 10)
    return !isNaN(m) ? m : 3
  })

  const [viewMode, setViewMode] = useState<'daily' | 'multiyear' | 'monthly'>('daily')
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    if (filter.startDate) return filter.startDate
    if (filteredObservations.length > 0) return filteredObservations[0]!.acqDate
    return null
  })

  const [criticalThresholdPercentile, setCriticalThresholdPercentile] = useState<number>(75)

  // Task E: Synchronize calendar view when global filter.startDate changes externally
  useEffect(() => {
    if (filter.startDate) {
      const y = parseInt(filter.startDate.slice(0, 4), 10)
      const m = parseInt(filter.startDate.slice(5, 7), 10)
      if (!isNaN(y) && !isNaN(m)) {
        setViewYear(y)
        setViewMonth(m)
        setMultiYearMonth(m)
        setSelectedDate(filter.startDate)
      }
    } else if (observations.length > 0) {
      const latest = observations[observations.length - 1]!.acqDate
      const y = parseInt(latest.slice(0, 4), 10)
      const m = parseInt(latest.slice(5, 7), 10)
      if (!isNaN(y) && !isNaN(m)) {
        setViewYear(y)
        setViewMonth(m)
        setMultiYearMonth(m)
      }
    }
  }, [filter.startDate, observations])

  // Multi-year observations matching active AOI and sensor filters (unconstrained by narrow calendar date clipping)
  const aoiHistoricalObservations = useMemo(() => {
    return filterObservations(observations, {
      ...filter,
      startDate: '',
      endDate: '',
      customAoi,
    })
  }, [observations, filter, customAoi])

  // Determine observation date bounds
  const datasetBounds = useMemo(() => {
    const records =
      aoiHistoricalObservations.length > 0 ? aoiHistoricalObservations : filteredObservations
    if (records.length === 0) return null
    let min = records[0]!.acqDate
    let max = records[0]!.acqDate
    for (const o of records) {
      if (o.acqDate < min) min = o.acqDate
      if (o.acqDate > max) max = o.acqDate
    }
    return { min, max }
  }, [aoiHistoricalObservations, filteredObservations])

  // Date aggregates across active filters
  const dailyData = useMemo(() => {
    const records =
      aoiHistoricalObservations.length > 0 ? aoiHistoricalObservations : filteredObservations
    return aggregateByDate(records, filter.gridResolution)
  }, [aoiHistoricalObservations, filteredObservations, filter.gridResolution])

  const monthlyData = useMemo(() => {
    const records =
      aoiHistoricalObservations.length > 0 ? aoiHistoricalObservations : filteredObservations
    return aggregateByMonth(records, filter.gridResolution)
  }, [aoiHistoricalObservations, filteredObservations, filter.gridResolution])

  // Task B: Historical critical-period identification engine
  const criticalReport = useMemo(() => {
    const records =
      aoiHistoricalObservations.length > 0 ? aoiHistoricalObservations : filteredObservations
    return identifyCriticalPeriods(records, {
      thresholdPercentile: criticalThresholdPercentile,
      metricType: filter.metricType,
      gridResolution: filter.gridResolution,
      minSampleYearsRequired: 2,
    })
  }, [
    aoiHistoricalObservations,
    filteredObservations,
    criticalThresholdPercentile,
    filter.metricType,
    filter.gridResolution,
  ])

  const criticalWeeksMap = useMemo(() => {
    const map = new Map<number, (typeof criticalReport.allWeeks)[0]>()
    for (const w of criticalReport.allWeeks) {
      map.set(w.weekNumber, w)
    }
    return map
  }, [criticalReport.allWeeks])

  // Statistical anomaly detection for independent anomaly comparison
  const anomalyReport = useMemo(() => {
    return detectUnusualActivity(filteredObservations, {
      metricType: filter.metricType,
      referenceRecords: aoiHistoricalObservations,
      baselinePeriodLabel: 'AOI Baseline',
    })
  }, [filteredObservations, aoiHistoricalObservations, filter.metricType])

  const anomalyDateSet = useMemo(() => {
    return new Set(anomalyReport.anomalies.map((a) => a.date))
  }, [anomalyReport.anomalies])

  // Multi-year comparative dataset for target month
  const multiYearData = useMemo(() => {
    const records =
      aoiHistoricalObservations.length > 0 ? aoiHistoricalObservations : filteredObservations
    return aggregateMultiYearMonth(
      records,
      multiYearMonth,
      filter.metricType,
      filter.gridResolution,
    )
  }, [
    aoiHistoricalObservations,
    filteredObservations,
    multiYearMonth,
    filter.metricType,
    filter.gridResolution,
  ])

  // Map of date string -> daily aggregate
  const dateMap = useMemo(() => {
    const map = new Map<string, (typeof dailyData)[0]>()
    for (const d of dailyData) {
      map.set(d.date, d)
    }
    return map
  }, [dailyData])

  // Days in selected view month with coverage and critical period awareness
  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay()
    const daysInCurrentMonth = new Date(viewYear, viewMonth, 0).getDate()

    const cells: Array<{
      dayNumber: number | null
      dateStr: string | null
      total: number | null
      modis: number
      viirs: number
      avgFrp: number | null
      hasCoverage: boolean
      isCriticalPeriod: boolean
      criticalityTier: string
      isAnomaly: boolean
    }> = []

    // Padding empty cells before the 1st
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({
        dayNumber: null,
        dateStr: null,
        total: null,
        modis: 0,
        viirs: 0,
        avgFrp: null,
        hasCoverage: false,
        isCriticalPeriod: false,
        criticalityTier: 'baseline',
        isAnomaly: false,
      })
    }

    // Days 1 through N
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const hasCoverage = Boolean(
        datasetBounds &&
          dateStr >= datasetBounds.min &&
          dateStr <= datasetBounds.max,
      )
      const record = dateMap.get(dateStr)
      const weekNum = getWeekOfYear(dateStr)
      const weekEntry = criticalWeeksMap.get(weekNum)
      const isCriticalPeriod = Boolean(weekEntry?.isCriticalPeriod)
      const criticalityTier = weekEntry?.criticalityTier ?? 'baseline'
      const isAnomaly = anomalyDateSet.has(dateStr)

      cells.push({
        dayNumber: d,
        dateStr,
        total: hasCoverage ? (record?.total ?? 0) : null,
        modis: record?.modis ?? 0,
        viirs: record?.viirs ?? 0,
        avgFrp: record?.avgFrp ?? null,
        hasCoverage,
        isCriticalPeriod,
        criticalityTier,
        isAnomaly,
      })
    }

    return cells
  }, [viewYear, viewMonth, dateMap, datasetBounds, criticalWeeksMap, anomalyDateSet])

  // Month summary metrics respecting missing data vs zero activity
  const monthTotals = useMemo(() => {
    let total = 0
    let modis = 0
    let viirs = 0
    let activeDays = 0
    let observedDays = 0
    let peakDay = { date: '', total: 0 }

    for (const cell of calendarCells) {
      if (!cell.dateStr || cell.total === null) continue
      observedDays++
      total += cell.total
      modis += cell.modis
      viirs += cell.viirs
      if (cell.total > 0) activeDays++
      if (cell.total > peakDay.total) {
        peakDay = { date: cell.dateStr, total: cell.total }
      }
    }

    const monthHasCoverage = observedDays > 0

    return { total, modis, viirs, activeDays, observedDays, peakDay, monthHasCoverage }
  }, [calendarCells])

  // Selected date record
  const selectedDayRecord = useMemo(() => {
    if (!selectedDate) return null
    return dateMap.get(selectedDate) ?? null
  }, [selectedDate, dateMap])

  // Month navigation
  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  // Jump to day in Explorer
  const handleExploreDayOnMap = (dateStr: string) => {
    setFilter({ startDate: dateStr, endDate: dateStr })
    navigate('/explorer')
  }

  // Enhanced cell style classifier supporting 4 key states
  const getCellStateStyle = (
    count: number | null,
    hasCoverage: boolean,
    isSelected: boolean,
    isAnomaly: boolean,
    isCriticalPeriod: boolean,
  ) => {
    if (isSelected) {
      return 'border-white ring-2 ring-white/50 bg-ink-700'
    }
    if (!hasCoverage || count === null) {
      return 'border-line/20 bg-ink-950/40 text-fg-faint/40'
    }
    if (isAnomaly) {
      return 'border-rose-500/80 bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/40 font-bold'
    }
    if (isCriticalPeriod && count > 0) {
      return 'border-ember-400/70 bg-ember-500/30 text-ember-100 ring-1 ring-ember-500/40 font-semibold'
    }
    if (count === 0) {
      return 'border-line/40 bg-ink-950/70 text-fg-faint'
    }
    if (count <= 4) {
      return 'border-ember-500/20 bg-ember-500/10 text-ember-300'
    }
    if (count <= 14) {
      return 'border-ember-500/40 bg-ember-500/25 text-ember-200'
    }
    if (count <= 29) {
      return 'border-ember-500/60 bg-ember-500/45 text-white font-bold'
    }
    return 'border-ember-400 bg-ember-500 text-ink-950 font-bold shadow-glow-ember'
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Historical Activity Calendar"
        description="Temporal hotspot density across days, weeks, and seasons with day-by-day exploration."
        meta={
          <Badge tone="ember" dot>
            Daily Fire Intelligence
          </Badge>
        }
      />

      {/* Shared Filter Bar */}
      <FilterBar />

      {/* Mandatory Scientific Notice */}
      <div
        role="region"
        aria-label="Calendar zero detection advisory"
        className="flex items-start gap-3 rounded-xl border border-line bg-ink-900/60 p-4 text-xs text-fg-muted"
      >
        <ShieldAlert className="size-4 shrink-0 text-ember-400 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-fg">
            Critical Scientific Rule: Zero Detections != Zero Wildfires
          </p>
          <p className="leading-relaxed">
            A calendar day with <strong>zero detected hotspots</strong> must not be described as a day with no fires.
            Satellite sensors only detect active thermal anomalies during clear-sky overpasses. Persistent cloud cover,
            heavy monsoon rain, thick smoke, or fires burning exclusively between overpasses will result in zero satellite detections.
          </p>
        </div>
      </div>

      {/* Task B: Historical Critical Periods & Climatological Baseline Card */}
      <Card padding="sm" className="border-signal-400/30 bg-ink-900/80">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-ember-400" />
            <div>
              <h3 className="font-semibold text-sm text-fg">
                Historical Critical-Period Analysis (Climatological Baseline)
              </h3>
              <p className="text-[11px] text-fg-faint">
                Identifies recurring seasonal burning peaks based on weekly percentiles across historical observations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-fg-muted font-medium">Critical Threshold:</span>
            <select
              value={criticalThresholdPercentile}
              onChange={(e) => setCriticalThresholdPercentile(Number(e.target.value))}
              className="rounded-lg border border-line bg-ink-800 px-2.5 py-1 text-fg focus:outline-none focus:border-ember-500"
            >
              <option value={70}>70th Percentile</option>
              <option value={75}>75th Percentile (Standard)</option>
              <option value={80}>80th Percentile (Elevated)</option>
              <option value={90}>90th Percentile (Extreme Only)</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-xs">
          <div className="rounded-lg border border-line bg-ink-950 p-2.5">
            <span className="text-fg-faint text-[11px] block">Critical Weeks Identified</span>
            <p className="mt-1 text-lg font-bold text-ember-400">
              {criticalReport.criticalWeeks.length} weeks{' '}
              <span className="text-xs font-normal text-fg-faint">/ 52</span>
            </p>
            <span className="text-[10px] text-fg-faint">
              &ge; {criticalReport.thresholdCutoffValue} active cells/week
            </span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-2.5">
            <span className="text-fg-faint text-[11px] block">Observed History Sample</span>
            <p className="mt-1 text-lg font-bold text-signal-400">
              {criticalReport.sampleYearsAvailable} year(s)
            </p>
            <span className="text-[10px] text-fg-faint">
              Required minimum: {criticalReport.minSampleYearsRequired} year
            </span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-2.5 md:col-span-2">
            <span className="text-fg-faint text-[11px] block">Peak Seasonal Clustering</span>
            <p className="mt-1 text-xs text-fg leading-relaxed">
              {criticalReport.peakSeasonSummary}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-fg-faint border-t border-line/40 pt-2 leading-relaxed">
          <strong className="text-fg-muted">Climatological Distinction: </strong>
          {criticalReport.disclaimer}
        </p>
      </Card>

      {/* View Mode & Calendar Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-ink-900/90 px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('daily')}
            className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
              viewMode === 'daily'
                ? 'bg-ember-500 text-ink-950 font-bold'
                : 'bg-ink-800 text-fg-muted hover:text-fg'
            }`}
          >
            Daily Heatmap
          </button>
          <button
            type="button"
            onClick={() => setViewMode('multiyear')}
            className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
              viewMode === 'multiyear'
                ? 'bg-ember-500 text-ink-950 font-bold'
                : 'bg-ink-800 text-fg-muted hover:text-fg'
            }`}
          >
            Year-over-Year Matrix
          </button>
          <button
            type="button"
            onClick={() => setViewMode('monthly')}
            className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
              viewMode === 'monthly'
                ? 'bg-ember-500 text-ink-950 font-bold'
                : 'bg-ink-800 text-fg-muted hover:text-fg'
            }`}
          >
            12-Month Overview
          </button>
        </div>

        {viewMode === 'multiyear' && (
          <div className="flex items-center gap-2">
            <span className="text-fg-muted font-medium">Comparison Month:</span>
            <select
              value={multiYearMonth}
              onChange={(e) => setMultiYearMonth(Number(e.target.value))}
              className="rounded-lg border border-line bg-ink-800 px-3 py-1.5 font-medium text-fg focus:outline-none focus:border-ember-500"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name} (All Years)
                </option>
              ))}
            </select>
          </div>
        )}

        {viewMode === 'daily' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-lg border border-line bg-ink-800 p-1.5 text-fg-muted hover:bg-ink-700 hover:text-fg"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>

            <span className="font-semibold text-fg min-w-[120px] text-center">
              {MONTH_NAMES[viewMonth - 1]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="rounded-lg border border-line bg-ink-800 p-1.5 text-fg-muted hover:bg-ink-700 hover:text-fg"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setViewYear(2024)
                setViewMonth(3)
                setSelectedDate('2024-03-21')
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-ink-800 px-2.5 py-1 text-fg hover:border-ember-500/50 hover:bg-ink-700 text-xs transition-colors ml-2"
              title="Jump to the March 2024 dry peak season"
            >
              <Sparkles className="size-3 text-ember-400" />
              <span>Peak Season</span>
            </button>
          </div>
        )}
      </div>

      {/* Month Metrics Header */}
      {viewMode === 'daily' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <Card padding="sm">
            <span className="text-fg-muted block">Month Total Hotspots</span>
            <p className="mt-1 text-2xl font-bold text-fg">
              {monthTotals.monthHasCoverage ? monthTotals.total.toLocaleString() : '—'}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-faint">
              {monthTotals.monthHasCoverage
                ? `In ${MONTH_NAMES[viewMonth - 1]} ${viewYear}`
                : `No satellite records in ${MONTH_NAMES[viewMonth - 1]} ${viewYear}`}
            </p>
          </Card>

          <Card padding="sm">
            <span className="text-fg-muted block">Active vs. Zero Days</span>
            <p className="mt-1 text-2xl font-bold text-fg">
              {monthTotals.monthHasCoverage ? (
                <>
                  {monthTotals.activeDays}{' '}
                  <span className="text-sm font-normal text-fg-faint">
                    / {monthTotals.observedDays} observed days
                  </span>
                </>
              ) : (
                <span className="text-fg-faint text-lg">No coverage</span>
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-faint">
              {monthTotals.monthHasCoverage
                ? `${monthTotals.observedDays - monthTotals.activeDays} days with 0 detected anomalies`
                : 'Period not covered by archive records'}
            </p>
          </Card>

          <Card padding="sm">
            <span className="text-fg-muted block">Sensor Breakdown</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-bold text-ember-400">
                {monthTotals.monthHasCoverage ? monthTotals.modis : '—'}
              </span>
              <span className="text-[11px] text-fg-faint">MODIS</span>
              <span className="text-fg-faint">·</span>
              <span className="text-lg font-bold text-signal-400">
                {monthTotals.monthHasCoverage ? monthTotals.viirs : '—'}
              </span>
              <span className="text-[11px] text-fg-faint">VIIRS</span>
            </div>
            <p className="mt-0.5 text-[11px] text-fg-faint">
              {monthTotals.monthHasCoverage
                ? 'VIIRS 375m captures finer sub-pixel anomalies'
                : 'Awaiting sensor archive data'}
            </p>
          </Card>

          <Card padding="sm">
            <span className="text-fg-muted block">Peak Activity Day</span>
            <p className="mt-1 text-lg font-bold text-ember-400">
              {monthTotals.monthHasCoverage && monthTotals.peakDay.total > 0
                ? monthTotals.peakDay.date
                : 'None'}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-faint">
              {monthTotals.monthHasCoverage
                ? monthTotals.peakDay.total > 0
                  ? `${monthTotals.peakDay.total} hotspots in a single day`
                  : 'Zero detections during monitored period'
                : 'No observations available'}
            </p>
          </Card>
        </div>
      )}

      {/* Main Daily Calendar Grid */}
      {viewMode === 'daily' ? (
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          {/* Calendar Grid (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            <Card padding="sm">
              {/* Days of Week Header */}
              <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs text-fg-faint mb-2">
                {DAYS_OF_WEEK.map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day Cells Grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {calendarCells.map((cell, idx) => {
                  if (cell.dayNumber === null) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="h-20 rounded-lg border border-transparent bg-ink-950/20"
                        aria-hidden="true"
                      />
                    )
                  }

                  const isSelected = cell.dateStr === selectedDate
                  const intensityClass = getCellStateStyle(
                    cell.total,
                    cell.hasCoverage,
                    isSelected,
                    cell.isAnomaly,
                    cell.isCriticalPeriod,
                  )

                  return (
                    <button
                      key={cell.dateStr!}
                      type="button"
                      onClick={() => setSelectedDate(cell.dateStr)}
                      className={`h-20 rounded-lg border p-1.5 flex flex-col justify-between text-left transition-all hover:border-ember-500/80 ${intensityClass}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold">{cell.dayNumber}</span>
                        <div className="flex items-center gap-1">
                          {cell.isAnomaly && (
                            <span
                              className="text-[9px] font-bold px-1 rounded bg-rose-500/30 text-rose-300 border border-rose-500/40"
                              title="Statistical Anomaly Surge (> 2.5x MAD)"
                            >
                              ANOM
                            </span>
                          )}
                          {!cell.isAnomaly && cell.isCriticalPeriod && cell.hasCoverage && (
                            <span
                              className="text-[9px] font-semibold px-1 rounded bg-ember-500/20 text-ember-300 border border-ember-500/30"
                              title="Historical Critical Period (≥ 75th percentile of historical weeks)"
                            >
                              CP
                            </span>
                          )}
                          {cell.total !== null && cell.total > 0 && (
                            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                          )}
                        </div>
                      </div>

                      <div className="w-full">
                        {!cell.hasCoverage ? (
                          <span className="text-[10px] text-fg-faint/40 italic" title="No satellite observations available">
                            —
                          </span>
                        ) : cell.total !== null && cell.total > 0 ? (
                          <>
                            <div className="text-sm font-bold tracking-tight">
                              {cell.total}
                            </div>
                            <div className="text-[10px] opacity-80 truncate">
                              M:{cell.modis} V:{cell.viirs}
                            </div>
                          </>
                        ) : (
                          <span className="text-[10px] opacity-40">0</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Heatmap & Climatology Legend */}
              <div
                role="note"
                aria-label="Calendar activity and critical periods legend"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-fg-muted"
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <Flame className="size-3.5 text-ember-400" />
                  <span>Activity &amp; Critical Legend:</span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
                  <div className="flex items-center gap-1" title="Confirmed zero active thermal anomalies detected during monitored passes">
                    <span className="size-3 rounded border border-line bg-ink-950" />
                    <span>0 Hotspots</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="size-3 rounded border border-ember-500/20 bg-ember-500/10" />
                    <span>1–4</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="size-3 rounded border border-ember-500/40 bg-ember-500/25" />
                    <span>5–14</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="size-3 rounded border border-ember-500/60 bg-ember-500/45" />
                    <span>15–29</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="size-3 rounded border border-ember-400 bg-ember-500" />
                    <span className="font-semibold text-fg">30+ (Peak)</span>
                  </div>
                  <div className="flex items-center gap-1" title="Historically high active period (≥ 75th percentile of historical calendar weeks)">
                    <span className="rounded border border-ember-500/50 bg-ember-500/20 px-1 text-[10px] font-bold text-ember-300">CP</span>
                    <span>Critical Period</span>
                  </div>
                  <div className="flex items-center gap-1" title="Statistical surge exceeding 2.5x MAD baseline">
                    <span className="rounded border border-rose-500/60 bg-rose-500/20 px-1 text-[10px] font-bold text-rose-300">ANOM</span>
                    <span>Anomaly</span>
                  </div>
                  <div className="flex items-center gap-1" title="No satellite observation records exist for this date in the archive">
                    <span className="size-3 rounded border border-line/20 bg-ink-950/40 text-center leading-3 text-[10px] text-fg-faint/40">—</span>
                    <span>No Data</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Selected Day Details Panel (4 cols) */}
          <div className="lg:col-span-4">
            <Card aria-labelledby="selected-day-title" className="sticky top-4">
              <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-ember-400" />
                  <h3 id="selected-day-title" className="text-sm font-semibold text-fg">
                    Day Activity Details
                  </h3>
                </div>
                {selectedDate && (
                  <span className="font-mono text-xs font-semibold text-fg-muted">
                    {selectedDate}
                  </span>
                )}
              </div>

              {selectedDate ? (
                <div className="space-y-4 text-xs">
                  {/* Contextual Status callouts */}
                  {(() => {
                    const wNum = getWeekOfYear(selectedDate)
                    const wEntry = criticalWeeksMap.get(wNum)
                    const isAnom = anomalyDateSet.has(selectedDate)
                    return (
                      <div className="space-y-1.5">
                        {isAnom && (
                          <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-2 text-xs text-rose-200">
                            <strong className="block text-rose-300 font-semibold">
                              Statistical Anomaly Surge
                            </strong>
                            <span className="text-[11px] leading-tight">
                              Thermal radiance on this date exceeded the median baseline by &gt; 2.5x MAD.
                            </span>
                          </div>
                        )}
                        {wEntry?.isCriticalPeriod && (
                          <div className="rounded-lg border border-ember-500/40 bg-ember-950/30 p-2 text-xs text-ember-200">
                            <strong className="block text-ember-300 font-semibold">
                              Historical Critical Period (Week {wNum})
                            </strong>
                            <span className="text-[11px] leading-tight">
                              Falls in the {wEntry.criticalityTier.toUpperCase()} seasonal tier (historically averaging {wEntry.historicalMeanActiveCells} active cells).
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {selectedDayRecord ? (
                    <>
                      <div>
                        <span className="text-fg-faint block">Observed Thermal Radiance</span>
                        <p className="text-2xl font-bold text-fg mt-0.5">
                          {selectedDayRecord.total}{' '}
                          <span className="text-xs font-normal text-fg-muted">observations</span>
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-line bg-ink-950 p-2.5">
                          <span className="text-[11px] text-ember-400 font-semibold block">
                            MODIS (1 km)
                          </span>
                          <span className="text-lg font-bold text-fg">
                            {selectedDayRecord.modis}
                          </span>
                          <span className="text-[10px] text-fg-faint block">
                            Avg FRP: {selectedDayRecord.modisAvgFrp ?? 'N/A'} MW
                          </span>
                        </div>

                        <div className="rounded-lg border border-line bg-ink-950 p-2.5">
                          <span className="text-[11px] text-signal-400 font-semibold block">
                            VIIRS (375 m)
                          </span>
                          <span className="text-lg font-bold text-fg">
                            {selectedDayRecord.viirs}
                          </span>
                          <span className="text-[10px] text-fg-faint block">
                            Avg FRP: {selectedDayRecord.viirsAvgFrp ?? 'N/A'} MW
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-line bg-ink-950 p-2.5">
                        <span className="text-[11px] text-fg-faint block">
                          Overall Day Average FRP
                        </span>
                        <span className="text-base font-bold text-ember-400">
                          {selectedDayRecord.avgFrp !== null
                            ? `${selectedDayRecord.avgFrp} MW`
                            : 'Not available'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleExploreDayOnMap(selectedDate)}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-ember-500 py-2 font-semibold text-ink-950 hover:bg-ember-400 transition-colors shadow-sm"
                      >
                        <MapPin className="size-3.5" />
                        <span>Explore {selectedDate} on Map</span>
                      </button>
                    </>
                  ) : datasetBounds &&
                    selectedDate >= datasetBounds.min &&
                    selectedDate <= datasetBounds.max ? (
                    <div className="rounded-lg border border-line bg-ink-950 p-4 text-center space-y-2">
                      <p className="font-semibold text-fg">Zero Detected Hotspots</p>
                      <p className="text-[11px] text-fg-faint leading-relaxed">
                        Satellite observations were conducted during this period, and zero thermal anomalies were detected.
                        This may be due to heavy cloud cover, non-detection, or absence of surface fires.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-line bg-ink-950 p-4 text-center space-y-2">
                      <p className="font-semibold text-fg-muted">No Satellite Observations Available</p>
                      <p className="text-[11px] text-fg-faint leading-relaxed">
                        No satellite active-fire observation passes or archive records exist for {selectedDate} in the current dataset.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-fg-muted">
                  <p>Click any day on the calendar to view its observation count and jump to map.</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : viewMode === 'multiyear' ? (
        /* Year-over-Year Comparative Matrix View */
        <div className="space-y-6">
          {/* Scientific Harmonization Banner */}
          <div className="flex items-start gap-3 rounded-xl border border-signal-400/30 bg-signal-950/30 p-4 text-xs text-signal-200">
            <Info className="size-4 shrink-0 text-signal-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-fg">
                Multi-Year Temporal Harmonization ({MONTH_NAMES[multiYearMonth - 1]} across 2020–2026)
              </p>
              <p className="leading-relaxed text-fg-muted">
                Cross-year comparisons must be evaluated cautiously due to differences in sensor availability,
                orbital timing, and cloud occlusions. The matrix below displays{' '}
                <strong className="text-signal-300">
                  {(filter.metricType ?? 'harmonized') === 'harmonized'
                    ? `Harmonized Active Grid Cells (${filter.gridResolution}°)`
                    : (filter.metricType ?? 'raw_total').toUpperCase()}
                </strong>
                . 2026 data reflects available archive and near-real-time observations through October 2026.
              </p>
            </div>
          </div>

          {/* Month Summary Cards across Years */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 text-xs">
            {multiYearData.monthSummary.map((ms) => (
              <Card key={ms.year} padding="sm" className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-fg">{ms.year}</span>
                  {!ms.hasCoverage ? (
                    <Badge tone="neutral">No Coverage</Badge>
                  ) : ms.isPartial ? (
                    <Badge tone="ember">Partial</Badge>
                  ) : (
                    <Badge tone="ok">Observed</Badge>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-fg-faint block">
                    {filter.metricType === 'harmonized' ? 'Active Cells' : 'Hotspots'}
                  </span>
                  <span className="text-xl font-bold text-ember-400">
                    {ms.hasCoverage
                      ? filter.metricType === 'harmonized'
                        ? ms.harmonizedActiveCells
                        : ms.totalCount
                      : '—'}
                  </span>
                </div>
                <div className="text-[10px] text-fg-faint space-y-0.5 border-t border-line/40 pt-1 mt-1">
                  <div>M: {ms.hasCoverage ? ms.modisCount : '—'} · V: {ms.hasCoverage ? ms.viirsCount : '—'}</div>
                  <div>Active Days: {ms.hasCoverage ? ms.activeDaysCount : '—'}</div>
                  <div>Avg FRP: {ms.avgFrp !== null ? `${ms.avgFrp} MW` : 'N/A'}</div>
                </div>
              </Card>
            ))}
          </div>

          {/* Comparative Day-by-Day Heatmap Table */}
          <Card padding="sm" className="overflow-x-auto">
            <div className="border-b border-line pb-2 mb-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Grid className="size-4 text-ember-400" />
                <span className="font-semibold text-fg">
                  Daily Burning Activity Matrix — {MONTH_NAMES[multiYearMonth - 1]}
                </span>
              </div>
              <span className="text-fg-faint text-[11px]">
                Click any cell to navigate to that specific date on the map
              </span>
            </div>

            <table className="w-full min-w-[700px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-line text-fg-muted">
                  <th className="py-2 px-3 text-left font-semibold w-16">Day</th>
                  {multiYearData.years.map((y) => (
                    <th key={y} className="py-2 px-2 text-center font-semibold">
                      {y}
                      {y === 2026 && (
                        <span className="block text-[9px] text-ember-400 font-normal">
                          (thru Oct)
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30">
                {multiYearData.days.map((row) => (
                  <tr key={row.dayOfMonth} className="hover:bg-ink-800/40 transition-colors">
                    <td className="py-1.5 px-3 font-mono font-medium text-fg-muted">
                      Day {String(row.dayOfMonth).padStart(2, '0')}
                    </td>
                    {multiYearData.years.map((y) => {
                      const entry = row.byYear[y]
                      if (!entry) {
                        return (
                          <td key={y} className="p-1 text-center text-fg-faint text-[10px]">
                            —
                          </td>
                        )
                      }

                      if (entry.isLeapDay || entry.status === 'leap_day') {
                        return (
                          <td
                            key={y}
                            className="p-1 text-center text-[10px] text-fg-faint/40 italic"
                            title="Feb 29 only exists in leap years"
                          >
                            —
                          </td>
                        )
                      }

                      if (!entry.hasData || entry.status === 'no_coverage' || entry.value === null) {
                        return (
                          <td
                            key={y}
                            className="p-1 text-center text-[10px] text-fg-faint/40"
                            title={`No satellite observations available for ${y}`}
                          >
                            —
                          </td>
                        )
                      }

                      const val = entry.value
                      const isObservedZero = entry.hasData && val === 0
                      const dateStr = `${y}-${String(multiYearMonth).padStart(2, '0')}-${String(row.dayOfMonth).padStart(2, '0')}`

                      return (
                        <td key={y} className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleExploreDayOnMap(dateStr)}
                            className={`w-full py-1 px-1 rounded font-mono text-[11px] transition-all hover:scale-105 ${
                              isObservedZero
                                ? 'bg-ink-950/60 text-fg-faint/70 hover:bg-ink-800 hover:text-fg border border-line/40'
                                : val <= 4
                                  ? 'bg-ember-500/15 text-ember-300 border border-ember-500/20'
                                  : val <= 14
                                    ? 'bg-ember-500/35 text-ember-200 border border-ember-500/40 font-semibold'
                                    : val <= 29
                                      ? 'bg-ember-500/60 text-white border border-ember-500/70 font-bold'
                                      : 'bg-ember-500 text-ink-950 font-bold shadow-glow-ember'
                            }`}
                            title={`${dateStr}: ${val} ${filter.metricType} (${entry.rawCount} raw detections)`}
                          >
                            {val}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : (
        /* 12-Month Historical Overview Grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {monthlyData.map((m) => (
            <Card key={m.monthKey} padding="sm" className="space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="font-semibold text-sm text-fg">{m.label}</span>
                <Badge tone={m.total > 150 ? 'ember' : m.total > 50 ? 'signal' : 'neutral'}>
                  {m.total} Hotspots
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-fg-faint text-[11px]">MODIS (1 km):</span>
                  <p className="font-bold text-ember-400">{m.modis}</p>
                </div>
                <div>
                  <span className="text-fg-faint text-[11px]">VIIRS (375 m):</span>
                  <p className="font-bold text-signal-400">{m.viirs}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-line/40">
                <span className="text-fg-faint">Avg FRP:</span>
                <span className="font-semibold text-fg">
                  {m.avgFrp !== null ? `${m.avgFrp} MW` : 'N/A'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setViewYear(m.year)
                  setViewMonth(m.monthNumber)
                  setViewMode('daily')
                }}
                className="w-full rounded bg-ink-800 py-1.5 text-center text-xs text-fg-muted hover:bg-ink-700 hover:text-fg transition-colors"
              >
                Inspect Daily Calendar &rarr;
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

