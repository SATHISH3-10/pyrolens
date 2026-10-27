import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib'

interface LinkButtonProps {
  to: string
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  className?: string
  state?: unknown
}

const VARIANTS = {
  primary: 'bg-ember-500 text-on-accent hover:bg-ember-600 border-transparent font-semibold',
  secondary: 'bg-ink-700 text-fg hover:bg-ink-600 border-line-strong',
  ghost: 'bg-transparent text-fg-muted hover:bg-ink-700 hover:text-fg border-transparent',
} as const

/** A router link styled as a button. Use for navigation actions. */
export function LinkButton({ to, children, variant = 'secondary', size = 'md', className, state }: LinkButtonProps) {
  return (
    <Link
      to={to}
      state={state}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-[13px]',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}
