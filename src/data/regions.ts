import type { RegionDefinition } from '@/types/fire'

/**
 * Notice regarding regional boundaries:
 * Simplified rectangular bounding boxes are used solely for demo filtering.
 * They do not reflect official survey boundaries, international borders,
 * or constitutional state borders of the Republic of India.
 */
export const REGIONAL_BOUNDS_DISCLAIMER =
  'Simplified bounding boxes are used for spatial filtering. They do not represent official administrative or state boundaries.'

export const REGIONS: readonly RegionDefinition[] = [
  {
    id: 'all',
    name: 'All India',
    bounds: {
      minLat: 8.0,
      maxLat: 36.5,
      minLng: 68.0,
      maxLng: 97.5,
    },
    description: 'Mainland India bounding envelope (8°N–36.5°N, 68°E–97.5°E)',
  },
  {
    id: 'tamil_nadu',
    name: 'Tamil Nadu',
    bounds: {
      minLat: 8.05,
      maxLat: 13.55,
      minLng: 76.2,
      maxLng: 80.35,
    },
    description: 'Southern peninsular bounds covering Western & Eastern Ghats, Cauvery basin, Nilgiris',
  },
  {
    id: 'kerala',
    name: 'Kerala',
    bounds: {
      minLat: 8.25,
      maxLat: 12.8,
      minLng: 74.85,
      maxLng: 77.6,
    },
    description: 'Southwestern coastal & Western Ghats bounds (Wayanad, Idukki, Silent Valley corridors)',
  },
  {
    id: 'karnataka',
    name: 'Karnataka',
    bounds: {
      minLat: 11.55,
      maxLat: 18.45,
      minLng: 74.05,
      maxLng: 78.6,
    },
    description: 'Deccan plateau & Western Ghats bounds (Bandipur, Nagarhole, Western Ghats forest tracts)',
  },
  {
    id: 'andhra_pradesh',
    name: 'Andhra Pradesh',
    bounds: {
      minLat: 12.6,
      maxLat: 19.15,
      minLng: 76.75,
      maxLng: 84.75,
    },
    description: 'Eastern Ghats & coastal belt (Nallamala hills, Seshachalam biosphere, Godavari/Krishna basins)',
  },
  {
    id: 'telangana',
    name: 'Telangana',
    bounds: {
      minLat: 15.8,
      maxLat: 19.9,
      minLng: 77.2,
      maxLng: 81.8,
    },
    description: 'Northern Deccan plateau (Amrabad forest reserve, Godavari valley dry deciduous tracts)',
  },
] as const

/**
 * Determine the primary region for a given coordinate.
 * Checks specific regions first, falls back to All India or 'other'.
 */
export function assignRegion(lat: number, lng: number): { id: string; name: string } {
  // Check specific state envelopes first
  for (const reg of REGIONS) {
    if (reg.id === 'all') continue
    const { minLat, maxLat, minLng, maxLng } = reg.bounds
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return { id: reg.id, name: reg.name }
    }
  }

  // Check if inside India overall envelope
  const allBounds = REGIONS[0]!.bounds
  if (
    lat >= allBounds.minLat &&
    lat <= allBounds.maxLat &&
    lng >= allBounds.minLng &&
    lng <= allBounds.maxLng
  ) {
    return { id: 'other_india', name: 'Other Regions (India)' }
  }

  return { id: 'out_of_bounds', name: 'Outside Region' }
}

export function getRegionById(id: string): RegionDefinition | undefined {
  return REGIONS.find((r) => r.id === id)
}
