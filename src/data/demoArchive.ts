import type { ConfidenceCategory, FireObservation, SatelliteName, SensorType } from '@/types/fire'
import { getStudyArea, type FireZone, type StudyArea } from './studyAreas'

/**
 * Deterministic multi-year demo archive generator (2003 → 2025).
 *
 * Simulates what a FIRMS archive download would contain for a study area:
 * - MODIS Terra + Aqua through the whole record; VIIRS S-NPP from 2012, NOAA-20 from 2018,
 *   NOAA-21 from 2024 (FIRMS availability dates).
 * - Multi-day fire episodes that drift slightly, so clustering has real structure.
 * - VIIRS resolves ~2–4× more pixels than MODIS for the same fire, and that ratio varies with
 *   season (small off-season burns are relatively under-detected by MODIS). This is exactly the
 *   behaviour the harmonization step has to learn.
 * - Wet-season cloud days that suppress detections, plus weather "spells" (AR(1) noise) that
 *   create multi-day critical periods and notable fire years.
 *
 * Volumes are scaled down from real FIRMS archives so the full record fits in browser memory.
 */

export const ARCHIVE_START = '2003-01-01'
export const ARCHIVE_END = '2025-12-31'

interface SatelliteSpec {
  name: SatelliteName
  instrument: SensorType
  from: string
  /** Local solar overpass hour (day pass). Night pass is +12 h. */
  localHour: number
}

export const SATELLITES: readonly SatelliteSpec[] = [
  { name: 'Terra', instrument: 'MODIS', from: '2000-11-01', localHour: 10.5 },
  { name: 'Aqua', instrument: 'MODIS', from: '2002-07-04', localHour: 13.5 },
  { name: 'Suomi-NPP', instrument: 'VIIRS', from: '2012-01-20', localHour: 13.5 },
  { name: 'NOAA-20', instrument: 'VIIRS', from: '2018-04-01', localHour: 12.7 },
  { name: 'NOAA-21', instrument: 'VIIRS', from: '2024-01-17', localHour: 13.1 },
]

/** Mulberry32 seeded PRNG. */
function createPrng(seed: number) {
  let s = Math.floor(seed) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seasonal(doy: number, peak: number, width: number): number {
  let d = Math.abs(doy - peak)
  if (d > 182.5) d = 365 - d
  return Math.exp(-0.5 * (d / width) ** 2)
}

interface Episode {
  zone: FireZone
  lat: number
  lng: number
  size: number
  daysLeft: number
  age: number
  ratio: number
  intensity: number
}

const DAY_MS = 86_400_000

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function utcTime(localHour: number, lng: number): string {
  let h = localHour - lng / 15
  h = ((h % 24) + 24) % 24
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`
}

const archiveCache = new Map<string, FireObservation[]>()

export function generateAreaArchive(areaId: string): FireObservation[] {
  const cached = archiveCache.get(areaId)
  if (cached) return cached
  const area = getStudyArea(areaId)
  if (!area) return []
  const result = buildArchive(area)
  archiveCache.set(areaId, result)
  return result
}

function buildArchive(area: StudyArea): FireObservation[] {
  const rand = createPrng(hashString(area.id) ^ 0x5eed)
  const gauss = () => {
    const u = Math.max(rand(), 1e-9)
    const v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const poisson = (lambda: number) => {
    if (lambda <= 0) return 0
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss()))
    const L = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
      k++
      p *= rand()
    } while (p > L)
    return k - 1
  }

  const prefix = area.id.slice(0, 3).toUpperCase()
  const totalWeight = area.zones.reduce((s, z) => s + z.weight, 0)
  const startMs = Date.parse(`${ARCHIVE_START}T00:00:00Z`)
  const endMs = Date.parse(`${ARCHIVE_END}T00:00:00Z`)

  const yearFactors = new Map<number, number>()
  for (let y = 2003; y <= 2025; y++) {
    const random = Math.exp(gauss() * 0.22)
    yearFactors.set(y, (area.notableYears[y] ?? 1) * random)
  }

  const out: FireObservation[] = []
  let active: Episode[] = []
  let spell = 0
  let counter = 1

  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const date = isoDate(ms)
    const year = Number(date.slice(0, 4))
    const doy = Math.floor((ms - Date.UTC(year, 0, 1)) / DAY_MS) + 1
    const yearFactor = yearFactors.get(year) ?? 1

    // Weather spell: persistent multiplicative noise, so hot/dry runs last several days.
    spell = Math.max(-1.2, Math.min(1.2, 0.85 * spell + gauss() * 0.17))
    const spellFactor = Math.exp(spell - 0.1)

    // Cloud / wet-season observability for the whole area on this day.
    const wet = seasonal(doy, area.wetSeason.centerDoy, area.wetSeason.width)
    const cloudy = rand() < 0.05 + area.wetSeason.cloudProb * wet
    const visibility = cloudy ? 0.12 + rand() * 0.2 : 0.85 + rand() * 0.15

    // New ignitions per zone.
    for (const zone of area.zones) {
      const season = seasonal(doy, zone.peakDoy, zone.width)
      const lambda =
        area.peakEpisodesPerDay * (zone.weight / totalWeight) * (season + 0.025) * yearFactor * spellFactor
      const n = poisson(lambda)
      for (let i = 0; i < n; i++) {
        const size = zone.fireSize * Math.exp(gauss() * 0.55) * (yearFactor > 1.5 ? 1.25 : 1)
        // Small off-season burns are relatively under-detected by MODIS → higher VIIRS:MODIS ratio.
        const sizeEffect = 1.3 / (0.5 + 0.55 * zone.fireSize)
        const ratio = area.baseViirsRatio * (1 + 0.6 * (1 - season)) * sizeEffect * (0.85 + rand() * 0.3)
        active.push({
          zone,
          lat: zone.lat + gauss() * zone.radius * 0.6,
          lng: zone.lng + gauss() * zone.radius * 0.6,
          size,
          daysLeft: 1 + Math.floor(-Math.log(Math.max(rand(), 1e-6)) * (0.6 + size * 0.9)),
          age: 0,
          ratio,
          intensity: 10 + rand() * 25 * Math.sqrt(size),
        })
      }
    }

    const sats = SATELLITES.filter((s) => s.from <= date)

    for (const ep of active) {
      const growth = ep.age === 0 ? 0.8 : ep.age === 1 ? 1.15 : Math.exp(-0.25 * (ep.age - 1))
      const daySize = ep.size * growth * spellFactor ** 0.3

      for (const sat of sats) {
        for (const pass of ['D', 'N'] as const) {
          const passFactor = pass === 'D' ? 1 : 0.3
          const isModis = sat.instrument === 'MODIS'
          const expected = daySize * 0.7 * passFactor * visibility * (isModis ? 1 : ep.ratio)
          const n = poisson(expected)
          if (n === 0) continue
          const jitter = isModis ? 0.009 : 0.004
          const spread = jitter * Math.sqrt(n)
          const time = utcTime(sat.localHour + (pass === 'N' ? 12 : 0), ep.lng)

          for (let k = 0; k < n; k++) {
            const lat = ep.lat + gauss() * spread
            const lng = ep.lng + gauss() * spread
            const basePixelFrp = ep.intensity * growth * Math.exp(gauss() * 0.5) * (pass === 'N' ? 0.6 : 1)
            const frpRaw = isModis ? basePixelFrp : basePixelFrp * 0.32
            const frp = rand() < 0.015 ? null : Number(Math.max(0.4, frpRaw).toFixed(1))
            const f = frp ?? 5

            let confidence: number | ConfidenceCategory
            if (isModis) {
              confidence = Math.round(Math.min(100, Math.max(5, 38 + 55 * (1 - Math.exp(-f / 18)) + gauss() * 10)))
            } else {
              const r = rand()
              confidence = r < 0.07 ? 'low' : f > 9 || r > 0.8 ? 'high' : 'nominal'
            }

            out.push({
              id: `${prefix}-${counter++}`,
              latitude: Number(lat.toFixed(4)),
              longitude: Number(lng.toFixed(4)),
              brightness: Number(((isModis ? 305 : 300) + Math.min(f, 200) * 0.45 + rand() * 12).toFixed(1)),
              brightT31: Number((288 + rand() * 18).toFixed(1)),
              scan: isModis ? Number((1 + rand() * 1.6).toFixed(1)) : Number((0.37 + rand() * 0.25).toFixed(2)),
              track: isModis ? Number((1 + rand() * 0.9).toFixed(1)) : Number((0.36 + rand() * 0.2).toFixed(2)),
              acqDate: date,
              acqTime: time,
              satellite: sat.name,
              instrument: sat.instrument,
              confidence,
              version: isModis ? '6.1' : '2.0',
              frp,
              daynight: pass,
              regionId: area.id,
              regionName: area.name,
              provenance: 'synthetic-demo',
            })
          }
        }
      }

      ep.age++
      ep.daysLeft--
      ep.lat += gauss() * 0.012
      ep.lng += gauss() * 0.012
    }
    active = active.filter((e) => e.daysLeft > 0)
  }

  return out
}
