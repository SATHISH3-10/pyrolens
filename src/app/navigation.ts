import {
  BookOpen,
  CalendarDays,
  FileDown,
  GitCompareArrows,
  LayoutDashboard,
  Map,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  /** Page title used for the document title. */
  title: string
  description: string
  icon: LucideIcon
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    title: 'Dashboard',
    description: 'Outlook, seasonal pattern and the harmonized burning calendar at a glance.',
    icon: LayoutDashboard,
  },
  {
    path: '/map',
    label: 'Fire Map',
    title: 'Fire Map',
    description: 'Hotspots, fire clusters and density for any day or period; draw an area of interest.',
    icon: Map,
  },
  {
    path: '/calendar',
    label: 'Burning Calendar',
    title: 'Burning Calendar',
    description: 'Daily, weekly and monthly Burning Activity Index with anomalies and critical periods.',
    icon: CalendarDays,
  },
  {
    path: '/harmonization',
    label: 'Harmonization',
    title: 'Sensor Harmonization',
    description: 'How MODIS and VIIRS are put on one comparable scale.',
    icon: GitCompareArrows,
  },
  {
    path: '/reports',
    label: 'Reports & Export',
    title: 'Reports & Export',
    description: 'Download BAI tables, clusters, hotspots and summary reports.',
    icon: FileDown,
  },
  {
    path: '/methodology',
    label: 'How it works',
    title: 'How it works',
    description: 'MODIS, VIIRS, harmonization, the BAI and the limitations.',
    icon: BookOpen,
  },
] as const

/** Find the nav item for a pathname. "/" matches only exactly. */
export function findNavItem(pathname: string): NavItem | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return NAV_ITEMS.find((item) => item.path === normalized)
}
