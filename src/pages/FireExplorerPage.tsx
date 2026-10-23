import { useEffect, useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
} from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import {
  Crosshair,
  Flame,
  MapPin,
  Maximize2,
  RotateCcw,
  Satellite,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { FilterBar } from '@/components/shared/FilterBar'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { REGIONS, REGIONAL_BOUNDS_DISCLAIMER } from '@/data/regions'

// Center coordinate for India
const INDIA_CENTER: [number, number] = [17.5, 78.5]
const DEFAULT_ZOOM = 5

// Helper component to programmatically pan/zoom map
function MapViewController({
  bounds,
  resetTrigger,
}: {
  bounds: LatLngBoundsExpression | null
  resetTrigger: number
}) {
  const map = useMap()

  useEffect(() => {
    if (resetTrigger > 0) {
      map.setView(INDIA_CENTER, DEFAULT_ZOOM, { animate: true })
    }
  }, [resetTrigger, map])

  useEffect(() => {
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12, animate: true })
      } catch {
        // Fallback if bounds invalid
      }
    }
  }, [bounds, map])

  return null
}

export default function FireExplorerPage() {
  const {
    filteredObservations,
    summaryMetrics,
    selectedObservation,
    selectedObservationId,
    setSelectedObservationId,
    filter,
    metadata,
  } = useFireData()

  const [resetTrigger, setResetTrigger] = useState(0)
  const [fitBounds, setFitBounds] = useState<LatLngBoundsExpression | null>(null)
  const [showRegionBounds, setShowRegionBounds] = useState(true)
  const [darkBasemap, setDarkBasemap] = useState(true)

  // Active region bounding box
  const activeRegionDef = useMemo(() => {
    if (filter.regionId === 'all') return null
    return REGIONS.find((r) => r.id === filter.regionId)
  }, [filter.regionId])

  // Compute bounding box of filtered observations
  const handleFitToFiltered = () => {
    if (filteredObservations.length === 0) return

    let minLat = 90
    let maxLat = -90
    let minLng = 180
    let maxLng = -180

    for (const obs of filteredObservations) {
      if (obs.latitude < minLat) minLat = obs.latitude
      if (obs.latitude > maxLat) maxLat = obs.latitude
      if (obs.longitude < minLng) minLng = obs.longitude
      if (obs.longitude > maxLng) maxLng = obs.longitude
    }

    setFitBounds([
      [minLat, minLng],
      [maxLat, maxLng],
    ])
  }

  const handleResetView = () => {
    setFitBounds(null)
    setResetTrigger((t) => t + 1)
  }

  // Cap markers rendered on map for smooth 60fps performance if thousands exist
  const mapObservations = useMemo(() => {
    if (filteredObservations.length <= 1500) return filteredObservations
    // If over 1500, take a representative subsample + always include selected
    const sample = filteredObservations.slice(0, 1500)
    if (
      selectedObservation &&
      !sample.some((o) => o.id === selectedObservation.id)
    ) {
      sample.push(selectedObservation)
    }
    return sample
  }, [filteredObservations, selectedObservation])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Interactive Fire Explorer"
        description="Geographic map visualization of NASA MODIS and VIIRS active-fire hotspot detections across India."
        meta={
          <Badge tone="ember" dot>
            OpenStreetMap Engine
          </Badge>
        }
      />

      {/* Shared Filter Bar */}
      <FilterBar />

      {/* Map Control Bar & Metrics Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-ink-900/90 px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-fg">
              {filteredObservations.length.toLocaleString()}
            </span>
            <span className="text-fg-muted">Hotspots</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#ff8a1f]" aria-hidden="true" />
            <span className="text-fg-muted">MODIS:</span>
            <span className="font-semibold text-ember-400">
              {summaryMetrics.modisCount.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#38bdf8]" aria-hidden="true" />
            <span className="text-fg-muted">VIIRS:</span>
            <span className="font-semibold text-signal-400">
              {summaryMetrics.viirsCount.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-fg-muted">Avg FRP:</span>
            <span className="font-semibold text-fg">
              {summaryMetrics.avgFrp !== null ? `${summaryMetrics.avgFrp} MW` : 'N/A'}
            </span>
          </div>
        </div>

        {/* Map action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRegionBounds((s) => !s)}
            className={`rounded-lg border px-2.5 py-1 font-medium transition-colors ${
              showRegionBounds
                ? 'border-signal-400/50 bg-signal-400/10 text-signal-300'
                : 'border-line bg-ink-800 text-fg-muted hover:bg-ink-700'
            }`}
            title="Toggle simplified regional boundary rectangle"
          >
            Bounds
          </button>

          <button
            type="button"
            onClick={() => setDarkBasemap((d) => !d)}
            className="rounded-lg border border-line bg-ink-800 px-2.5 py-1 text-fg-muted hover:bg-ink-700 hover:text-fg transition-colors"
            title="Toggle Dark Map Filter"
          >
            {darkBasemap ? 'Dark Tiles' : 'Light Tiles'}
          </button>

          <button
            type="button"
            onClick={handleFitToFiltered}
            disabled={filteredObservations.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-ink-800 px-2.5 py-1 font-medium text-fg hover:border-ember-500/50 hover:bg-ink-700 disabled:opacity-40 transition-colors"
            title="Fit map view to filtered observations"
          >
            <Maximize2 className="size-3 text-ember-400" />
            <span>Fit Hotspots</span>
          </button>

          <button
            type="button"
            onClick={handleResetView}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-ink-800 px-2.5 py-1 font-medium text-fg-muted hover:bg-ink-700 hover:text-fg transition-colors"
            title="Reset map view to India center"
          >
            <RotateCcw className="size-3 text-signal-400" />
            <span>Reset View</span>
          </button>
        </div>
      </div>

      {/* Main Explorer Two-Column Grid: Map + Details Panel */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Map Container (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-2">
          <div className="relative h-[550px] w-full overflow-hidden rounded-xl border border-line bg-ink-950 shadow-panel">
            {filteredObservations.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6">
                <EmptyState
                  icon={Flame}
                  title="No observations on map"
                  description="No hotspot observations matched the current filter criteria. Try adjusting dates or selecting 'All India'."
                />
              </div>
            ) : (
              <MapContainer
                center={INDIA_CENTER}
                zoom={DEFAULT_ZOOM}
                scrollWheelZoom={true}
                className={`h-full w-full ${darkBasemap ? 'leaflet-dark-mode' : ''}`}
                style={{ height: '100%', width: '100%', background: '#0a0b0d' }}
              >
                <MapViewController bounds={fitBounds} resetTrigger={resetTrigger} />

                {/* OpenStreetMap Tile Layer with mandatory attribution */}
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
                  maxZoom={18}
                />

                {/* Optional Region Envelope Boundary */}
                {showRegionBounds && activeRegionDef && (
                  <Rectangle
                    bounds={[
                      [activeRegionDef.bounds.minLat, activeRegionDef.bounds.minLng],
                      [activeRegionDef.bounds.maxLat, activeRegionDef.bounds.maxLng],
                    ]}
                    pathOptions={{
                      color: '#0ea5e9',
                      weight: 1.5,
                      dashArray: '4, 4',
                      fillColor: '#0ea5e9',
                      fillOpacity: 0.05,
                    }}
                  />
                )}

                {/* Hotspot Markers */}
                {mapObservations.map((obs) => {
                  const isModis = obs.instrument === 'MODIS'
                  const isSelected = obs.id === selectedObservationId

                  // Marker size based on FRP (if available)
                  let radius = isModis ? 6 : 5
                  if (obs.frp && obs.frp > 40) radius += 3
                  else if (obs.frp && obs.frp > 20) radius += 1.5

                  if (isSelected) radius += 3

                  const color = isSelected
                    ? '#ffffff'
                    : isModis
                      ? '#ff8a1f' // Ember orange
                      : '#0ea5e9' // Signal cyan

                  const fillColor = isModis ? '#ff8a1f' : '#38bdf8'

                  return (
                    <CircleMarker
                      key={obs.id}
                      center={[obs.latitude, obs.longitude]}
                      radius={radius}
                      pathOptions={{
                        color,
                        weight: isSelected ? 3 : 1,
                        fillColor,
                        fillOpacity: isSelected ? 1 : 0.75,
                      }}
                      eventHandlers={{
                        click: () => {
                          setSelectedObservationId(obs.id)
                        },
                      }}
                    >
                      <Popup className="pyrolens-popup">
                        <div className="p-1 text-xs">
                          <div className="flex items-center justify-between gap-2 border-b border-line pb-1 mb-1.5">
                            <span className="font-mono font-bold text-fg">{obs.id}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                isModis
                                  ? 'bg-ember-500/20 text-ember-300'
                                  : 'bg-signal-400/20 text-signal-300'
                              }`}
                            >
                              {obs.instrument} (
                              {isModis ? '1 km' : '375 m'})
                            </span>
                          </div>

                          <div className="space-y-1 text-fg-muted">
                            <p>
                              <strong>Satellite:</strong> {obs.satellite} ({obs.daynight === 'D' ? 'Day' : 'Night'})
                            </p>
                            <p>
                              <strong>Date/Time:</strong> {obs.acqDate} {obs.acqTime} UTC
                            </p>
                            <p>
                              <strong>Coordinates:</strong> {obs.latitude.toFixed(4)}°, {obs.longitude.toFixed(4)}°
                            </p>
                            <p>
                              <strong>Confidence:</strong> {String(obs.confidence)}
                              {typeof obs.confidence === 'number' ? '%' : ''}
                            </p>
                            <p>
                              <strong>FRP:</strong>{' '}
                              {obs.frp !== null ? `${obs.frp} MW` : 'Not available'}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedObservationId(obs.id)}
                            className="mt-2 w-full rounded bg-ink-700 py-1 text-center text-[11px] font-medium text-fg hover:bg-ink-600 transition-colors"
                          >
                            Inspect in Side Panel
                          </button>
                        </div>
                      </Popup>
                    </CircleMarker>
                  )
                })}
              </MapContainer>
            )}

            {/* Map Legend Floating Overlay */}
            <div
              role="note"
              aria-label="Map sensor legend"
              className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-line-strong bg-ink-900/90 p-2.5 text-[11px] shadow-lg backdrop-blur space-y-1.5"
            >
              <div className="font-semibold text-fg text-xs pb-1 border-b border-line/60">
                Hotspot Legend
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-[#ff8a1f] ring-1 ring-white/20" />
                <span className="text-fg">MODIS (1 km)</span>
                <span className="text-fg-faint text-[10px] ml-auto">Terra/Aqua</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-[#38bdf8] ring-1 ring-white/20" />
                <span className="text-fg">VIIRS (375 m)</span>
                <span className="text-fg-faint text-[10px] ml-auto">SNPP/NOAA</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-line/40 text-fg-faint text-[10px]">
                <span className="size-3 rounded-full border border-white" />
                <span>Selected Hotspot</span>
              </div>
            </div>
          </div>

          {/* Regional Bounding Box Disclaimer */}
          <p className="text-[11px] text-fg-faint leading-relaxed">
            <strong className="text-fg-muted">Boundary Notice:</strong> {REGIONAL_BOUNDS_DISCLAIMER}
          </p>
        </div>

        {/* Selected Observation Details Panel (4 cols) */}
        <div className="lg:col-span-4">
          <Card aria-labelledby="observation-details-title" className="sticky top-4">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Crosshair className="size-4 text-ember-400" aria-hidden="true" />
                <h3 id="observation-details-title" className="text-sm font-semibold text-fg">
                  Observation Details
                </h3>
              </div>
              {selectedObservation && (
                <button
                  type="button"
                  onClick={() => setSelectedObservationId(null)}
                  className="text-xs text-fg-muted hover:text-fg"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {selectedObservation ? (
              <div className="space-y-4 text-xs">
                {/* ID & Sensor Heading */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-fg-faint">Hotspot ID</span>
                    <p className="font-mono text-base font-bold text-fg">
                      {selectedObservation.id}
                    </p>
                  </div>
                  <Badge
                    tone={selectedObservation.instrument === 'MODIS' ? 'ember' : 'signal'}
                    dot
                  >
                    {selectedObservation.instrument}
                  </Badge>
                </div>

                {/* Spatial Coordinates */}
                <div className="rounded-lg border border-line bg-ink-950 p-3">
                  <div className="flex items-center gap-1.5 text-fg-muted mb-1">
                    <MapPin className="size-3 text-signal-400" />
                    <span className="font-semibold text-fg">Geographic Location</span>
                  </div>
                  <p className="font-mono text-fg text-sm">
                    {selectedObservation.latitude.toFixed(4)}° N, {selectedObservation.longitude.toFixed(4)}° E
                  </p>
                  <p className="text-fg-faint text-[11px] mt-0.5">
                    Assigned Region: <strong className="text-fg-muted">{selectedObservation.regionName}</strong>
                  </p>
                </div>

                {/* Satellite & Product Details */}
                <div className="grid grid-cols-2 gap-2 text-fg-muted">
                  <div className="rounded-lg border border-line bg-ink-950 p-2.5">
                    <span className="text-[11px] text-fg-faint block">Satellite Platform</span>
                    <span className="font-medium text-fg">{selectedObservation.satellite}</span>
                  </div>

                  <div className="rounded-lg border border-line bg-ink-950 p-2.5">
                    <span className="text-[11px] text-fg-faint block">Pass Timing</span>
                    <span className="font-medium text-fg">
                      {selectedObservation.daynight === 'D' ? 'Daytime (Noon)' : 'Nighttime'}
                    </span>
                  </div>
                </div>

                {/* Acquisition Date & Time */}
                <div className="rounded-lg border border-line bg-ink-950 p-2.5">
                  <span className="text-[11px] text-fg-faint block">Acquisition Timestamp</span>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-medium text-fg">{selectedObservation.acqDate}</span>
                    <span className="font-mono text-fg-muted">
                      {selectedObservation.acqTime.slice(0, 2)}:{selectedObservation.acqTime.slice(2)} UTC
                    </span>
                  </div>
                </div>

                {/* Radiative Power & Confidence */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-line bg-ink-950 p-2.5">
                    <span className="text-[11px] text-fg-faint block">Fire Radiative Power</span>
                    <span className="text-base font-bold text-ember-400">
                      {selectedObservation.frp !== null
                        ? `${selectedObservation.frp} MW`
                        : 'Not available'}
                    </span>
                    <span className="text-[10px] text-fg-faint block mt-0.5">
                      Rate of radiant energy
                    </span>
                  </div>

                  <div className="rounded-lg border border-line bg-ink-950 p-2.5">
                    <span className="text-[11px] text-fg-faint block">Detection Confidence</span>
                    <span className="text-base font-bold text-signal-300">
                      {String(selectedObservation.confidence)}
                      {typeof selectedObservation.confidence === 'number' ? '%' : ''}
                    </span>
                    <span className="text-[10px] text-fg-faint block mt-0.5">
                      Quality score
                    </span>
                  </div>
                </div>

                {/* Sensor Resolution & Technical Specs */}
                <div className="rounded-lg border border-line bg-ink-950 p-3 space-y-1.5 text-[11px]">
                  <div className="font-semibold text-fg flex items-center gap-1.5">
                    <Satellite className="size-3 text-ember-400" />
                    <span>Instrument Specifications</span>
                  </div>
                  <div className="flex justify-between text-fg-muted">
                    <span>Nominal Spatial Resolution:</span>
                    <strong className="text-fg">
                      {selectedObservation.instrument === 'MODIS' ? '1,000 m (1 km)' : '375 m'}
                    </strong>
                  </div>
                  {selectedObservation.brightness !== undefined && (
                    <div className="flex justify-between text-fg-muted">
                      <span>4 µm Brightness Temp:</span>
                      <strong className="text-fg">{selectedObservation.brightness} K</strong>
                    </div>
                  )}
                  {selectedObservation.brightT31 !== undefined && (
                    <div className="flex justify-between text-fg-muted">
                      <span>11/12 µm Brightness Temp:</span>
                      <strong className="text-fg">{selectedObservation.brightT31} K</strong>
                    </div>
                  )}
                  {selectedObservation.scan !== undefined && (
                    <div className="flex justify-between text-fg-muted">
                      <span>Pixel Scan / Track:</span>
                      <strong className="text-fg font-mono">
                        {selectedObservation.scan} × {selectedObservation.track} km
                      </strong>
                    </div>
                  )}
                </div>

                {/* Provenance Badge */}
                <div className="rounded-lg border border-ember-500/30 bg-ember-500/10 p-2.5 text-[11px] text-ember-300 flex items-start gap-2">
                  <ShieldAlert className="size-3.5 shrink-0 mt-0.5 text-ember-400" />
                  <div>
                    <strong className="block font-semibold">
                      {metadata.isSynthetic
                        ? 'DEMO DATA — NOT OFFICIAL NASA OBSERVATIONS'
                        : `Imported from ${metadata.title}`}
                    </strong>
                    <span>
                      Satellite thermal anomalies do not equate to unique wildfires or burned area.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-fg-muted space-y-3">
                <MapPin className="mx-auto size-8 text-fg-faint" />
                <div>
                  <p className="text-xs font-semibold text-fg">No Hotspot Selected</p>
                  <p className="mt-1 text-[11px] text-fg-faint max-w-xs mx-auto">
                    Click any marker on the map to inspect its spatial coordinates, detection confidence, and Fire Radiative Power (FRP).
                  </p>
                </div>
                {mapObservations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedObservationId(mapObservations[0]!.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-ink-800 px-3 py-1.5 text-xs font-medium text-fg hover:bg-ink-700"
                  >
                    <Zap className="size-3 text-ember-400" />
                    <span>Select First Hotspot</span>
                  </button>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
