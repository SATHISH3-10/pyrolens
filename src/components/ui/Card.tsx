import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib'
import { InfoTip } from './InfoTip'

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  /** Padding preset. Use "none" when the content supplies its own (tables, maps). */
  padding?: 'none' | 'sm' | 'md'
  /** Adds the restrained ember glow, for the single most important card on a page. */
  emphasis?: boolean
}

const PADDING = { none: '', sm: 'p-4', md: 'p-5' } as const

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
        'rounded-2xl border bg-ink-850 shadow-panel',
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
  description?: ReactNode
  action?: ReactNode
  info?: ReactNode
  /** Heading element id, so a parent <section> can use aria-labelledby. */
  id?: string
  className?: string
}

export function CardHeader({ title, description, action, info, id, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 id={id} className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          {title}
          {info && <InfoTip align="start">{info}</InfoTip>}
        </h3>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {action && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}
