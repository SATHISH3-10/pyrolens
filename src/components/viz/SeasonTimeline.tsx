import type { ActivityAnalysis } from '@/types/activity'
import { doy365 } from '@/utils/burningActivity'
import { monthName } from '@/lib'
import { ACTIVITY_COLORS } from './activityScale'

const MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]

function doyFromLabel(label: string): number {
  // label like "Mar 15"
  const [mon, day] = label.split(' ')
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(mon ?? '')
  return doy365(`2001-${String(m + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`)
}

/** Jan–Dec strip: monthly share of activity, typical season span and peak. */
export function SeasonTimeline({ analysis }: { analysis: ActivityAnalysis }) {
  const norms = analysis.seasonNorms
  const maxShare = Math.max(...analysis.months.map((m) => m.share), 0.0001)
  if (!norms) {
    return <p className="text-sm text-fg-muted">At least a full year of data is needed to describe the typical season.</p>
  }
  const s = doyFromLabel(norms.typicalStart)
  const p = doyFromLabel(norms.typicalPeak)
  const e = doyFromLabel(norms.typicalEnd)
  const pct = (doy: number) => ((doy - 1) / 365) * 100
  const segments: Array<[number, number]> = s <= e ? [[s, e]] : [[s, 365], [1, e]]

  const shareColor = (share: number) => {
    const r = share / maxShare
    if (r > 0.75) return ACTIVITY_COLORS.very_high
    if (r > 0.45) return ACTIVITY_COLORS.high
    if (r > 0.2) return ACTIVITY_COLORS.moderate
    if (r > 0.05) return ACTIVITY_COLORS.low
    return '#262c36'
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Typical start', norms.typicalStart],
          ['Typical peak', norms.typicalPeak],
          ['Typical end', norms.typicalEnd],
          ['Median length', `${Math.round(norms.medianDuration)} days`],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[11px] text-fg-faint">{k}</div>
            <div className="mt-0.5 text-base font-semibold text-fg">{v}</div>
          </div>
        ))}
      </div>

      <div className="relative mt-5" role="img" aria-label={`Typical season from ${norms.typicalStart} to ${norms.typicalEnd}, peaking ${norms.typicalPeak}`}>
        <div className="flex h-14 items-end gap-[3px]">
          {analysis.months.map((m) => (
            <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end" title={`${monthName(m.month)}: ${(m.share * 100).toFixed(1)}% of annual activity`}>
              <div
                className="w-full rounded-t-[4px]"
                style={{ height: `${Math.max(4, (m.share / maxShare) * 100)}%`, background: shareColor(m.share) }}
              />
            </div>
          ))}
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-ink-700">
          {segments.map(([a, b]) => (
            <div
              key={a}
              className="absolute inset-y-0 rounded-full bg-gradient-to-r from-amber-400/70 to-red-500/80"
              style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }}
            />
          ))}
          <div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-850 bg-white"
            style={{ left: `${pct(p)}%` }}
            title={`Typical peak ${norms.typicalPeak}`}
          />
        </div>
        <div className="mt-1.5 flex">
          {MONTH_START_DOY.map((d, i) => (
            <div key={d} className="flex-1 text-center text-[10px] text-fg-faint">
              {monthName(i + 1)}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-fg-muted">
        Most fire-prone months:{' '}
        <span className="font-medium text-fg">{norms.topMonths.map(monthName).join(', ')}</span>
        {analysis.seasons.length > 0 && (
          <span className="text-fg-faint"> · based on {analysis.seasons.length} fire-years</span>
        )}
      </p>
    </div>
  )
}
