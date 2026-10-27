import { useMemo } from 'react'
import Map, { AttributionControl, Layer, Source } from 'react-map-gl/maplibre'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import './maplibreSetup'
import type { FireObservation } from '@/types/fire'
import { useTheme } from '@/context/ThemeContext'
import { CARTO_STYLES } from './basemaps'

/** Small non-interactive MapLibre map of one day's detections (MODIS / VIIRS coloured by sensor). */
export function MiniMap({ points }: { points: readonly FireObservation[] }) {
  const { resolved, tokens } = useTheme()
  const data = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: points.slice(0, 5000).map((o) => ({
        type: 'Feature',
        properties: { modis: o.instrument === 'MODIS' },
        geometry: { type: 'Point', coordinates: [o.longitude, o.latitude] },
      })),
    }),
    [points],
  )
  const bounds = useMemo<[[number, number], [number, number]]>(() => {
    let w = 180
    let s = 90
    let e = -180
    let n = -90
    for (const o of points) {
      w = Math.min(w, o.longitude)
      e = Math.max(e, o.longitude)
      s = Math.min(s, o.latitude)
      n = Math.max(n, o.latitude)
    }
    const pad = 0.15
    return [
      [w - pad, s - pad],
      [e + pad, n + pad],
    ]
  }, [points])

  return (
    <Map
      key={`${bounds.flat().join(',')}|${resolved}`}
      initialViewState={{ bounds, fitBoundsOptions: { padding: 20, maxZoom: 10 } }}
      mapStyle={CARTO_STYLES[resolved]}
      interactive={false}
      attributionControl={false}
      style={{ width: '100%', height: '100%', background: tokens.mapBg }}
    >
      <Source id="day-points" type="geojson" data={data}>
        <Layer
          id="day-points"
          type="circle"
          paint={{
            'circle-radius': ['case', ['get', 'modis'], 4, 3],
            'circle-color': ['case', ['get', 'modis'], tokens.sensors.MODIS, tokens.sensors.VIIRS],
            'circle-stroke-color': tokens.surface,
            'circle-stroke-width': 0.75,
            'circle-opacity': 0.9,
          }}
        />
      </Source>
      <AttributionControl compact position="bottom-right" />
    </Map>
  )
}
