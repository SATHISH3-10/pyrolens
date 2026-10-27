import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActivityAnalysis, DailyActivity } from '@/types/activity'
import { useTheme } from '@/context/ThemeContext'
import { doy365 } from '@/utils/burningActivity'
import { MIN_ANOMALY_HISTORY_YEARS, rawBinIndex, rawBins, weekCellState, weeklyCells, type SensorView } from '@/utils/calendarLayout'
import { fmtCompact, fmtDate } from '@/lib'
import { paintCell, setupCanvas, type CellPaint } from './cellPainter'
import { CellTooltip, type HoverInfo } from './CellTooltip'
import type { CalendarModel } from './useCalendarModel'

const LEFT = 44
const RIGHT = 92
const TOP = 18
const GAP = 2
const WEEKS = 52
const MONTH_START_WEEK = [0, 4, 8, 13, 17, 21, 26, 30, 34, 39, 43, 47]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface MultiYearViewProps {
  analysis: ActivityAnalysis
  startDate: string
  endDate: string
  model: CalendarModel
  sensorView: SensorView
  selectedDate: string | null
  isPlaying: boolean
  showSeasons: boolean
  /** Called with the most active day of the clicked week. */
  onOpenWeek: (date: string) => void
  canvasId?: string
  compact?: boolean
}

/** Years (oldest at top) × 52 weekly aggregates, with an annual-total bar at the right of each row. */
export function MultiYearView({
  analysis,
  startDate,
  endDate,
  model,
  sensorView,
  selectedDate,
  isPlaying,
  showSeasons,
  onOpenWeek,
  canvasId,
  compact,
}: MultiYearViewProps) {
  const { tokens } = useTheme()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const years = useMemo(() => {
    const out: number[] = []
    for (let y = Number(startDate.slice(0, 4)); y <= Number(endDate.slice(0, 4)); y++) out.push(y)
    return out
  }, [startDate, endDate])
  const weeks = useMemo(() => weeklyCells(analysis), [analysis])
  const weekRaw = (k: string) => {
    const c = weeks.get(k)
    if (!c) return 0
    return sensorView === 'modis' ? c.modis : sensorView === 'viirs' ? c.viirs : c.totalCount
  }
  const weekBins = useMemo(
    () => (sensorView === 'harmonized' ? [] : rawBins([...weeks.values()].map((c) => (sensorView === 'modis' ? c.modis : c.viirs)))),
    [weeks, sensorView],
  )
  const annual = useMemo(() => {
    const m = new Map<number, number>()
    for (const d of analysis.days) {
      const v = sensorView === 'modis' ? d.modisCount : sensorView === 'viirs' ? d.viirsCount : d.harmonizedCount
      m.set(d.year, (m.get(d.year) ?? 0) + v)
    }
    return m
  }, [analysis, sensorView])
  const maxAnnual = Math.max(1, ...years.map((y) => annual.get(y) ?? 0))

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setWidth(Math.floor(e[0]!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cw = width > 0 ? Math.max(4, (width - LEFT - RIGHT) / WEEKS - GAP) : 10
  const ch = compact ? Math.min(11, Math.max(7, cw)) : Math.min(16, Math.max(9, cw))
  const rowPitch = ch + GAP + (showSeasons ? 3 : 0)
  const canvasW = Math.max(width, LEFT + RIGHT + WEEKS * 6)
  const canvasH = TOP + years.length * rowPitch

  const daysOfWeek = (key: string): DailyActivity[] => {
    const c = weeks.get(key)
    if (!c) return []
    const i0 = analysis.dayIndex.get(c.start) ?? 0
    const i1 = analysis.dayIndex.get(c.end) ?? i0
    return analysis.days.slice(i0, i1 + 1)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return
    const ctx = setupCanvas(canvas, canvasW, canvasH)
    ctx.font = '500 10px Inter, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = tokens.textFaint
    MONTH_START_WEEK.forEach((w, i) => ctx.fillText(MONTHS[i]!, LEFT + w * (cw + GAP), TOP / 2))

    years.forEach((year, r) => {
      const y = TOP + r * rowPitch
      ctx.fillStyle = tokens.textMuted
      ctx.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace'
      ctx.fillText(String(year), 0, y + ch / 2)
      ctx.font = '500 10px Inter, system-ui, sans-serif'

      for (let w = 0; w < WEEKS; w++) {
        const key = `${year}-${w}`
        const c = weeks.get(key)
        const state = weekCellState(c, sensorView)
        const wd = daysOfWeek(key)
        const midDoy = c ? Math.min(365, w * 7 + 4) : 1
        const enoughHistory = (model.history[midDoy - 1] ?? 0) >= MIN_ANOMALY_HISTORY_YEARS
        const p: CellPaint = {
          state,
          fill:
            state !== 'active' || !c
              ? null
              : sensorView === 'harmonized'
                ? c.cls === 'none'
                  ? null
                  : tokens.bai[c.cls]
                : (model.ramp[rawBinIndex(sensorView === 'modis' ? c.modis : c.viirs, weekBins)] ?? null),
          limited: !!c && c.coveredDays > 0 && c.limitedDays > c.coveredDays / 2,
          scaled: sensorView === 'harmonized' && !!c && c.source === 'modis_scaled' && state === 'active',
          anomaly: sensorView === 'harmonized' && c && c.anomalyDays > 0 && enoughHistory ? 'above_normal' : 'none',
          dim: wd.length > 0 ? !wd.some((d) => model.matches(d)) : !model.matches(undefined),
        }
        paintCell(ctx, tokens, LEFT + w * (cw + GAP), y, cw, ch, p)
      }

      // Annual total bar (right margin).
      const total = annual.get(year) ?? 0
      const bx = LEFT + WEEKS * (cw + GAP) + 6
      const bw = (RIGHT - 44) * (total / maxAnnual)
      ctx.fillStyle = sensorView === 'harmonized' ? tokens.sensors.harmonized : tokens.sensors[sensorView === 'modis' ? 'MODIS' : 'VIIRS']
      ctx.fillRect(bx, y + ch * 0.25, Math.max(1, bw), ch * 0.5)
      ctx.fillStyle = tokens.textFaint
      ctx.fillText(fmtCompact(total), bx + (RIGHT - 44) + 4, y + ch / 2)
    })

    if (showSeasons) {
      ctx.strokeStyle = tokens.text
      ctx.fillStyle = tokens.text
      ctx.lineWidth = 1.5
      for (const s of analysis.seasons) {
        const row = years.indexOf(Number(s.start.slice(0, 4)))
        if (row < 0) continue
        // Same day-of-year → week mapping as aggregatePeriods.
        const wk = (d: string) => Math.min(51, Math.floor((doy365(d) - 1) / 7))
        const yLine = TOP + row * rowPitch + ch + 1.5
        const x0 = LEFT + wk(s.start) * (cw + GAP)
        const sameYear = s.end.slice(0, 4) === s.start.slice(0, 4)
        const x1 = sameYear ? LEFT + wk(s.end) * (cw + GAP) + cw : LEFT + WEEKS * (cw + GAP)
        ctx.beginPath()
        ctx.moveTo(x0, yLine)
        ctx.lineTo(x1, yLine)
        ctx.stroke()
        if (s.peak.slice(0, 4) === s.start.slice(0, 4)) {
          ctx.beginPath()
          ctx.arc(LEFT + wk(s.peak) * (cw + GAP) + cw / 2, yLine, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, weeks, years, model, tokens, cw, ch, rowPitch, canvasW, canvasH, width, sensorView, weekBins, annual, maxAnnual, showSeasons])

  const weekOf = (date: string) => {
    for (const [k, c] of weeks) if (c.start <= date && c.end >= date) return { key: k, c }
    return null
  }
  const sel = selectedDate ? weekOf(selectedDate) : null
  const selRow = sel ? years.indexOf(sel.c.year) : -1

  const hit = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const w = Math.floor((x - LEFT) / (cw + GAP))
    const r = Math.floor((y - TOP) / rowPitch)
    const year = years[r]
    if (x < LEFT || y < TOP || w < 0 || w >= WEEKS || year === undefined) return null
    const key = `${year}-${w}`
    const c = weeks.get(key)
    const wd = daysOfWeek(key)
    const best = wd.reduce<DailyActivity | undefined>((b, d) => (!b || d.bai > b.bai ? d : b), undefined)
    return {
      date: c?.start ?? `${year}-01-01`,
      day: best,
      x,
      y,
      label: c ? `Week of ${fmtDate(c.start)}` : `${year}, week ${w + 1}`,
      total: weekRaw(key),
    }
  }

  return (
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
          if (h?.day) onOpenWeek(h.day.date)
        }}
      />
      {sel && selRow >= 0 && (
        <div
          aria-hidden="true"
          className={isPlaying ? 'pulse-ring pointer-events-none absolute rounded-[4px] border-2' : 'pointer-events-none absolute rounded-[4px] border-2'}
          style={{
            left: LEFT + sel.c.index * (cw + GAP) - 2,
            top: TOP + selRow * rowPitch - 2,
            width: cw + 4,
            height: ch + 4,
            borderColor: 'var(--accent-ring)',
          }}
        />
      )}
      {hover && <CellTooltip info={hover} sensorView={sensorView} history={model.history} containerWidth={width} />}
    </div>
  )
}
