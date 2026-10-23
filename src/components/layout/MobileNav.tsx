import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Wordmark } from './Logo'
import { NavList } from './NavList'

interface MobileNavProps {
  open: boolean
  onClose: () => void
}

/** Slide-in navigation drawer for screens below the lg breakpoint. */
export function MobileNav({ open, onClose }: MobileNavProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-ink-900 shadow-2xl"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <Link to="/" onClick={onClose} aria-label="PyroLens, go to Overview" className="rounded-md">
            <Wordmark />
          </Link>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-ink-700 hover:text-fg"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList onNavigate={onClose} />
        </div>
      </div>
    </div>
  )
}
