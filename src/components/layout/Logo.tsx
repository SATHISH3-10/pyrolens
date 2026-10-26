import { cn } from '@/lib'

/** Lens ring with an ember flame: the PyroLens mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8 shrink-0', className)}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="10" stroke="var(--color-signal-400)" strokeWidth="1.6" />
      <path
        d="M16 3v3M16 26v3M3 16h3M26 16h3"
        stroke="var(--color-signal-400)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M16 8.5c2.6 3.1 4.2 5 4.2 7.2a4.2 4.2 0 0 1-8.4 0c0-1.4.7-2.6 1.8-3.8.2 1.2 1 1.8 1.6 2-.4-1.9 0-3.7.8-5.4z"
        fill="var(--color-ember-500)"
      />
    </svg>
  )
}

interface WordmarkProps {
  /** Hide the text and show only the mark (collapsed sidebar). */
  compact?: boolean
  className?: string
}

export function Wordmark({ compact = false, className }: WordmarkProps) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <span className="text-[17px] font-semibold tracking-tight text-fg">
          Pyro<span className="text-ember-400">Lens</span>
        </span>
      )}
      {compact && <span className="sr-only">PyroLens</span>}
    </span>
  )
}
