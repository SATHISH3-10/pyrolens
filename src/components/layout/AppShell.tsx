import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { findNavItem } from '@/app/navigation'
import { CsvImportModal } from '@/components/shared/CsvImportModal'
import { cn } from '@/lib'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'

const COLLAPSE_KEY = 'pyrolens.sidebarCollapsed'
/** Routes that render edge-to-edge (no page padding or max width). */
const FULL_BLEED = new Set(['/map'])

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const fullBleed = FULL_BLEED.has(pathname)

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* storage unavailable: keep in-memory state only */
      }
      return next
    })
  }, [])

  useEffect(() => {
    const page = findNavItem(pathname)?.title ?? 'Page not found'
    document.title = `${page} · PyroLens`
  }, [pathname])

  return (
    <div className="flex h-dvh bg-ink-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[2000] focus:rounded-lg focus:bg-ember-500 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-accent"
      >
        Skip to main content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <MobileNav open={mobileOpen} onClose={closeMobile} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMobileNav={() => setMobileOpen(true)} />
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            'min-h-0 flex-1 focus:outline-none',
            fullBleed ? 'relative overflow-hidden' : 'overflow-y-auto',
          )}
        >
          {fullBleed ? (
            <Outlet />
          ) : (
            <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          )}
        </main>
      </div>
      <CsvImportModal />
    </div>
  )
}
