import { Check, ChevronDown, FileSpreadsheet, Globe2, MapPin, Upload, X } from 'lucide-react'
import { IMPORTED_AREA_ID, useFireData } from '@/context/FireDataContext'
import { STUDY_AREAS } from '@/data/studyAreas'
import { Popover } from '@/components/ui/Popover'
import { cn } from '@/lib'

export function StudyAreaPicker() {
  const { area, setStudyAreaId, customAoi, clearCustomAoi, setIsCsvModalOpen } = useFireData()

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Popover
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="flex min-w-0 items-center gap-2 rounded-lg border border-line-strong bg-ink-800 py-1.5 pl-2.5 pr-2 text-left transition-colors hover:border-ink-500"
          >
            {area.id === IMPORTED_AREA_ID ? (
              <FileSpreadsheet className="size-4 shrink-0 text-signal-400" aria-hidden="true" />
            ) : (
              <Globe2 className="size-4 shrink-0 text-ember-400" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight text-fg">{area.name}</span>
              <span className="block truncate text-[11px] leading-tight text-fg-faint">{area.subtitle}</span>
            </span>
            <ChevronDown className={cn('size-4 shrink-0 text-fg-faint transition-transform', open && 'rotate-180')} aria-hidden="true" />
          </button>
        )}
        panelClassName="w-80"
      >
        {(close) => (
          <div role="listbox" aria-label="Study area">
            <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-faint">
              Sample study areas
            </div>
            {STUDY_AREAS.map((a) => {
              const active = a.id === area.id
              return (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setStudyAreaId(a.id)
                    close()
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-ink-700' : 'hover:bg-ink-700/60',
                  )}
                >
                  <MapPin className={cn('mt-0.5 size-4 shrink-0', active ? 'text-ember-400' : 'text-fg-faint')} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-fg">{a.name}</span>
                      <span className="shrink-0 text-[11px] text-fg-faint">{a.country}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-fg-muted">
                      Peak season {a.typicalSeasonLabel}
                    </span>
                  </span>
                  {active && <Check className="mt-0.5 size-4 shrink-0 text-ember-400" aria-hidden="true" />}
                </button>
              )
            })}
            <div className="my-1.5 h-px bg-line" />
            <button
              type="button"
              onClick={() => {
                setIsCsvModalOpen(true)
                close()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg-muted transition-colors hover:bg-ink-700/60 hover:text-fg"
            >
              <Upload className="size-4 text-signal-400" aria-hidden="true" />
              Load NASA FIRMS data (CSV or API)…
            </button>
          </div>
        )}
      </Popover>

      {customAoi && (
        <span className="hidden items-center gap-1.5 rounded-full border border-signal-400/40 bg-signal-400/10 py-1 pl-2.5 pr-1.5 text-[11px] font-medium text-signal-200 md:inline-flex">
          <span className="max-w-[10rem] truncate">AOI: {customAoi.name}</span>
          <button
            type="button"
            onClick={clearCustomAoi}
            aria-label="Clear custom area of interest"
            className="rounded-full p-0.5 hover:bg-signal-400/20"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  )
}
