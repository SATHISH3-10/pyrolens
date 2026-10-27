import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ember-500 text-on-accent hover:bg-ember-600 border-transparent font-semibold',
  secondary: 'bg-ink-700 text-fg hover:bg-ink-600 border-line-strong',
  ghost: 'bg-transparent text-fg-muted hover:bg-ink-700 hover:text-fg border-transparent',
  danger: 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border-red-500/30',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-[13px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}
