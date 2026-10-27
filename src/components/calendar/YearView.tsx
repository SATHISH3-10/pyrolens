import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActivityAnalysis } from '@/types/activity'
import { useTheme } from '@/context/ThemeContext'
import { aggregatePeriods, CLASS_LABEL } from '@/utils/burningActivity'
import { yearGrid, type SensorView } from '@/utils/calendarLayout'
import { ACTIVITY_COLORS } from '@/components/viz/activityScale'
import { cn, fmtCompact, monthName } from '@/lib'
import { paintCell, setupCanvas } from './cellPainter'
import { CellTooltip, type HoverInfo } from './CellTooltip'
import type { CalendarModel } from './useCalendarModel'

const LEFT = 30
const TOP = 18
const GAP = 3
const WEEKDAYS: Array<[number, string]> = [
  [0, 'Mon'],
  [2, 'Wed'],
  [4, 'Fri'],
]
const FLAG_STYLE: Record<string, string> = {
  early: 'bg-sky-400/10 text-sky-300',
  late: 'bg-violet-400/10 text-violet-300',
  intense: 'bg-red-500/15 text-red-300',
  prolonged: 'bg-orange-400/15 text-orange-300',
  weak: 'bg-ink-600 text-fg-muted',
}

interface YearViewProps {
  analysis: ActivityAnalysis
  year: number
  model: CalendarModel
  sensorView: SensorView
  selectedDate: string | null
  isPlaying: boolean
  showSeasons: boolean
  onSelect: (date: string) => void
  canvasId?: string
  showHeader?: boolean
}

/** One GitHub-contribution-style year: 53–54 Monday-first week columns × 7 weekday rows, plus a month strip. */
export function YearView({ analysis, year, model, sensorView, selectedDate, isPlaying, showSeasons, onSelect, canvasId, showHeader }: YearViewProps) {
  const { tokens } = useTheme()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const grid = useMemo(() => yearGrid(year), [year])
  const byPos = useMemo(() => new Map(grid.cells.map((c) => [`${c.col}-${c.row}`, c.date])), [grid])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setWidth(Math.floor(e[0]!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const size = width > 0 ? Math.max(8, Math.min(20, Math.floor((width - LEFT) / grid.columns) - GAP)) : 14
  const pitch = size + GAP
  const canvasW = LEFT + grid.columns * pitch
  const canvasH = TOP + 7 * pitch

  const seasonMarks = useMemo(() => {
    const marks = new Map<string, Array<'start' | 'peak' | 'end'>>()
    if (!showSeasons) return marks
    for (const s of analysis.seasons) {
      for (const [k, d] of [['start', s.start], ['peak', s.peak], ['end', s.end]] as const) {
        if (!d.startsWith(String(year))) continue
        marks.set(d, [...(marks.get(d) ?? []), k])
      }
    }
    return marks
  }, [analysis.seasons, showSeasons, year])

  const seasonsInYear = useMemo(
    () => analysis.seasons.filter((s) => s.rangeEnd >= `${year}-01-01` && s.rangeStart <= `${year}-12-31` && s.flags.length > 0),
    [analysis.seasons, year],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return
    const ctx = setupCanvas(canvas, canvasW, canvasH)
    ctx.font = '500 10px Inter, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = tokens.textFaint
    grid.monthStartCols.forEach((col, m) => ctx.fillText(monthName(m + 1), LEFT + col * pitch, TOP / 2))
    for (const [row, label] of WEEKDAYS) ctx.fillText(label, 0, TOP + row * pitch + size / 2)

    for (const c of grid.cells) {
      const idx = analysis.dayIndex.get(c.date)
      const day = idx !== undefined ? analysis.days[idx] : undefined
      const x = LEFT + c.col * pitch
      const y = TOP + c.row * pitch
      paintCell(ctx, tokens, x, y, size, size, model.paint(day))
      const marks = seasonMarks.get(c.date)
      if (marks) {
        ctx.save()
        ctx.strokeStyle = tokens.text
        ctx.fillStyle = tokens.text
        ctx.lineWidth = 2
        if (marks.includes('start')) {
          ctx.beginPath()
          ctx.moveTo(x + 3, y - 1.5)
          ctx.lineTo(x - 1.5, y - 1.5)
          ctx.lineTo(x - 1.5, y + size + 1.5)
          ctx.lineTo(x + 3, y + size + 1.5)
          ctx.stroke()
        }
        if (marks.includes('end')) {
          ctx.beginPath()
          ctx.moveTo(x + size - 3, y - 1.5)
          ctx.lineTo(x + size + 1.5, y - 1.5)
          ctx.lineTo(x + size + 1.5, y + size + 1.5)
          ctx.lineTo(x + size - 3, y + size + 1.5)
          ctx.stroke()
        }
        if (marks.includes('peak')) {
          ctx.beginPath()
          ctx.moveTo(x + size / 2 - 4, y - 6)
          ctx.lineTo(x + size / 2 + 4, y - 6)
          ctx.lineTo(x + size / 2, y - 1)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
      }
    }
  }, [analysis, grid, model, tokens, size, pitch, canvasW, canvasH, width, seasonMarks])

  const selectedCell = selectedDate ? grid.cells.find((c) => c.date === selectedDate) : undefined

  const monthStats = useMemo(() => {
    const periods = aggregatePeriods(analysis, 'month').filter((p) => p.year === year)
    return Array.from({ length: 12 }, (_, m) => {
      const p = periods.find((q) => q.index === m)
      let raw = 0
      if (p && sensorView !== 'harmonized') {
        const i0 = analysis.dayIndex.get(p.start) ?? 0
        const i1 = analysis.dayIndex.get(p.end) ?? i0
        for (let i = i0; i <= i1; i++) raw += sensorView === 'modis' ? analysis.days[i]!.modisCount : analysis.days[i]!.viirsCount
      }
      return { month: m + 1, p, total: sensorView === 'harmonized' ? (p?.totalCount ?? 0) : raw }
    })
  }, [analysis, year, sensorView])

  const hit = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const col = Math.floor((x - LEFT) / pitch)
    const row = Math.floor((y - TOP) / pitch)
    if (x < LEFT || y < TOP || row > 6) return null
    const date = byPos.get(`${col}-${row}`)
    if (!date) return null
    const idx = analysis.dayIndex.get(date)
    return { date, day: idx !== undefined ? analysis.days[idx] : undefined, x, y }
  }

  return (
    <div>
      {showHeader && (
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-fg">{year}</span>
          {showSeasons &&
            seasonsInYear.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
                Fire year {s.label}:
                {s.flags.map((f) => (
                  <span key={f} className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize', FLAG_STYLE[f])}>
                    {f}
                  </span>
                ))}
              </span>
            ))}
        </div>
      )}
      <div ref={wrapRef} className="relative overflow-x-auto">
        <canvas
          ref={canvasRef}
          id={canvasId}
          aria-hidden="true"
          className="block cursor-pointer"
          onMouseMove={(e) => setHover(hit(e.clientX, e.clientY))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const h = hit(e.clientX, e.clientY)
            if (h) onSelect(h.date)
          }}
        />
        {selectedCell && (
          <div
            aria-hidden="true"
            className={cn('pointer-events-none absolute rounded-[5px] border-[2.5px]', isPlaying && 'pulse-ring')}
            style={{
              left: LEFT + selectedCell.col * pitch - 3,
              top: TOP + selectedCell.row * pitch - 3,
              width: size + 6,
              height: size + 6,
              borderColor: 'var(--accent-ring)',
            }}
          />
        )}
        {hover && <CellTooltip info={hover} sensorView={sensorView} history={model.history} containerWidth={width} />}
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-12" style={{ maxWidth: canvasW }}>
        {monthStats.map(({ month, p, total }) => (
          <div key={month} className="rounded-md border border-line px-1.5 py-1 text-center" title={`${monthName(month)} ${year}`}>
            <div className="text-[10px] font-medium text-fg-faint">{monthName(month)}</div>
            {p && p.coveredDays > 0 ? (
              <>
                {sensorView === 'harmonized' && (
                  <div className="mt-0.5 flex items-center justify-center gap-1">
                    <span className="size-2 rounded-sm" style={{ background: ACTIVITY_COLORS[p.cls] }} aria-hidden="true" />
                    <span className="text-[11px] font-semibold tabular text-fg" title={p.cls === 'none' ? 'No detections' : CLASS_LABEL[p.cls]}>
                      {p.meanBai.toFixed(0)}
                    </span>
                  </div>
                )}
                <div className="text-[10px] tabular text-fg-muted">{fmtCompact(total)} det.</div>
              </>
            ) : (
              <div className="mt-0.5 text-[10px] text-fg-faint">{p ? 'no coverage' : 'unknown'}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
