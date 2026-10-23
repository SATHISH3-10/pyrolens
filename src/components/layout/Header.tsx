import { Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { findNavItem } from '@/app/navigation'
import { LogoMark } from './Logo'
import { DatasetStatusIndicator } from './DatasetStatusIndicator'

interface HeaderProps {
  onOpenMobileNav: () => void
}

export function Header({ onOpenMobileNav }: HeaderProps) {
  const { pathname } = useLocation()
  const title = findNavItem(pathname)?.title ?? 'Page not found'

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-ink-950/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="-ml-1 flex size-10 items-center justify-center rounded-lg text-fg-muted hover:bg-ink-700 hover:text-fg lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <LogoMark className="size-7 lg:hidden" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg sm:text-base">{title}</p>
      </div>
      <DatasetStatusIndicator />
    </header>
  )
}
