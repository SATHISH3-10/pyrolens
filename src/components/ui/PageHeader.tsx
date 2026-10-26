import type { ReactNode } from 'react'
import { cn } from '@/lib'

interface PageHeaderProps {
  title: string
  eyebrow?: ReactNode
  description?: ReactNode
  /** Badges or other inline metadata shown beside the title. */
  meta?: ReactNode
  /** Page-level actions, aligned right on wide screens. */
  actions?: ReactNode
  className?: string
}

/** In-page heading carrying the page's purpose and actions. */
export function PageHeader({ title, eyebrow, description, meta, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-ember-400">{eyebrow}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {meta}
        </div>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
