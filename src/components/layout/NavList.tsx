import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '@/app/navigation'
import { cn } from '@/lib'

interface NavListProps {
  /** Icon-only presentation (desktop collapsed sidebar). */
  collapsed?: boolean
  /** Called after a link is activated, e.g. to close the mobile drawer. */
  onNavigate?: () => void
}

export function NavList({ collapsed = false, onNavigate }: NavListProps) {
  return (
    <nav aria-label="Primary">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <li key={path}>
            <NavLink
              to={path}
              end={path === '/'}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0' : 'px-3',
                  isActive
                    ? 'bg-ink-700 text-fg'
                    : 'text-fg-muted hover:bg-ink-700/60 hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-ember-500 transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <Icon
                    className={cn(
                      'size-[18px] shrink-0',
                      isActive ? 'text-ember-400' : 'text-fg-faint group-hover:text-fg-muted',
                    )}
                    aria-hidden="true"
                  />
                  {!collapsed && <span className="truncate">{label}</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
