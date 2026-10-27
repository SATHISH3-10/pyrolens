import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Flame, Map as MapIcon, TrendingUp } from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Stat } from '@/components/ui'
import { BurningCalendar } from '@/components/calendar/BurningCalendar'
import { OutlookCard } from '@/components/viz/OutlookCard'
import { ShortRecordNotice } from '@/components/viz/ShortRecordNotice'
import { SeasonTimeline } from '@/components/viz/SeasonTimeline'
import {
  AnnualActivityChart,
  AnnualLegend,
  SeasonalLegend,
  SeasonalPatternChart,
} from '@/components/viz/SeasonalCharts'
import { ACTIVITY_COLORS, SENSOR_COLORS } from '@/components/viz/activityScale'
import { CLASS_LABEL } from '@/utils/burningActivity'
import { useRangeDays } from '@/hooks/useRangeDays'
import { cn, fmtCompact, fmtDate, fmtNum } from '@/lib'

const FLAG_STYLE: Record<string, string> = {
  early: 'bg-sky-400/10 text-sky-300',
  late: 'bg-violet-400/10 text-violet-300',
  intense: 'bg-red-500/15 text-red-300',
  prolonged: 'bg-orange-400/15 text-orange-300',
  weak: 'bg-ink-600 text-fg-muted',
}

export default function DashboardPage() {
  const { analysis, area, filter, setFilter, selectedDate, setSelectedDate, isPlaying } = useFireData()
  const navigate = useNavigate()
  const rangeDays = useRangeDays()

  const stats = useMemo(() => {
    let active = 0
    let covered = 0
    let harmonized = 0
    let modis = 0
    let viirs = 0
    let anomalous = 0
    let peak = rangeDays[0]
    for (const d of rangeDays) {
      if (d.source === 'none') continue
      covered++
      if (d.harmonizedCount > 0) active++
      harmonized += d.harmonizedCount
      modis += d.modisCount
      viirs += d.viirsCount
      if (d.anomaly !== 'none') anomalous++
      if (!peak || d.bai > peak.bai) peak = d
    }
    return { active, covered, harmonized, modis, viirs, anomalous, peak }
  }, [rangeDays])

  const periodsInRange = useMemo(
    () =>
      (analysis?.criticalPeriods ?? []).filter((p) => p.end >= filter.startDate && p.start <= filter.endDate),
    [analysis, filter.startDate, filter.endDate],
  )

  if (!analysis) {
    return (
      <EmptyState
        icon={Flame}
        title="No detections in this area"
        description="The current area of interest contains no hotspot detections. Choose another study area, clear the custom AOI, or load NASA FIRMS data."
      />
    )
  }

  const selectYear = Number(filter.endDate.slice(0, 4))
  const openDay = (date: string) => {
    setSelectedDate(date)
    navigate('/calendar')
  }
  const topPeriods = [...periodsInRange].sort((a, b) => b.peakBai * b.days - a.peakBai * a.days).slice(0, 6)
  const unusualSeasons = analysis.seasons
    .filter((s) => s.flags.length > 0 && s.rangeEnd >= filter.startDate && s.rangeStart <= filter.endDate)
    .slice(-8)
    .reverse()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Harmonized burning activity"
        title={area.name}
        description={
          <>
            {area.preset?.shortDescription ?? 'Imported NASA FIRMS detections.'} MODIS and VIIRS combined into one
            comparable Burning Activity Index (BAI), {fmtDate(analysis.firstDate)} – {fmtDate(analysis.lastDate)}.
          </>
        }
        actions={
          <>
            <LinkButton to="/map" variant="secondary">
              <MapIcon className="size-4" aria-hidden="true" /> Open map
            </LinkButton>
            <LinkButton to="/calendar" variant="primary">
              <CalendarDays className="size-4" aria-hidden="true" /> Burning calendar
            </LinkButton>
          </>
        }
      />

      <ShortRecordNotice analysis={analysis} />

      <div className="grid gap-5 lg:grid-cols-12">
        <OutlookCard analysis={analysis} referenceDate={filter.endDate} className="lg:col-span-5 xl:col-span-4" />

        <div className="flex flex-col gap-5 lg:col-span-7 xl:col-span-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat
              label="Active fire days"
              value={fmtNum(stats.active)}
              hint={`of ${fmtNum(stats.covered)} observed days (${stats.covered ? Math.round((100 * stats.active) / stats.covered) : 0}%)`}
              info="Days with at least one quality-controlled hotspot in the selected range."
            />
            <Stat
              label="Harmonized detections"
              value={fmtCompact(stats.harmonized)}
              accent={SENSOR_COLORS.harmonized}
              hint="VIIRS-equivalent, per satellite"
              info="Detections expressed on the VIIRS scale and normalized per satellite, so years with different numbers of satellites and sensors are comparable."
            />
            <Stat
              label="Raw detections"
              value={fmtCompact(stats.modis + stats.viirs)}
              hint={
                <span>
                  <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="size-2 rounded-full" style={{ background: SENSOR_COLORS.MODIS }} />MODIS {fmtCompact(stats.modis)}</span>
                  {' · '}
                  <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="size-2 rounded-full" style={{ background: SENSOR_COLORS.VIIRS }} />VIIRS {fmtCompact(stats.viirs)}</span>
                </span>
              }
              info="Raw hotspot counts are shown for reference only — they cannot be added or compared across sensors."
            />
            <Stat
              label="Critical periods"
              value={fmtNum(periodsInRange.length)}
              hint={`${fmtNum(periodsInRange.reduce((s, p) => s + p.days, 0))} days at High or above`}
              info="Runs of 3 or more consecutive days classed High, Very high or Extreme."
            />
            <Stat
              label="Anomalous days"
              value={fmtNum(stats.anomalous)}
              hint="above 90th pct for the date"
              info="Days whose BAI exceeded the 90th percentile of the historical record for the same ±7-day window of the year."
            />
            <Stat
              label="Peak day"
              value={stats.peak ? fmtDate(stats.peak.date) : '—'}
              hint={
                stats.peak ? (
                  <span>
                    BAI {stats.peak.bai.toFixed(0)} ·{' '}
                    <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="size-2 rounded-full" style={{ background: ACTIVITY_COLORS[stats.peak.cls] }} />{CLASS_LABEL[stats.peak.cls]}</span>
                  </span>
                ) : undefined
              }
            />
          </div>

          <Card className="flex-1">
            <CardHeader
              title="Typical fire season"
              description="Season start, peak and end are the dates by which 10%, the 7-day maximum and 90% of a fire-year's harmonized activity occur (median across years)."
            />
            <SeasonTimeline analysis={analysis} />
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Burning Activity Calendar"
          description="Each row is a year (oldest at top) and each cell a week, coloured by its BAI class. The bar at the right is the year's harmonized total. Click a week to open it in the full calendar."
          info="Centre dots mark MODIS-scaled (pre-VIIRS) estimates; hatched cells have no satellite coverage; dashed cells are outside the loaded record."
        />
        <BurningCalendar
          analysis={analysis}
          startDate={filter.startDate}
          endDate={filter.endDate}
          view="multi"
          sensorView="harmonized"
          smartFilter="none"
          showSeasons={false}
          selectedDate={selectedDate}
          onSelect={openDay}
          isPlaying={isPlaying}
          compact
          showLegend={false}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Seasonal pattern"
            description={`Monthly mean BAI in ${selectYear} against the historical normal.`}
            action={<SeasonalLegend year={selectYear} />}
          />
          <SeasonalPatternChart analysis={analysis} year={selectYear} />
        </Card>
        <Card>
          <CardHeader
            title="Annual harmonized activity"
            description="One continuous record across the sensor change. Click a year to focus on it."
            action={<AnnualLegend />}
          />
          <AnnualActivityChart
            analysis={analysis}
            highlightYear={filter.startDate.slice(0, 4) === filter.endDate.slice(0, 4) ? selectYear : undefined}
            onSelectYear={(y) =>
              setFilter({
                startDate: `${y}-01-01` < analysis.firstDate ? analysis.firstDate : `${y}-01-01`,
                endDate: `${y}-12-31` > analysis.lastDate ? analysis.lastDate : `${y}-12-31`,
              })
            }
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card padding="none">
          <div className="p-5 pb-3">
            <CardHeader
              className="mb-0"
              title="Most severe critical periods"
              description="Consecutive High-or-above days in the selected range, ranked by peak × duration."
            />
          </div>
          {topPeriods.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-muted">No critical periods in the selected range.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {topPeriods.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => openDay(p.peakDate)}
                    className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-ink-800"
                  >
                    <AlertTriangle className="size-4 shrink-0 text-orange-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-fg">
                        {fmtDate(p.start)} → {fmtDate(p.end)}
                      </div>
                      <div className="text-xs text-fg-faint">
                        {p.days} days · peak {fmtDate(p.peakDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-fg tabular">{p.peakBai.toFixed(0)}</div>
                      <div className="text-[11px] text-fg-faint">peak BAI</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="none">
          <div className="p-5 pb-3">
            <CardHeader
              className="mb-0"
              title="Unusual fire seasons"
              description="Fire-years that started early, ended late, were unusually intense, prolonged or weak versus the median season."
            />
          </div>
          {unusualSeasons.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-muted">No unusual seasons in the selected range.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {unusualSeasons.map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onClick={() => openDay(s.peak)}
                    className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-ink-800"
                  >
                    <TrendingUp className="size-4 shrink-0 text-fg-faint" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-fg">Fire year {s.label}</div>
                      <div className="text-xs text-fg-faint">
                        {fmtDate(s.start)} → {fmtDate(s.end)} · {s.durationDays} days
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {s.flags.map((f) => (
                        <span key={f} className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize', FLAG_STYLE[f])}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <LimitationsStrip />
    </div>
  )
}

function LimitationsStrip() {
  const items = [
    ['Thermal anomalies, not fires', 'Hotspots mark hot pixels. Crop-residue, prescribed and industrial burns appear too.'],
    ['Zero ≠ no fire', 'Clouds, smoke and overpass timing hide fires. Hatched cells flag suspicious gaps.'],
    ['Pre-2012 is modelled', 'MODIS-only years are scaled to VIIRS with monthly factors and carry wider uncertainty.'],
    ['Indicator, not a forecast', 'The outlook highlights unusual activity; it cannot predict individual wildfires.'],
  ]
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-ink-900 p-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([t, d]) => (
        <div key={t}>
          <div className="text-xs font-semibold text-fg-muted">{t}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-faint">{d}</p>
        </div>
      ))}
    </div>
  )
}
