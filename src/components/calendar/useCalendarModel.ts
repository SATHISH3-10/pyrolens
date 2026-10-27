import { useCallback, useMemo } from 'react'
import type { ActivityAnalysis, DailyActivity } from '@/types/activity'
import { useTheme } from '@/context/ThemeContext'
import {
  dayCellState,
  displayedAnomaly,
  historyYearsByDoy,
  MIN_ANOMALY_HISTORY_YEARS,
  rawBinIndex,
  rawBins,
  rawCount,
  smartFilterAvailability,
  smartFilterPredicate,
  type SensorView,
  type SmartFilter,
} from '@/utils/calendarLayout'
import { rawRamp, type CellPaint } from './cellPainter'

export interface CalendarModel {
  history: number[]
  /** True when no day of year has enough history for anomaly rings. */
  noAnomalyHistory: boolean
  availability: Record<SmartFilter, string | null>
  matches: (d: DailyActivity | undefined) => boolean
  bins: number[]
  ramp: string[]
  paint: (d: DailyActivity | undefined) => CellPaint
  fill: (d: DailyActivity) => string | null
}

export function useCalendarModel(analysis: ActivityAnalysis, sensorView: SensorView, smartFilter: SmartFilter): CalendarModel {
  const { tokens } = useTheme()
  const history = useMemo(() => historyYearsByDoy(analysis.days), [analysis])
  const availability = useMemo(() => {
    const base = smartFilterAvailability(analysis.days, history)
    if (sensorView === 'harmonized') return base
    // Raw sensor views never mix with BAI-derived information.
    const why = 'BAI-based highlight: switch the calendar to Harmonized.'
    return { ...base, top_bai: why, extreme: why, anomalies: why, modis_scaled: why }
  }, [analysis, history, sensorView])
  const effectiveFilter: SmartFilter = availability[smartFilter] ? 'none' : smartFilter
  const matches = useMemo(() => smartFilterPredicate(effectiveFilter, analysis.days, history), [effectiveFilter, analysis, history])
  const bins = useMemo(
    () => (sensorView === 'harmonized' ? [] : rawBins(analysis.days.map((d) => rawCount(d, sensorView)))),
    [analysis, sensorView],
  )
  const ramp = useMemo(() => (sensorView === 'harmonized' ? [] : rawRamp(tokens, sensorView === 'modis' ? 'MODIS' : 'VIIRS')), [tokens, sensorView])

  const fill = useCallback(
    (d: DailyActivity) =>
      sensorView === 'harmonized'
        ? d.cls === 'none'
          ? null
          : tokens.bai[d.cls]
        : (ramp[rawBinIndex(rawCount(d, sensorView), bins)] ?? null),
    [sensorView, tokens, ramp, bins],
  )

  const paint = useCallback(
    (d: DailyActivity | undefined): CellPaint => {
      const state = dayCellState(d, sensorView)
      if (!d) return { state, fill: null, limited: false, scaled: false, anomaly: 'none', dim: !matches(d) }
      const anomaly = sensorView === 'harmonized' ? displayedAnomaly(d, history) : 'none'
      return {
        state,
        fill: state === 'active' ? fill(d) : null,
        limited: d.quality === 'limited',
        // BAI-only encodings are never mixed into raw sensor views.
        scaled: sensorView === 'harmonized' && d.source === 'modis_scaled' && state === 'active',
        anomaly: anomaly === 'insufficient' ? 'none' : anomaly,
        dim: !matches(d),
      }
    },
    [sensorView, history, matches, fill],
  )

  return {
    history,
    noAnomalyHistory: !history.some((n) => n >= MIN_ANOMALY_HISTORY_YEARS),
    availability,
    matches,
    bins,
    ramp,
    paint,
    fill,
  }
}
