import type { ReactNode } from 'react'
import { cn } from '@/lib'

interface PageHeaderProps {
  title: string
  description?: string
  /** Badges or other inline metadata shown beside the title. */
  meta?: ReactNode
  /** Page-level actions, aligned right on wide screens. */
  actions?: ReactNode
  className?: string
}

/** In-page heading. The app header shows the page name; this carries the page's purpose and actions. */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[1.75rem]">{title}</h1>
          {meta}
        </div>
        {description && (
          <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-fg-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
