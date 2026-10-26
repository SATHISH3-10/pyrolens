import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib'
import { Wordmark } from './Logo'
import { NavList } from './NavList'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

/** Desktop sidebar (lg and up). Mobile uses <MobileNav />. */
export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose
  return (
    <aside
      id="app-sidebar"
      className={cn(
        'hidden shrink-0 flex-col border-r border-line bg-ink-900 transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[68px]' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 shrink-0 items-center', collapsed ? 'justify-center' : 'px-5')}>
        <Link to="/" aria-label="PyroLens, go to Dashboard" className="rounded-md">
          <Wordmark compact={collapsed} />
        </Link>
      </div>

      <div className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
        <NavList collapsed={collapsed} />
      </div>

      {!collapsed && (
        <div className="mx-3 mb-3 rounded-xl border border-line bg-ink-850 p-3 text-[11px] leading-relaxed text-fg-faint">
          <p className="font-semibold text-fg-muted">NASA Space Apps Challenge</p>
          <p className="mt-0.5">Harmonization of MODIS &amp; VIIRS Hot Spots</p>
          <p className="mt-2">Hotspots are thermal anomalies, not confirmed wildfires. Not for life-safety decisions.</p>
        </div>
      )}

      <div className={cn('shrink-0 border-t border-line p-3', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center gap-3 rounded-lg py-2 text-[13px] text-fg-muted transition-colors hover:bg-ink-700/60 hover:text-fg',
            collapsed ? 'size-10 justify-center' : 'w-full px-3',
          )}
        >
          <ToggleIcon className="size-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
