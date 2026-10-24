import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  MapPin,
  Sliders,
  TrendingUp,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useFireData } from '@/context/FireDataContext'
import { FilterBar } from '@/components/shared/FilterBar'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui'
import {
  aggregateByDate,
  aggregateByRegion,
  aggregateSpatialGrid,
  filterObservations,
} from '@/utils/aggregation'
import {
  ANOMALY_SCIENTIFIC_DISCLAIMER,
  detectUnusualActivity,
  MIN_OBSERVATION_DAYS_REQUIRED,
} from '@/utils/anomalyDetection'
import {
  exportAggregatedDailyCsv,
  exportObservationsCsv,
  exportObservationsGeoJson,
  exportReportSummary,
  exportSpatialGridGeoJson,
} from '@/utils/exportUtils'

export default function InsightsReportsPage() {
  const navigate = useNavigate()
  const {
    filteredObservations,
    observations,
    summaryMetrics,
    filter,
    setFilter,
    metadata,
    customAoi,
  } = useFireData()

  // Anomaly multiplier configuration: 2.0x (Sensitive), 2.5x (Standard), 3.0x (Extreme)
  const [thresholdMultiplier, setThresholdMultiplier] = useState<number>(2.5)

  // Aggregated data
  const dailyData = useMemo(() => aggregateByDate(filteredObservations, filter.gridResolution), [filteredObservations, filter.gridResolution])
  const regionData = useMemo(() => aggregateByRegion(filteredObservations, filter.gridResolution), [filteredObservations, filter.gridResolution])

  // Broader reference baseline: observations matching the active AOI and sensor across the entire available dataset date range
  const aoiReferenceBaseline = useMemo(() => {
    return filterObservations(observations, {
      ...filter,
      startDate: '',
      endDate: '',
      customAoi,
    })
  }, [observations, filter, customAoi])

  // Statistical anomaly detection report (respects primary analysis metric and broader AOI baseline)
  const anomalyReport = useMemo(() => {
    return detectUnusualActivity(filteredObservations, {
      thresholdMultiplier,
      metricType: filter.metricType,
      referenceRecords: aoiReferenceBaseline,
      baselinePeriodLabel:
        filter.startDate && filter.endDate ? 'Historical AOI Baseline' : 'Full AOI Baseline',
    })
  }, [
    filteredObservations,
    aoiReferenceBaseline,
    thresholdMultiplier,
    filter.metricType,
    filter.startDate,
    filter.endDate,
  ])

  // Task F: Handle anomaly inspect navigation to Fire Explorer with preserved context
  const handleInspectAnomaly = (anomalyDate: string) => {
    setFilter({
      startDate: anomalyDate,
      endDate: anomalyDate,
    })
    navigate('/explorer', {
      state: {
        inspectedDate: anomalyDate,
        fromAnomaly: true,
      },
    })
  }

  // Export handlers
  const handleExportObservations = () => {
    exportObservationsCsv(
      filteredObservations,
      `pyrolens_${filter.regionId}_${filter.sensor.toLowerCase()}_observations.csv`,
    )
  }

  const handleExportDailyAggregates = () => {
    exportAggregatedDailyCsv(
      dailyData,
      `pyrolens_${filter.regionId}_daily_aggregates.csv`,
    )
  }

  const handleExportMarkdownReport = () => {
    exportReportSummary({
      filter,
      summary: summaryMetrics,
      anomalyReport,
      fileName: `pyrolens_activity_report_${filter.regionId}.md`,
    })
  }

  const handleExportHotspotsGeoJson = () => {
    exportObservationsGeoJson(
      filteredObservations,
      `pyrolens_${filter.regionId}_hotspots.geojson`,
    )
  }

  const handleExportGridGeoJson = () => {
    const { cells } = aggregateSpatialGrid(filteredObservations, filter.gridResolution)
    exportSpatialGridGeoJson(
      cells,
      `pyrolens_${filter.regionId}_grid_${filter.gridResolution}deg.geojson`,
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Insights & Intelligence Reports"
        description="Transparent statistical anomaly detection, historical multi-sensor trends, and reproducible data exports."
        meta={
          <Badge tone="ok" dot>
            Statistical Analysis Engine
          </Badge>
        }
      />

      {/* Shared Filter Bar */}
      <FilterBar />

      {/* Section 1: Unusual Activity Indicators (Statistical Anomaly Detection) */}
      <Card aria-labelledby="anomaly-detection-title">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-ember-400" />
              <h3 id="anomaly-detection-title" className="text-sm font-semibold text-fg">
                Statistical Observation Anomaly Detection
              </h3>
            </div>
            <p className="mt-1 text-xs text-fg-muted">
              Identifies unusually high hotspot observation counts against historical baseline using Median Absolute Deviation (MAD).
            </p>
          </div>

          {/* Multiplier Sensitivity Slider / Buttons */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-fg-faint flex items-center gap-1">
              <Sliders className="size-3 text-signal-400" />
              <span>Sensitivity Threshold:</span>
            </span>
            <div className="flex rounded-lg border border-line-strong bg-ink-950 p-0.5">
              <button
                type="button"
                onClick={() => setThresholdMultiplier(2.0)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  thresholdMultiplier === 2.0
                    ? 'bg-ember-500 text-ink-950 font-bold'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                2.0x (Moderate)
              </button>
              <button
                type="button"
                onClick={() => setThresholdMultiplier(2.5)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  thresholdMultiplier === 2.5
                    ? 'bg-ember-500 text-ink-950 font-bold'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                2.5x (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setThresholdMultiplier(3.0)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  thresholdMultiplier === 3.0
                    ? 'bg-ember-500 text-ink-950 font-bold'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                3.0x (Extreme)
              </button>
            </div>
          </div>
        </div>

        {/* Baseline Transparency Parameters */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs mb-5">
          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Statistical Method</span>
            <span className="font-semibold text-fg text-sm">{anomalyReport.baselineMethod}</span>
            <span className="text-fg-faint text-[10px] block mt-0.5">
              Robust against extreme outliers
            </span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Historical Baseline Median</span>
            <span className="font-bold text-fg text-sm">
              {anomalyReport.baselineMedian} hotspots/day
            </span>
            <span className="text-fg-faint text-[10px] block mt-0.5">
              MAD dispersion: ±{anomalyReport.madValue}
            </span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Calculated Anomaly Cutoff</span>
            <span className="font-bold text-ember-400 text-sm">
              &gt; {anomalyReport.thresholdValue} hotspots/day
            </span>
            <span className="text-fg-faint text-[10px] block mt-0.5">
              Multiplier: {anomalyReport.thresholdMultiplier}x above baseline
            </span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Analyzed Baseline Coverage</span>
            <span className="font-bold text-fg text-sm">
              {anomalyReport.totalDaysAnalyzed} observation days
            </span>
            <span className="text-fg-faint text-[10px] block mt-0.5">
              {anomalyReport.totalDaysAnalyzed >= MIN_OBSERVATION_DAYS_REQUIRED
                ? 'Sufficient baseline sample'
                : `Insufficient (min ${MIN_OBSERVATION_DAYS_REQUIRED} required)`}
            </span>
          </div>
        </div>

        {/* Anomaly Results or Insufficient Data State */}
        {anomalyReport.status === 'insufficient_baseline' ? (
          <div className="rounded-xl border border-line bg-ink-950 p-6 text-center text-xs text-fg-muted space-y-2">
            <AlertTriangle className="mx-auto size-7 text-ember-400" />
            <p className="font-semibold text-fg">Insufficient Historical Baseline</p>
            <p className="max-w-md mx-auto text-fg-faint leading-relaxed">
              At least {MIN_OBSERVATION_DAYS_REQUIRED} distinct observation days are required to calculate a statistically rigorous baseline. Currently only {anomalyReport.totalDaysAnalyzed} days are available under this filter. Expand the date range or select &apos;All India&apos;.
            </p>
          </div>
        ) : anomalyReport.anomalies.length === 0 ? (
          <div className="rounded-xl border border-line bg-ink-950 p-6 text-center text-xs text-fg-muted space-y-1">
            <CheckCircle2 className="mx-auto size-7 text-ok" />
            <p className="font-semibold text-fg">No Statistical Observation Anomalies Detected</p>
            <p className="text-fg-faint">
              All daily observation counts for the selected period fall within expected statistical variance (&le; {anomalyReport.thresholdValue} hotspots/day).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-fg-muted">
              <span className="font-semibold text-fg">
                Flagged Anomaly Dates ({anomalyReport.anomalies.length} periods exceeding threshold)
              </span>
              <span className="text-fg-faint text-[11px]">
                Threshold: &gt; {anomalyReport.thresholdValue} hotspots/day
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line bg-ink-950 text-fg-muted">
                    <th className="py-2.5 px-3 font-semibold">Anomaly Date</th>
                    <th className="py-2.5 px-3 font-semibold">Observed Count</th>
                    <th className="py-2.5 px-3 font-semibold">Baseline Median</th>
                    <th className="py-2.5 px-3 font-semibold">Anomaly Score</th>
                    <th className="py-2.5 px-3 font-semibold">Severity</th>
                    <th className="py-2.5 px-3 font-semibold">Contextual Explanation</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {anomalyReport.anomalies.map((anom) => (
                    <tr key={anom.date} className="hover:bg-ink-700/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-fg">
                        {anom.date}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-ember-400">
                        {anom.observedCount} hotspots
                      </td>
                      <td className="py-2.5 px-3 text-fg-muted">
                        {anom.baselineValue} hotspots
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-fg">
                        +{anom.anomalyScore}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          tone={
                            anom.severity === 'extreme'
                              ? 'danger'
                              : anom.severity === 'high'
                                ? 'ember'
                                : 'signal'
                          }
                        >
                          {anom.severity.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-fg-muted max-w-sm truncate" title={anom.explanation}>
                        {anom.explanation}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleInspectAnomaly(anom.date)}
                          className="inline-flex items-center gap-1 text-signal-400 hover:text-signal-300 font-medium transition-colors"
                          title={`Inspect ${anom.date} anomaly hotspots on map`}
                        >
                          <MapPin className="size-3" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mandatory Scientific Anomaly Disclaimer */}
        <div className="mt-4 rounded-lg border border-line-strong bg-ink-950 p-3 text-[11px] text-fg-faint leading-relaxed">
          <strong className="text-fg-muted">Important Disclaimer: </strong>
          {ANOMALY_SCIENTIFIC_DISCLAIMER}
        </div>
      </Card>

      {/* Section 2: Historical Multi-Sensor Trend Visualizations */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trend with Baseline Reference Line */}
        <Card aria-labelledby="trend-with-baseline-title">
          <CardHeader
            id="trend-with-baseline-title"
            title="Daily Trends with Statistical Baseline"
            description="Daily hotspot volume plotted against the historical median threshold line."
          />
          {dailyData.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No trend data"
              description="Adjust date or sensor filters to view time-series trends."
            />
          ) : (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262b33" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#6b7480"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis stroke="#6b7480" fontSize={11} tickLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="rounded-lg border border-line-strong bg-ink-900 p-2.5 text-xs shadow-xl">
                          <p className="font-semibold text-fg mb-1">{label}</p>
                          <p className="text-ember-400">Total: {payload[0]?.value} hotspots</p>
                          {anomalyReport.thresholdValue > 0 && (
                            <p className="text-fg-faint text-[10px]">
                              Cutoff: &gt; {anomalyReport.thresholdValue}
                            </p>
                          )}
                        </div>
                      )
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="rect"
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                  />
                  {anomalyReport.thresholdValue > 0 && (
                    <ReferenceLine
                      y={anomalyReport.thresholdValue}
                      stroke="#f87171"
                      strokeDasharray="4 4"
                      label={{
                        value: `Cutoff (${anomalyReport.thresholdValue})`,
                        fill: '#f87171',
                        fontSize: 10,
                        position: 'insideTopRight',
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Daily Hotspots"
                    stroke="#ff8a1f"
                    strokeWidth={2}
                    fill="#ff8a1f"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Regional Activity Ranking */}
        <Card aria-labelledby="regional-ranking-title">
          <CardHeader
            id="regional-ranking-title"
            title="Regional Activity Comparison"
            description="Comparing observation frequency across simplified state bounding envelopes."
          />
          {regionData.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No regional data"
              description="Select 'All India' to inspect regional comparisons."
            />
          ) : (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262b33" vertical={false} />
                  <XAxis
                    dataKey="regionName"
                    stroke="#6b7480"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v: string) => v.split(' ')[0] ?? ''}
                  />
                  <YAxis stroke="#6b7480" fontSize={11} tickLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="rounded-lg border border-line-strong bg-ink-900 p-2.5 text-xs shadow-xl">
                          <p className="font-semibold text-fg mb-1">{label}</p>
                          <p className="text-ember-400">Total: {payload[0]?.value} hotspots</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="total" name="Total Hotspots" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Section 3: Report & Data Export Center */}
      <Card aria-labelledby="export-center-title">
        <div className="border-b border-line pb-3 mb-4">
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="size-4 text-ok" />
            <h3 id="export-center-title" className="text-sm font-semibold text-fg">
              Report &amp; Dataset Export Center
            </h3>
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            Export reproducible data packages formatted with active filter parameters and scientific notices.
          </p>
        </div>

        {/* Current Active Filter State Summary for Export */}
        <div className="rounded-lg border border-line bg-ink-950 p-3 text-xs text-fg-muted flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <span className="text-fg-faint">Scope: </span>
              <strong className="text-fg">
                {filter.regionId === 'all' ? 'All India' : filter.regionId}
              </strong>
            </div>
            <div>
              <span className="text-fg-faint">Sensors: </span>
              <strong className="text-fg">{filter.sensor}</strong>
            </div>
            <div>
              <span className="text-fg-faint">Date Range: </span>
              <strong className="text-fg">
                {filter.startDate || 'Start'} to {filter.endDate || 'End'}
              </strong>
            </div>
            <div>
              <span className="text-fg-faint">Matched Records: </span>
              <strong className="text-ok">{filteredObservations.length.toLocaleString()}</strong>
            </div>
          </div>
          <Badge tone={metadata.isSynthetic ? 'ember' : 'signal'}>
            {metadata.isSynthetic ? 'Demo Provenance Tagged' : 'Official NASA CSV'}
          </Badge>
        </div>

        {/* 5 Export Action Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Export 1: Observations CSV */}
          <div className="rounded-xl border border-line bg-ink-950 p-4 flex flex-col justify-between space-y-4 hover:border-line-strong transition-colors">
            <div>
              <div className="flex items-center gap-2 text-fg">
                <FileSpreadsheet className="size-4 text-ember-400" />
                <h4 className="font-semibold text-xs">Filtered Observations CSV</h4>
              </div>
              <p className="mt-1 text-[11px] text-fg-muted leading-relaxed">
                Raw point observation records matching active filters with coordinates, confidence, and FRP.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportObservations}
              disabled={filteredObservations.length === 0}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-ink-800 py-2 text-xs font-semibold text-fg hover:bg-ink-700 hover:border-ember-500/50 disabled:opacity-40 transition-colors"
            >
              <ArrowDownToLine className="size-3.5 text-ember-400" />
              <span>Download Observations (.CSV)</span>
            </button>
          </div>

          {/* Export 2: Daily Aggregates CSV */}
          <div className="rounded-xl border border-line bg-ink-950 p-4 flex flex-col justify-between space-y-4 hover:border-line-strong transition-colors">
            <div>
              <div className="flex items-center gap-2 text-fg">
                <FileSpreadsheet className="size-4 text-signal-400" />
                <h4 className="font-semibold text-xs">Daily Aggregates CSV</h4>
              </div>
              <p className="mt-1 text-[11px] text-fg-muted leading-relaxed">
                Aggregated daily time series with separate MODIS/VIIRS counts, harmonized active cells, and FRP.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportDailyAggregates}
              disabled={dailyData.length === 0}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-ink-800 py-2 text-xs font-semibold text-fg hover:bg-ink-700 hover:border-signal-400/50 disabled:opacity-40 transition-colors"
            >
              <ArrowDownToLine className="size-3.5 text-signal-400" />
              <span>Download Aggregates (.CSV)</span>
            </button>
          </div>

          {/* Export 3: Hotspots GeoJSON */}
          <div className="rounded-xl border border-line bg-ink-950 p-4 flex flex-col justify-between space-y-4 hover:border-line-strong transition-colors">
            <div>
              <div className="flex items-center gap-2 text-fg">
                <FileSpreadsheet className="size-4 text-emerald-400" />
                <h4 className="font-semibold text-xs">Hotspots GeoJSON</h4>
              </div>
              <p className="mt-1 text-[11px] text-fg-muted leading-relaxed">
                FeatureCollection of Point geometries for GIS desktop mapping (QGIS/ArcGIS) and geospatial analyses.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportHotspotsGeoJson}
              disabled={filteredObservations.length === 0}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-ink-800 py-2 text-xs font-semibold text-fg hover:bg-ink-700 hover:border-emerald-500/50 disabled:opacity-40 transition-colors"
            >
              <ArrowDownToLine className="size-3.5 text-emerald-400" />
              <span>Download Hotspots (.GeoJSON)</span>
            </button>
          </div>

          {/* Export 4: Harmonized Spatial Grid GeoJSON */}
          <div className="rounded-xl border border-line bg-ink-950 p-4 flex flex-col justify-between space-y-4 hover:border-line-strong transition-colors">
            <div>
              <div className="flex items-center gap-2 text-fg">
                <FileSpreadsheet className="size-4 text-signal-300" />
                <h4 className="font-semibold text-xs">Spatial Grid Cells GeoJSON</h4>
              </div>
              <p className="mt-1 text-[11px] text-fg-muted leading-relaxed">
                Polygon grid bounding boxes ({filter.gridResolution}°) with MODIS/VIIRS counts and coincidence classification.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportGridGeoJson}
              disabled={filteredObservations.length === 0}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-ink-800 py-2 text-xs font-semibold text-fg hover:bg-ink-700 hover:border-signal-300/50 disabled:opacity-40 transition-colors"
            >
              <ArrowDownToLine className="size-3.5 text-signal-300" />
              <span>Download Grid Cells (.GeoJSON)</span>
            </button>
          </div>

          {/* Export 5: Complete Report Summary Markdown */}
          <div className="rounded-xl border border-line bg-ink-950 p-4 flex flex-col justify-between space-y-4 hover:border-line-strong transition-colors">
            <div>
              <div className="flex items-center gap-2 text-fg">
                <FileText className="size-4 text-ok" />
                <h4 className="font-semibold text-xs">Scientific Report Summary</h4>
              </div>
              <p className="mt-1 text-[11px] text-fg-muted leading-relaxed">
                Full structured intelligence report including summary statistics, anomaly analysis, and limitations.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportMarkdownReport}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-ink-800 py-2 text-xs font-semibold text-fg hover:bg-ink-700 hover:border-ok/50 transition-colors"
            >
              <ArrowDownToLine className="size-3.5 text-ok" />
              <span>Download Report (.MD)</span>
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
