import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { findNavItem } from '@/app/navigation'
import { CsvImportModal } from '@/components/shared/CsvImportModal'
import { DemoBanner } from './DemoBanner'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'

const COLLAPSE_KEY = 'pyrolens.sidebarCollapsed'

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

  // Keep the document title in sync with the current page.
  useEffect(() => {
    const page = findNavItem(pathname)?.title ?? 'Page not found'
    document.title = `${page} · PyroLens`
  }, [pathname])

  return (
    <div className="flex h-dvh flex-col bg-ink-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ember-500 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-950"
      >
        Skip to main content
      </a>
      <DemoBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        <MobileNav open={mobileOpen} onClose={closeMobile} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onOpenMobileNav={() => setMobileOpen(true)} />
          <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto focus:outline-none">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <CsvImportModal />
    </div>
  )
}
