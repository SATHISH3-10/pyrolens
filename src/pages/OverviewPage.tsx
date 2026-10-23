import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  Layers,
  MapPin,
  Satellite,
  Search,
  TrendingUp,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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
  aggregateByMonth,
  aggregateByRegion,
} from '@/utils/aggregation'

interface ChartTooltipPayloadItem {
  name: string
  value: number | string
  color: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: ChartTooltipPayloadItem[]
  label?: string
}

function CustomChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="rounded-lg border border-line-strong bg-ink-900/95 p-3 shadow-xl text-xs backdrop-blur">
      <p className="font-semibold text-fg mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={`tip-${index}`} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span className="text-fg-muted">{entry.name}:</span>
            </div>
            <span className="font-medium text-fg">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function OverviewPage() {
  const {
    filteredObservations,
    summaryMetrics,
    metadata,
    filter,
    setSelectedObservationId,
  } = useFireData()

  const [tableSearch, setTableSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 8

  // Aggregated data for charts
  const dateData = useMemo(() => aggregateByDate(filteredObservations, filter.gridResolution), [filteredObservations, filter.gridResolution])
  const monthData = useMemo(() => aggregateByMonth(filteredObservations, filter.gridResolution), [filteredObservations, filter.gridResolution])
  const regionData = useMemo(() => aggregateByRegion(filteredObservations, filter.gridResolution), [filteredObservations, filter.gridResolution])

  // Diurnal day vs night data
  const diurnalData = useMemo(() => {
    return [
      { name: 'Daytime (Solar Noon)', value: summaryMetrics.dayCount, color: '#ff8a1f' },
      { name: 'Nighttime (Pass)', value: summaryMetrics.nightCount, color: '#38bdf8' },
    ]
  }, [summaryMetrics.dayCount, summaryMetrics.nightCount])

  // Table filtering & pagination
  const filteredTableRows = useMemo(() => {
    if (!tableSearch.trim()) return filteredObservations
    const q = tableSearch.toLowerCase()
    return filteredObservations.filter(
      (obs) =>
        obs.id.toLowerCase().includes(q) ||
        obs.instrument.toLowerCase().includes(q) ||
        obs.satellite.toLowerCase().includes(q) ||
        obs.regionName.toLowerCase().includes(q) ||
        obs.acqDate.includes(q),
    )
  }, [filteredObservations, tableSearch])

  const totalPages = Math.max(1, Math.ceil(filteredTableRows.length / pageSize))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredTableRows.slice(start, start + pageSize)
  }, [filteredTableRows, currentPage, pageSize])

  const modisShare =
    summaryMetrics.totalCount > 0
      ? ((summaryMetrics.modisCount / summaryMetrics.totalCount) * 100).toFixed(1)
      : '0'

  const viirsShare =
    summaryMetrics.totalCount > 0
      ? ((summaryMetrics.viirsCount / summaryMetrics.totalCount) * 100).toFixed(1)
      : '0'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fire Activity Overview"
        description="Harmonized intelligence across NASA MODIS and VIIRS satellite hotspot observations for India."
        meta={
          <Badge tone={metadata.isSynthetic ? 'ember' : 'signal'} dot>
            {metadata.isSynthetic ? 'Demo Dataset (Synthetic)' : 'Official NASA CSV'}
          </Badge>
        }
      />

      {/* Shared Filter Bar */}
      <FilterBar />

      {/* Scientific Notice Banner */}
      <div
        role="region"
        aria-label="Scientific advisory notice"
        className="flex items-start gap-3 rounded-xl border border-line bg-ink-900/60 p-4 text-xs text-fg-muted"
      >
        <Info className="size-4 shrink-0 text-signal-400 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-fg">
            Scientific Interpretation: Satellite Thermal Anomalies vs. Wildfires
          </p>
          <p className="leading-relaxed">
            A satellite hotspot is a detected sub-pixel thermal anomaly, not a verified fire perimeter or burned area.
            MODIS (1 km) and VIIRS (375 m) differ in pixel footprint, detection limits, and overpass timing.
            <strong className="text-fg-muted"> Raw detection counts from different sensors must not be summed blindly.</strong>
          </p>
        </div>
      </div>

      {/* 6 Summary Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {/* Total Observations */}
        <Card padding="sm" className="relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span className="font-medium">Total Hotspots</span>
            <Activity className="size-4 text-ember-400" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-fg">
            {summaryMetrics.totalCount.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-fg-faint">
            Raw detections
          </p>
        </Card>

        {/* Harmonized Active Grid Cells */}
        <Card padding="sm" className="relative overflow-hidden border-signal-400/40 bg-signal-950/20">
          <div className="flex items-center justify-between text-xs text-signal-300">
            <span className="font-semibold">Harmonized Cells</span>
            <Layers className="size-4 text-signal-400" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-signal-300">
            {summaryMetrics.harmonizedActiveCells.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-signal-400/70">
            {filter.gridResolution}° spatial cells
          </p>
        </Card>

        {/* MODIS Observations */}
        <Card padding="sm">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span className="font-medium">MODIS (1 km)</span>
            <Satellite className="size-4 text-ember-500" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ember-400">
            {summaryMetrics.modisCount.toLocaleString()}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-fg-faint">
            <span>{modisShare}% share</span>
            <span className="font-mono">Terra/Aqua</span>
          </div>
        </Card>

        {/* VIIRS Observations */}
        <Card padding="sm">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span className="font-medium">VIIRS (375 m)</span>
            <Layers className="size-4 text-signal-400" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-signal-400">
            {summaryMetrics.viirsCount.toLocaleString()}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-fg-faint">
            <span>{viirsShare}% share</span>
            <span className="font-mono">SNPP/NOAA</span>
          </div>
        </Card>

        {/* Distinct Dates */}
        <Card padding="sm">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span className="font-medium">Active Dates</span>
            <Calendar className="size-4 text-ok" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-fg">
            {summaryMetrics.distinctDatesCount}
          </p>
          <p className="mt-1 text-[11px] text-fg-faint truncate">
            {summaryMetrics.dateRange.min || 'N/A'} to {summaryMetrics.dateRange.max || 'N/A'}
          </p>
        </Card>

        {/* Average FRP */}
        <Card padding="sm">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span className="font-medium">Average FRP</span>
            <Flame className="size-4 text-ember-400" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-fg">
            {summaryMetrics.avgFrp !== null ? `${summaryMetrics.avgFrp} MW` : 'Not available'}
          </p>
          <p className="mt-1 text-[11px] text-fg-faint">
            {summaryMetrics.validFrpCount > 0
              ? `From ${summaryMetrics.validFrpCount.toLocaleString()} retrievals`
              : 'No valid FRP'}
          </p>
        </Card>
      </div>

      {/* Main Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart 1: Hotspot Activity Over Time */}
        <Card aria-labelledby="time-series-chart">
          <CardHeader
            id="time-series-chart"
            title="Hotspot Detections Over Time"
            description="Daily count comparison showing sensor detection characteristics."
          />
          {dateData.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No observations in range"
              description="Adjust the date or sensor filters above to inspect activity."
            />
          ) : (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dateData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorModis" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff8a1f" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ff8a1f" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorViirs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262b33" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#6b7480"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val: string) => {
                      const parts = val.split('-')
                      return `${parts[1]}/${parts[2]}`
                    }}
                  />
                  <YAxis stroke="#6b7480" fontSize={11} tickLine={false} />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="harmonizedActiveCells"
                    name={`Harmonized Cells (${filter.gridResolution}°)`}
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fillOpacity={0}
                  />
                  <Area
                    type="monotone"
                    dataKey="viirs"
                    name="VIIRS (375 m)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorViirs)"
                  />
                  <Area
                    type="monotone"
                    dataKey="modis"
                    name="MODIS (1 km)"
                    stroke="#ff8a1f"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorModis)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Chart 2: Monthly Activity Distribution */}
        <Card aria-labelledby="monthly-chart">
          <CardHeader
            id="monthly-chart"
            title="Monthly Activity Distribution"
            description="Highlights seasonal fire cycles (e.g. March–April pre-monsoon dry season peak)."
          />
          {monthData.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No monthly data"
              description="No observation records found for the selected filter."
            />
          ) : (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262b33" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#6b7480"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val: string) => val.split(' ')[0] ?? ''}
                  />
                  <YAxis stroke="#6b7480" fontSize={11} tickLine={false} />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="rect"
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                  />
                  <Bar dataKey="harmonizedActiveCells" name={`Harmonized Cells (${filter.gridResolution}°)`} fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="modis" name="MODIS (1 km)" fill="#ff8a1f" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="viirs" name="VIIRS (375 m)" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Chart 3: Regional Distribution */}
        <Card aria-labelledby="regional-chart">
          <CardHeader
            id="regional-chart"
            title="Regional Activity Distribution"
            description="Observations across simplified state bounding envelopes."
          />
          {regionData.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No regional data"
              description="Select 'All India' or check region filters."
            />
          ) : (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={regionData}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#262b33" horizontal={false} />
                  <XAxis type="number" stroke="#6b7480" fontSize={11} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="regionName"
                    stroke="#6b7480"
                    fontSize={11}
                    tickLine={false}
                    width={100}
                    tickFormatter={(val: string) => val.split(' ')[0] ?? ''}
                  />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                  />
                  <Bar dataKey="modis" name="MODIS" fill="#ff8a1f" stackId="a" />
                  <Bar dataKey="viirs" name="VIIRS" fill="#38bdf8" stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Chart 4: Day vs Night Diurnal Overpass */}
        <Card aria-labelledby="diurnal-chart">
          <CardHeader
            id="diurnal-chart"
            title="Overpass Timing: Day vs. Night"
            description="Solar noon overpasses capture active afternoon thermal fire peaks."
          />
          <div className="flex h-72 items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={diurnalData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {diurnalData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomChartTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Observations Table */}
      <Card aria-labelledby="recent-observations">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 id="recent-observations" className="text-sm font-semibold text-fg">
              Active Fire Observations
            </h3>
            <p className="mt-1 text-xs text-fg-muted">
              Displaying filtered satellite hotspot records with coordinates and FRP values.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Search ID, sensor, region..."
                className="w-48 sm:w-64 rounded-lg border border-line-strong bg-ink-950 pl-8 pr-3 py-1.5 text-xs text-fg placeholder:text-fg-faint focus:border-signal-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {paginatedRows.length === 0 ? (
          <EmptyState
            icon={Flame}
            title="No matching observations"
            description="No hotspot observations matched the current search or filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line bg-ink-950/60 text-fg-muted">
                  <th scope="col" className="py-2.5 px-3 font-semibold">Observation ID</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Sensor</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Satellite</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Date & Time</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Coordinates</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Region</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Confidence</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">FRP (MW)</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {paginatedRows.map((obs) => {
                  const isModis = obs.instrument === 'MODIS'
                  return (
                    <tr
                      key={obs.id}
                      className="hover:bg-ink-700/40 transition-colors group"
                    >
                      <td className="py-2.5 px-3 font-mono font-medium text-fg">
                        {obs.id}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge tone={isModis ? 'ember' : 'signal'}>
                          {obs.instrument}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-fg-muted">
                        {obs.satellite}
                      </td>
                      <td className="py-2.5 px-3 text-fg-muted whitespace-nowrap">
                        <span>{obs.acqDate}</span>{' '}
                        <span className="font-mono text-fg-faint">
                          {obs.acqTime.slice(0, 2)}:{obs.acqTime.slice(2)} UTC
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-fg-muted whitespace-nowrap">
                        {obs.latitude.toFixed(4)}°, {obs.longitude.toFixed(4)}°
                      </td>
                      <td className="py-2.5 px-3 text-fg-muted">
                        {obs.regionName}
                      </td>
                      <td className="py-2.5 px-3">
                        {typeof obs.confidence === 'number' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-fg">{obs.confidence}%</span>
                            <div className="w-12 h-1.5 rounded-full bg-ink-950 overflow-hidden">
                              <div
                                className="h-full bg-ember-400"
                                style={{ width: `${obs.confidence}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <Badge
                            tone={
                              obs.confidence === 'high'
                                ? 'ok'
                                : obs.confidence === 'low'
                                  ? 'neutral'
                                  : 'signal'
                            }
                          >
                            {String(obs.confidence)}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-fg">
                        {obs.frp !== null ? (
                          <span
                            className={
                              obs.frp > 35
                                ? 'text-ember-400 font-bold'
                                : obs.frp > 15
                                  ? 'text-ember-300'
                                  : 'text-fg-muted'
                            }
                          >
                            {obs.frp} MW
                          </span>
                        ) : (
                          <span className="text-fg-faint italic">Not available</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          to="/explorer"
                          onClick={() => setSelectedObservationId(obs.id)}
                          className="inline-flex items-center gap-1 text-xs text-signal-400 hover:text-signal-300 font-medium"
                          title="View on Map"
                        >
                          <MapPin className="size-3" />
                          <span>Locate</span>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-fg-muted">
            <span>
              Page {currentPage} of {totalPages} ({filteredTableRows.length} records)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-line bg-ink-800 p-1.5 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-line bg-ink-800 p-1.5 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Exploration Links */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          to="/explorer"
          className="group flex flex-col justify-between rounded-xl border border-line bg-ink-900 p-4 hover:border-ember-500/40 hover:bg-ink-800/80 transition-all"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ember-400">
                Interactive Map
              </span>
              <MapPin className="size-4 text-fg-faint group-hover:text-ember-400 transition-colors" />
            </div>
            <h4 className="mt-2 text-sm font-semibold text-fg">Fire Explorer</h4>
            <p className="mt-1 text-xs text-fg-muted">
              Inspect spatial coordinates on OpenStreetMap with sensor color coding.
            </p>
          </div>
          <span className="mt-4 text-xs font-medium text-ember-400 group-hover:underline">
            Open Map &rarr;
          </span>
        </Link>

        <Link
          to="/harmonization"
          className="group flex flex-col justify-between rounded-xl border border-line bg-ink-900 p-4 hover:border-signal-400/40 hover:bg-ink-800/80 transition-all"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-signal-400">
                Cross-Sensor Engine
              </span>
              <Layers className="size-4 text-fg-faint group-hover:text-signal-400 transition-colors" />
            </div>
            <h4 className="mt-2 text-sm font-semibold text-fg">Sensor Harmonization</h4>
            <p className="mt-1 text-xs text-fg-muted">
              Understand spatial resolution differences and spatiotemporal grid binning.
            </p>
          </div>
          <span className="mt-4 text-xs font-medium text-signal-400 group-hover:underline">
            Harmonize Sensors &rarr;
          </span>
        </Link>

        <Link
          to="/insights"
          className="group flex flex-col justify-between rounded-xl border border-line bg-ink-900 p-4 hover:border-ok/40 hover:bg-ink-800/80 transition-all"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ok">
                Statistical Insights
              </span>
              <Activity className="size-4 text-fg-faint group-hover:text-ok transition-colors" />
            </div>
            <h4 className="mt-2 text-sm font-semibold text-fg">Insights & Reports</h4>
            <p className="mt-1 text-xs text-fg-muted">
              Detect unusual activity periods and export filtered CSV summaries.
            </p>
          </div>
          <span className="mt-4 text-xs font-medium text-ok group-hover:underline">
            View Reports &rarr;
          </span>
        </Link>
      </div>
    </div>
  )
}
