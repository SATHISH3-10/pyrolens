import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Polygon, Polyline, Rectangle, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import type { FireObservation } from '@/types/fire'
import type { FireEvent } from '@/types/activity'
import { SENSOR_COLORS } from '@/components/viz/activityScale'

/** Hotspots drawn imperatively on a shared canvas renderer, so tens of thousands of points stay fluid. */
export function HotspotLayer({
  points,
  selectedId,
  onSelect,
}: {
  points: readonly FireObservation[]
  selectedId: string | null
  onSelect: (o: FireObservation) => void
}) {
  const map = useMap()
  const renderer = useMemo(() => L.canvas({ padding: 0.4, tolerance: 4 }), [])
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const group = L.layerGroup()
    let selected: FireObservation | null = null
    for (const o of points) {
      if (o.id === selectedId) {
        selected = o
        continue
      }
      const modis = o.instrument === 'MODIS'
      const frp = o.frp ?? 0
      const m = L.circleMarker([o.latitude, o.longitude], {
        renderer,
        radius: (modis ? 4 : 3) + (frp > 80 ? 2.5 : frp > 30 ? 1.2 : 0),
        color: modis ? '#ffb38a' : '#9cc4f5',
        weight: 0.6,
        opacity: 0.9,
        fillColor: modis ? SENSOR_COLORS.MODIS : SENSOR_COLORS.VIIRS,
        fillOpacity: 0.85,
      })
      m.on('click', () => onSelectRef.current(o))
      group.addLayer(m)
    }
    if (selected) {
      group.addLayer(
        L.circleMarker([selected.latitude, selected.longitude], {
          renderer,
          radius: 9,
          color: '#ffffff',
          weight: 2.5,
          fillColor: selected.instrument === 'MODIS' ? SENSOR_COLORS.MODIS : SENSOR_COLORS.VIIRS,
          fillOpacity: 1,
        }),
      )
    }
    group.addTo(map)
    return () => {
      group.remove()
    }
  }, [map, points, selectedId, renderer])

  return null
}

/** Fire events as convex hulls (or a ring for single-pixel events), scaled by total FRP. */
export function ClusterLayer({
  events,
  selectedId,
  onSelect,
}: {
  events: readonly FireEvent[]
  selectedId: string | null
  onSelect: (e: FireEvent) => void
}) {
  const map = useMap()
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const group = L.layerGroup()
    const maxFrp = Math.max(1, ...events.map((e) => e.totalFrp))
    for (const e of events) {
      const intensity = Math.sqrt(e.totalFrp / maxFrp)
      const selected = e.id === selectedId
      const style: L.PathOptions = {
        color: selected ? '#ffffff' : intensity > 0.5 ? '#ff5a3c' : '#ffa94d',
        weight: selected ? 2.5 : 1.5,
        fillColor: intensity > 0.5 ? '#e0412f' : '#f0862c',
        fillOpacity: 0.12 + intensity * 0.35,
      }
      // Screen-space halo keeps clusters visible at regional zoom, where hulls are only a few pixels wide.
      group.addLayer(
        L.circleMarker(e.centroid, {
          radius: 7 + intensity * 16,
          stroke: selected,
          color: '#ffffff',
          weight: 2,
          fillColor: style.fillColor,
          fillOpacity: 0.12 + intensity * 0.2,
          interactive: false,
        }),
      )
      const layer =
        e.hull.length >= 3
          ? L.polygon(e.hull, style)
          : L.circleMarker(e.centroid, { ...style, radius: 4 + intensity * 4 })
      layer.bindTooltip(
        `<b>${e.count} detections</b> · ${e.durationDays} day${e.durationDays > 1 ? 's' : ''}<br/>${Math.round(e.totalFrp).toLocaleString()} MW total FRP`,
        { className: 'pl-tooltip', sticky: true },
      )
      layer.on('click', () => onSelectRef.current(e))
      group.addLayer(layer)
    }
    group.addTo(map)
    return () => {
      group.remove()
    }
  }, [map, events, selectedId])

  return null
}

const HEAT = ['#2f8f72', '#e3b53b', '#f0862c', '#e0412f', '#a3123a']

/** Detection density on a regular lat/lng grid; resolution follows zoom. */
export function DensityLayer({ points }: { points: readonly FireObservation[] }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const renderer = useMemo(() => L.canvas({ padding: 0.4 }), [])
  const cell = zoom >= 9 ? 0.05 : zoom >= 7 ? 0.1 : zoom >= 5 ? 0.25 : 0.5

  useEffect(() => {
    const counts = new Map<string, number>()
    for (const o of points) {
      const k = `${Math.floor(o.latitude / cell)}:${Math.floor(o.longitude / cell)}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const values = [...counts.values()].sort((a, b) => a - b)
    const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 1
    const breaks = [q(0.4), q(0.7), q(0.9), q(0.97)]
    const group = L.layerGroup()
    for (const [k, n] of counts) {
      const [iy, ix] = k.split(':').map(Number) as [number, number]
      const level = breaks.filter((b) => n > b).length
      const rect = L.rectangle(
        [
          [iy * cell, ix * cell],
          [(iy + 1) * cell, (ix + 1) * cell],
        ],
        { renderer, stroke: false, fillColor: HEAT[level], fillOpacity: 0.55 },
      )
      rect.bindTooltip(`${n.toLocaleString()} detections in ${cell}° cell`, { className: 'pl-tooltip' })
      group.addLayer(rect)
    }
    group.addTo(map)
    return () => {
      group.remove()
    }
  }, [map, points, cell, renderer])

  return null
}

export type DrawTool = 'none' | 'rectangle' | 'polygon'

/** Rectangle (drag) and polygon (click vertices, double-click or click first point to close) drawing. */
export function DrawController({
  tool,
  onComplete,
}: {
  tool: DrawTool
  onComplete: (points: Array<[number, number]>, kind: 'rectangle' | 'polygon') => void
}) {
  const map = useMap()
  const [rectStart, setRectStart] = useState<L.LatLng | null>(null)
  const [rectEnd, setRectEnd] = useState<L.LatLng | null>(null)
  const [vertices, setVertices] = useState<Array<[number, number]>>([])
  const [cursor, setCursor] = useState<[number, number] | null>(null)

  useEffect(() => {
    const el = map.getContainer()
    if (tool === 'none') {
      el.classList.remove('leaflet-crosshair')
      map.dragging.enable()
      map.doubleClickZoom.enable()
    } else {
      el.classList.add('leaflet-crosshair')
      map.doubleClickZoom.disable()
      if (tool === 'rectangle') map.dragging.disable()
      else map.dragging.enable()
    }
    setRectStart(null)
    setRectEnd(null)
    setVertices([])
    setCursor(null)
    return () => {
      el.classList.remove('leaflet-crosshair')
      map.dragging.enable()
      map.doubleClickZoom.enable()
    }
  }, [tool, map])

  const finishPolygon = (pts: Array<[number, number]>) => {
    if (pts.length >= 3) onComplete(pts, 'polygon')
    setVertices([])
  }

  useMapEvents({
    mousedown(e) {
      if (tool === 'rectangle') {
        setRectStart(e.latlng)
        setRectEnd(e.latlng)
      }
    },
    mousemove(e) {
      if (tool === 'rectangle' && rectStart) setRectEnd(e.latlng)
      if (tool === 'polygon') setCursor([e.latlng.lat, e.latlng.lng])
    },
    mouseup() {
      if (tool === 'rectangle' && rectStart && rectEnd) {
        const s = Math.min(rectStart.lat, rectEnd.lat)
        const n = Math.max(rectStart.lat, rectEnd.lat)
        const w = Math.min(rectStart.lng, rectEnd.lng)
        const ea = Math.max(rectStart.lng, rectEnd.lng)
        setRectStart(null)
        setRectEnd(null)
        if (n - s > 0.01 && ea - w > 0.01) {
          onComplete(
            [
              [s, w],
              [n, w],
              [n, ea],
              [s, ea],
            ],
            'rectangle',
          )
        }
      }
    },
    click(e) {
      if (tool !== 'polygon') return
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng]
      if (vertices.length >= 3) {
        const first = map.latLngToContainerPoint(vertices[0]!)
        const here = map.latLngToContainerPoint(e.latlng)
        if (first.distanceTo(here) < 12) {
          finishPolygon(vertices)
          return
        }
      }
      setVertices((v) => [...v, pt])
    },
    dblclick() {
      if (tool === 'polygon') finishPolygon(vertices)
    },
  })

  const drawStyle = { color: '#ffa94d', weight: 2, dashArray: '5 4', fillColor: '#ff8a1f', fillOpacity: 0.1 }
  return (
    <>
      {rectStart && rectEnd && <Rectangle bounds={L.latLngBounds(rectStart, rectEnd)} pathOptions={drawStyle} />}
      {vertices.length > 0 && (
        <>
          <Polyline positions={cursor ? [...vertices, cursor] : vertices} pathOptions={drawStyle} />
          {vertices.length >= 3 && <Polygon positions={vertices} pathOptions={{ ...drawStyle, weight: 0 }} />}
          {vertices.map((v, i) => (
            <CircleMarker
              key={`${v[0]}-${v[1]}`}
              center={v}
              radius={i === 0 ? 6 : 4}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#ff8a1f', fillOpacity: 1 }}
            />
          ))}
        </>
      )}
    </>
  )
}

/** Fits the map when the study area or AOI changes. */
export function ViewController({ bounds, version }: { bounds: L.LatLngBoundsExpression; version: string }) {
  const map = useMap()
  const first = useRef(true)
  useEffect(() => {
    map.flyToBounds(bounds, { padding: [40, 40], duration: first.current ? 0 : 0.8, maxZoom: 11 })
    first.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, map])
  return null
}
