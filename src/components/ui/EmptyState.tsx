import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  /** Optional call to action, e.g. a <LinkButton>. */
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-line bg-ink-700 text-signal-400">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      )}
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
