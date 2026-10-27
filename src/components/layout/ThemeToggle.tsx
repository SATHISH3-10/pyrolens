import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '@/context/ThemeContext'
import { cn } from '@/lib'

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'system', label: 'Use system theme', Icon: Monitor },
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
]

export function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex items-center rounded-lg border border-line bg-ink-900 p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              'flex size-7 items-center justify-center rounded-md transition-colors',
              active ? 'bg-ink-600 text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
