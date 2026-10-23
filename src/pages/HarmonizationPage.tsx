import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Clock,
  Flame,
  GitCompareArrows,
  Grid,
  Info,
  Layers,
  Satellite,
  ShieldAlert,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useFireData } from '@/context/FireDataContext'
import { FilterBar } from '@/components/shared/FilterBar'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui'
import { aggregateSpatialGrid } from '@/utils/aggregation'

export default function HarmonizationPage() {
  const { filteredObservations } = useFireData()

  // Harmonization settings
  const [gridSizeDegrees, setGridSizeDegrees] = useState<0.1 | 0.25 | 0.5>(0.25)
  const [activeTab, setActiveTab] = useState<'demo' | 'specs' | 'methodology'>('demo')
  const [tableSearch, setTableSearch] = useState('')
  const [tableCategory, setTableCategory] = useState<'ALL' | 'BOTH_COINCIDENT' | 'VIIRS_ONLY' | 'MODIS_ONLY'>('ALL')

  // Run spatial aggregation
  const { cells, metrics } = useMemo(() => {
    return aggregateSpatialGrid(filteredObservations, gridSizeDegrees)
  }, [filteredObservations, gridSizeDegrees])

  // Filter table cells
  const filteredCells = useMemo(() => {
    return cells.filter((c) => {
      if (tableCategory !== 'ALL' && c.category !== tableCategory) return false
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase()
        return (
          c.cellId.toLowerCase().includes(q) ||
          c.centerLat.toString().includes(q) ||
          c.centerLng.toString().includes(q)
        )
      }
      return true
    })
  }, [cells, tableCategory, tableSearch])

  // Top 10 active cells for comparison chart
  const topCellsChartData = useMemo(() => {
    return cells.slice(0, 10).map((c) => ({
      name: `${c.centerLat}°, ${c.centerLng}°`,
      cellId: c.cellId,
      modis: c.modisCount,
      viirs: c.viirsCount,
      total: c.totalCount,
      category: c.category,
      avgFrp: c.avgFrp,
    }))
  }, [cells])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sensor Harmonization Engine"
        description="Transparent cross-sensor comparison and spatiotemporal aggregation methodology for NASA MODIS (1 km) and VIIRS (375 m) active-fire observations."
        meta={
          <Badge tone="signal" dot>
            Documented Aggregation Demonstration
          </Badge>
        }
      />

      {/* Shared Filter Bar */}
      <FilterBar />

      {/* Tab Navigation */}
      <div className="flex border-b border-line gap-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('demo')}
          className={`flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition-colors ${
            activeTab === 'demo'
              ? 'border-ember-500 text-fg'
              : 'border-transparent text-fg-muted hover:text-fg'
          }`}
        >
          <GitCompareArrows className="size-3.5 text-ember-400" />
          <span>Interactive Harmonization Demo</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('specs')}
          className={`flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition-colors ${
            activeTab === 'specs'
              ? 'border-signal-400 text-fg'
              : 'border-transparent text-fg-muted hover:text-fg'
          }`}
        >
          <Satellite className="size-3.5 text-signal-400" />
          <span>Sensor Architecture Comparison</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('methodology')}
          className={`flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition-colors ${
            activeTab === 'methodology'
              ? 'border-ok text-fg'
              : 'border-transparent text-fg-muted hover:text-fg'
          }`}
        >
          <Info className="size-3.5 text-ok" />
          <span>Scientific Caveats & Limitations</span>
        </button>
      </div>

      {/* Tab 1: Interactive Harmonization Demonstration */}
      {activeTab === 'demo' && (
        <div className="flex flex-col gap-6">
          {/* Method Disclaimer */}
          <div className="rounded-xl border border-line bg-ink-900/60 p-4 text-xs text-fg-muted space-y-2">
            <div className="flex items-center gap-2 text-fg font-semibold">
              <ShieldAlert className="size-4 text-ember-400 shrink-0" />
              <span>Scientific Harmonization Principle</span>
            </div>
            <p className="leading-relaxed">
              Because VIIRS 375m has ~9x the spatial resolution of MODIS 1000m, adding raw hotspot counts creates a false sense of fire prevalence.
              This platform demonstrates <strong className="text-fg">Spatiotemporal Grid Binning</strong>: grouping observations into uniform spatial cells to calculate coincident fire presence, relative detection density, and Jaccard spatial agreement.
            </p>
          </div>

          {/* Aggregation Settings Control Bar */}
          <Card padding="sm" className="bg-ink-900/90">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <Grid className="size-4 text-signal-400" />
                <span className="font-semibold text-fg">Spatiotemporal Grid Resolution:</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-fg-muted">Cell Size:</span>
                <div className="flex rounded-lg border border-line-strong bg-ink-950 p-0.5">
                  <button
                    type="button"
                    onClick={() => setGridSizeDegrees(0.1)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      gridSizeDegrees === 0.1
                        ? 'bg-ember-500 text-ink-950 font-bold'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    0.10° (~11 km)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGridSizeDegrees(0.25)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      gridSizeDegrees === 0.25
                        ? 'bg-ember-500 text-ink-950 font-bold'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    0.25° (~27 km · Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGridSizeDegrees(0.5)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      gridSizeDegrees === 0.5
                        ? 'bg-ember-500 text-ink-950 font-bold'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    0.50° (~55 km · Regional)
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Harmonization Key Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card padding="sm">
              <span className="text-xs text-fg-muted block">Active Grid Cells</span>
              <p className="mt-1 text-2xl font-bold text-fg">
                {metrics.totalActiveCells.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-fg-faint">
                Spatial footprint at {metrics.gridCellSizeDegrees}° resolution
              </p>
            </Card>

            <Card padding="sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-muted">Coincident Cells</span>
                <Badge tone="ok">Both Sensors</Badge>
              </div>
              <p className="mt-1 text-2xl font-bold text-ok">
                {metrics.coincidentCellsCount.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-fg-faint">
                {metrics.totalActiveCells > 0
                  ? `${((metrics.coincidentCellsCount / metrics.totalActiveCells) * 100).toFixed(1)}% agreement`
                  : '0%'}
              </p>
            </Card>

            <Card padding="sm">
              <span className="text-xs text-fg-muted block">Detection Multiplier</span>
              <p className="mt-1 text-2xl font-bold text-signal-400">
                {metrics.viirsToModisRatio !== null ? `${metrics.viirsToModisRatio}x` : 'N/A'}
              </p>
              <p className="mt-1 text-[11px] text-fg-faint">
                Ratio of VIIRS to MODIS detections
              </p>
            </Card>

            <Card padding="sm">
              <span className="text-xs text-fg-muted block">Jaccard Spatial Similarity</span>
              <p className="mt-1 text-2xl font-bold text-fg">
                {metrics.jaccardSimilarityIndex}
              </p>
              <p className="mt-1 text-[11px] text-fg-faint">
                Coincidence / Union of active cells (0.0 to 1.0)
              </p>
            </Card>
          </div>

          {/* Side-by-side Top Cells Comparison Chart */}
          <Card aria-labelledby="harmonization-chart-title">
            <CardHeader
              id="harmonization-chart-title"
              title="Top 10 Active Grid Cells: Sensor Comparison"
              description={`Spatial cells (${gridSizeDegrees}° × ${gridSizeDegrees}°) showing where both sensors detected activity vs single-sensor detections.`}
            />
            {topCellsChartData.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No active grid cells"
                description="Adjust filters to view active spatial clusters."
              />
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topCellsChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#262b33" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#6b7480"
                      fontSize={10}
                      tickLine={false}
                      angle={-20}
                      textAnchor="end"
                    />
                    <YAxis stroke="#6b7480" fontSize={11} tickLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div className="rounded-lg border border-line-strong bg-ink-900 p-2.5 text-xs shadow-xl">
                            <p className="font-semibold text-fg mb-1">Cell: {label}</p>
                            <p className="text-ember-400">MODIS: {payload[0]?.value} hotspots</p>
                            <p className="text-signal-400">VIIRS: {payload[1]?.value} hotspots</p>
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
                    <Bar dataKey="modis" name="MODIS (1 km)" fill="#ff8a1f" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="viirs" name="VIIRS (375 m)" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Spatial Grid Cells Data Table */}
          <Card aria-labelledby="grid-table-title">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 id="grid-table-title" className="text-sm font-semibold text-fg">
                  Spatial Grid Co-occurrence Matrix
                </h3>
                <p className="mt-1 text-xs text-fg-muted">
                  Inspecting coincident presence vs sensor-exclusive cell detections.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={tableCategory}
                  onChange={(e) =>
                    setTableCategory(
                      e.target.value as 'ALL' | 'BOTH_COINCIDENT' | 'VIIRS_ONLY' | 'MODIS_ONLY',
                    )
                  }
                  className="rounded-lg border border-line-strong bg-ink-950 px-3 py-1.5 text-xs text-fg focus:outline-none"
                >
                  <option value="ALL">All Grid Cells ({cells.length})</option>
                  <option value="BOTH_COINCIDENT">
                    Both Coincident ({metrics.coincidentCellsCount})
                  </option>
                  <option value="VIIRS_ONLY">VIIRS Only ({metrics.viirsOnlyCellsCount})</option>
                  <option value="MODIS_ONLY">MODIS Only ({metrics.modisOnlyCellsCount})</option>
                </select>

                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Filter by coordinate..."
                  className="w-40 rounded-lg border border-line-strong bg-ink-950 px-3 py-1.5 text-xs text-fg placeholder:text-fg-faint focus:outline-none"
                />
              </div>
            </div>

            {filteredCells.length === 0 ? (
              <EmptyState
                icon={Grid}
                title="No matching grid cells"
                description="No cells matched the selected coincidence category."
              />
            ) : (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-ink-900 border-b border-line text-fg-muted">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Grid Cell ID</th>
                      <th className="py-2.5 px-3 font-semibold">Center Coordinate</th>
                      <th className="py-2.5 px-3 font-semibold">Coincidence Status</th>
                      <th className="py-2.5 px-3 font-semibold text-ember-400">MODIS Hotspots</th>
                      <th className="py-2.5 px-3 font-semibold text-signal-400">VIIRS Hotspots</th>
                      <th className="py-2.5 px-3 font-semibold">Total Hotspots</th>
                      <th className="py-2.5 px-3 font-semibold">Average FRP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {filteredCells.slice(0, 25).map((cell) => {
                      return (
                        <tr key={cell.cellId} className="hover:bg-ink-700/40 transition-colors">
                          <td className="py-2 px-3 font-mono text-fg-muted">{cell.cellId}</td>
                          <td className="py-2 px-3 font-mono text-fg">
                            {cell.centerLat}°N, {cell.centerLng}°E
                          </td>
                          <td className="py-2 px-3">
                            {cell.category === 'BOTH_COINCIDENT' ? (
                              <Badge tone="ok">Both Coincident</Badge>
                            ) : cell.category === 'VIIRS_ONLY' ? (
                              <Badge tone="signal">VIIRS Only</Badge>
                            ) : (
                              <Badge tone="ember">MODIS Only</Badge>
                            )}
                          </td>
                          <td className="py-2 px-3 font-semibold text-ember-400">
                            {cell.modisCount}
                          </td>
                          <td className="py-2 px-3 font-semibold text-signal-400">
                            {cell.viirsCount}
                          </td>
                          <td className="py-2 px-3 font-bold text-fg">
                            {cell.totalCount}
                          </td>
                          <td className="py-2 px-3 text-fg-muted">
                            {cell.avgFrp !== null ? `${cell.avgFrp} MW` : 'N/A'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-[11px] text-fg-faint">
              Displaying top {Math.min(25, filteredCells.length)} of {filteredCells.length} cells. Grid size: {gridSizeDegrees}° × {gridSizeDegrees}°.
            </p>
          </Card>
        </div>
      )}

      {/* Tab 2: Sensor Architecture Comparison */}
      {activeTab === 'specs' && (
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="specs-table-title">
            <CardHeader
              id="specs-table-title"
              title="Instrument Specifications & Physics Comparison"
              description="NASA satellite sensors operate on distinct optical swaths and pixel footprints."
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line bg-ink-950/80 text-fg-muted">
                    <th className="py-3 px-4 font-semibold">Parameter</th>
                    <th className="py-3 px-4 font-semibold text-ember-400">MODIS (Terra & Aqua)</th>
                    <th className="py-3 px-4 font-semibold text-signal-400">VIIRS (S-NPP & NOAA-20/21)</th>
                    <th className="py-3 px-4 font-semibold">Harmonization Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  <tr>
                    <td className="py-3 px-4 font-semibold text-fg">Nominal Spatial Resolution</td>
                    <td className="py-3 px-4 text-fg-muted">1,000 m (1.0 km nadir)</td>
                    <td className="py-3 px-4 text-fg-muted">375 m (I-band nadir)</td>
                    <td className="py-3 px-4 text-fg-faint leading-relaxed">
                      VIIRS has ~9x higher pixel density, detecting multiple pixels for a single fire cluster that registers as 1 MODIS pixel.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-fg">Scan Geometry (Swath Edge)</td>
                    <td className="py-3 px-4 text-fg-muted">
                      Severe distortion (~2 km × 4.8 km pixel footprint)
                    </td>
                    <td className="py-3 px-4 text-fg-muted">
                      3-zone pixel aggregation maintains ~375 m to 800 m across swath
                    </td>
                    <td className="py-3 px-4 text-fg-faint leading-relaxed">
                      MODIS loses sensitivity and duplicates pixels at high scan angles (&gt;45°), whereas VIIRS maintains consistent resolution.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-fg">Detection Channels</td>
                    <td className="py-3 px-4 text-fg-muted">
                      B21/B22 (3.96 µm) &amp; B31 (11.0 µm)
                    </td>
                    <td className="py-3 px-4 text-fg-muted">
                      I4 (3.74 µm) &amp; I5 (11.45 µm)
                    </td>
                    <td className="py-3 px-4 text-fg-faint leading-relaxed">
                      VIIRS I4 operates at higher spatial resolution with lower saturation temperature limits.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-fg">Minimum Detectable Fire Size</td>
                    <td className="py-3 px-4 text-fg-muted">~100 m² to 1,000 m² flaming front</td>
                    <td className="py-3 px-4 text-fg-muted">~1 m² to 5 m² small/cool fire</td>
                    <td className="py-3 px-4 text-fg-faint leading-relaxed">
                      VIIRS detects agricultural stubble and localized smoldering fires that are completely invisible to MODIS.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-fg">Equator Overpass (Local Time)</td>
                    <td className="py-3 px-4 text-fg-muted">
                      Terra: 10:30 AM/PM<br />Aqua: 01:30 PM/AM
                    </td>
                    <td className="py-3 px-4 text-fg-muted">
                      Suomi-NPP: 01:30 PM/AM<br />NOAA-20: 01:20 PM/AM
                    </td>
                    <td className="py-3 px-4 text-fg-faint leading-relaxed">
                      Temporal offset: morning fires may be detected by Terra before afternoon VIIRS overpass; short-lived burns between passes are missed.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-semibold text-fg">Confidence Metric</td>
                    <td className="py-3 px-4 text-fg-muted">Continuous 0% to 100% score</td>
                    <td className="py-3 px-4 text-fg-muted">Categorical: 'low', 'nominal', 'high'</td>
                    <td className="py-3 px-4 text-fg-faint leading-relaxed">
                      Confidence values cannot be merged or compared numerically.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Scientific Caveats & Limitations */}
      {activeTab === 'methodology' && (
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="caveats-title">
            <CardHeader
              id="caveats-title"
              title="Methodology Constraints and Harmonization Limits"
              description="Scientific principles governing multi-sensor satellite fire product integration."
            />
            <div className="space-y-4 text-xs text-fg-muted leading-relaxed">
              <div className="rounded-lg border border-line bg-ink-950 p-4 space-y-2">
                <h4 className="font-semibold text-fg flex items-center gap-2">
                  <AlertTriangle className="size-4 text-ember-400" />
                  Why Simple Addition is Invalid
                </h4>
                <p>
                  A naive summation of MODIS and VIIRS counts is scientifically incorrect. Because VIIRS has 9x higher spatial resolution, counting a fire cluster as 1 MODIS detection and 6 VIIRS detections does not mean there are 7 fires. It represents 1 fire episode observed at two different spatial resolutions.
                </p>
              </div>

              <div className="rounded-lg border border-line bg-ink-950 p-4 space-y-2">
                <h4 className="font-semibold text-fg flex items-center gap-2">
                  <Clock className="size-4 text-signal-400" />
                  Orbital Mechanics and Diurnal Bias
                </h4>
                <p>
                  Low-Earth Orbit (LEO) satellites provide polar snapshots 2 to 4 times per day per location. Fires that ignite and extinguish between overpass times (e.g. quick agricultural residue burns lasting 45 minutes) will only be recorded if they coincide with satellite scan time. Cloud cover and thick convective smoke also attenuate the 4 µm thermal signal, causing non-detection.
                </p>
              </div>

              <div className="rounded-lg border border-line bg-ink-950 p-4 space-y-2">
                <h4 className="font-semibold text-fg flex items-center gap-2">
                  <Flame className="size-4 text-ember-400" />
                  Fire Radiative Power (FRP) vs. Burned Area
                </h4>
                <p>
                  Fire Radiative Power measures the instantaneous rate of radiative heat output in Megawatts (MW). FRP is not burned area in hectares. A small, intense flaming fire can have higher FRP than a large, cool smoldering fire.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
