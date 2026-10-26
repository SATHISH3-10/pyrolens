import type { ReactNode } from 'react'
import { cn } from '@/lib'

export type BadgeTone = 'neutral' | 'ember' | 'signal' | 'ok' | 'danger'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-ink-700 text-fg-muted',
  ember: 'border-ember-500/40 bg-ember-500/10 text-ember-300',
  signal: 'border-signal-400/40 bg-signal-400/10 text-signal-300',
  ok: 'border-ok/40 bg-ok/10 text-ok',
  danger: 'border-danger/40 bg-danger/10 text-danger',
}

const DOTS: Record<BadgeTone, string> = {
  neutral: 'bg-fg-faint',
  ember: 'bg-ember-400',
  signal: 'bg-signal-400',
  ok: 'bg-ok',
  danger: 'bg-danger',
}

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  /** Show a small status dot before the label. */
  dot?: boolean
  className?: string
}

export function Badge({ children, tone = 'neutral', dot = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
        TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  )
}
