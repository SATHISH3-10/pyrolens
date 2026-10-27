import { useMemo } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ActivityAnalysis } from '@/types/activity'
import { fmtCompact, fmtNum, monthName } from '@/lib'
import { SENSOR_COLORS } from './activityScale'
import { chartStyles } from './chartTheme'
import { useTheme } from '@/context/ThemeContext'

/** Monthly mean BAI: historical 10th–90th band, median, and one highlighted year. */
export function SeasonalPatternChart({
  analysis,
  year,
  height = 240,
}: {
  analysis: ActivityAnalysis
  year: number
  height?: number
}) {
  const { tokens } = useTheme()
  const cs = chartStyles(tokens)
  const data = useMemo(() => {
    const sums = new Array(12).fill(0) as number[]
    const ns = new Array(12).fill(0) as number[]
    for (const d of analysis.days) {
      if (d.year !== year || d.source === 'none') continue
      sums[d.month - 1]! += d.bai
      ns[d.month - 1]! += 1
    }
    return analysis.months.map((m, i) => ({
      month: monthName(m.month),
      band: [m.p10, m.p90] as [number, number],
      median: m.p50,
      selected: ns[i]! > 0 ? sums[i]! / ns[i]! : null,
    }))
  }, [analysis, year])

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={cs.grid} vertical={false} />
          <XAxis dataKey="month" tick={cs.tick} axisLine={{ stroke: cs.axis }} tickLine={false} />
          <YAxis tick={cs.tick} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            {...cs.tooltip}
            formatter={(v, name) => {
              if (Array.isArray(v)) return [`${Number(v[0]).toFixed(1)} – ${Number(v[1]).toFixed(1)}`, 'Normal range (10–90th)']
              return [v === null ? '—' : Number(v).toFixed(1), name === 'median' ? 'Historical median' : `${year}`]
            }}
          />
          <Area dataKey="band" stroke="none" fill={tokens.chart.band} fillOpacity={1} isAnimationActive={false} name="band" />
          <Line dataKey="median" stroke={tokens.chart.median} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} name="median" />
          <Line
            dataKey="selected"
            stroke={tokens.accent}
            strokeWidth={2.5}
            dot={{ r: 3, fill: tokens.accent, strokeWidth: 0 }}
            isAnimationActive={false}
            connectNulls={false}
            name="selected"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SeasonalLegend({ year }: { year: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded bg-ember-500" /> {year}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed border-[var(--chart-median)]" /> Historical median
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm" style={{ background: 'var(--chart-band)' }} /> Normal range (10th–90th)
      </span>
    </div>
  )
}

/** Annual harmonized activity with the IQR uncertainty of MODIS-scaled years. */
export function AnnualActivityChart({
  analysis,
  highlightYear,
  onSelectYear,
  height = 240,
}: {
  analysis: ActivityAnalysis
  highlightYear?: number
  onSelectYear?: (year: number) => void
  height?: number
}) {
  const { tokens } = useTheme()
  const cs = chartStyles(tokens)
  const data = useMemo(() => {
    const byYear = new Map<number, { total: number; low: number; high: number; scaledDays: number; days: number }>()
    for (const d of analysis.days) {
      if (d.source === 'none') continue
      const r = byYear.get(d.year) ?? { total: 0, low: 0, high: 0, scaledDays: 0, days: 0 }
      r.total += d.harmonizedCount
      r.low += d.harmonizedCountLow
      r.high += d.harmonizedCountHigh
      r.days++
      if (d.source === 'modis_scaled') r.scaledDays++
      byYear.set(d.year, r)
    }
    return [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, r]) => ({
        year,
        total: r.total,
        err: [r.total - r.low, r.high - r.total] as [number, number],
        scaled: r.scaledDays > r.days / 2,
        partial: r.days < 360,
      }))
  }, [analysis])

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="18%">
          <CartesianGrid stroke={cs.grid} vertical={false} />
          <XAxis
            dataKey="year"
            tick={cs.tick}
            axisLine={{ stroke: cs.axis }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis tick={cs.tick} axisLine={false} tickLine={false} tickFormatter={fmtCompact} width={48} />
          <Tooltip
            {...cs.tooltip}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(v, _n, item) => {
              const p = item.payload as (typeof data)[number]
              return [
                `${fmtNum(Number(v))} detections${p.scaled ? ` (modelled, IQR ${fmtNum(p.total - p.err[0])}–${fmtNum(p.total + p.err[1])})` : ''}`,
                p.scaled ? 'MODIS scaled to VIIRS' : 'VIIRS observed',
              ]
            }}
          />
          <Bar
            dataKey="total"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            onClick={(entry) => onSelectYear?.((entry as unknown as { year: number }).year)}
            className={onSelectYear ? 'cursor-pointer' : undefined}
          >
            {data.map((d) => (
              <Cell
                key={d.year}
                fill={d.scaled ? tokens.sensors.MODIS : tokens.sensors.harmonized}
                fillOpacity={highlightYear === undefined || highlightYear === d.year ? 0.9 : 0.4}
              />
            ))}
            <ErrorBar dataKey="err" direction="y" stroke={tokens.textMuted} strokeWidth={1} width={4} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AnnualLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ background: SENSOR_COLORS.harmonized }} /> VIIRS observed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ background: SENSOR_COLORS.MODIS }} /> MODIS scaled to VIIRS (modelled)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-px bg-fg-muted" /> Uncertainty (IQR of r(m))
      </span>
    </div>
  )
}
