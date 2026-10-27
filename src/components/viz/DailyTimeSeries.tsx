import { useMemo } from 'react'
import {
  Area,
  Bar,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ActivityAnalysis } from '@/types/activity'
import { CLASS_LABEL } from '@/utils/burningActivity'
import { fmtDate, fmtDayMonth } from '@/lib'
import { ACTIVITY_COLORS } from './activityScale'
import { useTheme } from '@/context/ThemeContext'
import { chartStyles } from './chartTheme'

interface DailyTimeSeriesProps {
  analysis: ActivityAnalysis
  start: string
  end: string
  selectedDate?: string | null
  onSelect?: (date: string) => void
  height?: number
}

export function DailyTimeSeries({ analysis, start, end, selectedDate, onSelect, height = 280 }: DailyTimeSeriesProps) {
  const { tokens } = useTheme()
  const cs = chartStyles(tokens)
  const data = useMemo(
    () =>
      analysis.days
        .filter((d) => d.date >= start && d.date <= end)
        .map((d) => ({
          date: d.date,
          bai: d.bai,
          cls: d.cls,
          limited: d.quality === 'limited',
          band: [d.climP50, d.climP90] as [number, number],
          p97: d.climP97,
        })),
    [analysis, start, end],
  )
  const periods = useMemo(
    () => analysis.criticalPeriods.filter((p) => p.end >= start && p.start <= end),
    [analysis, start, end],
  )

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
          barCategoryGap={0}
          onClick={(e) => {
            const label = (e as { activeLabel?: string } | null)?.activeLabel
            if (label && onSelect) onSelect(String(label))
          }}
        >
          <CartesianGrid stroke={cs.grid} vertical={false} />
          {periods.map((p) => (
            <ReferenceArea
              key={p.id}
              x1={p.start < start ? start : p.start}
              x2={p.end > end ? end : p.end}
              fill={tokens.bai.high}
              fillOpacity={0.08}
              stroke="none"
              ifOverflow="hidden"
            />
          ))}
          <XAxis
            dataKey="date"
            tick={cs.tick}
            tickFormatter={fmtDayMonth}
            axisLine={{ stroke: cs.axis }}
            tickLine={false}
            minTickGap={36}
          />
          <YAxis tick={cs.tick} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={44} />
          <Tooltip
            {...cs.tooltip}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            labelFormatter={(d) => fmtDate(String(d))}
            formatter={(v, name, item) => {
              if (name === 'band' && Array.isArray(v)) return [`${Number(v[0]).toFixed(0)} – ${Number(v[1]).toFixed(0)}`, 'Normal (median–90th)']
              if (name === 'p97') return [Number(v).toFixed(0), '97th percentile']
              const p = item.payload as (typeof data)[number]
              return [`${Number(v).toFixed(0)} · ${p.limited && p.cls === 'none' ? 'Limited observation' : CLASS_LABEL[p.cls]}`, 'BAI']
            }}
          />
          <Area dataKey="band" stroke="none" fill={tokens.chart.band} fillOpacity={1} isAnimationActive={false} name="band" />
          <Bar dataKey="bai" isAnimationActive={false} name="bai" className={onSelect ? 'cursor-pointer' : undefined}>
            {data.map((d) => (
              <Cell key={d.date} fill={d.limited && d.cls === 'none' ? tokens.unknown : tokens.bai[d.cls]} />
            ))}
          </Bar>
          <Line dataKey="p97" stroke={tokens.chart.threshold} strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} name="p97" />
          {selectedDate && selectedDate >= start && selectedDate <= end && (
            <ReferenceLine x={selectedDate} stroke={tokens.accentRing} strokeWidth={1.5} />
          )}
          {data.length > 120 && (
            <Brush dataKey="date" height={22} stroke={tokens.borderStrong} fill={tokens.raised} travellerWidth={8} tickFormatter={fmtDayMonth} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DailyTimeSeriesLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3 rounded-sm" style={{ background: ACTIVITY_COLORS.high }} /> Daily BAI (coloured by class)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3 rounded-sm" style={{ background: 'var(--chart-band)' }} /> Normal range
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 border-t border-dashed border-[var(--chart-threshold)]" /> 97th pct (anomaly threshold)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3 rounded-sm" style={{ background: 'color-mix(in srgb, var(--bai-high) 18%, transparent)' }} /> Critical period
      </span>
    </div>
  )
}
