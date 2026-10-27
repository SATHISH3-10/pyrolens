import type { FireObservation, ObservationFilter } from '@/types/fire'
import { addDays } from './burningActivity'

/**
 * Pure helpers for the Fire Map's derived view: time windows, detection age, FRP classes, confidence and
 * satellite normalization, and filters. None of these mutate the dataset or touch the BAI science.
 */

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** Acquisition instant (UTC ms) from FIRMS acq_date + acq_time (HHMM). */
export function acquisitionMs(o: Pick<FireObservation, 'acqDate' | 'acqTime'>): number {
  const t = (o.acqTime || '0000').padStart(4, '0')
  return Date.parse(`${o.acqDate}T${t.slice(0, 2)}:${t.slice(2, 4)}:00Z`)
}

export type WindowMode = 'day' | '24h' | '48h' | '7d' | 'all'

export const WINDOW_LABELS: Record<WindowMode, string> = {
  day: 'Selected day',
  '24h': 'Rolling 24 h',
  '48h': 'Rolling 48 h',
  '7d': '7 days',
  all: 'All dates',
}

export interface TimeWindow {
  mode: WindowMode
  /** Inclusive start / exclusive end, UTC ms. */
  startMs: number
  endMs: number
  /** Inclusive date span touched by the window (for day-bucket lookups). */
  startDate: string
  endDate: string
}

/**
 * The window ends at the end of the selected (playback) day, or at `nowMs` if that is earlier — so for a
 * live near-real-time fetch the window end is "now", and for history it is the playback time.
 */
export function timeWindow(
  mode: WindowMode,
  selectedDate: string,
  range: { start: string; end: string },
  nowMs: number = Date.now(),
): TimeWindow {
  const dayEnd = Date.parse(`${selectedDate}T00:00:00Z`) + DAY_MS
  const endMs = mode === 'all' ? Date.parse(`${range.end}T00:00:00Z`) + DAY_MS : Math.min(dayEnd, nowMs)
  const span = mode === 'day' ? DAY_MS : mode === '24h' ? DAY_MS : mode === '48h' ? 2 * DAY_MS : mode === '7d' ? 7 * DAY_MS : 0
  const startMs =
    mode === 'all'
      ? Date.parse(`${range.start}T00:00:00Z`)
      : mode === 'day'
        ? Date.parse(`${selectedDate}T00:00:00Z`)
        : endMs - span
  const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return { mode, startMs, endMs, startDate: toDate(startMs), endDate: toDate(Math.max(startMs, endMs - 1)) }
}

/** FIRMS-style age buckets, measured in hours before the window end. */
export const AGE_BUCKETS = [
  { maxHours: 1, label: '< 1 h', color: [127, 0, 0] },
  { maxHours: 3, label: '1–3 h', color: [220, 38, 38] },
  { maxHours: 6, label: '3–6 h', color: [249, 115, 22] },
  { maxHours: 12, label: '6–12 h', color: [250, 204, 21] },
  { maxHours: 24, label: '12–24 h', color: [253, 224, 71] },
  { maxHours: Infinity, label: '> 24 h', color: [254, 243, 199] },
] as const

export function detectionAgeHours(o: Pick<FireObservation, 'acqDate' | 'acqTime'>, windowEndMs: number): number {
  return (windowEndMs - acquisitionMs(o)) / HOUR_MS
}

/** Index into AGE_BUCKETS; detections at or after the window end count as the newest bucket. */
export function ageBucket(hours: number): number {
  if (!(hours >= 0)) return 0
  const i = AGE_BUCKETS.findIndex((b) => hours < b.maxHours)
  return i === -1 ? AGE_BUCKETS.length - 1 : i
}

export type FrpClass = 'low' | 'moderate' | 'high' | 'extreme'
/** Per-pixel FRP classes (MW). Display aid only; not used by the BAI. */
export const FRP_THRESHOLDS = { moderate: 10, high: 30, extreme: 100 } as const

export function frpClass(frp: number | null): FrpClass | null {
  if (frp === null || !Number.isFinite(frp)) return null
  if (frp >= FRP_THRESHOLDS.extreme) return 'extreme'
  if (frp >= FRP_THRESHOLDS.high) return 'high'
  if (frp >= FRP_THRESHOLDS.moderate) return 'moderate'
  return 'low'
}

export type ConfidenceLevel = 'low' | 'nominal' | 'high'
const CONF_RANK: Record<ConfidenceLevel, number> = { low: 0, nominal: 1, high: 2 }

/** MODIS numeric confidence → <30 low, 30–79 nominal, ≥80 high; VIIRS l/n/h as given. */
export function confidenceLevel(o: Pick<FireObservation, 'confidence'>): ConfidenceLevel {
  const c = o.confidence
  if (typeof c === 'number') return c < 30 ? 'low' : c < 80 ? 'nominal' : 'high'
  const s = String(c).toLowerCase()
  return s.startsWith('l') ? 'low' : s.startsWith('h') ? 'high' : 'nominal'
}

export type SatelliteKey = 'Terra' | 'Aqua' | 'S-NPP' | 'NOAA-20' | 'NOAA-21' | 'Other'
export const SATELLITE_ORDER: SatelliteKey[] = ['Terra', 'Aqua', 'S-NPP', 'NOAA-20', 'NOAA-21', 'Other']

/** Normalizes FIRMS satellite codes (T, A, N, N20, N21, J1, …) and long names to one key. */
export function satelliteKey(o: Pick<FireObservation, 'satellite' | 'instrument'>): SatelliteKey {
  const s = String(o.satellite ?? '').trim().toUpperCase().replace(/[\s_]/g, '')
  if (s === 'T' || s.startsWith('TERRA')) return 'Terra'
  if (s === 'A' || s.startsWith('AQUA')) return 'Aqua'
  if (s === 'N20' || s === 'NOAA20' || s === 'NOAA-20' || s === 'J1' || s === '1') return 'NOAA-20'
  if (s === 'N21' || s === 'NOAA21' || s === 'NOAA-21' || s === 'J2' || s === '2') return 'NOAA-21'
  if (s === 'N' || s.includes('NPP') || s === 'SNPP') return 'S-NPP'
  return 'Other'
}

/** Map filters reuse ObservationFilter's existing day/night, minimum FRP and minimum confidence fields. */
export type MapFilters = Required<Pick<ObservationFilter, 'daynight' | 'minFrp'>> & {
  minConfidence: ConfidenceLevel | 'ALL'
  /** null = all satellites present in the data. */
  satellites: SatelliteKey[] | null
}

export const DEFAULT_MAP_FILTERS: MapFilters = { daynight: 'ALL', minFrp: 0, minConfidence: 'ALL', satellites: null }

export function isDefaultFilters(f: MapFilters): boolean {
  return f.daynight === 'ALL' && f.minFrp === 0 && f.minConfidence === 'ALL' && f.satellites === null
}

export function matchesFilters(o: FireObservation, f: MapFilters): boolean {
  if (f.daynight !== 'ALL' && o.daynight !== f.daynight) return false
  if (f.minFrp > 0 && (o.frp === null || o.frp < f.minFrp)) return false
  if (f.minConfidence !== 'ALL' && CONF_RANK[confidenceLevel(o)] < CONF_RANK[f.minConfidence]) return false
  if (f.satellites && !f.satellites.includes(satelliteKey(o))) return false
  return true
}

/** Observations grouped by acquisition date for O(window) slicing during playback. */
export function buildDayBuckets(obs: readonly FireObservation[]): Map<string, FireObservation[]> {
  const m = new Map<string, FireObservation[]>()
  for (const o of obs) {
    const b = m.get(o.acqDate)
    if (b) b.push(o)
    else m.set(o.acqDate, [o])
  }
  return m
}

/** Detections inside the window (by acquisition time), drawn from day buckets. */
export function sliceWindow(buckets: Map<string, FireObservation[]>, w: TimeWindow): FireObservation[] {
  const out: FireObservation[] = []
  if (w.mode === 'all') {
    for (const [date, list] of buckets) if (date >= w.startDate && date <= w.endDate) out.push(...list)
    return out
  }
  for (let d = w.startDate; d <= w.endDate; d = addDays(d, 1)) {
    const list = buckets.get(d)
    if (!list) continue
    for (const o of list) {
      const t = acquisitionMs(o)
      if (t >= w.startMs && t < w.endMs) out.push(o)
    }
  }
  return out
}

export function satellitesPresent(obs: readonly FireObservation[]): SatelliteKey[] {
  const set = new Set<SatelliteKey>()
  for (const o of obs) set.add(satelliteKey(o))
  return SATELLITE_ORDER.filter((s) => set.has(s))
}

/** Approximate local solar time at the detection's longitude (UTC + lon/15 h). */
export function localSolarTime(o: Pick<FireObservation, 'acqDate' | 'acqTime' | 'longitude'>): string {
  const ms = acquisitionMs(o) + (o.longitude / 15) * HOUR_MS
  const d = new Date(ms)
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`
}
