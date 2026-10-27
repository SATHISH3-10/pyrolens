import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import Map, {
  AttributionControl,
  Layer,
  NavigationControl,
  ScaleControl,
  Source,
  useControl,
  type MapRef,
  type ViewStateChangeEvent,
} from 'react-map-gl/maplibre'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import './maplibreSetup'
import { useTheme } from '@/context/ThemeContext'
import { CARTO_STYLES, ESRI_IMAGERY, GIBS_ATTRIBUTION, rasterStyle, type BasemapId, type RasterSpec } from './basemaps'
import { GIBS_MAX_NATIVE_ZOOM, gibsTileUrl, type GibsLayerSpec } from './gibs'
import { useAoiDrawing, type DrawTool } from './useAoiDrawing'

/** deck.gl rendered as a MapLibre control (non-interleaved overlay), the integration the deck.gl docs recommend. */
function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

export interface MapCanvasProps {
  /** [[west, south], [east, north]]; the map fits these whenever `boundsKey` changes. */
  bounds: [[number, number], [number, number]]
  boundsKey: string
  basemap: BasemapId
  gibs: { spec: GibsLayerSpec; date: string } | null
  satLabels: boolean
  layers: MapboxOverlayProps['layers']
  outlines: FeatureCollection
  drawTool: DrawTool
  onDrawComplete: (points: Array<[number, number]>, kind: 'rectangle' | 'polygon') => void
  onDrawCancel: () => void
  onBackgroundClick?: () => void
  onZoomChange?: (zoom: number) => void
  onLoad?: () => void
  mapRef?: React.RefObject<MapRef | null>
  children?: ReactNode
}

export function MapCanvas({
  bounds,
  boundsKey,
  basemap,
  gibs,
  satLabels,
  layers,
  outlines,
  drawTool,
  onDrawComplete,
  onDrawCancel,
  onBackgroundClick,
  onZoomChange,
  onLoad,
  mapRef: externalRef,
  children,
}: MapCanvasProps) {
  const { tokens } = useTheme()
  const ownRef = useRef<MapRef | null>(null)
  const mapRef = externalRef ?? ownRef
  const draw = useAoiDrawing(drawTool, mapRef, onDrawComplete, onDrawCancel)

  // Vector basemaps come from CARTO style URLs; imagery modes are self-contained raster styles so that a GIBS
  // date change is a style diff (old source out, new source in) that keeps overlays above the imagery.
  const gibsKey = gibs ? `${gibs.spec.id}|${gibs.date}` : ''
  const mapStyle = useMemo(() => {
    if (basemap === 'dark' || basemap === 'light') return CARTO_STYLES[basemap]
    const rasters: RasterSpec[] = []
    if (basemap === 'satellite') {
      rasters.push({ id: 'esri-imagery', tiles: ESRI_IMAGERY.tiles, maxzoom: 19, attribution: ESRI_IMAGERY.attribution })
    } else if (gibs) {
      rasters.push({
        id: `gibs-${gibs.date}`,
        tiles: gibsTileUrl(gibs.spec, gibs.date),
        maxzoom: GIBS_MAX_NATIVE_ZOOM,
        attribution: `${GIBS_ATTRIBUTION} · ${gibs.spec.label} ${gibs.date}`,
      })
    }
    if (satLabels) {
      rasters.push({ id: 'esri-labels', tiles: ESRI_IMAGERY.labels, maxzoom: 19, attribution: ESRI_IMAGERY.labelsAttribution, opacity: 0.85 })
    }
    return rasterStyle(tokens.mapBg, rasters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap, gibsKey, satLabels, tokens.mapBg])

  // Fit to the study area / AOI when it changes (not on every render).
  const firstFit = useRef(true)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.fitBounds(bounds, { padding: 48, duration: firstFit.current ? 0 : 800, maxZoom: 11 })
    firstFit.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey])

  return (
    <Map
      ref={mapRef}
      initialViewState={{ bounds, fitBoundsOptions: { padding: 48, maxZoom: 11 } }}
      mapStyle={mapStyle}
      attributionControl={false}
      maxZoom={18}
      dragPan={drawTool !== 'rectangle'}
      doubleClickZoom={drawTool === 'none'}
      cursor={drawTool === 'none' ? undefined : 'crosshair'}
      onLoad={onLoad}
      onZoomEnd={(e: ViewStateChangeEvent) => onZoomChange?.(e.viewState.zoom)}
      onClick={(e) => {
        draw.handlers.onClick(e)
      }}
      onDblClick={draw.handlers.onDblClick}
      onMouseDown={draw.handlers.onMouseDown}
      onMouseMove={draw.handlers.onMouseMove}
      onMouseUp={draw.handlers.onMouseUp}
      style={{ width: '100%', height: '100%', background: tokens.mapBg }}
    >
      <Source id="outlines" type="geojson" data={outlines}>
        <Layer
          id="outline-fill"
          type="fill"
          filter={['==', ['get', 'kind'], 'aoi']}
          paint={{ 'fill-color': tokens.aoi, 'fill-opacity': 0.06 }}
        />
        <Layer
          id="outline-line"
          type="line"
          paint={{ 'line-color': tokens.aoi, 'line-width': ['case', ['==', ['get', 'kind'], 'aoi'], 2, 1.25], 'line-dasharray': [3, 2] }}
        />
      </Source>

      <Source id="draw-preview" type="geojson" data={draw.preview}>
        <Layer id="draw-fill" type="fill" filter={['==', ['geometry-type'], 'Polygon']} paint={{ 'fill-color': tokens.accent, 'fill-opacity': 0.12 }} />
        <Layer
          id="draw-line"
          type="line"
          filter={['!=', ['geometry-type'], 'Point']}
          paint={{ 'line-color': tokens.accent, 'line-width': 2, 'line-dasharray': [2, 1.5] }}
        />
        <Layer
          id="draw-points"
          type="circle"
          filter={['==', ['geometry-type'], 'Point']}
          paint={{
            'circle-radius': ['case', ['get', 'first'], 6, 4],
            'circle-color': tokens.accent,
            'circle-stroke-color': tokens.surface,
            'circle-stroke-width': 2,
          }}
        />
      </Source>

      <DeckGLOverlay
        layers={layers}
        onClick={(info) => {
          if (!info.picked && drawTool === 'none') onBackgroundClick?.()
        }}
      />
      <NavigationControl position="bottom-right" visualizePitch showCompass />
      <ScaleControl position="bottom-right" unit="metric" />
      <AttributionControl position="bottom-right" compact />
      {children}
    </Map>
  )
}
