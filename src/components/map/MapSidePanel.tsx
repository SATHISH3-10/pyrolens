import { useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Segmented } from '@/components/ui'
import { useTheme } from '@/context/ThemeContext'
import {
  AGE_BUCKETS,
  FRP_THRESHOLDS,
  type ConfidenceLevel,
  type MapFilters,
  type SatelliteKey,
} from '@/utils/mapFilters'
import { cn, fmtNum } from '@/lib'
import { BASEMAP_LABELS, type BasemapId } from './basemaps'
import { DENSITY_RAMP, frpColors, type DensityMode, type HotspotColorMode } from './deckLayers'

export interface LayerVisibility {
  hotspots: boolean
  clusters: boolean
  density: boolean
  outlines: boolean
}

interface MapSidePanelProps {
  basemap: BasemapId
  onBasemapChange: (b: BasemapId) => void
  satLabels: boolean
  onSatLabelsChange: (v: boolean) => void
  show: LayerVisibility
  onShowChange: (s: LayerVisibility) => void
  colorMode: HotspotColorMode
  onColorModeChange: (m: HotspotColorMode) => void
  densityMode: DensityMode
  onDensityModeChange: (m: DensityMode) => void
  densityOpacity: number
  onDensityOpacityChange: (v: number) => void
  filters: MapFilters
  onFiltersChange: (f: MapFilters) => void
  onResetFilters: () => void
  satellites: SatelliteKey[]
  matchCount: number
  windowCount: number
  ageReference: string
}

const sectionTitle = 'text-[11px] font-medium uppercase tracking-wider text-fg-faint'

function Toggle({ on, onClick, children, swatch }: { on: boolean; onClick: () => void; children: ReactNode; swatch?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors', on ? 'text-fg' : 'text-fg-muted hover:text-fg')}
    >
      <span className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', on ? 'bg-ember-500' : 'bg-ink-600')}>
        <span className={cn('absolute top-0.5 size-3 rounded-full bg-white shadow transition-all', on ? 'left-3.5' : 'left-0.5')} />
      </span>
      <span className="flex-1">{children}</span>
      {swatch}
    </button>
  )
}

export function MapSidePanel(p: MapSidePanelProps) {
  const [tab, setTab] = useState<'layers' | 'filters' | 'legend'>('layers')
  const { tokens } = useTheme()
  const frp = frpColors(tokens)
  const rgb = (c: readonly number[], a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`
  const setFilter = (patch: Partial<MapFilters>) => p.onFiltersChange({ ...p.filters, ...patch })
  const toggleSatellite = (s: SatelliteKey) => {
    const current = p.filters.satellites ?? p.satellites
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s]
    setFilter({ satellites: next.length === p.satellites.length ? null : next })
  }

  return (
    <div className="flex flex-col">
      <Segmented
        className="w-full"
        aria-label="Panel section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'layers', label: 'Layers' },
          { value: 'filters', label: 'Filters' },
          { value: 'legend', label: 'Legend' },
        ]}
      />

      {tab === 'layers' && (
        <div className="mt-3 space-y-4">
          <div>
            <div className={sectionTitle}>Basemap</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {(Object.keys(BASEMAP_LABELS) as BasemapId[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={p.basemap === b}
                  onClick={() => p.onBasemapChange(b)}
                  className={cn(
                    'rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                    p.basemap === b ? 'border-ember-500 bg-ember-500/10 text-fg' : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  {b === 'gibs' ? 'NASA GIBS on date' : BASEMAP_LABELS[b]}
                </button>
              ))}
            </div>
            {(p.basemap === 'satellite' || p.basemap === 'gibs') && (
              <div className="mt-1.5">
                <Toggle on={p.satLabels} onClick={() => p.onSatLabelsChange(!p.satLabels)}>
                  Labels &amp; boundaries
                </Toggle>
              </div>
            )}
          </div>

          <div>
            <div className={sectionTitle}>Layers</div>
            <div className="-mx-1 mt-1">
              <Toggle on={p.show.hotspots} onClick={() => p.onShowChange({ ...p.show, hotspots: !p.show.hotspots })}>
                Hotspots
              </Toggle>
              <Toggle
                on={p.show.clusters}
                onClick={() => p.onShowChange({ ...p.show, clusters: !p.show.clusters })}
                swatch={<span className="size-3 rounded-sm border" style={{ borderColor: 'var(--bai-high)', background: 'color-mix(in srgb, var(--bai-high) 25%, transparent)' }} />}
              >
                Fire clusters
              </Toggle>
              <Toggle
                on={p.show.density}
                onClick={() => p.onShowChange({ ...p.show, density: !p.show.density })}
                swatch={<span className="h-3 w-6 rounded-sm" style={{ background: `linear-gradient(90deg, ${DENSITY_RAMP.slice(1).map((c) => rgb(c)).join(',')})` }} />}
              >
                Density heatmap
              </Toggle>
              <Toggle on={p.show.outlines} onClick={() => p.onShowChange({ ...p.show, outlines: !p.show.outlines })}>
                Study area &amp; AOI outlines
              </Toggle>
            </div>
          </div>

          {p.show.hotspots && (
            <div>
              <div className={sectionTitle}>Hotspot colour</div>
              <Segmented
                className="mt-1.5 w-full"
                aria-label="Hotspot colour mode"
                value={p.colorMode}
                onChange={p.onColorModeChange}
                options={[
                  { value: 'age', label: 'Detection age' },
                  { value: 'frp', label: 'FRP intensity' },
                ]}
              />
            </div>
          )}

          {p.show.density && (
            <div>
              <div className={sectionTitle}>Density of</div>
              <Segmented
                className="mt-1.5 w-full"
                aria-label="Density mode"
                value={p.densityMode}
                onChange={p.onDensityModeChange}
                options={[
                  { value: 'count', label: 'Detections' },
                  { value: 'frp', label: 'Total FRP' },
                  { value: 'clusters', label: 'Clusters' },
                ]}
              />
              <label className="mt-2 block text-xs text-fg-muted">
                <span className="flex justify-between">
                  Opacity <span className="tabular text-fg">{Math.round(p.densityOpacity * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={p.densityOpacity}
                  onChange={(e) => p.onDensityOpacityChange(Number(e.target.value))}
                  className="mt-1 w-full"
                  aria-label="Density opacity"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {tab === 'filters' && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-fg-muted">
            <span className="font-semibold text-fg tabular">{fmtNum(p.matchCount)}</span> of {fmtNum(p.windowCount)} detections in the window
            match. Filters change only what is shown; the dataset and the BAI are unchanged.
          </p>
          <div>
            <div className={sectionTitle}>Satellites in this dataset</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {p.satellites.map((s) => {
                const on = (p.filters.satellites ?? p.satellites).includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSatellite(s)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      on ? 'border-line-strong bg-ink-700 text-fg' : 'border-line text-fg-faint line-through',
                    )}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <div className={sectionTitle}>Minimum confidence</div>
            <Segmented
              className="mt-1.5 w-full"
              aria-label="Minimum confidence"
              value={p.filters.minConfidence}
              onChange={(v) => setFilter({ minConfidence: v as ConfidenceLevel | 'ALL' })}
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'nominal', label: 'Nominal+' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>
          <label className="block text-xs text-fg-muted">
            <span className={cn(sectionTitle, 'flex justify-between normal-case tracking-normal')}>
              <span className="uppercase tracking-wider">Minimum FRP</span>
              <span className="text-[12px] font-semibold tabular text-fg">{p.filters.minFrp} MW</span>
            </span>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={p.filters.minFrp}
              onChange={(e) => setFilter({ minFrp: Number(e.target.value) })}
              className="mt-1.5 w-full"
              aria-label="Minimum fire radiative power in megawatts"
            />
          </label>
          <div>
            <div className={sectionTitle}>Overpass</div>
            <Segmented
              className="mt-1.5 w-full"
              aria-label="Day or night overpass"
              value={p.filters.daynight}
              onChange={(v) => setFilter({ daynight: v })}
              options={[
                { value: 'ALL', label: 'Day & night' },
                { value: 'D', label: 'Day' },
                { value: 'N', label: 'Night' },
              ]}
            />
          </div>
          <button
            type="button"
            onClick={p.onResetFilters}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-ink-700 px-3 py-1.5 text-xs font-medium text-fg hover:bg-ink-600"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" /> Reset filters
          </button>
        </div>
      )}

      {tab === 'legend' && (
        <div className="mt-3 space-y-4 text-xs text-fg-muted">
          {p.colorMode === 'age' ? (
            <div>
              <div className={sectionTitle}>Detection age</div>
              <p className="mt-1 text-[11px] text-fg-faint">Hours before {p.ageReference}</p>
              <ul className="mt-1.5 space-y-1">
                {AGE_BUCKETS.map((b) => (
                  <li key={b.label} className="flex items-center gap-2">
                    <span className="size-3 rounded-full ring-1 ring-black/20" style={{ background: rgb(b.color) }} />
                    {b.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <div className={sectionTitle}>FRP per pixel</div>
              <ul className="mt-1.5 space-y-1">
                {(
                  [
                    ['low', `Low < ${FRP_THRESHOLDS.moderate} MW`],
                    ['moderate', `Moderate ${FRP_THRESHOLDS.moderate}–${FRP_THRESHOLDS.high} MW`],
                    ['high', `High ${FRP_THRESHOLDS.high}–${FRP_THRESHOLDS.extreme} MW`],
                    ['extreme', `Extreme ≥ ${FRP_THRESHOLDS.extreme} MW`],
                  ] as const
                ).map(([k, label]) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ background: rgb(frp[k]) }} />
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-fg-faint">VIIRS pixels are smaller, so per-pixel FRP is lower than MODIS for the same fire.</p>
            </div>
          )}
          <div>
            <div className={sectionTitle}>Confidence</div>
            <ul className="mt-1.5 space-y-1">
              <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-fg" /> High: solid</li>
              <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-fg/50" /> Nominal: translucent</li>
              <li className="flex items-center gap-2"><span className="size-3 rounded-full border-[1.5px] border-fg" /> Low: hollow ring</li>
            </ul>
            <p className="mt-1 text-[11px] text-fg-faint">Dot size grows with FRP (clamped).</p>
          </div>
          <div>
            <div className={sectionTitle}>Areas</div>
            <ul className="mt-1.5 space-y-1">
              <li className="flex items-center gap-2"><span className="h-0 w-5 border-t-2 border-dashed" style={{ borderColor: 'var(--aoi-stroke)' }} /> Study area / AOI</li>
              <li className="flex items-center gap-2"><span className="size-3 rounded-sm border" style={{ borderColor: 'var(--bai-high)', background: 'color-mix(in srgb, var(--bai-high) 25%, transparent)' }} /> Fire cluster (~5 km, ±1 day)</li>
            </ul>
          </div>
          <p className="text-[11px] leading-relaxed text-fg-faint">
            A hotspot is a satellite-detected thermal anomaly, not necessarily a confirmed wildfire. No dot does not mean no fire: clouds, smoke and
            overpass timing hide fires.
          </p>
        </div>
      )}
    </div>
  )
}
