import { TriangleAlert } from 'lucide-react'

export const DEMO_WARNING_TEXT = 'DEMO DATA — NOT OFFICIAL NASA OBSERVATIONS'

/** Persistent warning. Rendered by AppShell above all content and never dismissible. */
export function DemoBanner() {
  return (
    <div
      role="note"
      aria-label="Data warning"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-ember-500/40 bg-ember-500/15 px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-ember-300"
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{DEMO_WARNING_TEXT}</span>
    </div>
  )
}
