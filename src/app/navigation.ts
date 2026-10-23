import {
  BookOpen,
  CalendarDays,
  Flame,
  FileBarChart,
  GitCompareArrows,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  /** Route path. */
  path: string
  /** Sidebar label. */
  label: string
  /** Page title shown in the header. */
  title: string
  /** One-line summary of the page's purpose. */
  description: string
  icon: LucideIcon
  /** Development part that will implement this page (see README roadmap). */
  plannedPart: number
  /** Short list of what the page will contain once implemented. */
  planned: string[]
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/',
    label: 'Overview',
    title: 'Overview',
    description: 'Harmonized summary of satellite active-fire observations across India.',
    icon: LayoutDashboard,
    plannedPart: 2,
    planned: [
      'Headline counts for MODIS and VIIRS detections',
      'Coverage and data-quality summary',
      'Interactive time-series and monthly distribution charts',
      'Filterable observations data table',
    ],
  },
  {
    path: '/explorer',
    label: 'Fire Explorer',
    title: 'Fire Explorer',
    description: 'Interactive OpenStreetMap geospatial exploration of hotspot detections.',
    icon: Flame,
    plannedPart: 3,
    planned: [
      'Interactive map of hotspot detections with sensor styling',
      'Combined filters for sensor, dates, and regional envelopes',
      'Detailed inspection panel for selected observations',
      'Fit-to-filtered and view reset controls',
    ],
  },
  {
    path: '/harmonization',
    label: 'Sensor Harmonization',
    title: 'Sensor Harmonization',
    description: 'Compare MODIS (1 km) and VIIRS (375 m) using spatiotemporal grid binning.',
    icon: GitCompareArrows,
    plannedPart: 4,
    planned: [
      'Side-by-side MODIS and VIIRS physical specifications',
      'Configurable spatiotemporal grid binning demo',
      'Coincident detection matrix and Jaccard similarity',
      'Transparent scientific harmonization principles',
    ],
  },
  {
    path: '/calendar',
    label: 'Historical Calendar',
    title: 'Historical Calendar',
    description: 'Temporal heatmap showing fire detection activity across days and seasons.',
    icon: CalendarDays,
    plannedPart: 5,
    planned: [
      'Daily calendar heatmap with intensity color scale',
      'Month-by-month and 12-month overview modes',
      'Zero-detection scientific advisory rule',
      'Deep-linking to locate specific days in Fire Explorer',
    ],
  },
  {
    path: '/insights',
    label: 'Insights & Reports',
    title: 'Insights & Reports',
    description: 'Statistical observation anomaly detection and reproducible data exports.',
    icon: FileBarChart,
    plannedPart: 6,
    planned: [
      'Robust statistical anomaly detection using Median and MAD',
      'Transparent baseline parameters and sensitivity thresholding',
      'Export filtered observations as CSV',
      'Export daily aggregates and Markdown intelligence reports',
    ],
  },
  {
    path: '/methodology',
    label: 'Methodology',
    title: 'Methodology',
    description: 'Scientific principles, sensor physics, FRP definition, and data limitations.',
    icon: BookOpen,
    plannedPart: 7,
    planned: [
      'Satellite thermal anomaly detection physics',
      'Why MODIS and VIIRS counts cannot be summed',
      'FRP definition and why FRP does not equal burned area',
      'Data provenance and future official NASA FIRMS integration',
    ],
  },
] as const

/** Find the nav item for a pathname. "/" matches only exactly. */
export function findNavItem(pathname: string): NavItem | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return NAV_ITEMS.find((item) => item.path === normalized)
}
