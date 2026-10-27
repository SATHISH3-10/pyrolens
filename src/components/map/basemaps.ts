import type { StyleSpecification } from 'maplibre-gl'

export type BasemapId = 'dark' | 'light' | 'satellite' | 'gibs'
/** 'auto' follows the app theme (Dark Matter in dark, Positron in light). */
export type BasemapChoice = 'auto' | BasemapId

export const BASEMAP_LABELS: Record<BasemapId, string> = {
  dark: 'Dark',
  light: 'Light',
  satellite: 'Satellite',
  gibs: 'On this date',
}

/** Keyless CARTO vector styles (OpenStreetMap data). Verified HTTP 200 for style, tiles, sprite and glyphs. */
export const CARTO_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
} as const

export const ESRI_IMAGERY = {
  tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  labelsAttribution: 'Boundaries & places © Esri',
}

export const GIBS_ATTRIBUTION =
  'Imagery: NASA GIBS, part of NASA’s Earth Science Data and Information System (ESDIS)'

/** Esri day-time raster tile layers keep the old Leaflet basemaps for the small day-detail map. */
export const ESRI_CANVAS = {
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
}

/** Invisible top-most style layer: imagery re-added by a style diff is inserted below it, so overlays stay on top. */
export const TOP_ANCHOR = 'anchor-top'

export interface RasterSpec {
  id: string
  tiles: string
  maxzoom: number
  attribution: string
  opacity?: number
}

/** A self-contained raster basemap style (imagery, optional labels) for Satellite and GIBS modes. */
export function rasterStyle(background: string, rasters: RasterSpec[]): StyleSpecification {
  const sources: StyleSpecification['sources'] = {}
  const layers: StyleSpecification['layers'] = [{ id: 'background', type: 'background', paint: { 'background-color': background } }]
  for (const r of rasters) {
    sources[r.id] = { type: 'raster', tiles: [r.tiles], tileSize: 256, maxzoom: r.maxzoom, attribution: r.attribution }
    layers.push({ id: r.id, type: 'raster', source: r.id, paint: r.opacity !== undefined ? { 'raster-opacity': r.opacity } : {} })
  }
  layers.push({ id: TOP_ANCHOR, type: 'background', paint: { 'background-opacity': 0 } })
  return { version: 8, sources, layers }
}

export function resolveBasemap(choice: BasemapChoice, theme: 'light' | 'dark'): BasemapId {
  return choice === 'auto' ? theme : choice
}
