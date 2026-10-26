import { CalendarRange, ChevronDown } from 'lucide-react'
import { useMemo } from 'react'
import { useFireData } from '@/context/FireDataContext'
import { Popover } from '@/components/ui/Popover'
import { addDays } from '@/utils/burningActivity'
import { cn } from '@/lib'

interface Preset {
  label: string
  hint: string
  start: string
  end: string
}

function fmt(date: string) {
  if (!date) return '—'
  const d = new Date(`${date}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function DateRangeControl() {
  const { filter, setFilter, metadata, analysis } = useFireData()
  const min = metadata.dateRange.start
  const max = metadata.dateRange.end

  const presets = useMemo<Preset[]>(() => {
    const clamp = (d: string) => (d < min ? min : d > max ? max : d)
    const list: Preset[] = [{ label: 'Full record', hint: `${min.slice(0, 4)}–${max.slice(0, 4)}`, start: min, end: max }]
    const viirs = analysis?.model.viirsStart
    if (viirs && viirs > min) {
      list.push({ label: 'VIIRS era', hint: `${viirs.slice(0, 4)} onward`, start: viirs, end: max })
      list.push({ label: 'MODIS-only era', hint: `before ${viirs.slice(0, 4)}`, start: min, end: addDays(viirs, -1) })
    }
    list.push({ label: 'Last 5 years', hint: '', start: clamp(addDays(max, -365 * 5 + 1)), end: max })
    list.push({ label: 'Last 12 months', hint: '', start: clamp(addDays(max, -364)), end: max })
    const last = analysis?.seasons[analysis.seasons.length - 1]
    if (last) list.push({ label: 'Latest fire year', hint: last.label, start: clamp(last.rangeStart), end: clamp(last.rangeEnd) })
    return list
  }, [min, max, analysis])

  const activePreset = presets.find((p) => p.start === filter.startDate && p.end === filter.endDate)

  return (
    <Popover
      align="end"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-lg border border-line-strong bg-ink-800 px-2.5 py-1.5 text-left transition-colors hover:border-ink-500"
        >
          <CalendarRange className="size-4 shrink-0 text-signal-400" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium leading-tight text-fg tabular">
              {fmt(filter.startDate)} – {fmt(filter.endDate)}
            </span>
            <span className="hidden text-[11px] leading-tight text-fg-faint sm:block">
              {activePreset ? activePreset.label : 'Custom range'}
            </span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-fg-faint transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
      panelClassName="w-72"
    >
      {(close) => (
        <div>
          {presets.map((p) => {
            const active = p === activePreset
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFilter({ startDate: p.start, endDate: p.end })
                  close()
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
                  active ? 'bg-ink-700 font-semibold text-fg' : 'text-fg-muted hover:bg-ink-700/60 hover:text-fg',
                )}
              >
                {p.label}
                <span className="text-[11px] font-normal text-fg-faint">{p.hint}</span>
              </button>
            )
          })}
          <div className="mt-1.5 border-t border-line px-2.5 pb-1 pt-2.5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Custom range</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-fg-faint">
                From
                <input
                  type="date"
                  value={filter.startDate}
                  min={min}
                  max={filter.endDate || max}
                  onChange={(e) => e.target.value && setFilter({ startDate: e.target.value })}
                  className="field mt-1 w-full px-2 py-1 text-xs"
                />
              </label>
              <label className="text-[11px] text-fg-faint">
                To
                <input
                  type="date"
                  value={filter.endDate}
                  min={filter.startDate || min}
                  max={max}
                  onChange={(e) => e.target.value && setFilter({ endDate: e.target.value })}
                  className="field mt-1 w-full px-2 py-1 text-xs"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </Popover>
  )
}
