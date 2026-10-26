import { Info } from 'lucide-react'
import type { ActivityAnalysis } from '@/types/activity'
import { useFireData } from '@/context/FireDataContext'
import { fmtNum } from '@/lib'

/** Below two years, percentile classes and "normal" ranges describe only the loaded record itself. */
export const MIN_RECORD_DAYS = 730

export function ShortRecordNotice({ analysis }: { analysis: ActivityAnalysis }) {
  const { setIsCsvModalOpen } = useFireData()
  if (analysis.days.length >= MIN_RECORD_DAYS) return null
  return (
    <div role="note" className="flex flex-wrap items-start gap-3 rounded-2xl border border-signal-400/30 bg-signal-400/5 px-4 py-3 text-xs leading-relaxed text-fg-muted">
      <Info className="mt-0.5 size-4 shrink-0 text-signal-400" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-fg">Short record: {fmtNum(analysis.days.length)} days.</span> Activity classes, “normal”
        ranges, anomalies and the outlook are percentiles of this record only, and the MODIS–VIIRS factors need several overlap
        years. For a meaningful calendar, load multi-year FIRMS archive CSVs (MODIS + VIIRS) for this area.
      </p>
      <button type="button" onClick={() => setIsCsvModalOpen(true)} className="shrink-0 font-medium text-signal-300 hover:underline">
        Load archives
      </button>
    </div>
  )
}
