import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Braces,
  FileBarChart,
  FileDown,
  FileSpreadsheet,
  FileText,
  ImageDown,
  Loader2,
  Printer,
  Shapes,
  Sigma,
} from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui'
import { CalendarHeatmap } from '@/components/viz/CalendarHeatmap'
import { ActivityLegend } from '@/components/viz/ActivityLegend'
import { ACTIVITY_COLORS, SOURCE_SHORT } from '@/components/viz/activityScale'
import { buildOutlook, CLASS_LABEL, clusterFireEvents } from '@/utils/burningActivity'
import { exportObservationsCsv, exportObservationsGeoJson } from '@/utils/exportUtils'
import {
  downloadCanvasPng,
  exportDailyBaiCsv,
  exportFireEventsGeoJson,
  exportHarmonizationCsv,
  exportSummaryMarkdown,
  openPrintableReport,
} from '@/utils/exportActivity'
import { useRangeDays } from '@/hooks/useRangeDays'
import { fmtDate, fmtNum } from '@/lib'

const CANVAS_ID = 'report-calendar'

interface ExportItem {
  icon: typeof FileText
  title: string
  format: string
  description: string
  run: () => void | Promise<void>
}

function ExportCard({ item }: { item: ExportItem }) {
  const [busy, setBusy] = useState(false)
  const Icon = item.icon
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        // Let the spinner paint before heavy work.
        await new Promise((r) => setTimeout(r, 30))
        try {
          await item.run()
        } finally {
          setBusy(false)
        }
      }}
      className="group flex items-start gap-3.5 rounded-2xl border border-line bg-ink-850 p-4 text-left transition-colors hover:border-ember-500/40 hover:bg-ink-800"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-700 text-ember-400 transition-colors group-hover:bg-ember-500/15">
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">{item.title}</span>
          <span className="rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{item.format}</span>
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-fg-muted">{item.description}</span>
      </span>
      <FileDown className="mt-1 size-4 shrink-0 text-fg-faint transition-colors group-hover:text-ember-400" />
    </button>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-xs">
      <dt className="text-fg-faint">{k}</dt>
      <dd className="text-right font-medium text-fg">{v}</dd>
    </div>
  )
}

export default function ReportsPage() {
  const { analysis, area, filter, customAoi, areaObservations, filteredObservations, metadata, setSelectedDate } = useFireData()
  const rangeDays = useRangeDays()
  const navigate = useNavigate()

  const rangeObs = useMemo(
    () => areaObservations.filter((o) => o.acqDate >= filter.startDate && o.acqDate <= filter.endDate),
    [areaObservations, filter.startDate, filter.endDate],
  )

  const anomalies = useMemo(
    () =>
      rangeDays
        .filter((d) => d.anomaly !== 'none')
        .sort((a, b) => b.bai - a.bai)
        .slice(0, 12),
    [rangeDays],
  )

  if (!analysis) {
    return <EmptyState icon={FileBarChart} title="Nothing to export" description="The current area of interest contains no detections." />
  }

  const slug = `${area.id}_${filter.startDate}_${filter.endDate}`
  const summaryInput = () => ({
    analysis,
    areaName: customAoi ? `${area.name} — ${customAoi.name}` : area.name,
    start: filter.startDate,
    end: filter.endDate,
    outlook: buildOutlook(analysis, filter.endDate),
    isDemo: metadata.isSynthetic,
  })

  const items: ExportItem[] = [
    {
      icon: FileSpreadsheet,
      title: 'Daily BAI table',
      format: 'CSV',
      description: `${fmtNum(rangeDays.length)} days: BAI, class, harmonized values with uncertainty, per-sensor counts, FRP, data source, quality and climatology thresholds.`,
      run: () => exportDailyBaiCsv(rangeDays, area.name, `pyrolens_daily_bai_${slug}.csv`),
    },
    {
      icon: Shapes,
      title: 'Fire clusters',
      format: 'GeoJSON',
      description: 'Spatio-temporal fire events as convex-hull polygons with start/end, duration, detections, FRP and sensors.',
      run: () => exportFireEventsGeoJson(clusterFireEvents(rangeObs), `pyrolens_fire_clusters_${slug}.geojson`),
    },
    {
      icon: FileText,
      title: 'Filtered raw hotspots',
      format: 'CSV',
      description: `${fmtNum(filteredObservations.length)} detections matching the area, AOI and dates, with satellite, confidence, FRP and day/night.`,
      run: () => exportObservationsCsv(filteredObservations, `pyrolens_hotspots_${slug}.csv`),
    },
    {
      icon: Braces,
      title: 'Raw hotspots',
      format: 'GeoJSON',
      description: 'Point features for GIS tools (first 15,000 detections).',
      run: () => exportObservationsGeoJson(filteredObservations, `pyrolens_hotspots_${slug}.geojson`),
    },
    {
      icon: ImageDown,
      title: 'Calendar image',
      format: 'PNG',
      description: 'The burning activity calendar shown below, at screen resolution.',
      run: () => downloadCanvasPng(CANVAS_ID, `pyrolens_calendar_${slug}.png`),
    },
    {
      icon: Printer,
      title: 'Printable report',
      format: 'PDF',
      description: 'Opens a one-page report with outlook, calendar, seasons and harmonization factors. Use “Save as PDF” in the print dialog.',
      run: () => openPrintableReport(summaryInput(), CANVAS_ID),
    },
    {
      icon: Sigma,
      title: 'Summary statistics',
      format: 'Markdown',
      description: 'Headline numbers, days by class, season norms, outlook, critical periods and limitations.',
      run: () => exportSummaryMarkdown(summaryInput(), `pyrolens_summary_${slug}.md`),
    },
    {
      icon: FileSpreadsheet,
      title: 'Harmonization factors',
      format: 'CSV',
      description: 'Monthly VIIRS:MODIS factors r(m) with IQR, FRP and cluster ratios and overlap-year counts.',
      run: () => exportHarmonizationCsv(analysis, `pyrolens_harmonization_${area.id}.csv`),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reports & export"
        title="Take the results with you"
        description="Every export uses the study area, custom AOI and date range selected in the header."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Export scope" />
          <dl className="divide-y divide-line">
            <Row k="Area" v={area.name} />
            <Row k="Custom AOI" v={customAoi ? customAoi.name : 'None'} />
            <Row k="Dates" v={`${fmtDate(filter.startDate)} – ${fmtDate(filter.endDate)}`} />
            <Row k="Days" v={fmtNum(rangeDays.length)} />
            <Row k="Detections (QC input)" v={fmtNum(rangeObs.length)} />
            <Row k="Low-confidence removed" v={fmtNum(analysis.totals.lowConfidenceRemoved)} />
            <Row k="Duplicates removed" v={fmtNum(analysis.totals.duplicatesRemoved)} />
            <Row
              k="Data"
              v={<Badge tone={metadata.isSynthetic ? 'ember' : 'signal'}>{metadata.isSynthetic ? 'Demo (synthetic)' : 'NASA FIRMS'}</Badge>}
            />
          </dl>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          {items.map((item) => (
            <ExportCard key={item.title} item={item} />
          ))}
        </div>
      </div>

      <Card>
        <CardHeader title="Calendar preview" description="This is the image used for the PNG and the printable report." action={<ActivityLegend compact showGaps={false} />} />
        <CalendarHeatmap
          analysis={analysis}
          resolution="week"
          startDate={filter.startDate}
          endDate={filter.endDate}
          rowHeight={14}
          canvasId={CANVAS_ID}
          onSelect={(d) => {
            setSelectedDate(d)
            navigate('/calendar')
          }}
        />
      </Card>

      <Card padding="none">
        <div className="p-5 pb-3">
          <CardHeader
            className="mb-0"
            title="Strongest anomalies in range"
            description="The most intense days that were also above the 90th percentile for their time of year."
          />
        </div>
        {anomalies.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-fg-muted">No anomalous days in the selected range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-xs">
              <thead className="border-y border-line bg-ink-900 text-[11px] uppercase tracking-wider text-fg-faint">
                <tr>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 text-right font-medium">BAI</th>
                  <th className="px-3 py-2 text-right font-medium">Normal (p50–p90)</th>
                  <th className="px-3 py-2 text-right font-medium">Harmonized det.</th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {anomalies.map((d) => (
                  <tr key={d.date} className="hover:bg-ink-800">
                    <td className="px-5 py-2.5 font-medium text-fg">{fmtDate(d.date)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-fg">
                        <span className="size-2.5 rounded-sm" style={{ background: ACTIVITY_COLORS[d.cls] }} />
                        {CLASS_LABEL[d.cls]}
                        {d.anomaly === 'extreme' && <span className="rounded bg-red-500/15 px-1 text-[10px] font-semibold text-red-300">p97+</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-fg">{d.bai.toFixed(0)}</td>
                    <td className="px-3 py-2.5 text-right tabular text-fg-muted">
                      {d.climP50.toFixed(0)}–{d.climP90.toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-fg-muted">{d.harmonizedCount.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-fg-faint">{SOURCE_SHORT[d.source]}</td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(d.date)
                          navigate('/calendar')
                        }}
                        className="text-signal-400 hover:underline"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
