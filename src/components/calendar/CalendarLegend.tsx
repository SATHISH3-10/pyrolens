import { useEffect, useRef } from 'react'
import type { ThemeTokens } from '@/context/ThemeContext'
import { useTheme } from '@/context/ThemeContext'
import { CLASS_THRESHOLDS } from '@/utils/burningActivity'
import { MIN_ANOMALY_HISTORY_YEARS, type SensorView } from '@/utils/calendarLayout'
import { paintCell, setupCanvas, type CellPaint } from './cellPainter'
import type { CalendarModel } from './useCalendarModel'

export interface LegendItem {
  paint: CellPaint
  label: string
  note: string
}

const base: Omit<CellPaint, 'state'> = { fill: null, limited: false, scaled: false, anomaly: 'none', dim: false }

/** Every cell encoding with a one-line explanation (used by the on-page legend and the PNG export). */
export function legendItems(model: CalendarModel, sensorView: SensorView, t: ThemeTokens): { scale: LegendItem[]; marks: LegendItem[] } {
  const scale: LegendItem[] =
    sensorView === 'harmonized'
      ? CLASS_THRESHOLDS.map((c) => ({
          paint: { ...base, state: 'active', fill: t.bai[c.cls] },
          label: c.label,
          note: `BAI ${c.range} percentile of active days`,
        }))
      : model.ramp.map((color, i) => {
          const lo = i === 0 ? 1 : (model.bins[i - 1] ?? 0) + 1
          const hi = model.bins[i]
          return {
            paint: { ...base, state: 'active', fill: color },
            label: hi !== undefined ? (lo === hi ? `${lo}` : `${lo}–${hi}`) : `${lo}+`,
            note: `raw ${sensorView.toUpperCase()} detections per day`,
          }
        })
  const marks: LegendItem[] = [
    { paint: { ...base, state: 'zero' }, label: 'Zero detections', note: 'Covered by satellites, nothing detected (not proof of no fire)' },
    { paint: { ...base, state: 'no_coverage' }, label: 'No coverage', note: 'No satellite in the record covered this date' },
    { paint: { ...base, state: 'unknown' }, label: 'Unknown', note: 'Outside the loaded record' },
    { paint: { ...base, state: 'active', fill: t.bai.moderate, limited: true }, label: 'Limited observation', note: 'Detections dropped sharply: likely cloud or smoke' },
  ]
  if (sensorView === 'harmonized') {
    marks.push(
      { paint: { ...base, state: 'active', fill: t.bai.high, scaled: true }, label: 'MODIS-scaled', note: 'Pre-VIIRS estimate: MODIS × r(m), modelled' },
      { paint: { ...base, state: 'active', fill: t.bai.high, anomaly: 'above_normal' }, label: 'Anomaly', note: '> 90th percentile for this time of year' },
      { paint: { ...base, state: 'active', fill: t.bai.very_high, anomaly: 'extreme' }, label: 'Extreme anomaly', note: '> 97th percentile for this time of year' },
    )
  }
  return { scale, marks }
}

function Swatch({ paint }: { paint: CellPaint }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { tokens } = useTheme()
  useEffect(() => {
    if (!ref.current) return
    const ctx = setupCanvas(ref.current, 16, 16)
    paintCell(ctx, tokens, 0, 0, 16, 16, paint)
  }, [paint, tokens])
  return <canvas ref={ref} aria-hidden="true" className="shrink-0" />
}

export function CalendarLegend({ model, sensorView }: { model: CalendarModel; sensorView: SensorView }) {
  const { tokens } = useTheme()
  const { scale, marks } = legendItems(model, sensorView, tokens)
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">
          {sensorView === 'harmonized' ? 'Burning Activity Index' : `Raw ${sensorView.toUpperCase()} count (not BAI)`}
        </span>
        {scale.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-fg" title={s.note}>
            <Swatch paint={s.paint} />
            {s.label}
          </span>
        ))}
      </div>
      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {marks.map((m) => (
          <li key={m.label} className="flex items-center gap-2">
            <Swatch paint={m.paint} />
            <span>
              <span className="font-medium text-fg">{m.label}</span> <span className="text-fg-muted">— {m.note}</span>
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-4 shrink-0 rounded-[4px] border-[2.5px]" style={{ borderColor: 'var(--accent-ring)' }} />
          <span>
            <span className="font-medium text-fg">Selected day</span> <span className="text-fg-muted">— pulses while the map is playing</span>
          </span>
        </li>
      </ul>
      {sensorView === 'harmonized' && model.noAnomalyHistory && (
        <p className="rounded-lg bg-ink-700 px-3 py-2 text-fg-muted">
          Not enough history to assess anomalies: rings need at least {MIN_ANOMALY_HISTORY_YEARS} covered years for a day of year.
        </p>
      )}
    </div>
  )
}
