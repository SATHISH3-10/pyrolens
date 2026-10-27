import { Database, FlaskConical, Menu, Satellite } from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { InfoTip } from '@/components/ui'
import { LogoMark } from './Logo'
import { StudyAreaPicker } from './StudyAreaPicker'
import { DateRangeControl } from './DateRangeControl'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  onOpenMobileNav: () => void
}

function DataSourcePill() {
  const { metadata, setIsCsvModalOpen } = useFireData()
  const demo = metadata.isSynthetic
  const live = metadata.source === 'firms-live-api'
  const Icon = demo ? FlaskConical : live ? Satellite : Database
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setIsCsvModalOpen(true)}
        className={
          demo
            ? 'inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-400/20'
            : 'inline-flex items-center gap-1.5 rounded-full border border-signal-400/40 bg-signal-400/10 px-2.5 py-1 text-[11px] font-semibold text-signal-200 transition-colors hover:bg-signal-400/20'
        }
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {demo ? 'Demo data' : live ? 'FIRMS live' : 'FIRMS CSV'}
        <span className="hidden font-normal opacity-75 xl:inline">
          · {metadata.recordCount.toLocaleString()} detections
        </span>
      </button>
      <InfoTip side="bottom" align="end">
        {demo
          ? 'Synthetic demonstration archive generated to mimic MODIS and VIIRS behaviour (2003–2025). Not official NASA observations. Load FIRMS CSV archives or use the FIRMS API for real analysis.'
          : `${metadata.title}. ${metadata.recordCount.toLocaleString()} detections, ${metadata.dateRange.start} → ${metadata.dateRange.end}.`}
      </InfoTip>
    </div>
  )
}

export function Header({ onOpenMobileNav }: HeaderProps) {
  return (
    <header className="relative z-[1050] flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-ink-950/90 px-4 py-2.5 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="-ml-1 flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-ink-700 hover:text-fg lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <LogoMark className="size-7 lg:hidden" />
      <StudyAreaPicker />
      <DateRangeControl />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <DataSourcePill />
      </div>
    </header>
  )
}
