import type { ReactNode } from 'react'
import { cn } from '@/lib'
import { InfoTip } from './InfoTip'

interface StatProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  info?: ReactNode
  accent?: string
  className?: string
}

/** Compact stat tile: label, headline value and a one-line hint. */
export function Stat({ label, value, hint, info, accent, className }: StatProps) {
  return (
    <div className={cn('rounded-xl border border-line bg-ink-800/70 px-4 py-3.5', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        {accent && <span className="size-2 rounded-full" style={{ background: accent }} aria-hidden="true" />}
        <span className="truncate">{label}</span>
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <div className="mt-1.5 text-[1.375rem] font-semibold leading-tight tracking-tight text-fg tabular">{value}</div>
      {hint && <div className="mt-1 break-words text-xs text-fg-faint">{hint}</div>}
    </div>
  )
}
