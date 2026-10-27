import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ImageDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { useTheme } from '@/context/ThemeContext'
import { Button, Card, CardHeader, EmptyState, PageHeader, Segmented } from '@/components/ui'
import { Popover } from '@/components/ui/Popover'
import { BurningCalendar, type CalendarView } from '@/components/calendar/BurningCalendar'
import { ShortRecordNotice } from '@/components/viz/ShortRecordNotice'
import { DayDetail } from '@/components/viz/DayDetail'
import { DailyTimeSeries, DailyTimeSeriesLegend } from '@/components/viz/DailyTimeSeries'
import { SOURCE_LABEL, SOURCE_SHORT } from '@/components/viz/activityScale'
import { DEFAULT_BAI_WEIGHTS } from '@/utils/burningActivity'
import {
  historyYearsByDoy,
  SMART_FILTER_LABELS,
  smartFilterAvailability,
  type SensorView,
  type SmartFilter,
} from '@/utils/calendarLayout'
import { exportCalendarImage } from '@/utils/exportActivity'
import { useRangeDays } from '@/hooks/useRangeDays'
import { cn, fmtDate, fmtNum } from '@/lib'
import type { BaiWeights } from '@/types/activity'

const FLAG_STYLE: Record<string, string> = {
  early: 'bg-sky-400/10 text-sky-300',
  late: 'bg-violet-400/10 text-violet-300',
  intense: 'bg-red-500/15 text-red-300',
  prolonged: 'bg-orange-400/15 text-orange-300',
  weak: 'bg-ink-600 text-fg-muted',
}

function WeightsControl() {
  const { baiWeights, setBaiWeights } = useFireData()
  const [draft, setDraft] = useState<BaiWeights>(baiWeights)
  useEffect(() => setDraft(baiWeights), [baiWeights])
  const sum = draft.count + draft.frp + draft.clusters || 1
  const rows: Array<[keyof BaiWeights, string, string]> = [
    ['count', 'Hotspot count (H)', 'Harmonized detections per satellite'],
    ['frp', 'Fire radiative power (F)', 'Total FRP, log-scaled'],
    ['clusters', 'Fire clusters (C)', 'Distinct fire clusters (~5 km)'],
  ]
  return (
    <Popover
      align="end"
      panelClassName="w-80 p-4"
      trigger={({ toggle, open }) => (
        <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={open}>
          <SlidersHorizontal className="size-3.5" aria-hidden="true" /> Index weights
        </Button>
      )}
    >
      {(close) => (
        <div>
          <div className="text-sm font-semibold text-fg">Burning Activity Index weights</div>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            BAI = w₁·H + w₂·F + w₃·C, each term log-transformed and normalized to the 99th percentile of the record.
          </p>
          <div className="mt-4 space-y-4">
            {rows.map(([key, label, hint]) => (
              <label key={key} className="block">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-fg">{label}</span>
                  <span className="tabular text-fg-muted">{((draft[key] / sum) * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                  className="mt-1.5 w-full"
                />
                <div className="text-[11px] text-fg-faint">{hint}</div>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(DEFAULT_BAI_WEIGHTS)}>
              <RotateCcw className="size-3.5" aria-hidden="true" /> Defaults
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={sum <= 0}
              onClick={() => {
                setBaiWeights(draft)
                close()
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </Popover>
  )
}

export default function CalendarPage() {
  const { analysis, area, filter, areaObservations, selectedDate, setSelectedDate, isPlaying, metadata } = useFireData()
  const [view, setView] = useState<CalendarView>('year')
  const [sensorView, setSensorView] = useState<SensorView>('harmonized')
  const [smartFilter, setSmartFilter] = useState<SmartFilter>('none')
  const [showSeasons, setShowSeasons] = useState(false)
  const [compareYears, setCompareYears] = useState<number[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const detailsRef = useRef<HTMLDivElement>(null)
  const { tokens } = useTheme()
  const rangeDays = useRangeDays()
  const availability = useMemo(() => {
    if (!analysis) return null
    const base = smartFilterAvailability(analysis.days, historyYearsByDoy(analysis.days))
    if (sensorView === 'harmonized') return base
    const why = 'BAI-based highlight: switch the calendar to Harmonized.'
    return { ...base, top_bai: why, extreme: why, anomalies: why, modis_scaled: why }
  }, [analysis, sensorView])
  const openDetails = () => {
    setSheetOpen(true)
    requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      detailsRef.current?.focus({ preventScroll: true })
    })
  }

  // Default to the most active day in range so the detail panel is never empty.
  const peakDate = useMemo(() => {
    let best = rangeDays[0]
    for (const d of rangeDays) if (!best || d.bai > best.bai) best = d
    return best?.date ?? null
  }, [rangeDays])

  useEffect(() => {
    if (!analysis) return
    if (!selectedDate || !analysis.dayIndex.has(selectedDate)) setSelectedDate(peakDate)
  }, [analysis, selectedDate, peakDate, setSelectedDate])

  if (!analysis) {
    return <EmptyState icon={CalendarDays} title="No detections in this area" description="Choose another study area or clear the custom AOI." />
  }

  const date = selectedDate && analysis.dayIndex.has(selectedDate) ? selectedDate : peakDate
  const year = date ? Number(date.slice(0, 4)) : Number(filter.endDate.slice(0, 4))
  const tsStart = `${year}-01-01` < analysis.firstDate ? analysis.firstDate : `${year}-01-01`
  const tsEnd = `${year}-12-31` > analysis.lastDate ? analysis.lastDate : `${year}-12-31`
  const seasons = analysis.seasons.filter((s) => s.rangeEnd >= filter.startDate && s.rangeStart <= filter.endDate)

  return (
    <div className="flex flex-col gap-6 pb-16 xl:pb-0">
      <PageHeader
        eyebrow="Burning Activity Calendar"
        title={`${area.name} · ${filter.startDate.slice(0, 4)}–${filter.endDate.slice(0, 4)}`}
        description="One harmonized record of burning activity. Fill shows each day's Burning Activity Index class; hatching, dashed borders and corner marks show where the satellite record is missing or limited — never as zero."
        actions={
          <>
            <WeightsControl />
            <Button
              variant="secondary"
              size="sm"
              disabled={view === 'month'}
              title={view === 'month' ? 'Switch to Year or Multi-year view to save an image' : 'Save the current view and its legend as PNG'}
              onClick={() =>
                exportCalendarImage({
                  exportId: 'calendar-main',
                  tokens,
                  sensorView,
                  title: `${area.name} · ${view === 'multi' ? `${filter.startDate.slice(0, 4)}–${filter.endDate.slice(0, 4)} weekly` : year}`,
                  subtitle: `${sensorView === 'harmonized' ? 'Burning Activity Index (harmonized MODIS + VIIRS)' : `Raw ${sensorView.toUpperCase()} detections`} · ${metadata.isSynthetic ? 'SYNTHETIC DEMO DATA' : metadata.title}`,
                  fileName: `pyrolens_calendar_${area.id}_${view}_${sensorView}_${tokens.mode}.png`,
                })
              }
            >
              <ImageDown className="size-3.5" aria-hidden="true" /> Save image
            </Button>
          </>
        }
      />

      <ShortRecordNotice analysis={analysis} />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="Calendar view"
            value={view}
            onChange={setView}
            options={[
              { value: 'year', label: 'Year' },
              { value: 'multi', label: 'Multi-year' },
              { value: 'month', label: 'Month' },
            ]}
          />
          <Segmented
            aria-label="Sensor comparison"
            value={sensorView}
            onChange={setSensorView}
            options={[
              { value: 'harmonized', label: 'Harmonized', title: 'Burning Activity Index from harmonized MODIS + VIIRS' },
              { value: 'modis', label: 'MODIS raw', title: 'Raw MODIS detection counts (own scale, not BAI)' },
              { value: 'viirs', label: 'VIIRS raw', title: 'Raw VIIRS detection counts (own scale, not BAI)' },
            ]}
          />
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            Highlight
            <select value={smartFilter} onChange={(e) => setSmartFilter(e.target.value as SmartFilter)} className="field py-1 text-xs">
              {(Object.keys(SMART_FILTER_LABELS) as SmartFilter[]).map((f) => (
                <option key={f} value={f} disabled={!!availability?.[f]} title={availability?.[f] ?? undefined}>
                  {SMART_FILTER_LABELS[f]}
                  {availability?.[f] ? ' (unavailable)' : ''}
                </option>
              ))}
            </select>
          </label>
          {smartFilter !== 'none' && availability?.[smartFilter] === null && (
            <span className="text-[11px] text-fg-faint">Non-matching cells are dimmed, not hidden.</span>
          )}
          {smartFilter !== 'none' && availability?.[smartFilter] && (
            <span className="text-[11px] text-fg-faint">Highlight off: {availability[smartFilter]}</span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={showSeasons}
            onClick={() => setShowSeasons((s) => !s)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${showSeasons ? 'border-ember-500 bg-ember-500/10 text-fg' : 'border-line text-fg-muted hover:text-fg'}`}
          >
            Season overlay
          </button>
          {view === 'year' && (
            <label className="flex items-center gap-1.5 text-xs text-fg-muted">
              Compare
              <select
                value=""
                onChange={(e) => {
                  const y = Number(e.target.value)
                  if (y) setCompareYears((c) => (c.includes(y) ? c : [...c, y].slice(-2)))
                }}
                className="field py-1 text-xs"
                aria-label="Add a year to compare (up to 2 more)"
              >
                <option value="">+ year</option>
                {Array.from(
                  { length: Number(analysis.lastDate.slice(0, 4)) - Number(analysis.firstDate.slice(0, 4)) + 1 },
                  (_, i) => Number(analysis.firstDate.slice(0, 4)) + i,
                )
                  .filter((y) => y !== year)
                  .map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
              </select>
              {compareYears.map((y) => (
                <span key={y} className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-ink-700 py-0.5 pl-2 pr-1 text-[11px] text-fg">
                  {y}
                  <button type="button" aria-label={`Remove ${y} from comparison`} onClick={() => setCompareYears((c) => c.filter((x) => x !== y))} className="rounded-full p-0.5 hover:bg-ink-600">
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </label>
          )}
        </div>
        <BurningCalendar
          analysis={analysis}
          startDate={filter.startDate}
          endDate={filter.endDate}
          view={view}
          onViewChange={setView}
          sensorView={sensorView}
          smartFilter={smartFilter}
          showSeasons={showSeasons}
          compareYears={compareYears}
          selectedDate={date}
          onSelect={setSelectedDate}
          onOpenDetails={openDetails}
          isPlaying={isPlaying}
          exportId="calendar-main"
        />
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="flex flex-col gap-5 xl:col-span-8">
          <Card>
            <CardHeader
              title={`Daily activity in ${year}`}
              description="Daily BAI against the normal range for each date. Click a bar to inspect that day; drag the handles below to zoom."
              action={<DailyTimeSeriesLegend />}
            />
            <DailyTimeSeries analysis={analysis} start={tsStart} end={tsEnd} selectedDate={date} onSelect={setSelectedDate} height={300} />
          </Card>

          <Card padding="none">
            <div className="p-5 pb-3">
              <CardHeader
                className="mb-0"
                title="Fire seasons"
                description="Per fire-year timing and intensity. Start / end = 10% / 90% of the year's harmonized activity; peak = highest 7-day mean."
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] whitespace-nowrap text-left text-xs">
                <thead className="border-y border-line bg-ink-900 text-[11px] uppercase tracking-wider text-fg-faint">
                  <tr>
                    <th className="px-5 py-2 font-medium">Fire year</th>
                    <th className="px-3 py-2 font-medium">Start</th>
                    <th className="px-3 py-2 font-medium">Peak</th>
                    <th className="px-3 py-2 font-medium">End</th>
                    <th className="px-3 py-2 text-right font-medium">Days</th>
                    <th className="px-3 py-2 text-right font-medium">Activity</th>
                    <th className="px-3 py-2 text-right font-medium">Critical days</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-5 py-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...seasons].reverse().map((s) => (
                    <tr
                      key={s.label}
                      onClick={() => setSelectedDate(s.peak)}
                      className={cn('cursor-pointer transition-colors hover:bg-ink-800', date && date >= s.rangeStart && date <= s.rangeEnd && 'bg-ink-800/60')}
                    >
                      <td className="px-5 py-2.5 font-semibold text-fg">
                        {s.label}
                        {!s.complete && <span className="ml-1.5 text-[10px] font-normal text-fg-faint">partial</span>}
                      </td>
                      <td className="px-3 py-2.5 text-fg-muted">{fmtDate(s.start)}</td>
                      <td className="px-3 py-2.5 text-fg">{fmtDate(s.peak)}</td>
                      <td className="px-3 py-2.5 text-fg-muted">{fmtDate(s.end)}</td>
                      <td className="px-3 py-2.5 text-right tabular text-fg-muted">{s.durationDays}</td>
                      <td className="px-3 py-2.5 text-right tabular text-fg">{fmtNum(s.total)}</td>
                      <td className="px-3 py-2.5 text-right tabular text-fg-muted">{s.criticalDays}</td>
                      <td className="px-3 py-2.5 text-fg-faint" title={SOURCE_LABEL[s.source]}>{SOURCE_SHORT[s.source]}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {s.flags.map((f) => (
                            <span key={f} className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize', FLAG_STYLE[f])}>
                              {f}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div ref={detailsRef} tabIndex={-1} className="hidden outline-none xl:sticky xl:top-0 xl:col-span-4 xl:block">
          {date && <DayDetail analysis={analysis} date={date} observations={areaObservations} onChangeDate={setSelectedDate} />}
        </div>
      </div>

      {/* Small screens: the day panel is a bottom sheet. */}
      {date && !sheetOpen && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="panel-float fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-4 py-2 text-[13px] font-semibold text-fg xl:hidden"
        >
          Day details · {fmtDate(date)}
        </button>
      )}
      {date && sheetOpen && (
        <div className="fixed inset-0 z-[1200] xl:hidden" role="dialog" aria-modal="true" aria-label={`Details for ${fmtDate(date)}`}>
          <button type="button" aria-label="Close day details" tabIndex={-1} onClick={() => setSheetOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] animate-fade-in overflow-y-auto rounded-t-2xl border-t border-line-strong bg-ink-950 p-3 pb-6">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close day details" className="rounded-lg p-1.5 text-fg-muted hover:bg-ink-700 hover:text-fg">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <DayDetail analysis={analysis} date={date} observations={areaObservations} onChangeDate={setSelectedDate} />
          </div>
        </div>
      )}
    </div>
  )
}
