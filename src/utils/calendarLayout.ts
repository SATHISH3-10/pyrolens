import type { ActivityAnalysis, AnomalyLevel, DailyActivity } from '@/types/activity'
import { aggregatePeriods, type PeriodCell } from './burningActivity'

/**
 * Pure layout and cell-state helpers for the Burning Calendar views. No scientific logic lives here: classes,
 * anomalies and coverage all come from the existing analysis; this only decides where and how to draw them.
 */

const DAY_MS = 86_400_000

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** Monday-first weekday index: Mon 0 … Sun 6. */
export function weekdayMon0(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
}

export interface YearGridCell {
  date: string
  col: number
  row: number // 0 = Monday
}

/**
 * GitHub-contribution layout: one column per week (Monday-first), one row per weekday. Most years need 53
 * columns; a leap year that starts on a Sunday needs 54.
 */
export function yearGrid(year: number): { cells: YearGridCell[]; columns: number; monthStartCols: number[] } {
  const start = Date.UTC(year, 0, 1)
  const offset = (new Date(start).getUTCDay() + 6) % 7
  const n = isLeapYear(year) ? 366 : 365
  const cells: YearGridCell[] = []
  const monthStartCols = new Array(12).fill(0) as number[]
  for (let i = 0; i < n; i++) {
    const d = new Date(start + i * DAY_MS)
    const date = d.toISOString().slice(0, 10)
    const col = Math.floor((i + offset) / 7)
    const row = (i + offset) % 7
    if (d.getUTCDate() === 1) monthStartCols[d.getUTCMonth()] = col
    cells.push({ date, col, row })
  }
  return { cells, columns: Math.floor((n - 1 + offset) / 7) + 1, monthStartCols }
}

/** Monday-first month matrix: 4–6 rows of 7, `null` for padding days outside the month. */
export function monthGrid(year: number, month: number): Array<Array<string | null>> {
  const first = Date.UTC(year, month - 1, 1)
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const offset = (new Date(first).getUTCDay() + 6) % 7
  const rows: Array<Array<string | null>> = []
  let row: Array<string | null> = new Array(offset).fill(null)
  for (let d = 1; d <= days; d++) {
    row.push(new Date(first + (d - 1) * DAY_MS).toISOString().slice(0, 10))
    if (row.length === 7) {
      rows.push(row)
      row = []
    }
  }
  if (row.length) rows.push([...row, ...new Array(7 - row.length).fill(null)])
  return rows
}

/** How a cell's coverage is known. Unknown and no-coverage must never be drawn as zero. */
export type CellState = 'unknown' | 'no_coverage' | 'zero' | 'active'

export type SensorView = 'harmonized' | 'modis' | 'viirs'

export function dayCellState(day: DailyActivity | undefined, view: SensorView = 'harmonized'): CellState {
  if (!day) return 'unknown'
  if (view === 'modis') return day.modisSats === 0 ? 'no_coverage' : day.modisCount > 0 ? 'active' : 'zero'
  if (view === 'viirs') return day.viirsSats === 0 ? 'no_coverage' : day.viirsCount > 0 ? 'active' : 'zero'
  if (day.source === 'none') return 'no_coverage'
  return day.harmonizedCount > 0 ? 'active' : 'zero'
}

export function rawCount(day: DailyActivity, view: SensorView): number {
  return view === 'modis' ? day.modisCount : view === 'viirs' ? day.viirsCount : day.harmonizedCount
}

/** Minimum number of covered years at a day of year before anomaly rings are shown. */
export const MIN_ANOMALY_HISTORY_YEARS = 5

/** Distinct covered years per day of year (index 0 → doy 1). */
export function historyYearsByDoy(days: readonly DailyActivity[]): number[] {
  const sets = Array.from({ length: 365 }, () => new Set<number>())
  for (const d of days) if (d.source !== 'none') sets[d.doy - 1]!.add(d.year)
  return sets.map((s) => s.size)
}

/** Anomaly level to display, or 'insufficient' when there is too little history to judge. */
export function displayedAnomaly(day: DailyActivity, history: readonly number[]): AnomalyLevel | 'insufficient' {
  if ((history[day.doy - 1] ?? 0) < MIN_ANOMALY_HISTORY_YEARS) return 'insufficient'
  return day.anomaly
}

export type SmartFilter =
  | 'none'
  | 'top_bai'
  | 'extreme'
  | 'anomalies'
  | 'top_frp'
  | 'modis_only'
  | 'viirs'
  | 'modis_scaled'
  | 'limited'
  | 'no_data'

export const SMART_FILTER_LABELS: Record<SmartFilter, string> = {
  none: 'No highlight',
  top_bai: 'Highest BAI (top 20 days)',
  extreme: 'Extreme days',
  anomalies: 'Anomalies',
  top_frp: 'Highest FRP (top 20 days)',
  modis_only: 'MODIS-only days',
  viirs: 'VIIRS observed',
  modis_scaled: 'MODIS scaled estimates',
  limited: 'Limited observation',
  no_data: 'No or unknown coverage',
}

/** Which smart filters the loaded data can support, with a reason when not. */
export function smartFilterAvailability(
  days: readonly DailyActivity[],
  history: readonly number[],
): Record<SmartFilter, string | null> {
  const has = (p: (d: DailyActivity) => boolean) => days.some(p)
  const reason = (ok: boolean, why: string) => (ok ? null : why)
  return {
    none: null,
    top_bai: reason(has((d) => d.bai > 0), 'No active days in the loaded data.'),
    extreme: reason(has((d) => d.cls === 'extreme'), 'No day reaches the Extreme class.'),
    anomalies: reason(
      history.some((n) => n >= MIN_ANOMALY_HISTORY_YEARS),
      `Needs at least ${MIN_ANOMALY_HISTORY_YEARS} years of history for a day of year.`,
    ),
    top_frp: reason(has((d) => d.maxFrp !== null && d.maxFrp > 0), 'The loaded data has no FRP values.'),
    modis_only: reason(has((d) => d.modisSats > 0 && d.viirsSats === 0), 'No MODIS-only days (VIIRS covers the whole record).'),
    viirs: reason(has((d) => d.viirsSats > 0), 'The loaded data has no VIIRS detections.'),
    modis_scaled: reason(has((d) => d.source === 'modis_scaled'), 'No MODIS-scaled estimates in the loaded data.'),
    limited: reason(has((d) => d.quality === 'limited'), 'No days are flagged as limited observation.'),
    no_data: null,
  }
}

/** Predicate for "dim everything that does not match" highlighting. */
export function smartFilterPredicate(
  filter: SmartFilter,
  days: readonly DailyActivity[],
  history: readonly number[],
): (d: DailyActivity | undefined) => boolean {
  const topBy = (key: (d: DailyActivity) => number) => {
    const set = new Set(
      [...days]
        .filter((d) => key(d) > 0)
        .sort((a, b) => key(b) - key(a))
        .slice(0, 20)
        .map((d) => d.date),
    )
    return (d: DailyActivity | undefined) => !!d && set.has(d.date)
  }
  switch (filter) {
    case 'none':
      return () => true
    case 'top_bai':
      return topBy((d) => d.bai)
    case 'top_frp':
      return topBy((d) => d.maxFrp ?? 0)
    case 'extreme':
      return (d) => !!d && d.cls === 'extreme'
    case 'anomalies':
      return (d) => {
        if (!d) return false
        const a = displayedAnomaly(d, history)
        return a === 'above_normal' || a === 'extreme'
      }
    case 'modis_only':
      return (d) => !!d && d.modisSats > 0 && d.viirsSats === 0
    case 'viirs':
      return (d) => !!d && d.viirsSats > 0
    case 'modis_scaled':
      return (d) => !!d && d.source === 'modis_scaled'
    case 'limited':
      return (d) => !!d && d.quality === 'limited'
    case 'no_data':
      return (d) => !d || d.source === 'none'
  }
}

/** Five quantile bins over non-zero raw counts, for the raw MODIS / VIIRS views (never mixed with BAI classes). */
export function rawBins(values: readonly number[]): number[] {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (nz.length === 0) return [1, 2, 3, 4]
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))]!
  const raw = [q(0.4), q(0.7), q(0.9), q(0.97)]
  // Strictly increasing upper bounds so every bin is reachable.
  for (let i = 1; i < raw.length; i++) if (raw[i]! <= raw[i - 1]!) raw[i] = raw[i - 1]! + 1
  return raw
}

export function rawBinIndex(v: number, bins: readonly number[]): number {
  let i = 0
  while (i < bins.length && v > bins[i]!) i++
  return i // 0..4
}

export interface WeekCell extends PeriodCell {
  modis: number
  viirs: number
  modisCovered: number
  viirsCovered: number
}

/** Weekly aggregates via the existing aggregatePeriods, augmented with raw per-sensor sums. */
export function weeklyCells(analysis: ActivityAnalysis): Map<string, WeekCell> {
  const map = new Map<string, WeekCell>()
  for (const p of aggregatePeriods(analysis, 'week')) {
    let modis = 0
    let viirs = 0
    let modisCovered = 0
    let viirsCovered = 0
    const i0 = analysis.dayIndex.get(p.start) ?? 0
    const i1 = analysis.dayIndex.get(p.end) ?? i0
    for (let i = i0; i <= i1; i++) {
      const d = analysis.days[i]!
      modis += d.modisCount
      viirs += d.viirsCount
      if (d.modisSats > 0) modisCovered++
      if (d.viirsSats > 0) viirsCovered++
    }
    map.set(`${p.year}-${p.index}`, { ...p, modis, viirs, modisCovered, viirsCovered })
  }
  return map
}

export function weekCellState(c: WeekCell | undefined, view: SensorView): CellState {
  if (!c) return 'unknown'
  if (view === 'modis') return c.modisCovered === 0 ? 'no_coverage' : c.modis > 0 ? 'active' : 'zero'
  if (view === 'viirs') return c.viirsCovered === 0 ? 'no_coverage' : c.viirs > 0 ? 'active' : 'zero'
  if (c.coveredDays === 0) return 'no_coverage'
  return c.activeDays > 0 ? 'active' : 'zero'
}

/** Parses ?date=YYYY-MM-DD, rejecting malformed or impossible dates. */
export function parseUrlDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === value ? value : null
}
