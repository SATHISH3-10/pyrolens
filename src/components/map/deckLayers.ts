import { ScatterplotLayer, PolygonLayer } from '@deck.gl/layers'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import type { Layer, PickingInfo } from '@deck.gl/core'
import type { FireObservation } from '@/types/fire'
import type { FireEvent } from '@/types/activity'
import type { ThemeTokens } from '@/context/ThemeContext'
import { AGE_BUCKETS, ageBucket, confidenceLevel, detectionAgeHours, frpClass } from '@/utils/mapFilters'
import { toRGBA, withAlpha, type RGBA } from './colorUtils'
import { hotspotRadius } from './hotspotStyle'

export type HotspotColorMode = 'age' | 'frp'
export type DensityMode = 'count' | 'frp' | 'clusters'

/** Transparent → yellow → orange → red → dark red, for the density layer. */
export const DENSITY_RAMP: RGBA[] = [
  [255, 237, 160, 0],
  [254, 217, 118, 150],
  [253, 141, 60, 190],
  [240, 59, 32, 215],
  [189, 0, 38, 235],
  [110, 0, 30, 245],
]

export { HOTSPOT_RADIUS, hotspotRadius } from './hotspotStyle'

const CONF_FILL_ALPHA = { high: 235, nominal: 140, low: 0 } as const

export function frpColors(t: ThemeTokens): Record<'low' | 'moderate' | 'high' | 'extreme', RGBA> {
  return { low: toRGBA(t.bai.low), moderate: toRGBA(t.bai.moderate), high: toRGBA(t.bai.high), extreme: toRGBA(t.bai.extreme) }
}

export interface DeckLayerOptions {
  hotspots: FireObservation[]
  events: FireEvent[]
  show: { hotspots: boolean; clusters: boolean; density: boolean }
  colorMode: HotspotColorMode
  windowEndMs: number
  densityMode: DensityMode
  densityOpacity: number
  tokens: ThemeTokens
  selectedHotspotId: string | null
  selectedEventId: string | null
  onHotspotClick: (o: FireObservation, info: PickingInfo) => void
  onEventClick: (e: FireEvent, info: PickingInfo) => void
}

function eventPolygon(e: FireEvent): Array<[number, number]> {
  if (e.hull.length >= 3) return e.hull.map(([lat, lng]) => [lng, lat])
  const [lat, lng] = e.centroid
  const d = 0.01
  return [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
  ]
}

export function buildDeckLayers(o: DeckLayerOptions): Layer[] {
  const t = o.tokens
  const layers: Layer[] = []
  const outline: RGBA = t.mode === 'dark' ? [0, 0, 0, 170] : [17, 24, 39, 170]
  const ring = toRGBA(t.accentRing)
  const clusterColor = toRGBA(t.bai.high)
  const frpPalette = frpColors(t)

  if (o.show.density) {
    const useEvents = o.densityMode === 'clusters'
    layers.push(
      new HeatmapLayer<FireObservation | FireEvent>({
        id: 'density',
        data: (useEvents ? o.events : o.hotspots) as Array<FireObservation | FireEvent>,
        getPosition: (d) => ('centroid' in d ? [d.centroid[1], d.centroid[0]] : [d.longitude, d.latitude]),
        getWeight: (d) => ('centroid' in d ? 1 : o.densityMode === 'frp' ? Math.max(0, d.frp ?? 0) : 1),
        radiusPixels: 32,
        intensity: 1,
        threshold: 0.04,
        colorRange: DENSITY_RAMP.map((c) => [...c]) as unknown as RGBA[],
        opacity: o.densityOpacity,
        aggregation: 'SUM',
        updateTriggers: { getWeight: [o.densityMode] },
      }),
    )
  }

  if (o.show.clusters && o.events.length > 0) {
    const maxFrp = Math.max(1, ...o.events.map((e) => e.totalFrp))
    layers.push(
      new ScatterplotLayer<FireEvent>({
        id: 'cluster-halo',
        data: o.events,
        getPosition: (e) => [e.centroid[1], e.centroid[0]],
        radiusUnits: 'pixels',
        getRadius: (e) => 7 + 14 * Math.sqrt(e.totalFrp / maxFrp),
        getFillColor: (e) => withAlpha(clusterColor, e.id === o.selectedEventId ? 90 : 45),
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: (e) => (e.id === o.selectedEventId ? 2.5 : 0),
        getLineColor: ring,
        pickable: true,
        onClick: (info) => info.object && o.onEventClick(info.object, info),
        updateTriggers: { getFillColor: [o.selectedEventId, t.mode], getLineWidth: [o.selectedEventId] },
      }),
      new PolygonLayer<FireEvent>({
        id: 'clusters',
        data: o.events,
        getPolygon: eventPolygon,
        filled: true,
        stroked: true,
        getFillColor: withAlpha(clusterColor, 60),
        getLineColor: (e) => (e.id === o.selectedEventId ? ring : withAlpha(clusterColor, 230)),
        lineWidthUnits: 'pixels',
        getLineWidth: (e) => (e.id === o.selectedEventId ? 2.5 : 1.25),
        pickable: true,
        onClick: (info) => info.object && o.onEventClick(info.object, info),
        updateTriggers: { getLineColor: [o.selectedEventId, t.mode], getLineWidth: [o.selectedEventId], getFillColor: [t.mode] },
      }),
    )
  }

  if (o.show.hotspots) {
    const baseColor = (d: FireObservation): RGBA => {
      if (o.colorMode === 'age') {
        const c = AGE_BUCKETS[ageBucket(detectionAgeHours(d, o.windowEndMs))]!.color
        return [c[0], c[1], c[2], 255]
      }
      return frpPalette[frpClass(d.frp) ?? 'low']
    }
    layers.push(
      new ScatterplotLayer<FireObservation>({
        id: 'hotspots',
        data: o.hotspots,
        getPosition: (d) => [d.longitude, d.latitude],
        radiusUnits: 'pixels',
        getRadius: (d) => hotspotRadius(d.frp) + (d.id === o.selectedHotspotId ? 3 : 0),
        filled: true,
        stroked: true,
        lineWidthUnits: 'pixels',
        // Confidence is encoded by fill, not hue: high = solid, nominal = translucent, low = hollow ring.
        getFillColor: (d) => withAlpha(baseColor(d), CONF_FILL_ALPHA[confidenceLevel(d)]),
        getLineColor: (d) => (d.id === o.selectedHotspotId ? ring : confidenceLevel(d) === 'low' ? baseColor(d) : outline),
        getLineWidth: (d) => (d.id === o.selectedHotspotId ? 2.5 : confidenceLevel(d) === 'low' ? 1.6 : 0.6),
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 90],
        onClick: (info) => info.object && o.onHotspotClick(info.object, info),
        updateTriggers: {
          getFillColor: [o.colorMode, o.windowEndMs, t.mode],
          getLineColor: [o.colorMode, o.windowEndMs, o.selectedHotspotId, t.mode],
          getLineWidth: [o.selectedHotspotId],
          getRadius: [o.selectedHotspotId],
        },
      }),
    )
  }
  return layers
}
