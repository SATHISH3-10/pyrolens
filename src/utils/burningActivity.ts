import type { FireObservation } from '@/types/fire'
import type {
  ActivityAnalysis,
  ActivityClass,
  BaiWeights,
  CriticalOutlook,
  CriticalPeriod,
  DailyActivity,
  DataSource,
  DoyClimatology,
  FireEvent,
  FireSeason,
  HarmonizationModel,
  MonthClimatology,
  MonthlyFactor,
  RiskLevel,
  SeasonFlag,
  SeasonNorms,
  ValidationPoint,
} from '@/types/activity'

/**
 * Harmonized Burning Activity pipeline.
 *
 *   detections ──QC──▶ daily per-sensor aggregates ──satellite-normalize──▶ per-overpass counts
 *        ──overlap period──▶ monthly VIIRS:MODIS continuity factors r(m)
 *        ──scale MODIS-only days──▶ harmonized VIIRS-equivalent series
 *        ──log + robust normalize──▶ Burning Activity Index (0–100)
 *        ──day-of-year climatology──▶ classes, anomalies, critical periods, seasons, outlook
 */

export const DEFAULT_BAI_WEIGHTS: BaiWeights = { count: 0.4, frp: 0.4, clusters: 0.2 }

export const CLASS_THRESHOLDS: Array<{ cls: ActivityClass; min: number; label: string; range: string }> = [
  { cls: 'low', min: 0, label: 'Low', range: '0–40th pct' },
  { cls: 'moderate', min: 40, label: 'Moderate', range: '40–70th' },
  { cls: 'high', min: 70, label: 'High', range: '70–90th' },
  { cls: 'very_high', min: 90, label: 'Very high', range: '90–97th' },
  { cls: 'extreme', min: 97, label: 'Extreme', range: '97–100th' },
]

export const CLASS_LABEL: Record<ActivityClass, string> = {
  none: 'No detections',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very high',
  extreme: 'Extreme',
}

export const CLASS_RANK: Record<ActivityClass, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
  very_high: 4,
  extreme: 5,
}

const DAY_MS = 86_400_000
const CLUSTER_CELL_DEG = 0.05
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── small helpers ──────────────────────────────────────────────────────────

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const a = sorted[lo]!
  const b = sorted[hi]!
  return a + (b - a) * (pos - lo)
}

export function median(values: readonly number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5)
}

function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: string, n: number): string {
  return fromMs(toMs(date) + n * DAY_MS)
}

/** Day of year on a fixed 365-day calendar: Feb 29 folds onto Feb 28 (doy 59). */
export function doy365(date: string): number {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const d = Number(date.slice(8, 10))
  const raw = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / DAY_MS) + 1
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  if (leap && raw >= 60) return raw - 1
  return raw
}

/** Label like "Mar 14" for a 365-calendar day of year. */
export function doyLabel(doy: number): string {
  const ms = Date.UTC(2001, 0, 1) + (Math.round(doy) - 1) * DAY_MS
  const d = new Date(ms)
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function isLowConfidence(obs: FireObservation): boolean {
  const c = obs.confidence
  if (typeof c === 'number') return c < 30
  const s = String(c).toLowerCase()
  return s === 'low' || s === 'l'
}

export function classifyPercentile(p: number | null): ActivityClass {
  if (p === null) return 'none'
  if (p >= 97) return 'extreme'
  if (p >= 90) return 'very_high'
  if (p >= 70) return 'high'
  if (p >= 40) return 'moderate'
  return 'low'
}

/** Count 8-connected components among grid cells. */
function countComponents(cells: Set<string>): number {
  const seen = new Set<string>()
  let components = 0
  for (const start of cells) {
    if (seen.has(start)) continue
    components++
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const key = stack.pop()!
      const sep = key.indexOf(':')
      const x = Number(key.slice(0, sep))
      const y = Number(key.slice(sep + 1))
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const k = `${x + dx}:${y + dy}`
          if (cells.has(k) && !seen.has(k)) {
            seen.add(k)
            stack.push(k)
          }
        }
      }
    }
  }
  return components
}

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lng / CLUSTER_CELL_DEG)}:${Math.floor(lat / CLUSTER_CELL_DEG)}`
}

// ─── main pipeline ──────────────────────────────────────────────────────────

interface DayAccumulator {
  modisCount: number
  viirsCount: number
  modisFrp: number
  viirsFrp: number
  modisCells: Set<string>
  viirsCells: Set<string>
  day: number
  night: number
  low: number
  maxFrp: number | null
}

export function analyzeBurningActivity(
  observations: readonly FireObservation[],
  weights: BaiWeights = DEFAULT_BAI_WEIGHTS,
): ActivityAnalysis | null {
  if (observations.length === 0) return null

  // 1. QC: low-confidence removal, duplicate suppression, satellite operating windows.
  const seen = new Set<string>()
  const acc = new Map<string, DayAccumulator>()
  const satWindows = new Map<string, { instrument: string; first: string; last: string }>()
  let duplicates = 0
  let lowRemoved = 0
  let firstDate = '9999-12-31'
  let lastDate = '0000-01-01'

  for (const obs of observations) {
    if (!Number.isFinite(obs.latitude) || !Number.isFinite(obs.longitude) || !obs.acqDate) continue
    const dupKey = `${obs.satellite}|${obs.acqDate}|${obs.acqTime}|${obs.latitude.toFixed(4)}|${obs.longitude.toFixed(4)}`
    if (seen.has(dupKey)) {
      duplicates++
      continue
    }
    seen.add(dupKey)

    if (obs.acqDate < firstDate) firstDate = obs.acqDate
    if (obs.acqDate > lastDate) lastDate = obs.acqDate

    const satName = String(obs.satellite || obs.instrument)
    const w = satWindows.get(satName)
    if (!w) satWindows.set(satName, { instrument: obs.instrument, first: obs.acqDate, last: obs.acqDate })
    else {
      if (obs.acqDate < w.first) w.first = obs.acqDate
      if (obs.acqDate > w.last) w.last = obs.acqDate
    }

    let a = acc.get(obs.acqDate)
    if (!a) {
      a = {
        modisCount: 0,
        viirsCount: 0,
        modisFrp: 0,
        viirsFrp: 0,
        modisCells: new Set(),
        viirsCells: new Set(),
        day: 0,
        night: 0,
        low: 0,
        maxFrp: null,
      }
      acc.set(obs.acqDate, a)
    }

    if (isLowConfidence(obs)) {
      a.low++
      lowRemoved++
      continue
    }

    const frp = obs.frp !== null && Number.isFinite(obs.frp) ? obs.frp : 0
    if (obs.instrument === 'MODIS') {
      a.modisCount++
      a.modisFrp += frp
      a.modisCells.add(cellKey(obs.latitude, obs.longitude))
    } else {
      a.viirsCount++
      a.viirsFrp += frp
      a.viirsCells.add(cellKey(obs.latitude, obs.longitude))
    }
    if (obs.daynight === 'N') a.night++
    else a.day++
    if (obs.frp !== null && (a.maxFrp === null || obs.frp > a.maxFrp)) a.maxFrp = obs.frp
  }

  if (firstDate > lastDate) return null

  const windows = [...satWindows.values()]
  const satsOn = (date: string, instrument: string) =>
    windows.filter((w) => w.instrument === instrument && w.first <= date && w.last >= date).length

  // 2. Contiguous daily table.
  const days: DailyActivity[] = []
  const dayIndex = new Map<string, number>()
  for (let ms = toMs(firstDate); ms <= toMs(lastDate); ms += DAY_MS) {
    const date = fromMs(ms)
    const a = acc.get(date)
    const modisSats = satsOn(date, 'MODIS')
    const viirsSats = satsOn(date, 'VIIRS')
    dayIndex.set(date, days.length)
    days.push({
      date,
      year: Number(date.slice(0, 4)),
      month: Number(date.slice(5, 7)),
      doy: doy365(date),
      modisCount: a?.modisCount ?? 0,
      viirsCount: a?.viirsCount ?? 0,
      modisFrp: a?.modisFrp ?? 0,
      viirsFrp: a?.viirsFrp ?? 0,
      modisSats,
      viirsSats,
      modisClusters: a ? countComponents(a.modisCells) : 0,
      viirsClusters: a ? countComponents(a.viirsCells) : 0,
      dayDetections: a?.day ?? 0,
      nightDetections: a?.night ?? 0,
      lowConfidenceRemoved: a?.low ?? 0,
      maxFrp: a?.maxFrp ?? null,
      harmonizedCount: 0,
      harmonizedCountLow: 0,
      harmonizedCountHigh: 0,
      harmonizedFrp: 0,
      harmonizedClusters: 0,
      source: 'none',
      bai: 0,
      percentile: null,
      cls: 'none',
      quality: 'good',
      qualityScore: 1,
      climP50: 0,
      climP90: 0,
      climP97: 0,
      anomaly: 'none',
      criticalPeriodId: null,
    })
  }

  // 3. Harmonization model from the MODIS–VIIRS overlap period.
  const model = buildHarmonizationModel(days)

  // 4. Harmonized VIIRS-equivalent daily series.
  for (const d of days) {
    const f = model.factors[d.month - 1]!
    if (d.viirsSats > 0) {
      d.harmonizedCount = d.viirsCount / d.viirsSats
      d.harmonizedCountLow = d.harmonizedCount
      d.harmonizedCountHigh = d.harmonizedCount
      d.harmonizedFrp = d.viirsFrp / d.viirsSats
      d.harmonizedClusters = d.viirsClusters / d.viirsSats
      d.source = d.modisSats > 0 ? 'combined' : 'viirs'
    } else if (d.modisSats > 0) {
      const m = d.modisCount / d.modisSats
      d.harmonizedCount = m * f.countRatio
      d.harmonizedCountLow = m * f.countQ25
      d.harmonizedCountHigh = m * f.countQ75
      d.harmonizedFrp = (d.modisFrp / d.modisSats) * f.frpRatio
      d.harmonizedClusters = (d.modisClusters / d.modisSats) * f.clusterRatio
      d.source = model.available ? 'modis_scaled' : 'modis_unscaled'
    } else {
      d.source = 'none'
      d.quality = 'no_coverage'
      d.qualityScore = 0
    }
  }

  // 5. Burning Activity Index.
  computeBai(days, weights)

  // 6. Day-of-year climatology (±7-day window across all years).
  const climatology = buildClimatology(days)
  for (const d of days) {
    const c = climatology[d.doy - 1]!
    d.climP50 = c.p50
    d.climP90 = c.p90
    d.climP97 = c.p97
  }

  // 7. Observation quality: flag suspicious gaps instead of treating them as "no fire".
  assessQuality(days, climatology)

  // 8. Anomalies.
  for (const d of days) {
    if (d.cls === 'none' || d.quality === 'no_coverage') continue
    if (CLASS_RANK[d.cls] < CLASS_RANK.moderate) continue
    if (d.bai > d.climP97 && d.bai > 0) d.anomaly = 'extreme'
    else if (d.bai > d.climP90 && d.bai > 0) d.anomaly = 'above_normal'
  }

  // 9. Critical periods.
  const criticalPeriods = findCriticalPeriods(days)

  // 10. Seasonal timing.
  const months = buildMonthClimatology(days)
  const { seasons, norms } = buildSeasons(days, months)

  let modisTotal = 0
  let viirsTotal = 0
  let activeDays = 0
  for (const d of days) {
    modisTotal += d.modisCount
    viirsTotal += d.viirsCount
    if (d.harmonizedCount > 0) activeDays++
  }

  return {
    days,
    dayIndex,
    firstDate,
    lastDate,
    model,
    weights,
    climatology,
    months,
    criticalPeriods,
    seasons,
    seasonNorms: norms,
    activeDays,
    totals: {
      modis: modisTotal,
      viirs: viirsTotal,
      lowConfidenceRemoved: lowRemoved,
      duplicatesRemoved: duplicates,
    },
  }
}

// ─── harmonization ──────────────────────────────────────────────────────────

interface MonthSums {
  year: number
  month: number
  modis: number
  viirs: number
  modisFrp: number
  viirsFrp: number
  modisClusters: number
  viirsClusters: number
}

function buildHarmonizationModel(days: readonly DailyActivity[]): HarmonizationModel {
  let modisStart: string | null = null
  let viirsStart: string | null = null
  let overlapStart: string | null = null
  let overlapEnd: string | null = null
  const sums = new Map<string, MonthSums>()

  for (const d of days) {
    if (d.modisSats > 0 && !modisStart) modisStart = d.date
    if (d.viirsSats > 0 && !viirsStart) viirsStart = d.date
    if (d.modisSats === 0 || d.viirsSats === 0) continue
    if (!overlapStart) overlapStart = d.date
    overlapEnd = d.date
    const key = `${d.year}-${d.month}`
    let s = sums.get(key)
    if (!s) {
      s = { year: d.year, month: d.month, modis: 0, viirs: 0, modisFrp: 0, viirsFrp: 0, modisClusters: 0, viirsClusters: 0 }
      sums.set(key, s)
    }
    s.modis += d.modisCount / d.modisSats
    s.viirs += d.viirsCount / d.viirsSats
    s.modisFrp += d.modisFrp / d.modisSats
    s.viirsFrp += d.viirsFrp / d.viirsSats
    s.modisClusters += d.modisClusters / d.modisSats
    s.viirsClusters += d.viirsClusters / d.viirsSats
  }

  const MIN_MODIS = 4
  const usable = [...sums.values()].filter((s) => s.modis >= MIN_MODIS && s.viirs > 0)

  let pooledM = 0
  let pooledV = 0
  let pooledMF = 0
  let pooledVF = 0
  let pooledMC = 0
  let pooledVC = 0
  for (const s of usable) {
    pooledM += s.modis
    pooledV += s.viirs
    pooledMF += s.modisFrp
    pooledVF += s.viirsFrp
    pooledMC += s.modisClusters
    pooledVC += s.viirsClusters
  }
  const available = usable.length >= 3 && pooledM > 0
  const pooledCountRatio = available ? pooledV / pooledM : 1
  const pooledFrpRatio = available && pooledMF > 0 ? pooledVF / pooledMF : 1
  const pooledClusterRatio = available && pooledMC > 0 ? pooledVC / pooledMC : 1

  const factorFor = (rows: MonthSums[], month: number): MonthlyFactor => {
    if (!available || rows.length < 2) {
      return {
        month,
        countRatio: pooledCountRatio,
        countQ25: pooledCountRatio * 0.8,
        countQ75: pooledCountRatio * 1.2,
        frpRatio: pooledFrpRatio,
        clusterRatio: pooledClusterRatio,
        samples: rows.length,
        fallback: true,
      }
    }
    const ratios = rows.map((r) => r.viirs / r.modis).sort((a, b) => a - b)
    const frp = rows.filter((r) => r.modisFrp > 0).map((r) => r.viirsFrp / r.modisFrp)
    const clu = rows.filter((r) => r.modisClusters > 0).map((r) => r.viirsClusters / r.modisClusters)
    return {
      month,
      countRatio: quantile(ratios, 0.5),
      countQ25: quantile(ratios, 0.25),
      countQ75: quantile(ratios, 0.75),
      frpRatio: frp.length ? median(frp) : pooledFrpRatio,
      clusterRatio: clu.length ? median(clu) : pooledClusterRatio,
      samples: rows.length,
      fallback: false,
    }
  }

  const factors: MonthlyFactor[] = []
  for (let m = 1; m <= 12; m++) {
    factors.push(factorFor(usable.filter((s) => s.month === m), m))
  }

  // Leave-one-year-out validation: predict each overlap month's VIIRS activity from MODIS
  // using a factor learned without that year; compare against a single pooled multiplier.
  const points: ValidationPoint[] = []
  if (available) {
    for (const s of usable) {
      const others = usable.filter((o) => o.month === s.month && o.year !== s.year)
      const f = others.length >= 1 ? median(others.map((o) => o.viirs / o.modis)) : pooledCountRatio
      const restM = pooledM - s.modis
      const pooledLoo = restM > 0 ? (pooledV - s.viirs) / restM : pooledCountRatio
      points.push({
        year: s.year,
        month: s.month,
        observed: s.viirs,
        predicted: s.modis * f,
        predictedPooled: s.modis * pooledLoo,
      })
    }
  }

  const errorStats = (key: 'predicted' | 'predictedPooled') => {
    const pts = points.filter((p) => p.observed >= 10)
    if (pts.length < 3) return { mape: null, r2: null }
    const mape = (pts.reduce((s, p) => s + Math.abs(p[key] - p.observed) / p.observed, 0) / pts.length) * 100
    const mean = pts.reduce((s, p) => s + p.observed, 0) / pts.length
    const ssTot = pts.reduce((s, p) => s + (p.observed - mean) ** 2, 0)
    const ssRes = pts.reduce((s, p) => s + (p.observed - p[key]) ** 2, 0)
    return { mape, r2: ssTot > 0 ? 1 - ssRes / ssTot : null }
  }
  const monthly = errorStats('predicted')
  const pooled = errorStats('predictedPooled')

  const overlapYears = new Set(usable.map((s) => s.year)).size

  return {
    available,
    viirsStart,
    modisStart,
    overlapStart,
    overlapEnd,
    overlapYears,
    factors,
    pooledCountRatio,
    pooledFrpRatio,
    validation: {
      points,
      mapeMonthly: monthly.mape,
      mapePooled: pooled.mape,
      r2Monthly: monthly.r2,
      r2Pooled: pooled.r2,
    },
  }
}

// ─── BAI ────────────────────────────────────────────────────────────────────

function computeBai(days: DailyActivity[], weights: BaiWeights) {
  const active = days.filter((d) => d.harmonizedCount > 0)
  const robustMax = (values: number[]) => {
    const sorted = values.sort((a, b) => a - b)
    return Math.max(quantile(sorted, 0.99), 1e-6)
  }
  const hMax = robustMax(active.map((d) => Math.log1p(d.harmonizedCount)))
  const fMax = robustMax(active.map((d) => Math.log1p(d.harmonizedFrp)))
  const cMax = robustMax(active.map((d) => Math.log1p(d.harmonizedClusters)))
  const wSum = weights.count + weights.frp + weights.clusters || 1

  for (const d of days) {
    if (d.harmonizedCount <= 0) {
      d.bai = 0
      continue
    }
    const h = Math.min(1, Math.log1p(d.harmonizedCount) / hMax)
    const f = Math.min(1, Math.log1p(d.harmonizedFrp) / fMax)
    const c = Math.min(1, Math.log1p(d.harmonizedClusters) / cMax)
    d.bai = (100 * (weights.count * h + weights.frp * f + weights.clusters * c)) / wSum
  }

  // Percentile among active days, then classify.
  const sorted = active.map((d) => d.bai).sort((a, b) => a - b)
  const n = sorted.length
  const lowerBound = (x: number) => {
    let lo = 0
    let hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid]! < x) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const upperBound = (x: number) => {
    let lo = 0
    let hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid]! <= x) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  for (const d of days) {
    if (d.harmonizedCount <= 0 || n === 0) {
      d.percentile = null
      d.cls = 'none'
      continue
    }
    const below = lowerBound(d.bai)
    const equal = upperBound(d.bai) - below
    d.percentile = (100 * (below + equal * 0.5)) / n
    d.cls = classifyPercentile(d.percentile)
  }
}

// ─── climatology ────────────────────────────────────────────────────────────

function buildClimatology(days: readonly DailyActivity[]): DoyClimatology[] {
  const baiByDoy: number[][] = Array.from({ length: 365 }, () => [])
  const countByDoy: number[][] = Array.from({ length: 365 }, () => [])
  for (const d of days) {
    if (d.source === 'none') continue
    baiByDoy[d.doy - 1]!.push(d.bai)
    countByDoy[d.doy - 1]!.push(d.harmonizedCount)
  }
  const out: DoyClimatology[] = []
  for (let doy = 1; doy <= 365; doy++) {
    const bai: number[] = []
    const cnt: number[] = []
    for (let k = -7; k <= 7; k++) {
      const idx = (((doy - 1 + k) % 365) + 365) % 365
      bai.push(...baiByDoy[idx]!)
      cnt.push(...countByDoy[idx]!)
    }
    bai.sort((a, b) => a - b)
    cnt.sort((a, b) => a - b)
    out.push({
      doy,
      p10: quantile(bai, 0.1),
      p50: quantile(bai, 0.5),
      p90: quantile(bai, 0.9),
      p97: quantile(bai, 0.97),
      mean: bai.length ? bai.reduce((s, v) => s + v, 0) / bai.length : 0,
      countP50: quantile(cnt, 0.5),
    })
  }
  return out
}

function assessQuality(days: DailyActivity[], clim: readonly DoyClimatology[]) {
  for (let i = 0; i < days.length; i++) {
    const d = days[i]!
    if (d.source === 'none') continue
    const neighbours: number[] = []
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue
      const n = days[i + k]
      if (n && n.source !== 'none') neighbours.push(n.harmonizedCount)
    }
    const nMed = neighbours.length ? median(neighbours) : 0
    const expected = Math.max(nMed, clim[d.doy - 1]!.countP50)
    const sharpDrop = nMed >= 3 && d.harmonizedCount < 0.25 * nMed
    const inSeasonSilence = d.harmonizedCount === 0 && expected >= 2
    const total = d.modisCount + d.viirsCount
    const lowShare = total + d.lowConfidenceRemoved > 0 ? d.lowConfidenceRemoved / (total + d.lowConfidenceRemoved) : 0
    if (sharpDrop || inSeasonSilence) {
      d.quality = 'limited'
      d.qualityScore = Math.max(0.1, Math.min(0.5, expected > 0 ? d.harmonizedCount / expected : 0.3))
    } else {
      d.quality = 'good'
      d.qualityScore = Math.max(0.5, 1 - lowShare * 0.6)
    }
    if (d.source === 'modis_scaled' || d.source === 'modis_unscaled') {
      d.qualityScore *= 0.85
    }
  }
}

function buildMonthClimatology(days: readonly DailyActivity[]): MonthClimatology[] {
  const perYearMonth = new Map<string, { month: number; bai: number; count: number; n: number }>()
  for (const d of days) {
    if (d.source === 'none') continue
    const key = `${d.year}-${d.month}`
    let r = perYearMonth.get(key)
    if (!r) {
      r = { month: d.month, bai: 0, count: 0, n: 0 }
      perYearMonth.set(key, r)
    }
    r.bai += d.bai
    r.count += d.harmonizedCount
    r.n++
  }
  const rows = [...perYearMonth.values()]
  const totals = new Array(12).fill(0) as number[]
  const out: MonthClimatology[] = []
  for (let m = 1; m <= 12; m++) {
    const ms = rows.filter((r) => r.month === m && r.n >= 20)
    const means = ms.map((r) => r.bai / r.n).sort((a, b) => a - b)
    const meanCount = ms.length ? ms.reduce((s, r) => s + r.count / r.n, 0) / ms.length : 0
    totals[m - 1] = meanCount
    out.push({
      month: m,
      meanBai: means.length ? means.reduce((s, v) => s + v, 0) / means.length : 0,
      p10: quantile(means, 0.1),
      p50: quantile(means, 0.5),
      p90: quantile(means, 0.9),
      meanDailyCount: meanCount,
      share: 0,
    })
  }
  const sum = totals.reduce((s, v) => s + v, 0)
  for (const m of out) m.share = sum > 0 ? m.meanDailyCount / sum : 0
  return out
}

// ─── critical periods ───────────────────────────────────────────────────────

function findCriticalPeriods(days: DailyActivity[]): CriticalPeriod[] {
  const out: CriticalPeriod[] = []
  const isHigh = (d: DailyActivity | undefined) => !!d && CLASS_RANK[d.cls] >= CLASS_RANK.high
  let i = 0
  while (i < days.length) {
    if (!isHigh(days[i])) {
      i++
      continue
    }
    let j = i
    // Extend the run, tolerating a single non-high day between high days.
    while (j + 1 < days.length && (isHigh(days[j + 1]) || (isHigh(days[j + 2]) && days[j + 1]!.harmonizedCount > 0))) {
      j++
    }
    const len = j - i + 1
    if (len >= 3) {
      const run = days.slice(i, j + 1)
      let peak = run[0]!
      let sum = 0
      let total = 0
      for (const d of run) {
        if (d.bai > peak.bai) peak = d
        sum += d.bai
        total += d.harmonizedCount
      }
      const id = out.length + 1
      for (const d of run) d.criticalPeriodId = id
      out.push({
        id,
        start: run[0]!.date,
        end: run[run.length - 1]!.date,
        days: len,
        peakDate: peak.date,
        peakBai: peak.bai,
        meanBai: sum / len,
        totalCount: total,
      })
    }
    i = j + 1
  }
  return out
}

// ─── seasons ────────────────────────────────────────────────────────────────

function buildSeasons(
  days: readonly DailyActivity[],
  months: readonly MonthClimatology[],
): { seasons: FireSeason[]; norms: SeasonNorms | null } {
  if (days.length < 200) return { seasons: [], norms: null }

  // The fire year starts in the climatologically quietest month, so seasons that straddle
  // 31 December (southern hemisphere) stay in one piece.
  let minMonth = 1
  for (const m of months) if (m.meanDailyCount < months[minMonth - 1]!.meanDailyCount) minMonth = m.month

  const firstYear = days[0]!.year - 1
  const lastYear = days[days.length - 1]!.year
  const seasons: FireSeason[] = []

  for (let y = firstYear; y <= lastYear; y++) {
    const rangeStart = `${y}-${String(minMonth).padStart(2, '0')}-01`
    const rangeEnd = addDays(`${minMonth === 1 ? y + 1 : y + 1}-${String(minMonth).padStart(2, '0')}-01`, -1)
    const sIdx = days.findIndex((d) => d.date >= rangeStart)
    if (sIdx < 0) continue
    const slice: DailyActivity[] = []
    for (let k = sIdx; k < days.length && days[k]!.date <= rangeEnd; k++) slice.push(days[k]!)
    if (slice.length < 300) continue
    const covered = slice.filter((d) => d.source !== 'none').length
    if (covered < 300) continue

    const total = slice.reduce((s, d) => s + d.harmonizedCount, 0)
    if (total <= 0) continue
    let cum = 0
    let start = slice[0]!.date
    let end = slice[slice.length - 1]!.date
    let startFound = false
    for (const d of slice) {
      cum += d.harmonizedCount
      if (!startFound && cum >= total * 0.1) {
        start = d.date
        startFound = true
      }
      if (cum >= total * 0.9) {
        end = d.date
        break
      }
    }
    let peak7 = 0
    let peak = slice[0]!.date
    for (let k = 0; k < slice.length; k++) {
      let s = 0
      let n = 0
      for (let q = Math.max(0, k - 3); q <= Math.min(slice.length - 1, k + 3); q++) {
        s += slice[q]!.harmonizedCount
        n++
      }
      if (s / n > peak7) {
        peak7 = s / n
        peak = slice[k]!.date
      }
    }
    const sources = new Set(slice.map((d) => d.source))
    const source: DataSource = sources.has('modis_scaled')
      ? 'modis_scaled'
      : sources.has('combined')
        ? 'combined'
        : sources.has('viirs')
          ? 'viirs'
          : 'modis_unscaled'

    seasons.push({
      label: minMonth === 1 ? String(y) : `${y}–${String(y + 1).slice(2)}`,
      startYear: y,
      rangeStart,
      rangeEnd,
      start,
      peak,
      end,
      durationDays: Math.round((toMs(end) - toMs(start)) / DAY_MS) + 1,
      total,
      peak7,
      anomalousDays: slice.filter((d) => d.anomaly !== 'none').length,
      criticalDays: slice.filter((d) => d.criticalPeriodId !== null).length,
      source,
      flags: [],
      complete: slice.length >= 360,
    })
  }

  if (seasons.length === 0) return { seasons, norms: null }

  const offset = (s: FireSeason, date: string) => Math.round((toMs(date) - toMs(s.rangeStart)) / DAY_MS)
  const startOffsets = seasons.map((s) => offset(s, s.start))
  const peakOffsets = seasons.map((s) => offset(s, s.peak))
  const endOffsets = seasons.map((s) => offset(s, s.end))
  const durations = seasons.map((s) => s.durationDays)
  const totalsSorted = seasons.map((s) => s.total).sort((a, b) => a - b)
  const peaksSorted = seasons.map((s) => s.peak7).sort((a, b) => a - b)

  const medStart = median(startOffsets)
  const medPeak = median(peakOffsets)
  const medEnd = median(endOffsets)
  const medDur = median(durations)
  const p90Total = quantile(totalsSorted, 0.9)
  const p10Total = quantile(totalsSorted, 0.1)
  const p90Peak = quantile(peaksSorted, 0.9)

  if (seasons.length >= 4) {
    seasons.forEach((s, i) => {
      const flags: SeasonFlag[] = []
      if (startOffsets[i]! < medStart - 14) flags.push('early')
      if (endOffsets[i]! > medEnd + 14) flags.push('late')
      if (s.total >= p90Total || s.peak7 >= p90Peak) flags.push('intense')
      if (durations[i]! > medDur * 1.25 && durations[i]! > medDur + 14) flags.push('prolonged')
      if (s.total <= p10Total) flags.push('weak')
      s.flags = flags
    })
  }

  const baseDoy = doy365(`2001-${String(minMonth).padStart(2, '0')}-01`)
  const toLabel = (off: number) => doyLabel(((baseDoy - 1 + off) % 365) + 1)
  const topMonths = [...months].sort((a, b) => b.meanDailyCount - a.meanDailyCount).slice(0, 3).map((m) => m.month)

  return {
    seasons,
    norms: {
      fireYearStartMonth: minMonth,
      medianStartOffset: medStart,
      medianPeakOffset: medPeak,
      medianEndOffset: medEnd,
      medianDuration: medDur,
      typicalStart: toLabel(medStart),
      typicalPeak: toLabel(medPeak),
      typicalEnd: toLabel(medEnd),
      topMonths,
    },
  }
}

// ─── outlook ────────────────────────────────────────────────────────────────

export function buildOutlook(analysis: ActivityAnalysis, referenceDate: string): CriticalOutlook | null {
  const { days, dayIndex, climatology } = analysis
  let ref = referenceDate
  if (ref > analysis.lastDate) ref = analysis.lastDate
  if (ref < analysis.firstDate) ref = analysis.firstDate
  const idx = dayIndex.get(ref)
  if (idx === undefined) return null

  const last7 = days.slice(Math.max(0, idx - 6), idx + 1)
  const today = days[idx]!
  const mean7 = last7.reduce((s, d) => s + d.bai, 0) / last7.length

  // Least-squares slope of BAI over the last 7 days.
  const n = last7.length
  const xm = (n - 1) / 2
  let num = 0
  let den = 0
  last7.forEach((d, i) => {
    num += (i - xm) * (d.bai - mean7)
    den += (i - xm) ** 2
  })
  const slope = den > 0 ? num / den : 0
  const trend = slope > 1.2 ? 'rising' : slope < -1.2 ? 'falling' : 'stable'

  const climNow = climatology[today.doy - 1]!
  const highDays = last7.filter((d) => CLASS_RANK[d.cls] >= CLASS_RANK.high).length

  const upcoming = [1, 2, 3, 4].map((w) => {
    const start = addDays(ref, (w - 1) * 7 + 1)
    const end = addDays(ref, w * 7)
    let p50 = 0
    let p90 = 0
    for (let k = 0; k < 7; k++) {
      const c = climatology[doy365(addDays(start, k)) - 1]!
      p50 += c.p50 / 7
      p90 += c.p90 / 7
    }
    return { label: `Week ${w}`, start, end, p50, p90 }
  })
  const upcomingP50 = upcoming.reduce((s, w) => s + w.p50, 0) / upcoming.length

  const maxFrps = days.filter((d) => d.maxFrp !== null).map((d) => d.maxFrp!).sort((a, b) => a - b)
  const frpP95 = quantile(maxFrps, 0.95)
  const recentMaxFrp = Math.max(0, ...last7.map((d) => d.maxFrp ?? 0))

  let score = 0
  const reasons: string[] = []
  if (mean7 > climNow.p97 && mean7 > 0) {
    score += 3
    reasons.push(`7-day activity (${mean7.toFixed(0)}) is above the 97th percentile for this time of year.`)
  } else if (mean7 > climNow.p90 && mean7 > 0) {
    score += 2
    reasons.push(`7-day activity (${mean7.toFixed(0)}) is above the 90th percentile for this time of year.`)
  } else if (mean7 > climNow.p50 && mean7 > 0) {
    score += 1
    reasons.push(`Activity is above the historical median for this time of year.`)
  }
  if (trend === 'rising') {
    score += 1
    reasons.push(`Activity is rising (+${slope.toFixed(1)} BAI per day over the last week).`)
  }
  if (highDays >= 5) {
    score += 2
    reasons.push(`${highDays} of the last 7 days were High or above — persistent burning.`)
  } else if (highDays >= 3) {
    score += 1
    reasons.push(`${highDays} of the last 7 days were High or above.`)
  }
  if (recentMaxFrp > frpP95 && frpP95 > 0) {
    score += 1
    reasons.push(`Very intense fire detected (max FRP ${recentMaxFrp.toFixed(0)} MW, top 5% of record).`)
  }
  if (upcomingP50 > climNow.p50 * 1.3 && upcomingP50 >= 15) {
    score += 1
    reasons.push(`The next 4 weeks are historically more active — entering the climatological peak.`)
  }
  if (reasons.length === 0) {
    reasons.push('Activity is at or below normal levels for this time of year.')
  }

  const risk: RiskLevel = score >= 5 ? 'critical' : score >= 3 ? 'elevated' : score >= 1 ? 'moderate' : 'low'

  const recent = days.slice(Math.max(0, idx - 29), idx + 1).map((d) => ({
    date: d.date,
    bai: d.bai,
    p50: d.climP50,
    p90: d.climP90,
  }))

  return {
    referenceDate: ref,
    latestBai: today.bai,
    latestClass: today.cls,
    mean7,
    trendPerDay: slope,
    trend,
    normalP50: climNow.p50,
    normalP90: climNow.p90,
    highDaysLast7: highDays,
    risk,
    score,
    reasons,
    upcoming,
    recent,
  }
}

// ─── aggregation for calendar views ─────────────────────────────────────────

export interface PeriodCell {
  key: string
  year: number
  index: number // week 0..52 or month 0..11
  start: string
  end: string
  meanBai: number
  maxBai: number
  totalCount: number
  activeDays: number
  coveredDays: number
  limitedDays: number
  anomalyDays: number
  criticalDays: number
  percentile: number | null
  cls: ActivityClass
  source: DataSource
}

export function aggregatePeriods(
  analysis: ActivityAnalysis,
  resolution: 'week' | 'month',
): PeriodCell[] {
  const map = new Map<string, PeriodCell & { sum: number }>()
  for (const d of analysis.days) {
    const index = resolution === 'week' ? Math.min(51, Math.floor((d.doy - 1) / 7)) : d.month - 1
    const key = `${d.year}-${index}`
    let c = map.get(key)
    if (!c) {
      c = {
        key,
        year: d.year,
        index,
        start: d.date,
        end: d.date,
        meanBai: 0,
        maxBai: 0,
        totalCount: 0,
        activeDays: 0,
        coveredDays: 0,
        limitedDays: 0,
        anomalyDays: 0,
        criticalDays: 0,
        percentile: null,
        cls: 'none',
        source: d.source,
        sum: 0,
      }
      map.set(key, c)
    }
    c.end = d.date
    if (d.source === 'none') continue
    c.coveredDays++
    c.sum += d.bai
    c.maxBai = Math.max(c.maxBai, d.bai)
    c.totalCount += d.harmonizedCount
    if (d.harmonizedCount > 0) c.activeDays++
    if (d.quality === 'limited') c.limitedDays++
    if (d.anomaly !== 'none') c.anomalyDays++
    if (d.criticalPeriodId !== null) c.criticalDays++
    if (d.source === 'modis_scaled') c.source = 'modis_scaled'
    else if (c.source === 'none') c.source = d.source
  }
  const cells = [...map.values()].map((c) => {
    const { sum, ...rest } = c
    return { ...rest, meanBai: c.coveredDays ? sum / c.coveredDays : 0 }
  })
  // Classify period means against the distribution of all period means with activity.
  const sorted = cells.filter((c) => c.activeDays > 0).map((c) => c.meanBai).sort((a, b) => a - b)
  for (const c of cells) {
    if (c.activeDays === 0 || sorted.length === 0) continue
    let below = 0
    while (below < sorted.length && sorted[below]! < c.meanBai) below++
    c.percentile = (100 * below) / sorted.length
    c.cls = classifyPercentile(c.percentile)
  }
  return cells
}

// ─── explanations ───────────────────────────────────────────────────────────

export function explainDay(d: DailyActivity, analysis: ActivityAnalysis): string[] {
  const out: string[] = []
  if (d.source === 'none') {
    return ['No satellite in the record covered this date, so no activity estimate is possible.']
  }
  if (d.harmonizedCount === 0) {
    out.push(
      d.quality === 'limited'
        ? 'No hotspots passed quality control, but this is normally an active time of year. Cloud, smoke or missed overpasses may be hiding fires — treat this as a data gap, not a fire-free day.'
        : 'No hotspots passed quality control. This is consistent with a normally quiet period, but zero detections never prove there was no fire.',
    )
    return out
  }
  const pct = d.percentile ?? 0
  out.push(
    `Burning Activity Index ${d.bai.toFixed(0)} / 100 — higher than ${pct.toFixed(0)}% of all active days on record, so it is classed ${CLASS_LABEL[d.cls]}.`,
  )
  if (d.anomaly === 'extreme') {
    out.push(`That is above the 97th percentile for this time of year (normal range up to ${d.climP90.toFixed(0)}): an extreme anomaly.`)
  } else if (d.anomaly === 'above_normal') {
    out.push(`That is above the 90th percentile for this time of year (normal ≤ ${d.climP90.toFixed(0)}).`)
  } else if (d.bai < d.climP50) {
    out.push(`Activity is below the typical level for this time of year (median ${d.climP50.toFixed(0)}).`)
  } else {
    out.push(`Activity is within the normal range for this time of year (median ${d.climP50.toFixed(0)}, 90th pct ${d.climP90.toFixed(0)}).`)
  }
  if (d.criticalPeriodId !== null) {
    const p = analysis.criticalPeriods.find((c) => c.id === d.criticalPeriodId)
    if (p) out.push(`Part of a ${p.days}-day critical period (${p.start} → ${p.end}).`)
  }
  if (d.source === 'modis_scaled') {
    const f = analysis.model.factors[d.month - 1]!
    out.push(
      `Pre-VIIRS date: MODIS detections were scaled by r = ${f.countRatio.toFixed(2)} (IQR ${f.countQ25.toFixed(2)}–${f.countQ75.toFixed(2)}) to a VIIRS-equivalent value, so this estimate is modelled and less certain.`,
    )
  } else if (d.source === 'modis_unscaled') {
    out.push('Only MODIS data are available and no overlap period exists to learn a conversion factor, so values are unscaled MODIS counts.')
  }
  if (d.quality === 'limited') {
    out.push('Detections dropped sharply compared with surrounding days — possible cloud or smoke obscuration. True activity may be higher.')
  }
  return out
}

// ─── spatio-temporal fire-event clustering ─────────────────────────────────

/**
 * Groups detections into fire events: detections whose 0.05° (~5 km) grid cells touch
 * (8-connectivity) within `maxGapDays` of each other belong to the same event.
 */
export function clusterFireEvents(
  observations: readonly FireObservation[],
  maxGapDays = 1,
): FireEvent[] {
  const obs = observations.filter((o) => !isLowConfidence(o))
  if (obs.length === 0) return []
  const order = obs.map((_, i) => i).sort((a, b) => obs[a]!.acqDate.localeCompare(obs[b]!.acqDate))

  const parent = new Int32Array(obs.length)
  for (let i = 0; i < parent.length; i++) parent[i] = i
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const lastInCell = new Map<string, { day: number; idx: number }>()
  for (const i of order) {
    const o = obs[i]!
    const day = Math.floor(toMs(o.acqDate) / DAY_MS)
    const cx = Math.floor(o.longitude / CLUSTER_CELL_DEG)
    const cy = Math.floor(o.latitude / CLUSTER_CELL_DEG)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const prev = lastInCell.get(`${cx + dx}:${cy + dy}`)
        if (prev && day - prev.day <= maxGapDays) union(i, prev.idx)
      }
    }
    lastInCell.set(`${cx}:${cy}`, { day, idx: i })
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < obs.length; i++) {
    const r = find(i)
    const g = groups.get(r)
    if (g) g.push(i)
    else groups.set(r, [i])
  }

  const events: FireEvent[] = []
  for (const members of groups.values()) {
    let lat = 0
    let lng = 0
    let start = '9999'
    let end = '0000'
    let modis = 0
    let frp = 0
    let maxFrp: number | null = null
    const sats = new Set<string>()
    const pts: Array<[number, number]> = []
    for (const i of members) {
      const o = obs[i]!
      lat += o.latitude
      lng += o.longitude
      if (o.acqDate < start) start = o.acqDate
      if (o.acqDate > end) end = o.acqDate
      if (o.instrument === 'MODIS') modis++
      if (o.frp !== null) {
        frp += o.frp
        if (maxFrp === null || o.frp > maxFrp) maxFrp = o.frp
      }
      sats.add(String(o.satellite))
      pts.push([o.latitude, o.longitude])
    }
    const hull = convexHull(pts)
    const centroid: [number, number] = [lat / members.length, lng / members.length]
    events.push({
      id: `E${events.length + 1}-${start.replaceAll('-', '')}`,
      centroid,
      start,
      end,
      durationDays: Math.round((toMs(end) - toMs(start)) / DAY_MS) + 1,
      count: members.length,
      modisCount: modis,
      viirsCount: members.length - modis,
      totalFrp: frp,
      maxFrp,
      hull,
      areaKm2: hullAreaKm2(hull),
      satellites: [...sats].sort(),
    })
  }
  return events.sort((a, b) => b.totalFrp - a.totalFrp)
}

/** Andrew's monotone chain on [lat, lng] points. */
export function convexHull(points: ReadonlyArray<[number, number]>): Array<[number, number]> {
  const pts = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) =>
    a[1] === b[1] ? a[0] - b[0] : a[1] - b[1],
  )
  if (pts.length < 3) return pts
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1])
  const lower: Array<[number, number]> = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Array<[number, number]> = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

function hullAreaKm2(hull: ReadonlyArray<[number, number]>): number {
  if (hull.length < 3) return 0
  const lat0 = (hull.reduce((s, p) => s + p[0], 0) / hull.length) * (Math.PI / 180)
  const kx = 111.32 * Math.cos(lat0)
  const ky = 110.57
  let a = 0
  for (let i = 0; i < hull.length; i++) {
    const [y1, x1] = hull[i]!
    const [y2, x2] = hull[(i + 1) % hull.length]!
    a += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky)
  }
  return Math.abs(a) / 2
}
