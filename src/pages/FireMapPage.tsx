import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { MapRef } from 'react-map-gl/maplibre'
import type { FeatureCollection } from 'geojson'
import {
  CloudOff,
  Download,
  Layers,
  Loader2,
  MousePointer2,
  PanelLeftClose,
  Pentagon,
  SatelliteDish,
  SearchX,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { useTheme } from '@/context/ThemeContext'
import { MapCanvas } from '@/components/map/MapCanvas'
import { MapSidePanel, type LayerVisibility } from '@/components/map/MapSidePanel'
import { PlaybackBar, type PlaybackSpeed } from '@/components/map/PlaybackBar'
import { ClusterPopup, HotspotPopup } from '@/components/map/MapPopups'
import { buildDeckLayers, type DensityMode, type HotspotColorMode } from '@/components/map/deckLayers'
import { resolveBasemap, type BasemapChoice, type BasemapId } from '@/components/map/basemaps'
import { selectGibsLayer } from '@/components/map/gibs'
import type { DrawTool } from '@/components/map/useAoiDrawing'
import { ACTIVITY_COLORS, inkOn } from '@/components/viz/activityScale'
import { CLASS_LABEL, clusterFireEvents } from '@/utils/burningActivity'
import {
  buildDayBuckets,
  DEFAULT_MAP_FILTERS,
  isDefaultFilters,
  matchesFilters,
  satellitesPresent,
  sliceWindow,
  timeWindow,
  WINDOW_LABELS,
  type ConfidenceLevel,
  type MapFilters,
  type SatelliteKey,
  type WindowMode,
} from '@/utils/mapFilters'
import { exportCustomAoiGeoJson } from '@/utils/exportUtils'
import type { FireEvent } from '@/types/activity'
import type { FireObservation } from '@/types/fire'
import { cn, fmtDate, fmtNum } from '@/lib'

type Selection = { kind: 'hotspot'; obs: FireObservation } | { kind: 'event'; event: FireEvent } | null

function useIsWide() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches
}

function EmptyOverlay({ icon: Icon, title, body, action }: { icon: typeof CloudOff; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-6">
      <div role="status" className="panel-float pointer-events-auto max-w-sm px-5 py-4 text-center">
        <Icon className="mx-auto size-6 text-fg-muted" aria-hidden="true" />
        <div className="mt-2 text-sm font-semibold text-fg">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{body}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

export default function FireMapPage() {
  const {
    analysis,
    area,
    filter,
    setFilter,
    areaObservations,
    customAoi,
    setCustomAoi,
    clearCustomAoi,
    selectedDate,
    setSelectedDate,
    setIsPlaying,
  } = useFireData()
  const { tokens, resolved } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const focusDate = (location.state as { focusDate?: string } | null)?.focusDate
  const mapRef = useRef<MapRef | null>(null)
  const wide = useIsWide()

  const [panelOpen, setPanelOpen] = useState(wide)
  const [basemapChoice, setBasemapChoice] = useState<BasemapChoice>('auto')
  const [satLabels, setSatLabels] = useState(true)
  const [show, setShow] = useState<LayerVisibility>({ hotspots: true, clusters: true, density: false, outlines: true })
  const [colorMode, setColorMode] = useState<HotspotColorMode>('age')
  const [densityMode, setDensityMode] = useState<DensityMode>('count')
  const [densityOpacity, setDensityOpacity] = useState(0.7)
  const [windowMode, setWindowMode] = useState<WindowMode>('day')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const [tool, setTool] = useState<DrawTool>('none')
  const [selection, setSelection] = useState<Selection>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [zoom, setZoom] = useState(area.zoom)
  const fileRef = useRef<HTMLInputElement>(null)

  // The basemap follows the theme unless the user explicitly picked Satellite or GIBS imagery.
  useEffect(() => {
    setBasemapChoice((c) => (c === 'dark' || c === 'light' ? 'auto' : c))
  }, [resolved])
  const basemap = resolveBasemap(basemapChoice, resolved)

  // Shared playback flag lets the calendar animate the playback day; always cleared on unmount.
  useEffect(() => setIsPlaying(playing), [playing, setIsPlaying])
  useEffect(() => () => setIsPlaying(false), [setIsPlaying])

  const mapFilters: MapFilters = {
    daynight: filter.daynight ?? 'ALL',
    minFrp: filter.minFrp ?? 0,
    minConfidence: filter.minConfidence === 'nominal' || filter.minConfidence === 'high' ? filter.minConfidence : 'ALL',
    satellites: (filter.satellites as SatelliteKey[] | null | undefined) ?? null,
  }
  const setMapFilters = (f: MapFilters) => {
    setPlaying(false)
    setFilter({ daynight: f.daynight, minFrp: f.minFrp, minConfidence: f.minConfidence as ConfidenceLevel | 'ALL', satellites: f.satellites })
  }

  // Default to the latest critical-period peak inside the range, so the map opens on something meaningful.
  const defaultDate = useMemo(() => {
    if (!analysis) return filter.endDate
    const p = [...analysis.criticalPeriods].reverse().find((c) => c.peakDate >= filter.startDate && c.peakDate <= filter.endDate)
    if (p) return p.peakDate
    let best = analysis.days[0]!
    for (const d of analysis.days) if (d.date >= filter.startDate && d.date <= filter.endDate && d.bai > best.bai) best = d
    return best.date
  }, [analysis, filter.startDate, filter.endDate])

  useEffect(() => {
    if (focusDate) {
      setSelectedDate(focusDate)
      setWindowMode('day')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDate])

  const date = selectedDate && analysis?.dayIndex.has(selectedDate) ? selectedDate : defaultDate
  const dateRef = useRef(date)
  dateRef.current = date

  // Playback: advance one day per tick at 1/3/7 days per second; cleaned up on pause and unmount.
  useEffect(() => {
    if (!playing || !analysis) return
    const t = window.setInterval(() => {
      const i = analysis.dayIndex.get(dateRef.current) ?? 0
      const next = analysis.days[i + 1]
      if (!next) setPlaying(false)
      else setSelectedDate(next.date)
    }, 1000 / speed)
    return () => window.clearInterval(t)
  }, [playing, speed, analysis, setSelectedDate])

  const win = useMemo(
    () => timeWindow(windowMode, date, { start: filter.startDate, end: filter.endDate }),
    [windowMode, date, filter.startDate, filter.endDate],
  )
  const buckets = useMemo(() => buildDayBuckets(areaObservations), [areaObservations])
  const satellites = useMemo(() => satellitesPresent(areaObservations), [areaObservations])
  const windowObs = useMemo(() => sliceWindow(buckets, win), [buckets, win])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => windowObs.filter((o) => matchesFilters(o, mapFilters)), [windowObs, mapFilters.daynight, mapFilters.minFrp, mapFilters.minConfidence, mapFilters.satellites])
  const needEvents = show.clusters || (show.density && densityMode === 'clusters')
  const events = useMemo(() => (needEvents ? clusterFireEvents(visible) : []), [visible, needEvents])

  // GIBS tiles follow the date, debounced during playback so tiles are not requested for every frame.
  const [gibsDate, setGibsDate] = useState(date)
  useEffect(() => {
    const t = window.setTimeout(() => setGibsDate(date), playing ? 800 : 0)
    return () => window.clearTimeout(t)
  }, [date, playing])
  const gibsSpec = selectGibsLayer(gibsDate)

  const onHotspotClick = useCallback((o: FireObservation) => setSelection({ kind: 'hotspot', obs: o }), [])
  const onEventClick = useCallback((e: FireEvent) => setSelection({ kind: 'event', event: e }), [])

  const layers = useMemo(
    () =>
      buildDeckLayers({
        hotspots: visible,
        events,
        show,
        colorMode,
        windowEndMs: win.endMs,
        densityMode,
        densityOpacity,
        tokens,
        selectedHotspotId: selection?.kind === 'hotspot' ? selection.obs.id : null,
        selectedEventId: selection?.kind === 'event' ? selection.event.id : null,
        onHotspotClick,
        onEventClick,
      }),
    [visible, events, show, colorMode, win.endMs, densityMode, densityOpacity, tokens, selection, onHotspotClick, onEventClick],
  )

  const outlines = useMemo<FeatureCollection>(() => {
    if (!show.outlines) return { type: 'FeatureCollection', features: [] }
    const b = area.bounds
    const features: FeatureCollection['features'] = []
    if (!customAoi) {
      features.push({
        type: 'Feature',
        properties: { kind: 'study' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[b.minLng, b.minLat], [b.maxLng, b.minLat], [b.maxLng, b.maxLat], [b.minLng, b.maxLat], [b.minLng, b.minLat]]],
        },
      })
    } else {
      const ring = customAoi.points.map(([lat, lng]) => [lng, lat])
      features.push({ type: 'Feature', properties: { kind: 'aoi' }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] } })
    }
    return { type: 'FeatureCollection', features }
  }, [show.outlines, area.bounds, customAoi])

  const frame = customAoi ? customAoi.bounds : area.bounds
  const bounds: [[number, number], [number, number]] = [
    [frame.minLng, frame.minLat],
    [frame.maxLng, frame.maxLat],
  ]

  const applyAoi = useCallback(
    (points: Array<[number, number]>, name: string) => {
      const lats = points.map((p) => p[0])
      const lngs = points.map((p) => p[1])
      setCustomAoi({
        name,
        points,
        bounds: { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) },
        createdAt: new Date().toISOString(),
      })
      setTool('none')
      setSelection(null)
    },
    [setCustomAoi],
  )

  const handleGeoJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const geom = parsed.type === 'FeatureCollection' ? parsed.features?.[0]?.geometry : parsed.type === 'Feature' ? parsed.geometry : parsed
        const ring: number[][] | undefined =
          geom?.type === 'Polygon' ? geom.coordinates[0] : geom?.type === 'MultiPolygon' ? geom.coordinates[0][0] : undefined
        if (!ring || ring.length < 4) throw new Error('No polygon')
        applyAoi(
          ring.slice(0, -1).map(([lng, lat]) => [lat!, lng!] as [number, number]),
          file.name.replace(/\.[^/.]+$/, ''),
        )
      } catch {
        window.alert('Could not read a Polygon from this GeoJSON file.')
      }
    }
    reader.readAsText(file)
  }

  const openDay = (d: string) => {
    setSelectedDate(d)
    navigate('/calendar')
  }
  const focusEvent = (e: FireEvent) => {
    const pts = e.hull.length ? e.hull : [e.centroid]
    const lats = pts.map((p) => p[0])
    const lngs = pts.map((p) => p[1])
    mapRef.current?.fitBounds(
      [
        [Math.min(...lngs) - 0.02, Math.min(...lats) - 0.02],
        [Math.max(...lngs) + 0.02, Math.max(...lats) + 0.02],
      ],
      { padding: 80, duration: 800, maxZoom: 13 },
    )
  }

  const dayRecord = analysis ? analysis.days[analysis.dayIndex.get(date) ?? -1] : undefined
  const noCoverage = windowMode === 'day' && (!dayRecord || dayRecord.source === 'none')
  const filteredOut = windowObs.length > 0 && visible.length === 0
  const ageReference =
    win.endMs < Date.parse(`${date}T00:00:00Z`) + 86_400_000
      ? `now (${new Date(win.endMs).toISOString().slice(11, 16)} UTC)`
      : `end of ${fmtDate(date)} (UTC)`

  return (
    <div className="absolute inset-0">
      <MapCanvas
        mapRef={mapRef}
        bounds={bounds}
        boundsKey={`${area.id}|${customAoi?.createdAt ?? ''}`}
        basemap={basemap}
        gibs={gibsSpec ? { spec: gibsSpec, date: gibsDate } : null}
        satLabels={satLabels}
        layers={layers}
        outlines={outlines}
        drawTool={tool}
        onDrawComplete={(pts, kind) => applyAoi(pts, kind === 'rectangle' ? 'Drawn rectangle' : `Drawn polygon (${pts.length} pts)`)}
        onDrawCancel={() => setTool('none')}
        onBackgroundClick={() => setSelection(null)}
        onZoomChange={setZoom}
        onLoad={() => setMapLoaded(true)}
      >
        {selection?.kind === 'hotspot' && (
          <HotspotPopup obs={selection.obs} windowEndMs={win.endMs} onClose={() => setSelection(null)} onOpenDay={openDay} />
        )}
        {selection?.kind === 'event' && (
          <ClusterPopup event={selection.event} onClose={() => setSelection(null)} onFocus={focusEvent} onOpenDay={openDay} />
        )}
      </MapCanvas>

      {/* ── Empty / loading states: an empty map must never look like "no fires" ── */}
      {!mapLoaded && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <div role="status" className="panel-float flex items-center gap-2 px-4 py-2 text-sm text-fg-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading map…
          </div>
        </div>
      )}
      {mapLoaded && !analysis && (
        <EmptyOverlay
          icon={SearchX}
          title={customAoi ? 'This AOI contains no data' : 'No detections in this area'}
          body="There are no hotspot records inside this boundary in the loaded dataset. That is not evidence of no fire: the data may not cover it."
          action={
            customAoi ? (
              <button type="button" onClick={clearCustomAoi} className="rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-ember-600">
                Clear AOI
              </button>
            ) : undefined
          }
        />
      )}
      {mapLoaded && analysis && noCoverage && (
        <EmptyOverlay
          icon={SatelliteDish}
          title="No satellite coverage for this date"
          body={`No satellite in the loaded record covers ${fmtDate(date)}, so activity is unknown — not zero.`}
        />
      )}
      {mapLoaded && analysis && !noCoverage && filteredOut && (
        <EmptyOverlay
          icon={SearchX}
          title="No detections match the current filters"
          body={`${fmtNum(windowObs.length)} detections exist in this window but are hidden by the filters.`}
          action={
            <button type="button" onClick={() => setMapFilters(DEFAULT_MAP_FILTERS)} className="rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-ember-600">
              Reset filters
            </button>
          }
        />
      )}

      {/* ── Left: layers / filters / legend ─────────────────────────────── */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-h-[calc(100%-9.5rem)] w-[19rem] max-w-[calc(100%-1.5rem)] flex-col gap-2">
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          aria-expanded={panelOpen}
          aria-controls="map-panel"
          className="panel-float pointer-events-auto inline-flex w-fit items-center gap-2 px-3 py-2 text-[13px] font-medium text-fg"
        >
          {panelOpen ? <PanelLeftClose className="size-4" aria-hidden="true" /> : <Layers className="size-4" aria-hidden="true" />}
          {panelOpen ? 'Hide panel' : 'Layers & filters'}
          {!isDefaultFilters(mapFilters) && <span className="rounded-full bg-ember-500 px-1.5 text-[10px] font-bold text-on-accent">filtered</span>}
        </button>
        {panelOpen && (
          <div id="map-panel" className="panel-float pointer-events-auto overflow-y-auto p-3">
            <MapSidePanel
              basemap={basemap}
              onBasemapChange={(b: BasemapId) => setBasemapChoice(b === resolved ? 'auto' : b)}
              satLabels={satLabels}
              onSatLabelsChange={setSatLabels}
              show={show}
              onShowChange={setShow}
              colorMode={colorMode}
              onColorModeChange={setColorMode}
              densityMode={densityMode}
              onDensityModeChange={setDensityMode}
              densityOpacity={densityOpacity}
              onDensityOpacityChange={setDensityOpacity}
              filters={mapFilters}
              onFiltersChange={setMapFilters}
              onResetFilters={() => setMapFilters(DEFAULT_MAP_FILTERS)}
              satellites={satellites}
              matchCount={visible.length}
              windowCount={windowObs.length}
              ageReference={ageReference}
            />
          </div>
        )}
      </div>

      {/* ── Top centre: AOI tools ─────────────────────────────────────── */}
      <div className="absolute left-1/2 top-3 z-10 hidden -translate-x-1/2 sm:block">
        <div className="panel-float flex items-center gap-0.5 p-1">
          {(
            [
              ['none', MousePointer2, 'Pan and select'],
              ['rectangle', Square, 'Draw rectangle area of interest'],
              ['polygon', Pentagon, 'Draw polygon area of interest'],
            ] as const
          ).map(([t, Icon, label]) => (
            <button
              key={t}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
              className={cn(
                'flex size-8 items-center justify-center rounded-lg transition-colors',
                tool === t ? 'bg-ember-500 text-on-accent' : 'text-fg-muted hover:bg-ink-700 hover:text-fg',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line-strong" />
          <button
            type="button"
            title="Import AOI from GeoJSON"
            aria-label="Import area of interest from GeoJSON"
            onClick={() => fileRef.current?.click()}
            className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-ink-700 hover:text-fg"
          >
            <Upload className="size-4" aria-hidden="true" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".geojson,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleGeoJson(f)
              e.target.value = ''
            }}
          />
          {customAoi && (
            <>
              <button
                type="button"
                title="Export AOI as GeoJSON"
                aria-label="Export area of interest as GeoJSON"
                onClick={() => exportCustomAoiGeoJson(customAoi)}
                className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-ink-700 hover:text-fg"
              >
                <Download className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Clear AOI"
                aria-label="Clear area of interest"
                onClick={clearCustomAoi}
                className="flex size-8 items-center justify-center rounded-lg text-red-300 hover:bg-red-500/15"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        {tool !== 'none' && (
          <div className="panel-float mt-2 flex items-center gap-2 px-3 py-2 text-xs text-fg-muted">
            {tool === 'rectangle'
              ? 'Drag on the map to draw a rectangle. Esc cancels.'
              : 'Click to add vertices; double-click, click the first point or press Enter to finish. Esc cancels.'}
            <button type="button" onClick={() => setTool('none')} aria-label="Cancel drawing" className="rounded p-0.5 hover:text-fg">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* ── Top right: status chip ─────────────────────────────────────── */}
      <div className="absolute right-3 top-16 z-10 max-w-[calc(100%-1.5rem)] sm:top-3">
        <div role="status" aria-live="polite" className="panel-float flex items-center gap-3 px-3 py-2">
          {dayRecord && (
            <span
              className="flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-bold tabular"
              style={{ background: ACTIVITY_COLORS[dayRecord.cls], color: inkOn(dayRecord.cls, resolved) }}
              title="Burning Activity Index for the selected day"
            >
              {dayRecord.source === 'none' ? '—' : dayRecord.bai.toFixed(0)}
            </span>
          )}
          <div className="min-w-0 text-xs">
            <div className="truncate font-semibold text-fg">
              {windowMode === 'day' ? fmtDate(date) : `${WINDOW_LABELS[windowMode]} · to ${fmtDate(win.endDate)}`}
            </div>
            <div className="truncate text-fg-muted">
              <span className="tabular text-fg">{fmtNum(visible.length)}</span> detections visible
              {dayRecord && dayRecord.source !== 'none' && <> · {dayRecord.cls === 'none' && dayRecord.quality === 'limited' ? 'Limited observation' : CLASS_LABEL[dayRecord.cls]}</>}
            </div>
          </div>
        </div>
        {analysis && !noCoverage && windowObs.length === 0 && (
          <div role="note" className="panel-float mt-2 flex max-w-xs items-start gap-2 px-3 py-2 text-[11px] leading-snug text-fg-muted">
            <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            No detections in this window. That is not proof of no fire: clouds, smoke or overpass timing can hide fires. Try “NASA GIBS on date” imagery.
          </div>
        )}
      </div>

      {/* ── Bottom: GIBS caption + playback ───────────────────────────── */}
      <div className="absolute inset-x-3 bottom-3 z-10 flex flex-col gap-2 md:right-14">
        {basemap === 'gibs' && (
          <div className="panel-float w-fit max-w-full px-3 py-1.5 text-[11px] leading-snug text-fg-muted">
            {gibsSpec ? (
              <>
                NASA GIBS imagery for <span className="font-semibold text-fg">{fmtDate(gibsDate)}</span> ({gibsSpec.label}). Clouds and smoke in this image can
                explain missing detections.
              </>
            ) : (
              <>No NASA GIBS true-colour imagery is available for {fmtDate(gibsDate)}.</>
            )}
            {zoom > 10 && (
              <button type="button" onClick={() => setBasemapChoice('satellite')} className="ml-2 font-semibold text-signal-400 hover:underline">
                Zoom in further with Satellite (Esri)
              </button>
            )}
          </div>
        )}
        {analysis && (
          <PlaybackBar
            analysis={analysis}
            date={date}
            onChange={setSelectedDate}
            playing={playing}
            onPlayingChange={setPlaying}
            speed={speed}
            onSpeedChange={setSpeed}
            windowMode={windowMode}
            onWindowModeChange={setWindowMode}
          />
        )}
      </div>
    </div>
  )
}
