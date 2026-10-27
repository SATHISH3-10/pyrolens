import type { DailyActivity } from '@/types/activity'
import { CLASS_LABEL } from '@/utils/burningActivity'
import { dayCellState, displayedAnomaly, rawCount, type SensorView } from '@/utils/calendarLayout'
import { SOURCE_LABEL } from '@/components/viz/activityScale'
import { fmtDate, fmtNum } from '@/lib'

export interface HoverInfo {
  date: string
  day: DailyActivity | undefined
  x: number
  y: number
  /** Optional period label (multi-year weeks). */
  label?: string
  total?: number
}

export function CellTooltip({
  info,
  sensorView,
  history,
  containerWidth,
}: {
  info: HoverInfo
  sensorView: SensorView
  history: readonly number[]
  containerWidth: number
}) {
  const { day } = info
  const state = dayCellState(day, sensorView)
  const left = Math.min(Math.max(4, info.x + 14), Math.max(4, containerWidth - 244))
  const anomaly = day ? displayedAnomaly(day, history) : 'none'
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-30 w-60 rounded-lg border border-line-strong bg-ink-850 px-3 py-2.5 text-xs shadow-xl"
      style={{ left, top: info.y + 16 }}
    >
      <div className="font-semibold text-fg">{info.label ?? fmtDate(info.date)}</div>
      {state === 'unknown' && <div className="mt-1 text-fg-muted">Outside the loaded record — coverage unknown.</div>}
      {state === 'no_coverage' && <div className="mt-1 text-fg-muted">No satellite coverage{sensorView !== 'harmonized' ? ` for ${sensorView.toUpperCase()}` : ''}: activity unknown, not zero.</div>}
      {day && state !== 'unknown' && state !== 'no_coverage' && (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-fg-muted">
          {sensorView === 'harmonized' ? (
            <>
              <dt>BAI</dt>
              <dd className="text-right tabular text-fg">
                {day.bai.toFixed(0)} · {day.cls === 'none' ? 'No detections' : CLASS_LABEL[day.cls]}
              </dd>
              <dt>Harmonized</dt>
              <dd className="text-right tabular text-fg">{info.total !== undefined ? fmtNum(info.total, 1) : day.harmonizedCount.toFixed(1)} det.</dd>
            </>
          ) : (
            <>
              <dt>{sensorView.toUpperCase()} raw</dt>
              <dd className="text-right tabular text-fg">{fmtNum(info.total ?? rawCount(day, sensorView))} detections</dd>
            </>
          )}
          <dt>FRP</dt>
          <dd className="text-right tabular text-fg">{fmtNum(day.modisFrp + day.viirsFrp)} MW</dd>
          <dt>Source</dt>
          <dd className="text-right text-fg">{SOURCE_LABEL[day.source]}</dd>
        </dl>
      )}
      {day && (day.quality === 'limited' || anomaly === 'above_normal' || anomaly === 'extreme' || (anomaly === 'insufficient' && sensorView === 'harmonized')) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {day.quality === 'limited' && <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] font-semibold text-fg">Limited observation</span>}
          {(anomaly === 'above_normal' || anomaly === 'extreme') && sensorView === 'harmonized' && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
              {anomaly === 'extreme' ? 'Extreme anomaly (>97th)' : 'Anomaly (>90th)'}
            </span>
          )}
          {anomaly === 'insufficient' && sensorView === 'harmonized' && (
            <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] text-fg-muted">Not enough history for anomalies</span>
          )}
        </div>
      )}
    </div>
  )
}
