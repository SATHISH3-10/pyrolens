/**
 * NASA GIBS daily true-colour imagery (WMTS, EPSG:3857, GoogleMapsCompatible_Level9).
 *
 * Layer identifiers, tile-matrix set, format and the available date ranges below were read from
 * https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities
 * on 2026-10-27. Dates inside a gap return HTTP 404, so selection must use these ranges rather than a
 * single "start date". Note: S-NPP corrected reflectance in GIBS starts 2015-11-24, not at launch (2012).
 */

export interface GibsLayerSpec {
  id: string
  label: string
  /** Inclusive [start, end] ISO date ranges with daily imagery. */
  ranges: ReadonlyArray<readonly [string, string]>
}

export const GIBS_MAX_NATIVE_ZOOM = 9
export const GIBS_TILE_MATRIX_SET = 'GoogleMapsCompatible_Level9'
export const GIBS_CAPABILITIES_CHECKED = '2026-10-27'

export const GIBS_VIIRS_SNPP: GibsLayerSpec = {
  id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
  label: 'VIIRS S-NPP true colour',
  ranges: [
    ['2015-11-24', '2022-07-27'],
    ['2022-08-10', '2024-05-31'],
    ['2024-06-04', '2024-07-11'],
    ['2024-07-16', '2024-07-24'],
    ['2024-07-29', '2024-11-03'],
    ['2024-11-06', '2026-04-28'],
    ['2026-04-30', '2026-07-10'],
    ['2026-07-16', '2026-10-26'],
  ],
}

export const GIBS_MODIS_TERRA: GibsLayerSpec = {
  id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
  label: 'MODIS Terra true colour',
  ranges: [
    ['2000-02-24', '2000-04-25'],
    ['2000-04-28', '2000-08-06'],
    ['2000-08-18', '2001-06-15'],
    ['2001-07-03', '2002-03-19'],
    ['2002-03-28', '2003-12-16'],
    ['2003-12-24', '2008-12-20'],
    ['2008-12-23', '2016-02-18'],
    ['2016-02-27', '2022-10-10'],
    ['2022-10-23', '2025-08-08'],
    ['2025-08-10', '2025-11-08'],
    ['2025-11-10', '2026-10-27'],
  ],
}

export function layerCovers(spec: GibsLayerSpec, date: string): boolean {
  return spec.ranges.some(([a, b]) => date >= a && date <= b)
}

/** Prefer VIIRS S-NPP when it has imagery for the date, otherwise MODIS Terra; null when neither does. */
export function selectGibsLayer(date: string): GibsLayerSpec | null {
  if (layerCovers(GIBS_VIIRS_SNPP, date)) return GIBS_VIIRS_SNPP
  if (layerCovers(GIBS_MODIS_TERRA, date)) return GIBS_MODIS_TERRA
  return null
}

export function gibsTileUrl(spec: GibsLayerSpec, date: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${spec.id}/default/${date}/${GIBS_TILE_MATRIX_SET}/{z}/{y}/{x}.jpg`
}
