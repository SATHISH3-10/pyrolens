import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib'

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  /** Padding preset. Use "none" when the content supplies its own (tables, maps). */
  padding?: 'none' | 'sm' | 'md'
  /** Adds the restrained ember glow, for the single most important card on a page. */
  emphasis?: boolean
}

const PADDING = { none: '', sm: 'p-4', md: 'p-5 sm:p-6' } as const

export function Card({
  as: Tag = 'section',
  padding = 'md',
  emphasis = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-xl border bg-ink-800 shadow-panel',
        emphasis ? 'border-ember-500/40 shadow-glow-ember' : 'border-line',
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

interface CardHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  /** Heading element id, so a parent <section> can use aria-labelledby. */
  id?: string
}

export function CardHeader({ title, description, action, id }: CardHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h3>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
