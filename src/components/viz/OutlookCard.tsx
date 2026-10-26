import { ArrowDownRight, ArrowRight, ArrowUpRight, Siren } from 'lucide-react'
import { useMemo } from 'react'
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ActivityAnalysis } from '@/types/activity'
import { buildOutlook, CLASS_LABEL } from '@/utils/burningActivity'
import { Card, InfoTip } from '@/components/ui'
import { cn, fmtDate, fmtDayMonth } from '@/lib'
import { ACTIVITY_COLORS, RISK_STYLES } from './activityScale'
import { AXIS_TICK, TOOLTIP_STYLE } from './chartTheme'

interface OutlookCardProps {
  analysis: ActivityAnalysis
  referenceDate: string
  className?: string
}

const RISK_SCALE = ['low', 'moderate', 'elevated', 'critical'] as const

export function OutlookCard({ analysis, referenceDate, className }: OutlookCardProps) {
  const outlook = useMemo(() => buildOutlook(analysis, referenceDate), [analysis, referenceDate])
  if (!outlook) return null
  const style = RISK_STYLES[outlook.risk]
  const TrendIcon = outlook.trend === 'rising' ? ArrowUpRight : outlook.trend === 'falling' ? ArrowDownRight : ArrowRight

  const chartData = [
    ...outlook.recent.map((r) => ({ date: r.date, bai: r.bai, band: [r.p50, r.p90] as [number, number] })),
    ...outlook.upcoming.map((w) => ({ date: w.end, bai: null, band: [w.p50, w.p90] as [number, number] })),
  ]

  return (
    <Card className={cn('flex flex-col', className)} aria-labelledby="outlook-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="outlook-title" className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Siren className="size-4 text-ember-400" aria-hidden="true" />
            Critical Period Outlook
            <InfoTip align="start">
              An early-warning indicator that compares recent activity, its 7-day trend, persistence and fire
              intensity with this area's historical normal for the same time of year. It is not a deterministic
              fire forecast.
            </InfoTip>
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">As of {fmtDate(outlook.referenceDate)}</p>
        </div>
        <div className={cn('rounded-xl px-3 py-1.5 text-right ring-1', style.bg, style.ring)}>
          <div className="text-[10px] font-medium uppercase tracking-wider text-fg-muted">Risk level</div>
          <div className={cn('text-lg font-bold leading-tight', style.text)}>{style.label}</div>
        </div>
      </div>

      <div className="mt-3 flex gap-1" aria-hidden="true">
        {RISK_SCALE.map((r) => (
          <div
            key={r}
            className="h-1.5 flex-1 rounded-full"
            style={{
              background: RISK_STYLES[r].color,
              opacity: RISK_SCALE.indexOf(r) <= RISK_SCALE.indexOf(outlook.risk) ? 1 : 0.15,
            }}
          />
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-[11px] text-fg-faint">Current BAI</dt>
          <dd className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold text-fg tabular">{outlook.latestBai.toFixed(0)}</span>
            <span
              className="rounded px-1 py-px text-[10px] font-semibold"
              style={{ background: `${ACTIVITY_COLORS[outlook.latestClass]}33`, color: outlook.latestClass === 'none' ? '#a1a9b6' : ACTIVITY_COLORS[outlook.latestClass] }}
            >
              {CLASS_LABEL[outlook.latestClass]}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-fg-faint">7-day trend</dt>
          <dd className="mt-0.5 flex items-center gap-1 text-xl font-semibold text-fg tabular">
            <TrendIcon
              className={cn(
                'size-5',
                outlook.trend === 'rising' ? 'text-red-400' : outlook.trend === 'falling' ? 'text-emerald-400' : 'text-fg-muted',
              )}
              aria-hidden="true"
            />
            {outlook.trendPerDay > 0 ? '+' : ''}
            {outlook.trendPerDay.toFixed(1)}
            <span className="text-xs font-normal text-fg-faint">/day</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-fg-faint">Normal now</dt>
          <dd className="mt-0.5 text-xl font-semibold text-fg tabular">
            {outlook.normalP50.toFixed(0)}
            <span className="text-xs font-normal text-fg-faint"> – {outlook.normalP90.toFixed(0)}</span>
          </dd>
        </div>
      </dl>

      <div className="mt-3 h-28" aria-label="Last 30 days of BAI against the historical normal band, and the normal range for the next 4 weeks">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              tickFormatter={fmtDayMonth}
              interval="preserveStartEnd"
              minTickGap={40}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 50, 100]} />
            <Tooltip
              {...TOOLTIP_STYLE}
              labelFormatter={(d) => fmtDate(String(d))}
              formatter={(v, name) =>
                name === 'band' && Array.isArray(v)
                  ? [`${Number(v[0]).toFixed(0)}–${Number(v[1]).toFixed(0)}`, 'Normal (median–90th)']
                  : [Number(v).toFixed(0), 'BAI']
              }
            />
            <Area
              dataKey="band"
              stroke="none"
              fill="#3987e5"
              fillOpacity={0.18}
              isAnimationActive={false}
              name="band"
            />
            <Line
              dataKey="bai"
              stroke="#ff8a1f"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
              name="bai"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[11px] text-fg-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-ember-500" /> Last 30 days
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm bg-[#3987e5]/30" /> Normal range, then next 4 weeks
        </span>
      </div>

      <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
        {outlook.reasons.map((r) => (
          <li key={r} className="flex gap-2 text-xs leading-relaxed text-fg-muted">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: style.color }} aria-hidden="true" />
            {r}
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-3 text-[11px] leading-relaxed text-fg-faint">
        Early-warning indicator from historical patterns — not a prediction of individual fires.
      </p>
    </Card>
  )
}
