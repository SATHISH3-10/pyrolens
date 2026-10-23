import { ChangeEvent } from 'react'
import {
  Calendar,
  Filter,
  Grid,
  Layers,
  MapPin,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { REGIONS } from '@/data/regions'
import { Badge } from '@/components/ui'
import type { PrimaryMetricType } from '@/types/fire'

interface FilterBarProps {
  showRegionSelect?: boolean
  showDayNightSelect?: boolean
  showMetricSelect?: boolean
  className?: string
}

export function FilterBar({
  showRegionSelect = true,
  showDayNightSelect = true,
  showMetricSelect = true,
  className = '',
}: FilterBarProps) {
  const {
    filter,
    setFilter,
    resetFilter,
    customAoi,
    clearCustomAoi,
    filteredObservations,
    observations,
    metadata,
    summaryMetrics,
    setIsCsvModalOpen,
  } = useFireData()

  const handleSensorChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setFilter({ sensor: e.target.value as 'ALL' | 'MODIS' | 'VIIRS' })
  }

  const handleMetricChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setFilter({ metricType: e.target.value as PrimaryMetricType })
  }

  const handleRegionChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === 'custom' && customAoi) {
      setFilter({ regionId: 'custom', customPolygon: customAoi.points })
    } else {
      if (customAoi) clearCustomAoi()
      setFilter({ regionId: e.target.value, customPolygon: undefined })
    }
  }

  const handleStartDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilter({ startDate: e.target.value })
  }

  const handleEndDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFilter({ endDate: e.target.value })
  }

  const handleDayNightChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setFilter({ daynight: e.target.value as 'ALL' | 'D' | 'N' })
  }

  const handleGridResolutionChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setFilter({ gridResolution: parseFloat(e.target.value) as 0.1 | 0.25 | 0.5 })
  }

  // Quick preset buttons
  const applyPreset = (preset: 'full' | 'peak' | 'monsoon' | 'post') => {
    if (preset === 'full') {
      setFilter({
        startDate: metadata.dateRange.start,
        endDate: metadata.dateRange.end,
      })
    } else if (preset === 'peak') {
      setFilter({
        startDate: '2024-03-01',
        endDate: '2024-04-30',
      })
    } else if (preset === 'monsoon') {
      setFilter({
        startDate: '2024-06-01',
        endDate: '2024-08-31',
      })
    } else if (preset === 'post') {
      setFilter({
        startDate: '2024-10-01',
        endDate: '2024-11-30',
      })
    }
  }

  return (
    <div
      role="search"
      aria-label="Filter active observations"
      className={`rounded-xl border border-line bg-ink-900/80 p-4 shadow-panel backdrop-blur ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line/60">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="size-4 text-ember-400" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Platform Filters
          </span>
          <Badge tone={filteredObservations.length === 0 ? 'danger' : 'neutral'}>
            {filteredObservations.length.toLocaleString()} of {observations.length.toLocaleString()}{' '}
            hotspots
          </Badge>
          <Badge tone="signal">
            {summaryMetrics.harmonizedActiveCells.toLocaleString()} Active Grid Cells (0.25°)
          </Badge>

          {/* Custom AOI active indicator */}
          {filter.regionId === 'custom' && customAoi && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-signal-400/50 bg-signal-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-signal-300">
              <MapPin className="size-3 text-signal-400" />
              <span>AOI: {customAoi.name}</span>
              <button
                type="button"
                onClick={clearCustomAoi}
                className="hover:text-white"
                title="Clear custom area and return to All India"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-ink-800 px-2.5 py-1 text-xs font-medium text-fg-muted hover:border-ember-500/50 hover:bg-ink-700 hover:text-fg transition-colors"
            title="Import official NASA FIRMS CSV or fetch live with MAP_KEY"
          >
            <Upload className="size-3 text-ember-400" aria-hidden="true" />
            <span>Load NASA Data</span>
          </button>

          <button
            type="button"
            onClick={resetFilter}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-ink-800 px-2.5 py-1 text-xs font-medium text-fg-muted hover:bg-ink-700 hover:text-fg transition-colors"
            title="Reset all filters to default dataset bounds"
          >
            <RefreshCw className="size-3 text-signal-400" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric Selector */}
        {showMetricSelect && (
          <div>
            <label
              htmlFor="filter-metric"
              className="block text-xs font-medium text-fg-muted mb-1 flex items-center gap-1"
            >
              <Sparkles className="size-3 text-signal-400" aria-hidden="true" />
              Primary Analysis Metric
            </label>
            <select
              id="filter-metric"
              value={filter.metricType}
              onChange={handleMetricChange}
              className="w-full rounded-lg border border-line-strong bg-ink-800 px-3 py-1.5 text-xs font-medium text-fg focus:border-signal-400 focus:outline-none"
            >
              <option value="harmonized">Harmonized Grid Index (Recommended)</option>
              <option value="modis">MODIS Hotspots only (1 km)</option>
              <option value="viirs">VIIRS Hotspots only (375 m)</option>
              <option value="frp">Mean FRP in Megawatts (MW)</option>
              <option value="raw_total">Raw Hotspots Sum (Reference)</option>
            </select>
          </div>
        )}

        {/* Sensor selector */}
        <div>
          <label
            htmlFor="filter-sensor"
            className="block text-xs font-medium text-fg-muted mb-1 flex items-center gap-1"
          >
            <Layers className="size-3 text-ember-400" aria-hidden="true" />
            Sensor Instrument
          </label>
          <select
            id="filter-sensor"
            value={filter.sensor}
            onChange={handleSensorChange}
            className="w-full rounded-lg border border-line-strong bg-ink-800 px-3 py-1.5 text-xs font-medium text-fg focus:border-signal-400 focus:outline-none"
          >
            <option value="ALL">Both Sensors (MODIS + VIIRS)</option>
            <option value="MODIS">MODIS only (Terra &amp; Aqua 1 km)</option>
            <option value="VIIRS">VIIRS only (Suomi-NPP 375 m)</option>
          </select>
        </div>

        {/* Region selector */}
        {showRegionSelect && (
          <div>
            <label
              htmlFor="filter-region"
              className="block text-xs font-medium text-fg-muted mb-1 flex items-center gap-1"
            >
              <MapPin className="size-3 text-signal-400" aria-hidden="true" />
              Area of Interest
            </label>
            <select
              id="filter-region"
              value={filter.regionId}
              onChange={handleRegionChange}
              className="w-full rounded-lg border border-line-strong bg-ink-800 px-3 py-1.5 text-xs font-medium text-fg focus:border-signal-400 focus:outline-none"
            >
              {customAoi && (
                <option value="custom">★ Custom Drawn Area ({customAoi.name})</option>
              )}
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date Ranges */}
        <div>
          <label
            htmlFor="filter-start-date"
            className="block text-xs font-medium text-fg-muted mb-1 flex items-center gap-1"
          >
            <Calendar className="size-3 text-fg-faint" aria-hidden="true" />
            Date Window
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="date"
              id="filter-start-date"
              value={filter.startDate}
              min={metadata.dateRange.start}
              max={filter.endDate || metadata.dateRange.end}
              onChange={handleStartDateChange}
              className="w-full rounded-lg border border-line-strong bg-ink-800 px-2 py-1.5 text-xs font-medium text-fg focus:border-signal-400 focus:outline-none"
            />
            <input
              type="date"
              id="filter-end-date"
              value={filter.endDate}
              min={filter.startDate || metadata.dateRange.start}
              max={metadata.dateRange.end}
              onChange={handleEndDateChange}
              className="w-full rounded-lg border border-line-strong bg-ink-800 px-2 py-1.5 text-xs font-medium text-fg focus:border-signal-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Bottom toolbar */}
        {showDayNightSelect && (
          <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-line/40 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-fg-faint">Pass:</span>
                <select
                  id="filter-daynight"
                  value={filter.daynight || 'ALL'}
                  onChange={handleDayNightChange}
                  className="rounded border border-line-strong bg-ink-800 px-2 py-0.5 text-xs text-fg"
                >
                  <option value="ALL">Day & Night Passes</option>
                  <option value="D">Daytime only (Solar Noon)</option>
                  <option value="N">Nighttime only</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <Grid className="size-3 text-signal-400" />
                <span className="text-fg-faint">Grid:</span>
                <select
                  id="filter-grid-res"
                  value={filter.gridResolution ?? 0.25}
                  onChange={handleGridResolutionChange}
                  className="rounded border border-line-strong bg-ink-800 px-2 py-0.5 text-xs text-fg"
                >
                  <option value={0.1}>0.10° (~11 km)</option>
                  <option value={0.25}>0.25° (~27 km Standard)</option>
                  <option value={0.5}>0.50° (~55 km Regional)</option>
                </select>
              </div>
            </div>

            {/* Quick date presets */}
            <div className="flex items-center gap-1 text-[11px] text-fg-muted">
              <span className="text-fg-faint">Presets:</span>
              <button
                type="button"
                onClick={() => applyPreset('full')}
                className="rounded px-2 py-0.5 bg-ink-800 hover:bg-ink-700 text-fg-muted hover:text-fg"
              >
                Full Record
              </button>
              <button
                type="button"
                onClick={() => applyPreset('peak')}
                className="rounded px-2 py-0.5 bg-ink-800 hover:bg-ink-700 text-ember-400 hover:text-ember-300 font-semibold"
              >
                Mar–Apr Peak
              </button>
              <button
                type="button"
                onClick={() => applyPreset('monsoon')}
                className="rounded px-2 py-0.5 bg-ink-800 hover:bg-ink-700 text-fg-muted hover:text-fg"
              >
                Monsoon
              </button>
              <button
                type="button"
                onClick={() => applyPreset('post')}
                className="rounded px-2 py-0.5 bg-ink-800 hover:bg-ink-700 text-fg-muted hover:text-fg"
              >
                Oct–Nov
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
