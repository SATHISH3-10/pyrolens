export type BasemapId = 'dark' | 'light' | 'satellite'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'

export interface Basemap {
  label: string
  url: string
  /** Optional label/reference overlay drawn above data layers' base. */
  labels?: string
  attribution: string
  maxZoom: number
}

/** Keyless Esri basemaps (attribution required). */
export const BASEMAPS: Record<BasemapId, Basemap> = {
  dark: {
    label: 'Dark',
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxZoom: 16,
  },
  light: {
    label: 'Light',
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxZoom: 16,
  },
  satellite: {
    label: 'Satellite',
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
}
