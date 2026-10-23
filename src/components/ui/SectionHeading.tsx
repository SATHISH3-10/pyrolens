import type { ReactNode } from 'react'
import { cn } from '@/lib'

interface SectionHeadingProps {
  title: string
  description?: string
  action?: ReactNode
  /** Heading level to render; defaults to h2. */
  level?: 2 | 3
  id?: string
  className?: string
}

export function SectionHeading({
  title,
  description,
  action,
  level = 2,
  id,
  className,
}: SectionHeadingProps) {
  const Tag = level === 2 ? 'h2' : 'h3'
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <Tag id={id} className="text-base font-semibold tracking-tight text-fg">
          {title}
        </Tag>
        {description && <p className="mt-1 max-w-prose text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
