import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MapLayerMouseEvent, MapRef } from 'react-map-gl/maplibre'
import type { FeatureCollection } from 'geojson'

export type DrawTool = 'none' | 'rectangle' | 'polygon'

/**
 * Small custom AOI drawing for MapLibre: drag a rectangle, or click polygon vertices and finish with a
 * double-click, by clicking the first vertex, or with Enter. Escape cancels. Keeps the existing
 * CustomAoi shape ([lat, lng] vertices).
 */
export function useAoiDrawing(
  tool: DrawTool,
  mapRef: React.RefObject<MapRef | null>,
  onComplete: (points: Array<[number, number]>, kind: 'rectangle' | 'polygon') => void,
  onCancel: () => void,
) {
  const [rectStart, setRectStart] = useState<[number, number] | null>(null)
  const [rectEnd, setRectEnd] = useState<[number, number] | null>(null)
  const [vertices, setVertices] = useState<Array<[number, number]>>([]) // [lng, lat]
  const [cursor, setCursor] = useState<[number, number] | null>(null)

  useEffect(() => {
    setRectStart(null)
    setRectEnd(null)
    setVertices([])
    setCursor(null)
  }, [tool])

  const finishPolygon = useCallback(
    (pts: Array<[number, number]>) => {
      if (pts.length >= 3) onComplete(pts.map(([lng, lat]) => [lat, lng]), 'polygon')
      setVertices([])
    },
    [onComplete],
  )

  useEffect(() => {
    if (tool === 'none') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && tool === 'polygon') finishPolygon(vertices)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tool, vertices, finishPolygon, onCancel])

  const handlers = {
    onMouseDown: (e: MapLayerMouseEvent) => {
      if (tool !== 'rectangle') return
      const p: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      setRectStart(p)
      setRectEnd(p)
    },
    onMouseMove: (e: MapLayerMouseEvent) => {
      if (tool === 'rectangle' && rectStart) setRectEnd([e.lngLat.lng, e.lngLat.lat])
      if (tool === 'polygon') setCursor([e.lngLat.lng, e.lngLat.lat])
    },
    onMouseUp: () => {
      if (tool !== 'rectangle' || !rectStart || !rectEnd) return
      const [w, ea] = [Math.min(rectStart[0], rectEnd[0]), Math.max(rectStart[0], rectEnd[0])]
      const [s, n] = [Math.min(rectStart[1], rectEnd[1]), Math.max(rectStart[1], rectEnd[1])]
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
    },
    onClick: (e: MapLayerMouseEvent) => {
      if (tool !== 'polygon') return
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      const map = mapRef.current
      if (vertices.length >= 3 && map) {
        const first = map.project(vertices[0]!)
        const here = map.project(pt)
        if (Math.hypot(first.x - here.x, first.y - here.y) < 12) {
          finishPolygon(vertices)
          return
        }
      }
      setVertices((v) => [...v, pt])
    },
    onDblClick: (e: MapLayerMouseEvent) => {
      if (tool !== 'polygon') return
      e.preventDefault()
      finishPolygon(vertices)
    },
  }

  const preview = useMemo<FeatureCollection>(() => {
    const features: FeatureCollection['features'] = []
    if (rectStart && rectEnd) {
      const [x1, y1] = rectStart
      const [x2, y2] = rectEnd
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]] },
      })
    }
    if (vertices.length > 0) {
      const line = cursor ? [...vertices, cursor] : vertices
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } })
      vertices.forEach((v, i) =>
        features.push({ type: 'Feature', properties: { first: i === 0 }, geometry: { type: 'Point', coordinates: v } }),
      )
    }
    return { type: 'FeatureCollection', features }
  }, [rectStart, rectEnd, vertices, cursor])

  return { handlers, preview, drawing: tool !== 'none', vertexCount: vertices.length }
}
