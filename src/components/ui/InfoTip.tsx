import { Info } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib'

interface InfoTipProps {
  children: ReactNode
  className?: string
  side?: 'top' | 'bottom'
  align?: 'center' | 'start' | 'end'
}

/** Small (i) affordance that explains a metric on hover or focus. */
export function InfoTip({ children, className, side = 'top', align = 'center' }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span
      className={cn('relative inline-flex align-middle', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label="More information"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="rounded-full text-fg-faint transition-colors hover:text-fg-muted"
      >
        <Info className="size-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute z-50 w-64 rounded-lg border border-line-strong bg-ink-850 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-fg-muted shadow-xl',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            align === 'start' && 'left-0',
            align === 'end' && 'right-0',
          )}
        >
          {children}
        </span>
      )}
    </span>
  )
}
