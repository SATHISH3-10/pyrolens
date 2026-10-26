import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { MapContainer, Pane, Polygon, Rectangle, TileLayer, ZoomControl } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  Layers,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Pentagon,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { Segmented } from '@/components/ui'
import { BASEMAPS, type BasemapId } from '@/components/map/basemaps'
import {
  ClusterLayer,
  DensityLayer,
  DrawController,
  HotspotLayer,
  ViewController,
  type DrawTool,
} from '@/components/map/MapLayers'
import { TimelineScrubber } from '@/components/map/TimelineScrubber'
import { ACTIVITY_COLORS, SENSOR_COLORS, SOURCE_LABEL } from '@/components/viz/activityScale'
import { addDays, CLASS_LABEL, clusterFireEvents } from '@/utils/burningActivity'
import { sampleObservationsStratified } from '@/utils/aggregation'
import { exportCustomAoiGeoJson, exportObservationsGeoJson } from '@/utils/exportUtils'
import { exportFireEventsGeoJson } from '@/utils/exportActivity'
import type { FireEvent } from '@/types/activity'
import type { FireObservation } from '@/types/fire'
import { cn, fmtDate, fmtNum } from '@/lib'

type WindowMode = 'day' | 'week' | 'month' | 'range'
type Selection = { kind: 'hotspot'; obs: FireObservation } | { kind: 'event'; event: FireEvent } | null

const MAX_RENDERED_HOTSPOTS = 15000

function windowFor(mode: WindowMode, date: string, rangeStart: string, rangeEnd: string): [string, string] {
  if (mode === 'day') return [date, date]
  if (mode === 'week') return [addDays(date, -3), addDays(date, 3)]
  if (mode === 'month') return [addDays(date, -15), addDays(date, 14)]
  return [rangeStart, rangeEnd]
}

function Toggle({ on, onClick, children, swatch }: { on: boolean; onClick: () => void; children: ReactNode; swatch?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
        on ? 'text-fg' : 'text-fg-faint hover:text-fg-muted',
      )}
    >
      <span className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', on ? 'bg-ember-500' : 'bg-ink-600')}>
        <span className={cn('absolute top-0.5 size-3 rounded-full bg-white transition-all', on ? 'left-3.5' : 'left-0.5')} />
      </span>
      <span className="flex-1">{children}</span>
      {swatch}
    </button>
  )
}

export default function FireMapPage() {
  const {
    analysis,
    area,
    filter,
    areaObservations,
    customAoi,
    setCustomAoi,
    clearCustomAoi,
    selectedDate,
    setSelectedDate,
  } = useFireData()
  const location = useLocation()
  const focusDate = (location.state as { focusDate?: string } | null)?.focusDate

  const [mode, setMode] = useState<WindowMode>(focusDate ? 'day' : 'week')
  const [basemap, setBasemap] = useState<BasemapId>('dark')
  const [layers, setLayers] = useState({ hotspots: true, clusters: true, density: false, bounds: true })
  const [sensors, setSensors] = useState({ MODIS: true, VIIRS: true })
  const [tool, setTool] = useState<DrawTool>('none')
  const [selection, setSelection] = useState<Selection>(null)
  const [playing, setPlaying] = useState(false)
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches
  const [showControls, setShowControls] = useState(wide)
  const [showSummary, setShowSummary] = useState(wide)
  const fileRef = useRef<HTMLInputElement>(null)

  // Choose a meaningful default date: the latest critical period's peak inside the range.
  const defaultDate = useMemo(() => {
    if (!analysis) return filter.endDate
    const p = [...analysis.criticalPeriods].reverse().find((c) => c.peakDate >= filter.startDate && c.peakDate <= filter.endDate)
    if (p) return p.peakDate
    let best = analysis.days[0]!
    for (const d of analysis.days) if (d.date >= filter.startDate && d.date <= filter.endDate && d.bai > best.bai) best = d
    return best.date
  }, [analysis, filter.startDate, filter.endDate])

  useEffect(() => {
    if (focusDate) setSelectedDate(focusDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDate])

  const date = selectedDate && analysis?.dayIndex.has(selectedDate) ? selectedDate : defaultDate
  const [winStart, winEnd] = windowFor(mode, date, filter.startDate, filter.endDate)

  // Animate through time.
  useEffect(() => {
    if (!playing || !analysis) return
    const t = window.setInterval(() => {
      const next = addDays(date, mode === 'month' ? 7 : 1)
      if (next > analysis.lastDate) setPlaying(false)
      else setSelectedDate(next)
    }, 450)
    return () => window.clearInterval(t)
  }, [playing, date, mode, analysis, setSelectedDate])

  const windowObs = useMemo(
    () =>
      areaObservations.filter(
        (o) => o.acqDate >= winStart && o.acqDate <= winEnd && sensors[o.instrument as 'MODIS' | 'VIIRS'] !== false,
      ),
    [areaObservations, winStart, winEnd, sensors],
  )

  const rendered = useMemo(
    () =>
      layers.hotspots
        ? sampleObservationsStratified(windowObs, MAX_RENDERED_HOTSPOTS, selection?.kind === 'hotspot' ? selection.obs.id : null)
        : [],
    [windowObs, layers.hotspots, selection],
  )

  const events = useMemo(() => (layers.clusters || showSummary ? clusterFireEvents(windowObs) : []), [windowObs, layers.clusters, showSummary])

  const stats = useMemo(() => {
    let modis = 0
    let frp = 0
    let maxFrp = 0
    for (const o of windowObs) {
      if (o.instrument === 'MODIS') modis++
      if (o.frp !== null) {
        frp += o.frp
        if (o.frp > maxFrp) maxFrp = o.frp
      }
    }
    return { modis, viirs: windowObs.length - modis, frp, maxFrp }
  }, [windowObs])

  const windowDays = useMemo(() => {
    if (!analysis) return []
    return analysis.days.filter((d) => d.date >= winStart && d.date <= winEnd)
  }, [analysis, winStart, winEnd])
  const meanBai = windowDays.length ? windowDays.reduce((s, d) => s + d.bai, 0) / windowDays.length : 0
  const dayRecord = mode === 'day' ? windowDays[0] : undefined

  const viewBounds: LatLngBoundsExpression = customAoi
    ? [
        [customAoi.bounds.minLat, customAoi.bounds.minLng],
        [customAoi.bounds.maxLat, customAoi.bounds.maxLng],
      ]
    : [
        [area.bounds.minLat, area.bounds.minLng],
        [area.bounds.maxLat, area.bounds.maxLng],
      ]
  const viewVersion = `${area.id}|${customAoi?.createdAt ?? ''}`

  const applyAoi = (points: Array<[number, number]>, name: string) => {
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
  }

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

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-fg-muted">
        No detections in this area. Clear the custom AOI or choose another study area.
        {customAoi && (
          <button type="button" onClick={clearCustomAoi} className="ml-2 text-signal-400 underline">
            Clear AOI
          </button>
        )}
      </div>
    )
  }

  const stepDate = (delta: number) => {
    const step = mode === 'week' ? 7 : mode === 'month' ? 30 : 1
    const next = addDays(date, delta * step)
    if (next >= analysis.firstDate && next <= analysis.lastDate) setSelectedDate(next)
  }

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={area.center}
        zoom={area.zoom}
        zoomControl={false}
        preferCanvas
        worldCopyJump
        className="h-full w-full"
      >
        <TileLayer key={basemap} url={BASEMAPS[basemap].url} attribution={BASEMAPS[basemap].attribution} maxZoom={BASEMAPS[basemap].maxZoom} />
        {BASEMAPS[basemap].labels && (
          <Pane name="labels" style={{ zIndex: 450, pointerEvents: 'none' }}>
            <TileLayer key={`${basemap}-labels`} url={BASEMAPS[basemap].labels!} maxZoom={BASEMAPS[basemap].maxZoom} />
          </Pane>
        )}
        <ZoomControl position="bottomright" />
        <ViewController bounds={viewBounds} version={viewVersion} />
        {layers.bounds && !customAoi && (
          <Rectangle
            bounds={[
              [area.bounds.minLat, area.bounds.minLng],
              [area.bounds.maxLat, area.bounds.maxLng],
            ]}
            pathOptions={{ color: '#38bdf8', weight: 1.2, dashArray: '6 6', fill: false }}
            interactive={false}
          />
        )}
        {customAoi && (
          <Polygon
            positions={customAoi.points}
            pathOptions={{ color: '#38bdf8', weight: 2, dashArray: '6 5', fillColor: '#38bdf8', fillOpacity: 0.06 }}
            interactive={false}
          />
        )}
        {layers.density && <DensityLayer points={windowObs} />}
        {layers.clusters && (
          <ClusterLayer
            events={events.slice(0, 600)}
            selectedId={selection?.kind === 'event' ? selection.event.id : null}
            onSelect={(e) => {
              setSelection({ kind: 'event', event: e })
              setShowSummary(true)
            }}
          />
        )}
        {layers.hotspots && (
          <HotspotLayer
            points={rendered}
            selectedId={selection?.kind === 'hotspot' ? selection.obs.id : null}
            onSelect={(o) => {
              setSelection({ kind: 'hotspot', obs: o })
              setShowSummary(true)
            }}
          />
        )}
        <DrawController tool={tool} onComplete={(pts, kind) => applyAoi(pts, kind === 'rectangle' ? 'Drawn rectangle' : `Drawn polygon (${pts.length} pts)`)} />
      </MapContainer>

      {/* ── Left: time window + layers ─────────────────────────────── */}
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex max-h-[calc(100%-7.5rem)] w-[18.5rem] flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowControls((s) => !s)}
          className="panel-float pointer-events-auto inline-flex w-fit items-center gap-2 px-3 py-2 text-[13px] font-medium text-fg min-[900px]:hidden"
        >
          <Layers className="size-4 text-ember-400" /> {showControls ? 'Hide controls' : 'Map controls'}
        </button>
        <div className={cn('panel-float pointer-events-auto overflow-y-auto p-3', !showControls && 'hidden')}>
          <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Time window</div>
          <Segmented
            className="mt-2 w-full"
            aria-label="Time window"
            value={mode}
            onChange={(m) => {
              setMode(m)
              setPlaying(false)
            }}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: '7 days' },
              { value: 'month', label: '30 days' },
              { value: 'range', label: 'Range', title: 'Whole date range from the header' },
            ]}
          />
          {mode !== 'range' ? (
            <div className="mt-2 flex items-center gap-1">
              <button type="button" aria-label="Earlier" onClick={() => stepDate(-1)} className="rounded-md p-1.5 text-fg-muted hover:bg-ink-700 hover:text-fg">
                <ChevronLeft className="size-4" />
              </button>
              <input
                type="date"
                value={date}
                min={analysis.firstDate}
                max={analysis.lastDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="field flex-1 py-1 text-center text-xs"
                aria-label="Centre date"
              />
              <button type="button" aria-label="Later" onClick={() => stepDate(1)} className="rounded-md p-1.5 text-fg-muted hover:bg-ink-700 hover:text-fg">
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-fg-muted">
              {fmtDate(filter.startDate)} → {fmtDate(filter.endDate)}
            </p>
          )}

          <div className="mt-4 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Layers</div>
          <div className="mt-1 -mx-1">
            <Toggle on={layers.hotspots} onClick={() => setLayers((l) => ({ ...l, hotspots: !l.hotspots }))}>
              Raw hotspots
            </Toggle>
            <Toggle
              on={layers.clusters}
              onClick={() => setLayers((l) => ({ ...l, clusters: !l.clusters }))}
              swatch={<span className="size-3 rounded-sm border border-[#ffa94d] bg-[#f0862c]/30" />}
            >
              Fire clusters
            </Toggle>
            <Toggle
              on={layers.density}
              onClick={() => setLayers((l) => ({ ...l, density: !l.density }))}
              swatch={<span className="h-3 w-6 rounded-sm bg-gradient-to-r from-[#2f8f72] via-[#f0862c] to-[#a3123a]" />}
            >
              Density grid
            </Toggle>
            <Toggle on={layers.bounds} onClick={() => setLayers((l) => ({ ...l, bounds: !l.bounds }))}>
              Study-area outline
            </Toggle>
          </div>

          <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Sensors</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {(['MODIS', 'VIIRS'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sensors[s]}
                onClick={() => setSensors((v) => ({ ...v, [s]: !v[s] }))}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  sensors[s] ? 'border-line-strong bg-ink-700 text-fg' : 'border-line text-fg-faint',
                )}
              >
                <span className="size-2.5 rounded-full" style={{ background: SENSOR_COLORS[s], opacity: sensors[s] ? 1 : 0.3 }} />
                {s}
                <span className="ml-auto text-[10px] text-fg-faint">{s === 'MODIS' ? '1 km' : '375 m'}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Basemap</div>
          <Segmented
            className="mt-1.5 w-full"
            aria-label="Basemap"
            value={basemap}
            onChange={setBasemap}
            options={(Object.keys(BASEMAPS) as BasemapId[]).map((b) => ({ value: b, label: BASEMAPS[b].label }))}
          />
        </div>
      </div>

      {/* ── Top centre: AOI tools ─────────────────────────────────── */}
      <div className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2">
        <div className="panel-float flex items-center gap-0.5 p-1">
          {(
            [
              ['none', MousePointer2, 'Pan & select'],
              ['rectangle', Square, 'Draw rectangle AOI'],
              ['polygon', Pentagon, 'Draw polygon AOI'],
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
                tool === t ? 'bg-ember-500 text-ink-950' : 'text-fg-muted hover:bg-ink-700 hover:text-fg',
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line-strong" />
          <button
            type="button"
            title="Import AOI from GeoJSON"
            aria-label="Import AOI from GeoJSON"
            onClick={() => fileRef.current?.click()}
            className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-ink-700 hover:text-fg"
          >
            <Upload className="size-4" />
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
                title="Download AOI as GeoJSON"
                aria-label="Download AOI as GeoJSON"
                onClick={() => exportCustomAoiGeoJson(customAoi)}
                className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-ink-700 hover:text-fg"
              >
                <Download className="size-4" />
              </button>
              <button
                type="button"
                title="Clear AOI"
                aria-label="Clear AOI"
                onClick={clearCustomAoi}
                className="flex size-8 items-center justify-center rounded-lg text-red-300 hover:bg-red-500/15"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
        {tool !== 'none' && (
          <div className="panel-float mt-2 flex items-center gap-2 px-3 py-2 text-xs text-fg-muted">
            {tool === 'rectangle'
              ? 'Drag on the map to draw a rectangle.'
              : 'Click to add vertices; double-click or click the first point to finish.'}
            <button type="button" onClick={() => setTool('none')} aria-label="Cancel drawing" className="rounded p-0.5 hover:text-fg">
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Right: summary / inspection ─────────────────────────────── */}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex max-h-[calc(100%-7.5rem)] w-[19rem] flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setShowSummary((s) => !s)}
          className="panel-float pointer-events-auto inline-flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-fg"
          aria-expanded={showSummary}
        >
          {showSummary ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          {showSummary ? 'Hide panel' : 'Summary'}
        </button>
        {showSummary && (
          <div className="panel-float pointer-events-auto w-full overflow-y-auto p-4">
            {selection ? (
              <SelectionDetail selection={selection} onBack={() => setSelection(null)} />
            ) : (
              <>
                <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">
                  {mode === 'day' ? 'Selected day' : mode === 'range' ? 'Selected range' : `${mode === 'week' ? '7' : '30'}-day window`}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-fg">
                  {winStart === winEnd ? fmtDate(winStart) : `${fmtDate(winStart)} – ${fmtDate(winEnd)}`}
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-ink-800 p-3">
                  <div
                    className="flex size-11 items-center justify-center rounded-lg text-sm font-bold tabular"
                    style={{
                      background: dayRecord ? ACTIVITY_COLORS[dayRecord.cls] : '#262c36',
                      color: dayRecord && (dayRecord.cls === 'moderate' || dayRecord.cls === 'high') ? '#111' : '#fff',
                    }}
                  >
                    {(dayRecord ? dayRecord.bai : meanBai).toFixed(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-fg">
                      {dayRecord ? (dayRecord.cls === 'none' && dayRecord.quality === 'limited' ? 'Limited observation' : CLASS_LABEL[dayRecord.cls]) : 'Mean BAI'}
                    </div>
                    <div className="truncate text-[11px] text-fg-faint">
                      {dayRecord ? SOURCE_LABEL[dayRecord.source] : `${windowDays.filter((d) => d.harmonizedCount > 0).length} active days`}
                    </div>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                  <div>
                    <dt className="text-fg-faint">Detections</dt>
                    <dd className="text-base font-semibold text-fg tabular">{fmtNum(windowObs.length)}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-faint">Fire clusters</dt>
                    <dd className="text-base font-semibold text-fg tabular">{fmtNum(events.length)}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-faint">Total FRP</dt>
                    <dd className="text-base font-semibold text-fg tabular">{fmtNum(stats.frp)} MW</dd>
                  </div>
                  <div>
                    <dt className="text-fg-faint">Max FRP</dt>
                    <dd className="text-base font-semibold text-fg tabular">{fmtNum(stats.maxFrp)} MW</dd>
                  </div>
                </dl>
                {windowObs.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span style={{ color: SENSOR_COLORS.MODIS }}>MODIS {fmtNum(stats.modis)}</span>
                      <span style={{ color: SENSOR_COLORS.VIIRS }}>VIIRS {fmtNum(stats.viirs)}</span>
                    </div>
                    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                      <div style={{ flex: stats.modis, background: SENSOR_COLORS.MODIS }} />
                      <div style={{ flex: stats.viirs, background: SENSOR_COLORS.VIIRS }} />
                    </div>
                  </div>
                )}
                {rendered.length < windowObs.length && layers.hotspots && (
                  <p className="mt-2 text-[11px] text-fg-faint">
                    Showing an even sample of {fmtNum(rendered.length)} points; statistics use all {fmtNum(windowObs.length)}.
                  </p>
                )}

                {events.length > 0 && (
                  <>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Largest fire clusters</span>
                      <button
                        type="button"
                        onClick={() => exportFireEventsGeoJson(events)}
                        className="text-[11px] text-signal-400 hover:underline"
                      >
                        GeoJSON
                      </button>
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {events.slice(0, 5).map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => setSelection({ kind: 'event', event: e })}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ink-700"
                          >
                            <Flame className="size-3.5 shrink-0 text-orange-400" />
                            <span className="min-w-0 flex-1 truncate text-xs text-fg">
                              {e.count} det. · {e.durationDays}d
                            </span>
                            <span className="text-[11px] tabular text-fg-muted">{fmtNum(e.totalFrp)} MW</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => exportObservationsGeoJson(windowObs, `pyrolens_hotspots_${winStart}_${winEnd}.geojson`)}
                  disabled={windowObs.length === 0}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-ink-700 px-3 py-1.5 text-xs font-medium text-fg hover:bg-ink-600 disabled:opacity-40"
                >
                  <Download className="size-3.5" /> Hotspots in window (GeoJSON)
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom: legend + timeline ─────────────────────────────── */}
      <div className="absolute inset-x-3 bottom-3 z-[1000] flex flex-col gap-2 md:right-14">
        <div className="panel-float hidden w-fit items-center gap-3 px-3 py-1.5 text-[11px] text-fg-muted sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: SENSOR_COLORS.MODIS }} /> MODIS hotspot
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: SENSOR_COLORS.VIIRS }} /> VIIRS hotspot
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-[#ffa94d] bg-[#f0862c]/30" /> Fire cluster
          </span>
          <span className="text-fg-faint">Larger dots = higher FRP</span>
        </div>
        <TimelineScrubber
          analysis={analysis}
          date={date}
          windowStart={winStart}
          windowEnd={winEnd}
          onChange={(d) => {
            setSelectedDate(d)
            if (mode === 'range') setMode('week')
          }}
          playing={playing}
          onTogglePlay={() => {
            if (mode === 'range') setMode('day')
            setPlaying((p) => !p)
          }}
        />
      </div>
    </div>
  )
}

function SelectionDetail({ selection, onBack }: { selection: NonNullable<Selection>; onBack: () => void }) {
  const rows: Array<[string, ReactNode]> =
    selection.kind === 'hotspot'
      ? [
          ['Sensor', `${selection.obs.instrument} · ${selection.obs.instrument === 'MODIS' ? '1 km' : '375 m'}`],
          ['Satellite', `${selection.obs.satellite} (${selection.obs.daynight === 'D' ? 'day' : 'night'} pass)`],
          ['Acquired', `${fmtDate(selection.obs.acqDate)} · ${selection.obs.acqTime.slice(0, 2)}:${selection.obs.acqTime.slice(2)} UTC`],
          ['Location', `${selection.obs.latitude.toFixed(4)}, ${selection.obs.longitude.toFixed(4)}`],
          ['FRP', selection.obs.frp !== null ? `${selection.obs.frp} MW` : 'n/a'],
          ['Confidence', `${String(selection.obs.confidence)}${typeof selection.obs.confidence === 'number' ? '%' : ''}`],
          ['Brightness', selection.obs.brightness !== undefined ? `${selection.obs.brightness} K` : 'n/a'],
          ['Pixel size', selection.obs.scan !== undefined ? `${selection.obs.scan} × ${selection.obs.track} km` : 'n/a'],
        ]
      : [
          ['Active', `${fmtDate(selection.event.start)} → ${fmtDate(selection.event.end)}`],
          ['Duration', `${selection.event.durationDays} day${selection.event.durationDays > 1 ? 's' : ''}`],
          ['Detections', `${selection.event.count} (${selection.event.modisCount} MODIS · ${selection.event.viirsCount} VIIRS)`],
          ['Total FRP', `${fmtNum(selection.event.totalFrp)} MW`],
          ['Max FRP', selection.event.maxFrp !== null ? `${selection.event.maxFrp} MW` : 'n/a'],
          ['Hull area', `${selection.event.areaKm2.toFixed(1)} km²`],
          ['Centroid', `${selection.event.centroid[0].toFixed(3)}, ${selection.event.centroid[1].toFixed(3)}`],
          ['Satellites', selection.event.satellites.join(', ')],
        ]
  return (
    <div>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Back to summary
      </button>
      <div className="mt-2 flex items-center gap-2">
        {selection.kind === 'hotspot' ? (
          <span className="size-3 rounded-full" style={{ background: SENSOR_COLORS[selection.obs.instrument as 'MODIS' | 'VIIRS'] }} />
        ) : (
          <Flame className="size-4 text-orange-400" />
        )}
        <h3 className="text-sm font-semibold text-fg">{selection.kind === 'hotspot' ? 'Hotspot detection' : 'Fire cluster'}</h3>
      </div>
      <dl className="mt-3 space-y-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-fg-faint">{k}</dt>
            <dd className="text-right font-medium text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-fg-faint">
        {selection.kind === 'hotspot'
          ? 'A hotspot is a pixel with a thermal anomaly during an overpass. It can be a wildfire, crop or prescribed burn, or industrial heat.'
          : 'Clusters group detections whose ~5 km cells touch within one day of each other, so one fire is not counted as many.'}
      </p>
    </div>
  )
}
