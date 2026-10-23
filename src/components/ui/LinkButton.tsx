import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib'

interface LinkButtonProps {
  to: string
  children: ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
}

const VARIANTS = {
  primary:
    'bg-ember-500 text-ink-950 hover:bg-ember-400 border-transparent',
  secondary:
    'bg-ink-700 text-fg hover:bg-ink-600 border-line-strong',
} as const

/** A router link styled as a button. Use for navigation actions. */
export function LinkButton({ to, children, variant = 'secondary', className }: LinkButtonProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}
