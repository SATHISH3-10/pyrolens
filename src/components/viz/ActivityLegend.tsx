import { cn } from '@/lib'
import { CLASS_THRESHOLDS } from '@/utils/burningActivity'
import { ACTIVITY_COLORS } from './activityScale'

interface ActivityLegendProps {
  className?: string
  compact?: boolean
  showGaps?: boolean
}

/** Legend for the Burning Activity Index classes, plus the no-detection and limited-observation states. */
export function ActivityLegend({ className, compact = false, showGaps = true }: ActivityLegendProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-fg-muted', className)}>
      {showGaps && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] ring-1 ring-inset ring-white/5" style={{ background: ACTIVITY_COLORS.none }} />
            No detections
          </span>
          <span className="inline-flex items-center gap-1.5" title="Detections dropped sharply or were absent during an active period — likely cloud, smoke or missed overpasses">
            <span className="hatch-limited size-3 rounded-[3px] ring-1 ring-inset ring-white/10" />
            Limited observation
          </span>
          <span className="mx-1 hidden h-3 w-px bg-line-strong sm:block" aria-hidden="true" />
        </>
      )}
      {CLASS_THRESHOLDS.map((t) => (
        <span key={t.cls} className="inline-flex items-center gap-1.5" title={`BAI ${t.range} percentile of active days`}>
          <span className="size-3 rounded-[3px]" style={{ background: ACTIVITY_COLORS[t.cls] }} />
          {t.label}
          {!compact && <span className="text-fg-faint">{t.range}</span>}
        </span>
      ))}
    </div>
  )
}
