import { useMemo } from 'react'
import type { ActivityAnalysis, DailyActivity } from '@/types/activity'
import { useTheme } from '@/context/ThemeContext'
import { CLASS_LABEL } from '@/utils/burningActivity'
import { monthGrid, rawCount, type SensorView } from '@/utils/calendarLayout'
import { toRGBA } from '@/components/map/colorUtils'
import { cn, fmtDate, fmtNum } from '@/lib'
import type { CalendarModel } from './useCalendarModel'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function inkFor(color: string): string {
  const [r, g, b] = toRGBA(color).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return L > 0.22 ? '#111111' : '#ffffff'
}

interface MonthViewProps {
  analysis: ActivityAnalysis
  year: number
  month: number
  model: CalendarModel
  sensorView: SensorView
  selectedDate: string | null
  isPlaying: boolean
  onSelect: (date: string) => void
  onOpenDetails: () => void
}

/** Classic Monday-first month calendar with large, fully labelled cells. */
export function MonthView({ analysis, year, month, model, sensorView, selectedDate, isPlaying, onSelect, onOpenDetails }: MonthViewProps) {
  const { tokens } = useTheme()
  const rows = useMemo(() => monthGrid(year, month), [year, month])
  const dayOf = (date: string): DailyActivity | undefined => {
    const i = analysis.dayIndex.get(date)
    return i !== undefined ? analysis.days[i] : undefined
  }
  const maxFrp = useMemo(() => {
    let m = 0
    for (const r of rows) for (const d of r) if (d) {
      const day = dayOf(d)
      if (day) m = Math.max(m, day.modisFrp + day.viirsFrp)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, analysis])

  return (
    <div role="grid" aria-label={`${new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${year}`}>
      <div role="row" className="grid grid-cols-7 gap-1.5 pb-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} role="columnheader" className="text-center text-[11px] font-medium text-fg-faint">
            {w}
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {rows.map((r, ri) => (
          <div key={ri} role="row" className="grid grid-cols-7 gap-1.5">
            {r.map((date, ci) => {
              if (!date) return <div key={ci} role="gridcell" aria-hidden="true" />
              const day = dayOf(date)
              const p = model.paint(day)
              const bg = p.state === 'active' ? p.fill ?? tokens.zero : p.state === 'zero' ? tokens.zero : 'transparent'
              const ink = p.state === 'active' && p.fill ? inkFor(p.fill) : tokens.text
              const selected = date === selectedDate
              const frp = day ? day.modisFrp + day.viirsFrp : 0
              const count = day ? rawCount(day, sensorView) : 0
              const label = [
                fmtDate(date),
                p.state === 'unknown' ? 'coverage unknown' : p.state === 'no_coverage' ? 'no satellite coverage' : null,
                day && p.state !== 'unknown' && p.state !== 'no_coverage'
                  ? sensorView === 'harmonized'
                    ? `BAI ${day.bai.toFixed(0)}, ${day.cls === 'none' ? 'no detections' : CLASS_LABEL[day.cls]}`
                    : `${fmtNum(count)} ${sensorView.toUpperCase()} detections`
                  : null,
                p.limited ? 'limited observation' : null,
                p.scaled ? 'MODIS scaled estimate' : null,
                p.anomaly === 'extreme' ? 'extreme anomaly' : p.anomaly === 'above_normal' ? 'anomaly' : null,
              ]
                .filter(Boolean)
                .join(', ')
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={label}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onSelect(date)}
                  onDoubleClick={onOpenDetails}
                  className={cn(
                    'relative flex min-h-[4.5rem] flex-col overflow-hidden rounded-lg p-1.5 text-left transition-opacity sm:min-h-[5.5rem] sm:p-2',
                    p.state === 'no_coverage' && 'hatch-nocov border border-line',
                    p.state === 'unknown' && 'border border-dashed',
                    p.dim && 'opacity-20',
                  )}
                  style={{
                    background: p.state === 'no_coverage' ? undefined : bg,
                    color: ink,
                    borderColor: p.state === 'unknown' ? 'var(--bai-unknown)' : undefined,
                    boxShadow:
                      p.anomaly === 'extreme'
                        ? 'inset 0 0 0 1.5px var(--bai-anomaly-ring), inset 0 0 0 4px transparent, inset 0 0 0 5.5px var(--bai-anomaly-ring)'
                        : p.anomaly === 'above_normal'
                          ? 'inset 0 0 0 2px var(--bai-anomaly-ring)'
                          : undefined,
                    outline: selected ? '3px solid var(--accent-ring)' : undefined,
                    outlineOffset: selected ? 2 : undefined,
                  }}
                >
                  {selected && isPlaying && <span aria-hidden="true" className="pulse-ring pointer-events-none absolute inset-0 rounded-lg border-2" style={{ borderColor: 'var(--accent-ring)' }} />}
                  {p.limited && (
                    <span aria-hidden="true" className="absolute right-0 top-0 size-3.5" style={{ background: 'var(--bai-limited)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                  )}
                  <span className="text-[12px] font-semibold tabular">{Number(date.slice(8))}</span>
                  {day && p.state !== 'unknown' && p.state !== 'no_coverage' && (
                    <>
                      {sensorView === 'harmonized' ? (
                        <span className="mt-auto text-[15px] font-bold leading-tight tabular sm:text-lg">{day.bai.toFixed(0)}</span>
                      ) : null}
                      <span className={cn('text-[10px] tabular opacity-90', sensorView !== 'harmonized' && 'mt-auto text-[13px] font-semibold')}>
                        {fmtNum(count, sensorView === 'harmonized' ? 1 : 0)} det.
                      </span>
                      <span className="mt-0.5 hidden flex-wrap gap-0.5 sm:flex">
                        {day.modisCount > 0 && <span className="rounded bg-black/15 px-1 text-[9px] font-bold">M</span>}
                        {day.viirsCount > 0 && <span className="rounded bg-black/15 px-1 text-[9px] font-bold">V</span>}
                        {p.scaled && <span className="rounded bg-black/15 px-1 text-[9px] font-bold">scaled</span>}
                      </span>
                      {maxFrp > 0 && frp > 0 && (
                        <span aria-hidden="true" className="absolute inset-x-1.5 bottom-1 h-[3px] rounded-full bg-black/10">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (frp / maxFrp) * 100)}%`, background: ink, opacity: 0.6 }} />
                        </span>
                      )}
                    </>
                  )}
                  {p.state === 'no_coverage' && <span className="mt-auto text-[10px] text-fg-muted">no coverage</span>}
                  {p.state === 'unknown' && <span className="mt-auto text-[10px] text-fg-faint">unknown</span>}
                  {p.scaled && <span aria-hidden="true" className="absolute left-1/2 top-1.5 size-1.5 -translate-x-1/2 rounded-full" style={{ background: 'var(--bai-scaled-dot)' }} />}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
