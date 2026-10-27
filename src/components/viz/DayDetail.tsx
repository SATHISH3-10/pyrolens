import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CloudOff, Map as MapIcon, SatelliteDish } from 'lucide-react'
import type { ActivityAnalysis } from '@/types/activity'
import type { FireObservation } from '@/types/fire'
import { addDays, CLASS_LABEL, explainDay, isLowConfidence } from '@/utils/burningActivity'
import { displayedAnomaly, historyYearsByDoy, MIN_ANOMALY_HISTORY_YEARS } from '@/utils/calendarLayout'
import { confidenceLevel, satelliteKey } from '@/utils/mapFilters'
import { Button, Card } from '@/components/ui'
import { MiniMap } from '@/components/map/MiniMap'
import { cn, fmtDate, fmtNum } from '@/lib'
import { ACTIVITY_COLORS, inkOn, SENSOR_COLORS, SOURCE_LABEL } from './activityScale'
import { useTheme } from '@/context/ThemeContext'

interface DayDetailProps {
  analysis: ActivityAnalysis
  date: string
  observations: readonly FireObservation[]
  onChangeDate: (date: string) => void
  className?: string
}

function Section({ title, tone, children }: { title: string; tone: 'observed' | 'estimated'; children: ReactNode }) {
  return (
    <section className={cn('rounded-xl border p-3', tone === 'observed' ? 'border-line bg-ink-900' : 'border-dashed border-line-strong')}>
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', tone === 'observed' ? 'bg-fg-muted' : 'border border-fg-muted')} />
        {title}
      </h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">{children}</dl>
    </section>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="text-fg-faint">{k}</dt>
      <dd className="text-right font-medium text-fg tabular">{v}</dd>
    </>
  )
}

export function DayDetail({ analysis, date, observations, onChangeDate, className }: DayDetailProps) {
  const navigate = useNavigate()
  const { resolved } = useTheme()
  const idx = analysis.dayIndex.get(date)
  const day = idx !== undefined ? analysis.days[idx] : undefined
  const history = useMemo(() => historyYearsByDoy(analysis.days), [analysis])
  const dayObs = useMemo(() => observations.filter((o) => o.acqDate === date), [observations, date])

  const detail = useMemo(() => {
    const conf = { low: 0, nominal: 0, high: 0 }
    const sats = new Map<string, number>()
    let frpN = 0
    let frpSum = 0
    for (const o of dayObs) {
      conf[confidenceLevel(o)]++
      const k = `${satelliteKey(o)} ${o.daynight === 'D' ? 'day' : 'night'}`
      sats.set(k, (sats.get(k) ?? 0) + 1)
      if (o.frp !== null && !isLowConfidence(o)) {
        frpSum += o.frp
        frpN++
      }
    }
    return { conf, sats: [...sats.entries()].sort((a, b) => b[1] - a[1]), frpMean: frpN ? frpSum / frpN : null, hasFrp: frpN > 0 }
  }, [dayObs])

  const canPrev = date > analysis.firstDate
  const canNext = date < analysis.lastDate
  const header = (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="sm" aria-label="Previous day" disabled={!canPrev} onClick={() => onChangeDate(addDays(date, -1))}>
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>
      <div className="text-center">
        <h2 id="day-detail-title" className="text-sm font-semibold text-fg">
          {new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
        </h2>
        <p className="text-xs text-fg-muted">{fmtDate(date)}</p>
      </div>
      <Button variant="ghost" size="sm" aria-label="Next day" disabled={!canNext} onClick={() => onChangeDate(addDays(date, 1))}>
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )

  if (!day || day.source === 'none') {
    return (
      <Card className={cn('flex flex-col', className)} aria-labelledby="day-detail-title">
        {header}
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-ink-900 p-3.5">
          <SatelliteDish className="mt-0.5 size-5 shrink-0 text-fg-muted" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-fg-muted">
            {day
              ? 'No satellite in the loaded record covered this date, so burning activity is unknown — not zero.'
              : 'This date is outside the loaded record; coverage is unknown.'}
          </p>
        </div>
      </Card>
    )
  }

  const anomaly = displayedAnomaly(day, history)
  const insufficient = anomaly === 'insufficient'
  // Anomaly honesty: drop the percentile-comparison sentence when there is too little history to judge.
  const explanation = explainDay(day, analysis)
    .filter((s) => !(insufficient && (s.startsWith('That is above') || s.startsWith('Activity is within') || s.startsWith('Activity is below'))))
    .concat(insufficient ? [`Not enough history to assess anomalies for this time of year (fewer than ${MIN_ANOMALY_HISTORY_YEARS} covered years).`] : [])
  const limitedEmpty = day.cls === 'none' && day.quality === 'limited'
  const scaled = day.source === 'modis_scaled'
  const factor = analysis.model.factors[day.month - 1]!
  const confTotal = detail.conf.low + detail.conf.nominal + detail.conf.high

  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="day-detail-title">
      {header}

      <div className="mt-4 flex items-center gap-4 rounded-xl border border-line bg-ink-900 p-3.5">
        <div
          className={cn('flex size-14 shrink-0 flex-col items-center justify-center rounded-xl', limitedEmpty && 'hatch-limited')}
          style={{ background: limitedEmpty ? undefined : ACTIVITY_COLORS[day.cls] }}
        >
          {limitedEmpty ? (
            <CloudOff className="size-5 text-fg" aria-hidden="true" />
          ) : (
            <span className="text-lg font-bold tabular" style={{ color: inkOn(day.cls, resolved) }}>
              {day.bai.toFixed(0)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-base font-semibold text-fg">{limitedEmpty ? 'Limited observation' : CLASS_LABEL[day.cls]}</div>
          <div className="text-xs text-fg-muted">
            {day.percentile !== null ? `${day.percentile.toFixed(0)}th percentile of active days` : 'Burning Activity Index'}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">{SOURCE_LABEL[day.source]}</span>
            {(anomaly === 'above_normal' || anomaly === 'extreme') && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
                {anomaly === 'extreme' ? 'Extreme anomaly' : 'Above normal'}
              </span>
            )}
            {day.criticalPeriodId !== null && (
              <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">Critical period</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {explanation.map((e) => (
          <p key={e} className="text-xs leading-relaxed text-fg-muted">
            {e}
          </p>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        <Section title="Observed by satellites" tone="observed">
          <Row
            k="MODIS"
            v={
              day.modisSats > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: SENSOR_COLORS.MODIS }} />
                  {fmtNum(day.modisCount)} det. · {day.modisSats} sat.
                </span>
              ) : (
                'not flying'
              )
            }
          />
          <Row
            k="VIIRS"
            v={
              day.viirsSats > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: SENSOR_COLORS.VIIRS }} />
                  {fmtNum(day.viirsCount)} det. · {day.viirsSats} sat.
                </span>
              ) : (
                'not yet launched / no data'
              )
            }
          />
          {detail.hasFrp && <Row k="Total FRP" v={`${fmtNum(day.modisFrp + day.viirsFrp)} MW`} />}
          {detail.hasFrp && (
            <Row k="Mean / max FRP" v={`${detail.frpMean !== null ? detail.frpMean.toFixed(1) : '—'} / ${day.maxFrp !== null ? day.maxFrp.toFixed(0) : '—'} MW`} />
          )}
          <Row k="Fire clusters" v={`${day.modisClusters} MODIS · ${day.viirsClusters} VIIRS`} />
          <Row k="Day / night" v={`${day.dayDetections} / ${day.nightDetections}`} />
          {confTotal > 0 && <Row k="Confidence" v={`${detail.conf.high} high · ${detail.conf.nominal} nom. · ${detail.conf.low} low`} />}
          {day.lowConfidenceRemoved > 0 && <Row k="Low-conf. removed" v={fmtNum(day.lowConfidenceRemoved)} />}
          <Row k="Quality" v={day.quality === 'limited' ? 'Limited observation' : `Good (${Math.round(day.qualityScore * 100)}%)`} />
          {detail.sats.length > 0 && (
            <div className="col-span-2 mt-1 flex flex-wrap gap-1">
              {detail.sats.map(([k, n]) => (
                <span key={k} className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-fg-muted">
                  {k} <span className="tabular text-fg">{n}</span>
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section title={scaled ? 'Estimated (modelled from MODIS)' : 'Derived'} tone="estimated">
          <Row
            k="Harmonized"
            v={
              scaled
                ? `${day.harmonizedCount.toFixed(1)} (${day.harmonizedCountLow.toFixed(1)}–${day.harmonizedCountHigh.toFixed(1)}) /sat`
                : `${day.harmonizedCount.toFixed(1)} /sat`
            }
          />
          <Row k="BAI" v={`${day.bai.toFixed(0)} · ${day.cls === 'none' ? 'no detections' : CLASS_LABEL[day.cls]}`} />
          {scaled && (
            <Row
              k={`r(${new Date(Date.UTC(2001, day.month - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })})`}
              v={`${factor.countRatio.toFixed(2)} (IQR ${factor.countQ25.toFixed(2)}–${factor.countQ75.toFixed(2)})`}
            />
          )}
          {!insufficient && <Row k="Normal for date" v={`${day.climP50.toFixed(0)}–${day.climP90.toFixed(0)} BAI`} />}
        </Section>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-fg-faint">A hotspot is a satellite-detected thermal anomaly, not necessarily a confirmed wildfire.</p>

      {dayObs.length > 0 && (
        <div className="mt-3 h-44 overflow-hidden rounded-xl border border-line" aria-label={`Map of ${dayObs.length} detections on ${fmtDate(date)}`} role="img">
          <MiniMap points={dayObs} />
        </div>
      )}

      <Button variant="secondary" className="mt-4" onClick={() => navigate({ pathname: '/map', search: window.location.search }, { state: { focusDate: date } })}>
        <MapIcon className="size-4" aria-hidden="true" /> Open on map
      </Button>
    </Card>
  )
}
