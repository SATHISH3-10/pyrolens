/**
 * Preloaded demonstration study areas.
 *
 * Each area carries a simplified bounding box (used as the FIRMS `west,south,east,north`
 * query envelope) and a coarse fire-regime profile that drives the synthetic demo archive.
 * Profiles are qualitative approximations of well-documented burning seasons; they are
 * not calibrated against real FIRMS counts.
 */

export interface FireZone {
  name: string
  lat: number
  lng: number
  /** Spatial spread of ignitions around the zone centre, in degrees. */
  radius: number
  /** Relative share of the area's activity. */
  weight: number
  /** Day of year of the climatological peak. */
  peakDoy: number
  /** Season half-width in days (Gaussian sigma). */
  width: number
  /** Mean detections-per-episode scale. Larger = bigger fires, fewer small burns. */
  fireSize: number
}

export interface StudyArea {
  id: string
  name: string
  country: string
  shortDescription: string
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  center: [number, number]
  zoom: number
  zones: FireZone[]
  /** New fire episodes per day across the whole area at full seasonal peak. */
  peakEpisodesPerDay: number
  /** Day of year at the centre of the cloudy / wet season, and its half-width. */
  wetSeason: { centerDoy: number; width: number; cloudProb: number }
  /** Year multipliers for notable fire years. Unlisted years draw from random variability. */
  notableYears: Record<number, number>
  /** Typical VIIRS:MODIS detection ratio for this fire regime. */
  baseViirsRatio: number
  typicalSeasonLabel: string
}

export const STUDY_AREAS: readonly StudyArea[] = [
  {
    id: 'tamil_nadu',
    name: 'Tamil Nadu',
    country: 'India',
    shortDescription: 'Western & Eastern Ghats forest fringe and Cauvery delta crop residue burning.',
    bounds: { minLat: 8.05, maxLat: 13.55, minLng: 76.2, maxLng: 80.35 },
    center: [10.9, 78.3],
    zoom: 7,
    zones: [
      { name: 'Nilgiris & Mudumalai', lat: 11.5, lng: 76.65, radius: 0.3, weight: 1.3, peakDoy: 70, width: 22, fireSize: 1.5 },
      { name: 'Sathyamangalam', lat: 11.6, lng: 77.25, radius: 0.3, weight: 1.1, peakDoy: 75, width: 22, fireSize: 1.4 },
      { name: 'Javadhu Hills', lat: 12.55, lng: 78.85, radius: 0.3, weight: 0.9, peakDoy: 85, width: 25, fireSize: 1.2 },
      { name: 'Shevaroy & Kolli Hills', lat: 11.55, lng: 78.3, radius: 0.35, weight: 0.9, peakDoy: 80, width: 25, fireSize: 1.2 },
      { name: 'Megamalai & Theni', lat: 9.75, lng: 77.35, radius: 0.3, weight: 0.8, peakDoy: 65, width: 20, fireSize: 1.3 },
      { name: 'Cauvery Delta croplands', lat: 10.75, lng: 79.35, radius: 0.35, weight: 0.8, peakDoy: 30, width: 20, fireSize: 0.7 },
    ],
    peakEpisodesPerDay: 2.2,
    wetSeason: { centerDoy: 320, width: 40, cloudProb: 0.55 },
    notableYears: { 2004: 1.5, 2009: 1.4, 2012: 1.35, 2016: 1.3, 2017: 1.7, 2019: 1.35, 2024: 1.6 },
    baseViirsRatio: 3.4,
    typicalSeasonLabel: 'Feb – Apr',
  },
  {
    id: 'amazon',
    name: 'Southern Amazon',
    country: 'Brazil',
    shortDescription: 'Arc of deforestation across Pará, Mato Grosso and Rondônia.',
    bounds: { minLat: -13.0, maxLat: -3.0, minLng: -61.0, maxLng: -48.0 },
    center: [-8.0, -54.5],
    zoom: 5,
    zones: [
      { name: 'Novo Progresso (BR-163)', lat: -7.2, lng: -55.4, radius: 0.9, weight: 1.3, peakDoy: 235, width: 24, fireSize: 1.6 },
      { name: 'São Félix do Xingu', lat: -6.6, lng: -51.9, radius: 0.8, weight: 1.2, peakDoy: 240, width: 24, fireSize: 1.5 },
      { name: 'Altamira', lat: -4.6, lng: -53.4, radius: 0.7, weight: 0.9, peakDoy: 245, width: 22, fireSize: 1.4 },
      { name: 'Northern Mato Grosso', lat: -10.6, lng: -55.6, radius: 1.1, weight: 1.3, peakDoy: 245, width: 26, fireSize: 1.3 },
      { name: 'Eastern Rondônia', lat: -10.4, lng: -59.6, radius: 0.8, weight: 1.0, peakDoy: 238, width: 22, fireSize: 1.4 },
      { name: 'Marabá', lat: -5.8, lng: -49.5, radius: 0.7, weight: 0.8, peakDoy: 250, width: 25, fireSize: 1.1 },
    ],
    peakEpisodesPerDay: 2.5,
    wetSeason: { centerDoy: 50, width: 55, cloudProb: 0.7 },
    notableYears: { 2004: 1.6, 2005: 1.7, 2007: 1.5, 2009: 0.6, 2010: 1.8, 2011: 0.65, 2013: 0.7, 2019: 1.35, 2020: 1.45, 2024: 1.9 },
    baseViirsRatio: 2.6,
    typicalSeasonLabel: 'Jul – Oct',
  },
  {
    id: 'indonesia',
    name: 'Sumatra & Kalimantan',
    country: 'Indonesia',
    shortDescription: 'Peatland and plantation fires, strongly amplified in El Niño years.',
    bounds: { minLat: -4.5, maxLat: 3.0, minLng: 100.0, maxLng: 117.0 },
    center: [-1.0, 108.5],
    zoom: 5,
    zones: [
      { name: 'Ogan Komering Ilir peat (S. Sumatra)', lat: -3.3, lng: 105.5, radius: 0.5, weight: 1.3, peakDoy: 265, width: 20, fireSize: 1.2 },
      { name: 'Riau peatlands', lat: 0.8, lng: 101.9, radius: 0.6, weight: 1.0, peakDoy: 200, width: 30, fireSize: 1.1 },
      { name: 'Jambi', lat: -1.7, lng: 103.8, radius: 0.5, weight: 0.9, peakDoy: 255, width: 20, fireSize: 1.1 },
      { name: 'Palangkaraya (C. Kalimantan)', lat: -2.4, lng: 113.9, radius: 0.7, weight: 1.3, peakDoy: 265, width: 20, fireSize: 1.3 },
      { name: 'West Kalimantan', lat: -0.4, lng: 110.3, radius: 0.6, weight: 0.9, peakDoy: 235, width: 22, fireSize: 1.0 },
      { name: 'South Kalimantan', lat: -2.9, lng: 115.1, radius: 0.4, weight: 0.6, peakDoy: 270, width: 20, fireSize: 1.0 },
    ],
    peakEpisodesPerDay: 2.4,
    wetSeason: { centerDoy: 15, width: 60, cloudProb: 0.65 },
    notableYears: { 2004: 1.3, 2006: 2.3, 2009: 1.6, 2012: 1.2, 2014: 1.4, 2015: 3.0, 2016: 0.35, 2017: 0.45, 2019: 2.2, 2020: 0.4, 2021: 0.45, 2023: 1.8 },
    baseViirsRatio: 3.0,
    typicalSeasonLabel: 'Aug – Oct',
  },
  {
    id: 'california',
    name: 'California',
    country: 'United States',
    shortDescription: 'Mediterranean-climate chaparral and conifer forest wildfire season.',
    bounds: { minLat: 32.5, maxLat: 42.0, minLng: -124.4, maxLng: -114.1 },
    center: [37.3, -119.6],
    zoom: 6,
    zones: [
      { name: 'Sierra Nevada foothills', lat: 38.9, lng: -120.7, radius: 0.5, weight: 1.2, peakDoy: 225, width: 30, fireSize: 1.8 },
      { name: 'North Coast Ranges', lat: 39.5, lng: -122.7, radius: 0.5, weight: 1.0, peakDoy: 220, width: 28, fireSize: 1.9 },
      { name: 'Klamath & Shasta', lat: 41.0, lng: -122.9, radius: 0.5, weight: 1.0, peakDoy: 215, width: 28, fireSize: 2.0 },
      { name: 'Transverse Ranges (SoCal)', lat: 34.35, lng: -118.1, radius: 0.45, weight: 0.9, peakDoy: 285, width: 35, fireSize: 1.8 },
      { name: 'Big Sur & Central Coast', lat: 36.2, lng: -121.4, radius: 0.35, weight: 0.6, peakDoy: 215, width: 25, fireSize: 1.7 },
      { name: 'San Joaquin Valley croplands', lat: 36.8, lng: -119.9, radius: 0.5, weight: 0.6, peakDoy: 165, width: 35, fireSize: 0.6 },
    ],
    peakEpisodesPerDay: 1.5,
    wetSeason: { centerDoy: 20, width: 45, cloudProb: 0.5 },
    notableYears: { 2003: 1.3, 2007: 1.6, 2008: 1.8, 2010: 0.6, 2011: 0.65, 2017: 1.8, 2018: 1.9, 2019: 0.7, 2020: 2.8, 2021: 2.1, 2022: 0.8, 2023: 0.75 },
    baseViirsRatio: 2.2,
    typicalSeasonLabel: 'Jul – Oct',
  },
  {
    id: 'mediterranean',
    name: 'Mediterranean Europe',
    country: 'Portugal → Türkiye',
    shortDescription: 'Summer wildfires from Iberia through Italy and Greece to western Anatolia.',
    bounds: { minLat: 35.0, maxLat: 44.5, minLng: -9.6, maxLng: 29.5 },
    center: [39.5, 10.0],
    zoom: 5,
    zones: [
      { name: 'Central Portugal', lat: 40.0, lng: -8.0, radius: 0.5, weight: 1.2, peakDoy: 215, width: 22, fireSize: 1.6 },
      { name: 'Galicia', lat: 42.4, lng: -7.7, radius: 0.4, weight: 0.8, peakDoy: 225, width: 25, fireSize: 1.3 },
      { name: 'Andalusia', lat: 37.5, lng: -5.4, radius: 0.5, weight: 0.8, peakDoy: 205, width: 22, fireSize: 1.4 },
      { name: 'Sardinia', lat: 40.1, lng: 9.0, radius: 0.35, weight: 0.6, peakDoy: 205, width: 18, fireSize: 1.4 },
      { name: 'Calabria & Sicily', lat: 38.3, lng: 15.6, radius: 0.5, weight: 0.8, peakDoy: 210, width: 20, fireSize: 1.3 },
      { name: 'Attica & Evia', lat: 38.4, lng: 23.6, radius: 0.35, weight: 0.8, peakDoy: 212, width: 18, fireSize: 1.7 },
      { name: 'Western Anatolia', lat: 37.6, lng: 28.2, radius: 0.4, weight: 0.7, peakDoy: 210, width: 18, fireSize: 1.6 },
    ],
    peakEpisodesPerDay: 2.2,
    wetSeason: { centerDoy: 15, width: 50, cloudProb: 0.55 },
    notableYears: { 2003: 1.8, 2005: 1.5, 2007: 1.9, 2012: 1.5, 2014: 0.6, 2017: 2.2, 2018: 0.65, 2021: 2.0, 2022: 1.7, 2023: 1.6, 2025: 1.8 },
    baseViirsRatio: 2.4,
    typicalSeasonLabel: 'Jul – Aug',
  },
  {
    id: 'australia',
    name: 'Australia',
    country: 'Australia',
    shortDescription: 'Northern savanna burning (dry season) and south-east forest bushfires (summer).',
    bounds: { minLat: -39.0, maxLat: -11.0, minLng: 113.0, maxLng: 154.0 },
    center: [-24.5, 134.0],
    zoom: 4,
    zones: [
      { name: 'Kimberley savanna', lat: -16.6, lng: 126.6, radius: 1.3, weight: 1.3, peakDoy: 240, width: 40, fireSize: 1.4 },
      { name: 'Top End (NT)', lat: -13.6, lng: 132.6, radius: 1.2, weight: 1.3, peakDoy: 225, width: 40, fireSize: 1.3 },
      { name: 'Cape York', lat: -14.6, lng: 143.0, radius: 1.0, weight: 0.9, peakDoy: 260, width: 35, fireSize: 1.2 },
      { name: 'Gulf Country', lat: -17.8, lng: 139.4, radius: 1.2, weight: 0.9, peakDoy: 250, width: 40, fireSize: 1.3 },
      { name: 'South-east forests (NSW/VIC)', lat: -35.9, lng: 148.6, radius: 0.9, weight: 0.5, peakDoy: 360, width: 25, fireSize: 2.2 },
      { name: 'South-west WA', lat: -33.2, lng: 116.6, radius: 0.6, weight: 0.4, peakDoy: 20, width: 30, fireSize: 1.6 },
    ],
    peakEpisodesPerDay: 1.9,
    wetSeason: { centerDoy: 45, width: 45, cloudProb: 0.5 },
    notableYears: { 2003: 1.4, 2006: 1.2, 2009: 1.3, 2011: 1.6, 2012: 1.7, 2019: 2.0, 2020: 0.8, 2023: 1.5 },
    baseViirsRatio: 2.8,
    typicalSeasonLabel: 'Jun – Nov (north) · Dec – Feb (south-east)',
  },
] as const

export const DEFAULT_STUDY_AREA_ID = 'tamil_nadu'

export function getStudyArea(id: string): StudyArea | undefined {
  return STUDY_AREAS.find((a) => a.id === id)
}

/** FIRMS Area API bounding-box string: west,south,east,north. */
export function toFirmsBbox(bounds: StudyArea['bounds']): string {
  const r = (v: number) => Number(v.toFixed(3))
  return `${r(bounds.minLng)},${r(bounds.minLat)},${r(bounds.maxLng)},${r(bounds.maxLat)}`
}
