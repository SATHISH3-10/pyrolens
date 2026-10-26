import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActivityAnalysis, ActivityClass, DataSource, ObservationQuality } from '@/types/activity'
import { aggregatePeriods, CLASS_LABEL } from '@/utils/burningActivity'
import { cn } from '@/lib'
import { ACTIVITY_COLORS, LIMITED_COLOR, NO_COVERAGE_COLOR, SOURCE_LABEL, SOURCE_SHORT } from './activityScale'

export type CalendarResolution = 'day' | 'week' | 'month'
export type CalendarEmphasis = 'none' | 'anomalies' | 'critical'

interface HeatCell {
  year: number
  col: number
  date: string
  end: string
  bai: number
  cls: ActivityClass
  percentile: number | null
  count: number
  modis: number
  viirs: number
  source: DataSource
  quality: ObservationQuality
  anomaly: boolean
  critical: boolean
  inRange: boolean
}

interface CalendarHeatmapProps {
  analysis: ActivityAnalysis
  resolution: CalendarResolution
  startDate: string
  endDate: string
  selectedDate?: string | null
  onSelect?: (date: string) => void
  rowHeight?: number
  emphasis?: CalendarEmphasis
  className?: string
  canvasId?: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]
const GUTTER_LEFT = 64
const GUTTER_TOP = 20

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function CalendarHeatmap({
  analysis,
  resolution,
  startDate,
  endDate,
  selectedDate,
  onSelect,
  rowHeight = 16,
  emphasis = 'none',
  className,
  canvasId,
}: CalendarHeatmapProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<{ cell: HeatCell; x: number; y: number } | null>(null)

  const columns = resolution === 'day' ? 365 : resolution === 'week' ? 52 : 12
  const minWidth = resolution === 'day' ? GUTTER_LEFT + 365 * 2 : resolution === 'week' ? GUTTER_LEFT + 52 * 9 : 0

  const { cells, years, yearSources } = useMemo(() => {
    const startYear = Number(startDate.slice(0, 4))
    const endYear = Number(endDate.slice(0, 4))
    const ys: number[] = []
    for (let y = endYear; y >= startYear; y--) ys.push(y)
    const map = new Map<string, HeatCell>()
    const srcByYear = new Map<number, Set<DataSource>>()

    if (resolution === 'day') {
      for (const d of analysis.days) {
        if (d.year < startYear || d.year > endYear) continue
        const key = `${d.year}-${d.doy - 1}`
        const prev = map.get(key)
        if (prev && prev.bai >= d.bai) continue
        map.set(key, {
          year: d.year,
          col: d.doy - 1,
          date: d.date,
          end: d.date,
          bai: d.bai,
          cls: d.cls,
          percentile: d.percentile,
          count: d.harmonizedCount,
          modis: d.modisCount,
          viirs: d.viirsCount,
          source: d.source,
          quality: d.quality,
          anomaly: d.anomaly !== 'none',
          critical: d.criticalPeriodId !== null,
          inRange: d.date >= startDate && d.date <= endDate,
        })
        if (d.source !== 'none') {
          const s = srcByYear.get(d.year) ?? new Set()
          s.add(d.source)
          srcByYear.set(d.year, s)
        }
      }
    } else {
      const periods = aggregatePeriods(analysis, resolution)
      for (const p of periods) {
        if (p.year < startYear || p.year > endYear) continue
        let modis = 0
        let viirs = 0
        const i0 = analysis.dayIndex.get(p.start) ?? 0
        const i1 = analysis.dayIndex.get(p.end) ?? i0
        for (let i = i0; i <= i1; i++) {
          modis += analysis.days[i]!.modisCount
          viirs += analysis.days[i]!.viirsCount
          const src = analysis.days[i]!.source
          if (src !== 'none') {
            const s = srcByYear.get(p.year) ?? new Set()
            s.add(src)
            srcByYear.set(p.year, s)
          }
        }
        map.set(`${p.year}-${p.index}`, {
          year: p.year,
          col: p.index,
          date: p.start,
          end: p.end,
          bai: p.meanBai,
          cls: p.cls,
          percentile: p.percentile,
          count: p.totalCount,
          modis,
          viirs,
          source: p.source,
          quality: p.coveredDays === 0 ? 'no_coverage' : p.limitedDays > (p.coveredDays * 0.5) ? 'limited' : 'good',
          anomaly: p.anomalyDays > 0,
          critical: p.criticalDays > 0,
          inRange: p.end >= startDate && p.start <= endDate,
        })
      }
    }
    const yearSources = new Map<number, DataSource>()
    for (const [y, set] of srcByYear) {
      yearSources.set(
        y,
        set.has('modis_scaled')
          ? set.has('combined') || set.has('viirs')
            ? 'combined'
            : 'modis_scaled'
          : set.has('combined')
            ? 'combined'
            : set.has('viirs')
              ? 'viirs'
              : 'modis_unscaled',
      )
    }
    // A year that mixes scaled MODIS and observed VIIRS (sensor transition year).
    for (const [y, set] of srcByYear) {
      if (set.has('modis_scaled') && (set.has('combined') || set.has('viirs'))) yearSources.set(y, 'combined')
    }
    return { cells: map, years: ys, yearSources }
  }, [analysis, resolution, startDate, endDate])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.max(minWidth, Math.floor(entries[0]!.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [minWidth])

  const gap = resolution === 'day' ? 0 : resolution === 'week' ? 2 : 3
  const rowGap = resolution === 'day' ? 2 : 3
  const cellW = width > 0 ? (width - GUTTER_LEFT) / columns : 0
  const height = GUTTER_TOP + years.length * (rowHeight + rowGap)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.font = '500 11px Inter, system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    // Column labels.
    ctx.fillStyle = '#6c7584'
    if (resolution === 'month') {
      ctx.textAlign = 'center'
      MONTHS.forEach((m, i) => ctx.fillText(m, GUTTER_LEFT + (i + 0.5) * cellW, GUTTER_TOP / 2))
    } else {
      ctx.textAlign = 'left'
      MONTHS.forEach((m, i) => {
        const col = resolution === 'day' ? MONTH_START_DOY[i]! - 1 : Math.floor((MONTH_START_DOY[i]! - 1) / 7)
        const x = GUTTER_LEFT + col * cellW
        ctx.fillText(m, x + 2, GUTTER_TOP / 2)
        if (i > 0) {
          ctx.fillStyle = '#20252e'
          ctx.fillRect(x - 0.5, GUTTER_TOP - 4, 1, 4)
          ctx.fillStyle = '#6c7584'
        }
      })
    }

    years.forEach((year, r) => {
      const y = GUTTER_TOP + r * (rowHeight + rowGap)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#a1a9b6'
      ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace'
      ctx.fillText(String(year), 2, y + rowHeight / 2)
      const src = yearSources.get(year)
      if (src) {
        ctx.font = '600 9px Inter, system-ui, sans-serif'
        ctx.fillStyle = src === 'modis_scaled' ? '#e8703a' : src === 'combined' ? '#22b07d' : '#3987e5'
        ctx.fillText(SOURCE_SHORT[src], 36, y + rowHeight / 2)
      }

      for (let c = 0; c < columns; c++) {
        const cell = cells.get(`${year}-${c}`)
        const x = GUTTER_LEFT + c * cellW
        const w = Math.max(0.5, cellW - gap)
        if (!cell) {
          ctx.fillStyle = NO_COVERAGE_COLOR
          ctx.fillRect(x, y, w, rowHeight)
          continue
        }
        let alpha = cell.inRange ? 1 : 0.18
        if (emphasis === 'anomalies' && !cell.anomaly) alpha *= 0.22
        if (emphasis === 'critical' && !cell.critical) alpha *= 0.22
        ctx.globalAlpha = alpha
        if (cell.quality === 'no_coverage') {
          ctx.fillStyle = NO_COVERAGE_COLOR
          ctx.fillRect(x, y, w, rowHeight)
        } else if (cell.quality === 'limited' && cell.cls === 'none') {
          ctx.fillStyle = ACTIVITY_COLORS.none
          ctx.fillRect(x, y, w, rowHeight)
          ctx.save()
          ctx.beginPath()
          ctx.rect(x, y, w, rowHeight)
          ctx.clip()
          ctx.strokeStyle = LIMITED_COLOR
          ctx.lineWidth = 1
          for (let k = -rowHeight; k < w + rowHeight; k += 4) {
            ctx.beginPath()
            ctx.moveTo(x + k, y + rowHeight)
            ctx.lineTo(x + k + rowHeight, y)
            ctx.stroke()
          }
          ctx.restore()
        } else {
          ctx.fillStyle = ACTIVITY_COLORS[cell.cls]
          ctx.fillRect(x, y, w, rowHeight)
          if (cell.quality === 'limited') {
            ctx.fillStyle = 'rgba(8,9,12,0.45)'
            ctx.fillRect(x, y + rowHeight - 3, w, 3)
          }
        }
        ctx.globalAlpha = 1
      }
    })

    // Selected cell outline.
    if (selectedDate) {
      const sy = Number(selectedDate.slice(0, 4))
      const r = years.indexOf(sy)
      if (r >= 0) {
        let col = -1
        for (const cell of cells.values()) {
          if (cell.year === sy && cell.date <= selectedDate && cell.end >= selectedDate) {
            col = cell.col
            break
          }
        }
        if (col >= 0) {
          const x = GUTTER_LEFT + col * cellW
          const y = GUTTER_TOP + r * (rowHeight + rowGap)
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          const w = Math.max(3, cellW - gap)
          ctx.strokeRect(x - 1.5, y - 1.5, w + 3, rowHeight + 3)
        }
      }
    }
  }, [cells, years, yearSources, width, height, cellW, columns, gap, rowGap, rowHeight, resolution, selectedDate, emphasis])

  const hitTest = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (x < GUTTER_LEFT || y < GUTTER_TOP) return null
    const col = Math.floor((x - GUTTER_LEFT) / cellW)
    const row = Math.floor((y - GUTTER_TOP) / (rowHeight + rowGap))
    const year = years[row]
    if (year === undefined || col < 0 || col >= columns) return null
    const cell = cells.get(`${year}-${col}`)
    return cell ? { cell, x, y } : null
  }

  return (
    <div className={cn('relative', className)}>
      <div ref={wrapRef} className="overflow-x-auto overflow-y-hidden">
        <canvas
          ref={canvasRef}
          id={canvasId}
          role="img"
          aria-label={`Burning activity calendar, ${years.length} years by ${resolution}`}
          className={cn('block', onSelect && 'cursor-pointer')}
          onMouseMove={(e) => setHover(hitTest(e.clientX, e.clientY))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const hit = hitTest(e.clientX, e.clientY)
            if (hit && onSelect) {
              if (resolution === 'day') onSelect(hit.cell.date)
              else {
                // Jump to the most active day inside the period.
                const i0 = analysis.dayIndex.get(hit.cell.date) ?? 0
                const i1 = analysis.dayIndex.get(hit.cell.end) ?? i0
                let best = analysis.days[i0]!
                for (let i = i0; i <= i1; i++) if (analysis.days[i]!.bai > best.bai) best = analysis.days[i]!
                onSelect(best.date)
              }
            }
          }}
        />
      </div>
      {hover && <HeatTooltip hover={hover} width={width} resolution={resolution} />}
    </div>
  )
}

function HeatTooltip({
  hover,
  width,
  resolution,
}: {
  hover: { cell: HeatCell; x: number; y: number }
  width: number
  resolution: CalendarResolution
}) {
  const { cell, x, y } = hover
  const left = Math.min(Math.max(8, x + 14), Math.max(8, width - 250))
  return (
    <div
      className="pointer-events-none absolute z-20 w-60 rounded-lg border border-line-strong bg-ink-850/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur"
      style={{ left, top: y + 16 }}
    >
      <div className="font-semibold text-fg">
        {resolution === 'day' ? fmtDate(cell.date) : `${cell.date} → ${cell.end}`}
      </div>
      {cell.quality === 'no_coverage' ? (
        <div className="mt-1 text-fg-muted">No satellite coverage in record</div>
      ) : (
        <>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={cn('size-2.5 rounded-sm', cell.cls === 'none' && cell.quality === 'limited' && 'hatch-limited')}
              style={{ background: cell.cls === 'none' && cell.quality === 'limited' ? undefined : ACTIVITY_COLORS[cell.cls] }}
            />
            <span className="font-medium text-fg">
              {cell.cls === 'none' && cell.quality === 'limited' ? 'Limited observation' : CLASS_LABEL[cell.cls]}
            </span>
            <span className="ml-auto tabular text-fg-muted">
              BAI {cell.bai.toFixed(0)}
              {resolution !== 'day' && ' avg'}
            </span>
          </div>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-fg-muted">
            <dt>Harmonized</dt>
            <dd className="text-right tabular text-fg">{cell.count.toFixed(1)} det.</dd>
            <dt>MODIS / VIIRS raw</dt>
            <dd className="text-right tabular text-fg">
              {cell.modis} / {cell.viirs}
            </dd>
            <dt>Source</dt>
            <dd className="text-right text-fg">{SOURCE_LABEL[cell.source]}</dd>
          </dl>
          {(cell.anomaly || cell.critical || cell.quality === 'limited') && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {cell.anomaly && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">Anomalous</span>}
              {cell.critical && <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">Critical period</span>}
              {cell.quality === 'limited' && <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted">Limited observation</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
