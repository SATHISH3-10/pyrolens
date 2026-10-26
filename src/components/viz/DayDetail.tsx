import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CloudOff, Map as MapIcon } from 'lucide-react'
import { CircleMarker, MapContainer, TileLayer, Tooltip as LTooltip } from 'react-leaflet'
import type { ActivityAnalysis } from '@/types/activity'
import type { FireObservation } from '@/types/fire'
import { addDays, CLASS_LABEL, explainDay, isLowConfidence } from '@/utils/burningActivity'
import { Button, Card } from '@/components/ui'
import { cn, fmtDate, fmtNum } from '@/lib'
import { BASEMAPS } from '@/components/map/basemaps'
import { ACTIVITY_COLORS, SENSOR_COLORS, SOURCE_LABEL } from './activityScale'

interface DayDetailProps {
  analysis: ActivityAnalysis
  date: string
  observations: readonly FireObservation[]
  onChangeDate: (date: string) => void
  className?: string
}

function confidenceBucket(o: FireObservation): 'low' | 'nominal' | 'high' {
  if (typeof o.confidence === 'number') return o.confidence < 30 ? 'low' : o.confidence < 80 ? 'nominal' : 'high'
  const s = String(o.confidence).toLowerCase()
  return s.startsWith('l') ? 'low' : s.startsWith('h') ? 'high' : 'nominal'
}

export function DayDetail({ analysis, date, observations, onChangeDate, className }: DayDetailProps) {
  const navigate = useNavigate()
  const idx = analysis.dayIndex.get(date)
  const day = idx !== undefined ? analysis.days[idx] : undefined

  const dayObs = useMemo(() => observations.filter((o) => o.acqDate === date), [observations, date])

  const detail = useMemo(() => {
    const conf = { low: 0, nominal: 0, high: 0 }
    const passes = new Map<string, number>()
    let frpSum = 0
    let frpN = 0
    let lat = 0
    let lng = 0
    for (const o of dayObs) {
      conf[confidenceBucket(o)]++
      const key = `${o.satellite} · ${o.daynight === 'D' ? 'day' : 'night'}`
      passes.set(key, (passes.get(key) ?? 0) + 1)
      if (o.frp !== null && !isLowConfidence(o)) {
        frpSum += o.frp
        frpN++
      }
      lat += o.latitude
      lng += o.longitude
    }
    const center: [number, number] | null = dayObs.length ? [lat / dayObs.length, lng / dayObs.length] : null
    return { conf, passes: [...passes.entries()].sort((a, b) => b[1] - a[1]), frpSum, frpMean: frpN ? frpSum / frpN : null, center }
  }, [dayObs])

  if (!day) return null
  const explanation = explainDay(day, analysis)
  const total = day.modisCount + day.viirsCount
  const confTotal = detail.conf.low + detail.conf.nominal + detail.conf.high
  const canPrev = date > analysis.firstDate
  const canNext = date < analysis.lastDate
  const limitedEmpty = day.cls === 'none' && day.quality === 'limited'

  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="day-detail-title">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" aria-label="Previous day" disabled={!canPrev} onClick={() => onChangeDate(addDays(date, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <h2 id="day-detail-title" className="text-sm font-semibold text-fg">
            {new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
          </h2>
          <p className="text-xs text-fg-muted">{fmtDate(date)}</p>
        </div>
        <Button variant="ghost" size="sm" aria-label="Next day" disabled={!canNext} onClick={() => onChangeDate(addDays(date, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-xl border border-line bg-ink-900 p-3.5">
        <div
          className={cn('flex size-14 shrink-0 flex-col items-center justify-center rounded-xl', limitedEmpty && 'hatch-limited')}
          style={{ background: limitedEmpty ? undefined : ACTIVITY_COLORS[day.cls] }}
        >
          {limitedEmpty ? (
            <CloudOff className="size-5 text-fg" aria-hidden="true" />
          ) : (
            <span className={cn('text-lg font-bold tabular', day.cls === 'moderate' || day.cls === 'high' ? 'text-ink-950' : 'text-white')}>
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
            {day.anomaly !== 'none' && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
                {day.anomaly === 'extreme' ? 'Extreme anomaly' : 'Above normal'}
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

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-xs">
        {[
          ['Hotspots (QC)', fmtNum(total)],
          ['Harmonized', `${day.harmonizedCount.toFixed(1)} /sat`],
          ['Total FRP', `${fmtNum(day.modisFrp + day.viirsFrp)} MW`],
          ['Mean / max FRP', `${detail.frpMean !== null ? detail.frpMean.toFixed(1) : '—'} / ${day.maxFrp !== null ? day.maxFrp.toFixed(0) : '—'} MW`],
          ['Fire clusters', `${day.modisClusters} M · ${day.viirsClusters} V`],
          ['Day / night', `${day.dayDetections} / ${day.nightDetections}`],
          ['Low-conf. removed', fmtNum(day.lowConfidenceRemoved)],
          ['Observation quality', `${Math.round(day.qualityScore * 100)}%`],
        ].map(([k, v]) => (
          <div key={k} className="bg-ink-850 px-3 py-2">
            <dt className="text-[11px] text-fg-faint">{k}</dt>
            <dd className="mt-0.5 font-medium text-fg tabular">{v}</dd>
          </div>
        ))}
      </dl>

      {total > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] text-fg-faint">
            <span>Sensor contribution</span>
            <span>
              <span style={{ color: SENSOR_COLORS.MODIS }}>MODIS {day.modisCount}</span> ·{' '}
              <span style={{ color: SENSOR_COLORS.VIIRS }}>VIIRS {day.viirsCount}</span>
            </span>
          </div>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            <div style={{ flex: day.modisCount, background: SENSOR_COLORS.MODIS }} />
            <div style={{ flex: day.viirsCount, background: SENSOR_COLORS.VIIRS }} />
          </div>
          {confTotal > 0 && (
            <>
              <div className="mb-1.5 mt-3 flex justify-between text-[11px] text-fg-faint">
                <span>Detection confidence</span>
                <span>
                  {detail.conf.high} high · {detail.conf.nominal} nominal · {detail.conf.low} low
                </span>
              </div>
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                <div style={{ flex: detail.conf.high, background: '#a1a9b6' }} />
                <div style={{ flex: detail.conf.nominal, background: '#5b6472' }} />
                <div style={{ flex: detail.conf.low, background: '#323944' }} />
              </div>
            </>
          )}
          {detail.passes.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[11px] text-fg-faint">Satellite passes with detections</div>
              <div className="flex flex-wrap gap-1">
                {detail.passes.map(([k, n]) => (
                  <span key={k} className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-fg-muted">
                    {k} <span className="text-fg tabular">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {detail.center && (
        <div className="mt-4 h-44 overflow-hidden rounded-xl border border-line">
          <MapContainer
            key={date}
            center={detail.center}
            zoom={7}
            preferCanvas
            zoomControl={false}
            attributionControl={false}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url={BASEMAPS.dark.url} />
            <TileLayer url={BASEMAPS.dark.labels!} />
            {dayObs.slice(0, 1500).map((o) => (
              <CircleMarker
                key={o.id}
                center={[o.latitude, o.longitude]}
                radius={o.instrument === 'MODIS' ? 4 : 3}
                pathOptions={{
                  color: o.instrument === 'MODIS' ? SENSOR_COLORS.MODIS : SENSOR_COLORS.VIIRS,
                  weight: 1,
                  fillOpacity: 0.8,
                }}
              >
                <LTooltip className="pl-tooltip">
                  {o.satellite} · {o.frp ?? '—'} MW
                </LTooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}

      <Button variant="secondary" className="mt-4" onClick={() => navigate('/map', { state: { focusDate: date } })}>
        <MapIcon className="size-4" aria-hidden="true" /> Open this day on the map
      </Button>
    </Card>
  )
}
