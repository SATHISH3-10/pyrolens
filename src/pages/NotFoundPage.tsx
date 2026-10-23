import { SearchX } from 'lucide-react'
import { EmptyState, LinkButton } from '@/components/ui'

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={SearchX}
      title="Page not found"
      description="This address doesn't match any PyroLens page. Use the navigation, or return to the overview."
      action={<LinkButton to="/" variant="primary">Go to Overview</LinkButton>}
    />
  )
}
