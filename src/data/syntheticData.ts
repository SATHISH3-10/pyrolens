import type { FireObservation, SatelliteName } from '@/types/fire'
import { assignRegion } from './regions'

/**
 * Seeded PRNG (Mulberry32) for reproducible, deterministic synthetic data.
 */
function createPrng(seed: number) {
  let s = Math.floor(seed)
  return function () {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface ClusterSeed {
  name: string
  centerLat: number
  centerLng: number
  latRadius: number
  lngRadius: number
  peakMonths: number[] // 1-12
  baseWeight: number
}

// Geographically grounded clusters in Southern & Central India
const REGIONAL_CLUSTERS: ClusterSeed[] = [
  // Tamil Nadu: Nilgiris & Western Ghats forest fringe
  {
    name: 'Nilgiris & Western Ghats (TN)',
    centerLat: 11.45,
    centerLng: 76.75,
    latRadius: 0.65,
    lngRadius: 0.7,
    peakMonths: [2, 3, 4],
    baseWeight: 1.3,
  },
  // Tamil Nadu: Jawadhu & Shevaroy dry deciduous hills
  {
    name: 'Eastern Ghats Foothills (TN)',
    centerLat: 12.35,
    centerLng: 78.85,
    latRadius: 0.8,
    lngRadius: 0.75,
    peakMonths: [3, 4, 5],
    baseWeight: 1.1,
  },
  // Kerala: Wayanad & Nilambur border
  {
    name: 'Wayanad Ghats (Kerala)',
    centerLat: 11.75,
    centerLng: 76.15,
    latRadius: 0.45,
    lngRadius: 0.4,
    peakMonths: [2, 3],
    baseWeight: 0.8,
  },
  // Kerala: Idukki & Cardamom hills
  {
    name: 'Idukki Ghats (Kerala)',
    centerLat: 9.85,
    centerLng: 77.05,
    latRadius: 0.5,
    lngRadius: 0.45,
    peakMonths: [2, 3],
    baseWeight: 0.7,
  },
  // Karnataka: Bandipur & Nagarhole Tiger Reserves
  {
    name: 'Bandipur-Nagarhole (Karnataka)',
    centerLat: 11.9,
    centerLng: 76.45,
    latRadius: 0.6,
    lngRadius: 0.65,
    peakMonths: [2, 3, 4],
    baseWeight: 1.4,
  },
  // Karnataka: Bellary & Central Karnataka scrub tracts
  {
    name: 'Central Karnataka Scrub & Agro (Karnataka)',
    centerLat: 15.15,
    centerLng: 76.85,
    latRadius: 1.1,
    lngRadius: 1.0,
    peakMonths: [3, 4, 10, 11],
    baseWeight: 1.2,
  },
  // Andhra Pradesh: Nallamala Hills & Srisailam forest
  {
    name: 'Nallamala Forests (Andhra Pradesh)',
    centerLat: 15.75,
    centerLng: 78.95,
    latRadius: 0.95,
    lngRadius: 0.85,
    peakMonths: [2, 3, 4, 5],
    baseWeight: 1.5,
  },
  // Andhra Pradesh: Seshachalam Hills & Eastern Ghats
  {
    name: 'Seshachalam Hills (Andhra Pradesh)',
    centerLat: 13.85,
    centerLng: 79.35,
    latRadius: 0.75,
    lngRadius: 0.8,
    peakMonths: [3, 4],
    baseWeight: 1.1,
  },
  // Telangana: Amrabad Tiger Reserve & Godavari basin
  {
    name: 'Amrabad & Lower Godavari (Telangana)',
    centerLat: 16.65,
    centerLng: 78.85,
    latRadius: 0.9,
    lngRadius: 0.9,
    peakMonths: [2, 3, 4],
    baseWeight: 1.2,
  },
  // Telangana: Northern Forest & Agro Belt
  {
    name: 'Northern Telangana (Adilabad)',
    centerLat: 19.35,
    centerLng: 78.75,
    latRadius: 0.8,
    lngRadius: 0.85,
    peakMonths: [3, 4, 10],
    baseWeight: 1.0,
  },
  // Central India / Odisha border (for regional variety)
  {
    name: 'Central Forests (Odisha / MP border)',
    centerLat: 20.85,
    centerLng: 82.45,
    latRadius: 1.4,
    lngRadius: 1.4,
    peakMonths: [3, 4, 5],
    baseWeight: 1.1,
  },
]

/**
 * Generates deterministically realistic active-fire observations for 2024.
 * Demonstrates sensor differences, seasonal dry peaks, and regional characteristics.
 */
export function generateSyntheticObservations(count = 1500, seed = 20241023): FireObservation[] {
  const prng = createPrng(seed)
  const observations: FireObservation[] = []

  // Month weightings reflect India's tropical monsoon cycle:
  // Peaks in Mar-Apr, low in monsoon Jul-Aug, secondary minor rise in Oct-Nov.
  const monthWeights: Record<number, number> = {
    1: 0.5,
    2: 1.4,
    3: 2.8,
    4: 3.2,
    5: 1.9,
    6: 0.4,
    7: 0.1,
    8: 0.15,
    9: 0.35,
    10: 1.1,
    11: 1.3,
    12: 0.6,
  }

  // Days in month for 2024 (leap year)
  const daysInMonth: Record<number, number> = {
    1: 31,
    2: 29,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31,
  }

  // Pre-calculate cumulative month probability
  const monthCDF: Array<{ month: number; threshold: number }> = []
  let cumulative = 0
  const totalWeight = Object.values(monthWeights).reduce((a, b) => a + b, 0)
  for (let m = 1; m <= 12; m++) {
    cumulative += (monthWeights[m] ?? 0.5) / totalWeight
    monthCDF.push({ month: m, threshold: cumulative })
  }

  function pickMonth(): number {
    const r = prng()
    for (const entry of monthCDF) {
      if (r <= entry.threshold) return entry.month
    }
    return 3
  }

  let idCounter = 10001

  // Loop to generate thermal clusters that create both MODIS and VIIRS detections
  while (observations.length < count) {
    const month = pickMonth()
    const maxDay = daysInMonth[month] ?? 30
    const day = Math.min(maxDay, Math.max(1, Math.floor(prng() * maxDay) + 1))
    const dateStr = `2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    // Anomaly spike injection on March 18-22, 2024 (heatwave / intense dry spell event)
    const isSpikePeriod = month === 3 && day >= 18 && day <= 22

    // Pick a cluster
    const cluster = REGIONAL_CLUSTERS[Math.floor(prng() * REGIONAL_CLUSTERS.length)]!
    const isPeakForCluster = cluster.peakMonths.includes(month)
    const clusterMultiplier = (isPeakForCluster ? cluster.baseWeight * 1.5 : cluster.baseWeight * 0.6) * (isSpikePeriod ? 2.5 : 1.0)

    // Fire episode epicenter
    const centerLat = cluster.centerLat + (prng() - 0.5) * 2 * cluster.latRadius
    const centerLng = cluster.centerLng + (prng() - 0.5) * 2 * cluster.lngRadius

    // Episode intensity / scale (small fire = 1-3 detections; large episode = 6-12 detections)
    const baseEpisodeSize = Math.floor(prng() * 3) + 1
    const episodeSize = Math.max(1, Math.round(baseEpisodeSize * clusterMultiplier))

    // Day or Night overpass
    const isDay = prng() < 0.72 // Most active fires detected during afternoon peak
    const daynight = isDay ? 'D' : 'N'

    // Determine satellites passing
    // Overpass times (UTC):
    // Terra: ~05:00 UTC (10:30 IST) Day, ~17:00 UTC (22:30 IST) Night
    // Aqua / Suomi-NPP: ~08:00 UTC (13:30 IST) Day, ~20:00 UTC (01:30 IST) Night
    const isTerraPass = prng() < 0.45
    const modisSatellite: SatelliteName = isTerraPass ? 'Terra' : 'Aqua'
    const viirsSatellite: SatelliteName = prng() < 0.55 ? 'Suomi-NPP' : 'NOAA-20'

    const modisAcqTime = isDay
      ? isTerraPass ? '0525' : '0815'
      : isTerraPass ? '1710' : '2030'

    const viirsAcqTime = isDay
      ? isTerraPass ? '0610' : '0825'
      : isTerraPass ? '1805' : '2045'

    // Core fire intensity (controls FRP)
    const episodeBaseFrp = 8 + prng() * 25 + (isSpikePeriod ? 20 : 0)

    // 1. Generate MODIS observation(s) for the episode (coarser 1 km resolution)
    // MODIS typically detects 1 to 2 coarse pixels for an episode
    const modisCount = Math.max(0, Math.floor(episodeSize * 0.4))
    for (let i = 0; i < modisCount; i++) {
      if (observations.length >= count) break
      const lat = Number((centerLat + (prng() - 0.5) * 0.015).toFixed(4))
      const lng = Number((centerLng + (prng() - 0.5) * 0.015).toFixed(4))
      const reg = assignRegion(lat, lng)

      // MODIS FRP (higher core pixel values)
      // ~2% chance of null FRP (algorithm edge case)
      const hasNullFrp = prng() < 0.025
      const frpVal = hasNullFrp
        ? null
        : Number((episodeBaseFrp * (0.8 + prng() * 0.7)).toFixed(1))

      // MODIS confidence: integer 0-100%
      const confidence = Math.min(100, Math.max(30, Math.floor(50 + prng() * 48)))

      // Brightness temps in Kelvin
      const brightness = Number((315 + prng() * 45).toFixed(1))
      const brightT31 = Number((brightness - (12 + prng() * 18)).toFixed(1))

      observations.push({
        id: `MODIS-${idCounter++}`,
        latitude: lat,
        longitude: lng,
        brightness,
        brightT31,
        scan: Number((1.0 + prng() * 1.5).toFixed(1)),
        track: Number((1.0 + prng() * 0.8).toFixed(1)),
        acqDate: dateStr,
        acqTime: modisAcqTime,
        satellite: modisSatellite,
        instrument: 'MODIS',
        confidence,
        version: '6.1NRT',
        frp: frpVal,
        daynight,
        regionId: reg.id,
        regionName: reg.name,
        provenance: 'synthetic-demo',
      })
    }

    // 2. Generate VIIRS observations for the episode (sharper 375 m resolution)
    // VIIRS typically yields 2x to 4x more pixel detections across sub-pixel flaming zones
    const viirsCount = Math.max(1, Math.round(episodeSize * 1.1))
    for (let j = 0; j < viirsCount; j++) {
      if (observations.length >= count) break
      // VIIRS 375m pixels are clustered around the center with smaller individual footprint
      const lat = Number((centerLat + (prng() - 0.5) * 0.02).toFixed(4))
      const lng = Number((centerLng + (prng() - 0.5) * 0.02).toFixed(4))
      const reg = assignRegion(lat, lng)

      // VIIRS FRP can detect smaller flaming fronts, so individual 375m pixels often have lower FRP
      const hasNullFrp = prng() < 0.015
      const frpVal = hasNullFrp
        ? null
        : Number(Math.max(1.1, (episodeBaseFrp * 0.45 * (0.5 + prng() * 0.9))).toFixed(1))

      // VIIRS confidence: 'low' (8%), 'nominal' (65%), 'high' (27%)
      const confRand = prng()
      const confidence: 'low' | 'nominal' | 'high' =
        confRand < 0.08 ? 'low' : confRand < 0.73 ? 'nominal' : 'high'

      const brightness = Number((320 + prng() * 50).toFixed(1))
      const brightT31 = Number((brightness - (15 + prng() * 20)).toFixed(1))

      observations.push({
        id: `VIIRS-${idCounter++}`,
        latitude: lat,
        longitude: lng,
        brightness,
        brightT31,
        scan: Number((0.38 + prng() * 0.2).toFixed(2)),
        track: Number((0.36 + prng() * 0.15).toFixed(2)),
        acqDate: dateStr,
        acqTime: viirsAcqTime,
        satellite: viirsSatellite,
        instrument: 'VIIRS',
        confidence,
        version: '2.0NRT',
        frp: frpVal,
        daynight,
        regionId: reg.id,
        regionName: reg.name,
        provenance: 'synthetic-demo',
      })
    }
  }

  // Sort chronologically by acquisition date and time
  return observations.sort((a, b) => {
    const cmp = a.acqDate.localeCompare(b.acqDate)
    if (cmp !== 0) return cmp
    return a.acqTime.localeCompare(b.acqTime)
  })
}
