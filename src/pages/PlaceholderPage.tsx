import { Hammer } from 'lucide-react'
import type { NavItem } from '@/app/navigation'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui'

/** Shared placeholder for pages that a later development part will build. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.title}
        description={item.description}
        meta={<Badge tone="signal">Planned for Part {item.plannedPart}</Badge>}
      />

      <EmptyState
        icon={Hammer}
        title={`${item.title} is not built yet`}
        description={`This page will be implemented in development Part ${item.plannedPart}. The navigation, layout and design system it will use are already in place.`}
      />

      <Card aria-labelledby="planned-scope">
        <CardHeader
          id="planned-scope"
          title="Planned scope"
          description="What this page is intended to include."
        />
        <ul className="grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
          {item.planned.map((entry) => (
            <li key={entry} className="flex gap-2.5 rounded-lg border border-line bg-ink-900 px-3 py-2.5">
              <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ember-500" />
              <span>{entry}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
