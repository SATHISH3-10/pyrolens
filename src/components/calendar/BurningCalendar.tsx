import { useEffect, useRef, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ActivityAnalysis } from '@/types/activity'
import { addDays, CLASS_LABEL } from '@/utils/burningActivity'
import type { SensorView, SmartFilter } from '@/utils/calendarLayout'
import { fmtDate, fmtNum } from '@/lib'
import { YearView } from './YearView'
import { MultiYearView } from './MultiYearView'
import { MonthView } from './MonthView'
import { CalendarLegend, legendItems } from './CalendarLegend'
import { useCalendarModel } from './useCalendarModel'
import { calendarLegendRegistry } from './exportRegistry'
import { useTheme } from '@/context/ThemeContext'

export type CalendarView = 'year' | 'multi' | 'month'

interface BurningCalendarProps {
  analysis: ActivityAnalysis
  startDate: string
  endDate: string
  view: CalendarView
  onViewChange?: (v: CalendarView) => void
  sensorView: SensorView
  smartFilter: SmartFilter
  showSeasons: boolean
  compareYears?: number[]
  selectedDate: string | null
  onSelect: (date: string) => void
  onOpenDetails?: () => void
  isPlaying: boolean
  compact?: boolean
  showLegend?: boolean
  exportId?: string
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function shiftYear(date: string, delta: number): string {
  const y = Number(date.slice(0, 4)) + delta
  const md = date.slice(5) === '02-29' ? '02-28' : date.slice(5)
  return `${y}-${md}`
}

function shiftMonth(date: string, delta: number): string {
  let y = Number(date.slice(0, 4))
  let m = Number(date.slice(5, 7)) + delta
  while (m < 1) {
    m += 12
    y--
  }
  while (m > 12) {
    m -= 12
    y++
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const d = Math.min(Number(date.slice(8, 10)), last)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function BurningCalendar({
  analysis,
  startDate,
  endDate,
  view,
  onViewChange,
  sensorView,
  smartFilter,
  showSeasons,
  compareYears = [],
  selectedDate,
  onSelect,
  onOpenDetails,
  isPlaying,
  compact,
  showLegend = true,
  exportId,
}: BurningCalendarProps) {
  const model = useCalendarModel(analysis, sensorView, smartFilter)
  const { tokens } = useTheme()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportId) return
    calendarLegendRegistry.set(exportId, {
      ...legendItems(model, sensorView, tokens),
      scaleTitle: sensorView === 'harmonized' ? 'Burning Activity Index class' : `Raw ${sensorView.toUpperCase()} detections per day (not BAI)`,
    })
    return () => {
      calendarLegendRegistry.delete(exportId)
    }
  }, [exportId, model, sensorView, tokens])
  const anchor = selectedDate ?? endDate
  const year = Number(anchor.slice(0, 4))
  const month = Number(anchor.slice(5, 7))

  const clamp = (d: string) => (d < analysis.firstDate ? analysis.firstDate : d > analysis.lastDate ? analysis.lastDate : d)
  const go = (d: string) => onSelect(clamp(d))

  // Keep keyboard focus on the selected cell in Month view.
  useEffect(() => {
    if (view !== 'month' || !rootRef.current?.contains(document.activeElement)) return
    rootRef.current.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
  }, [selectedDate, view])

  const onKeyDown = (e: KeyboardEvent) => {
    if (!selectedDate) return
    const steps: Record<CalendarView, Record<string, number>> = {
      year: { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 },
      month: { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 },
      multi: { ArrowLeft: -7, ArrowRight: 7 },
    }
    if (view === 'multi' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      go(shiftYear(selectedDate, e.key === 'ArrowUp' ? -1 : 1))
      return
    }
    const s = steps[view][e.key]
    if (s !== undefined) {
      e.preventDefault()
      go(addDays(selectedDate, s))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onOpenDetails?.()
    }
  }

  const sel = selectedDate ? analysis.days[analysis.dayIndex.get(selectedDate) ?? -1] : undefined
  const announce = sel
    ? `${fmtDate(sel.date)}: ${sel.source === 'none' ? 'no satellite coverage' : sensorView === 'harmonized' ? `BAI ${sel.bai.toFixed(0)}, ${sel.cls === 'none' ? 'no detections' : CLASS_LABEL[sel.cls]}` : `${fmtNum(sensorView === 'modis' ? sel.modisCount : sel.viirsCount)} ${sensorView.toUpperCase()} detections`}`
    : selectedDate
      ? `${fmtDate(selectedDate)}: outside the loaded record`
      : ''

  const firstYear = Number(analysis.firstDate.slice(0, 4))
  const lastYear = Number(analysis.lastDate.slice(0, 4))
  const years = view === 'year' ? [year, ...compareYears.filter((y) => y !== year && y >= firstYear && y <= lastYear).slice(0, 2)] : []

  return (
    <div ref={rootRef} data-calendar-export={exportId}>
      {view !== 'multi' && !compact && (
        <div className="mb-3 flex items-center gap-1">
          <button
            type="button"
            aria-label={view === 'year' ? 'Previous year' : 'Previous month'}
            onClick={() => go(view === 'year' ? shiftYear(anchor, -1) : shiftMonth(anchor, -1))}
            disabled={view === 'year' ? year <= firstYear : anchor.slice(0, 7) <= analysis.firstDate.slice(0, 7)}
            className="rounded-md p-1.5 text-fg-muted hover:bg-ink-700 hover:text-fg disabled:opacity-30"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-fg">
            {view === 'year' ? year : `${MONTH_NAMES[month - 1]} ${year}`}
          </span>
          <button
            type="button"
            aria-label={view === 'year' ? 'Next year' : 'Next month'}
            onClick={() => go(view === 'year' ? shiftYear(anchor, 1) : shiftMonth(anchor, 1))}
            disabled={view === 'year' ? year >= lastYear : anchor.slice(0, 7) >= analysis.lastDate.slice(0, 7)}
            className="rounded-md p-1.5 text-fg-muted hover:bg-ink-700 hover:text-fg disabled:opacity-30"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div
        tabIndex={view === 'month' ? -1 : 0}
        role="application"
        aria-roledescription="calendar"
        aria-label={`Burning activity calendar, ${view === 'multi' ? 'multi-year weekly overview' : view === 'year' ? `year ${year}` : `${MONTH_NAMES[month - 1]} ${year}`}. Arrow keys move the selected day; Enter opens its details.`}
        onKeyDown={onKeyDown}
        className="rounded-lg outline-offset-4"
      >
        {view === 'year' && (
          <div className="space-y-5">
            {years.map((y, i) => (
              <YearView
                key={y}
                analysis={analysis}
                year={y}
                model={model}
                sensorView={sensorView}
                selectedDate={selectedDate}
                isPlaying={isPlaying}
                showSeasons={showSeasons}
                onSelect={onSelect}
                canvasId={exportId ? `${exportId}-year-${i}` : undefined}
                showHeader={years.length > 1 || showSeasons}
              />
            ))}
          </div>
        )}
        {view === 'multi' && (
          <MultiYearView
            analysis={analysis}
            startDate={startDate}
            endDate={endDate}
            model={model}
            sensorView={sensorView}
            selectedDate={selectedDate}
            isPlaying={isPlaying}
            showSeasons={showSeasons}
            onOpenWeek={(d) => {
              onSelect(d)
              onViewChange?.('year')
            }}
            canvasId={exportId ? `${exportId}-multi` : undefined}
            compact={compact}
          />
        )}
        {view === 'month' && (
          <MonthView
            analysis={analysis}
            year={year}
            month={month}
            model={model}
            sensorView={sensorView}
            selectedDate={selectedDate}
            isPlaying={isPlaying}
            onSelect={onSelect}
            onOpenDetails={() => onOpenDetails?.()}
          />
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {showLegend && (
        <div className="mt-4 border-t border-line pt-3">
          <CalendarLegend model={model} sensorView={sensorView} />
        </div>
      )}
    </div>
  )
}

export { useCalendarModel }
