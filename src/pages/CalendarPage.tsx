import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ImageDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { Button, Card, CardHeader, EmptyState, PageHeader, Segmented } from '@/components/ui'
import { Popover } from '@/components/ui/Popover'
import { CalendarHeatmap, type CalendarEmphasis, type CalendarResolution } from '@/components/viz/CalendarHeatmap'
import { ActivityLegend } from '@/components/viz/ActivityLegend'
import { ShortRecordNotice } from '@/components/viz/ShortRecordNotice'
import { DayDetail } from '@/components/viz/DayDetail'
import { DailyTimeSeries, DailyTimeSeriesLegend } from '@/components/viz/DailyTimeSeries'
import { SOURCE_LABEL, SOURCE_SHORT } from '@/components/viz/activityScale'
import { DEFAULT_BAI_WEIGHTS } from '@/utils/burningActivity'
import { downloadCanvasPng } from '@/utils/exportActivity'
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
  const { analysis, area, filter, areaObservations, selectedDate, setSelectedDate } = useFireData()
  const [resolution, setResolution] = useState<CalendarResolution>('day')
  const [emphasis, setEmphasis] = useState<CalendarEmphasis>('none')
  const rangeDays = useRangeDays()

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
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Burning Activity Calendar"
        title={`${area.name} · ${filter.startDate.slice(0, 4)}–${filter.endDate.slice(0, 4)}`}
        description="One harmonized record of burning activity. Colours show each period's Burning Activity Index class; hatched cells mark suspicious gaps where clouds, smoke or missed overpasses may hide fires."
        actions={
          <>
            <WeightsControl />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => downloadCanvasPng('calendar-heatmap', `pyrolens_calendar_${area.id}_${resolution}.png`)}
            >
              <ImageDown className="size-3.5" aria-hidden="true" /> Save image
            </Button>
          </>
        }
      />

      <ShortRecordNotice analysis={analysis} />

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              aria-label="Calendar resolution"
              value={resolution}
              onChange={setResolution}
              options={[
                { value: 'day', label: 'Daily' },
                { value: 'week', label: 'Weekly' },
                { value: 'month', label: 'Monthly' },
              ]}
            />
            <Segmented
              aria-label="Highlight"
              value={emphasis}
              onChange={setEmphasis}
              options={[
                { value: 'none', label: 'All activity' },
                { value: 'anomalies', label: 'Anomalies', title: 'Fade everything except days above the 90th percentile for the date' },
                { value: 'critical', label: 'Critical periods', title: 'Fade everything except runs of ≥3 High-or-above days' },
              ]}
            />
          </div>
          <ActivityLegend compact />
        </div>
        <CalendarHeatmap
          analysis={analysis}
          resolution={resolution}
          startDate={filter.startDate}
          endDate={filter.endDate}
          selectedDate={date}
          onSelect={setSelectedDate}
          emphasis={emphasis}
          rowHeight={resolution === 'day' ? 15 : 18}
          canvasId="calendar-heatmap"
        />
        <p className="mt-3 text-[11px] text-fg-faint">
          Row tags: <span className="font-semibold text-[#e8703a]">M→V</span> MODIS scaled to VIIRS (modelled) ·{' '}
          <span className="font-semibold text-[#22b07d]">M+V</span> both sensors observed ·{' '}
          <span className="font-semibold text-[#3987e5]">V</span> VIIRS only. Classes are percentiles of all active days in this area's record.
        </p>
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

        <div className="xl:sticky xl:top-0 xl:col-span-4">
          {date && (
            <DayDetail analysis={analysis} date={date} observations={areaObservations} onChangeDate={setSelectedDate} />
          )}
        </div>
      </div>
    </div>
  )
}
