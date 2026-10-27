import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import type { ActivityAnalysis } from '@/types/activity'
import { CLASS_LABEL } from '@/utils/burningActivity'
import { useTheme } from '@/context/ThemeContext'
import { cn, fmtDate } from '@/lib'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

interface TimelineScrubberProps {
  analysis: ActivityAnalysis
  date: string
  windowStart: string
  windowEnd: string
  onChange: (date: string) => void
  playing: boolean
  onTogglePlay: () => void
  className?: string
}

/** One-year strip of daily BAI used to scrub the map through time. */
export function TimelineScrubber({
  analysis,
  date,
  windowStart,
  windowEnd,
  onChange,
  playing,
  onTogglePlay,
  className,
}: TimelineScrubberProps) {
  const year = Number(date.slice(0, 4))
  const { tokens } = useTheme()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const firstYear = Number(analysis.firstDate.slice(0, 4))
  const lastYear = Number(analysis.lastDate.slice(0, 4))

  const days = useMemo(() => analysis.days.filter((d) => d.year === year), [analysis, year])
  const W = 1000
  const H = 44
  // Fixed 365 slots positioned by day of year, so partial years (short imports) line up with the month labels.
  const SLOTS = 365
  const bw = W / SLOTS
  const byDoy = useMemo(() => new Map(days.map((d) => [d.doy - 1, d])), [days])

  const pick = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    const i = Math.floor(((clientX - r.left) / r.width) * SLOTS)
    return Math.max(0, Math.min(SLOTS - 1, i))
  }

  const changeYear = (delta: number) => {
    const y = Math.min(lastYear, Math.max(firstYear, year + delta))
    let next = `${y}${date.slice(4)}`
    if (next.endsWith('02-29')) next = `${y}-02-28`
    if (next < analysis.firstDate) next = analysis.firstDate
    if (next > analysis.lastDate) next = analysis.lastDate
    onChange(next)
  }

  const hoverDay = hover !== null ? byDoy.get(hover) : undefined
  const inWindow = days.filter((d) => d.date >= windowStart && d.date <= windowEnd)
  const winStartIdx = inWindow.length ? inWindow[0]!.doy - 1 : -1
  const winEndIdx = inWindow.length ? inWindow[inWindow.length - 1]!.doy - 1 : -1
  const selectedIdx = days.find((d) => d.date === date)?.doy

  return (
    <div className={cn('panel-float flex items-center gap-3 px-3 py-2.5', className)}>
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause animation' : 'Play through time'}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ember-500 text-on-accent transition-colors hover:bg-ember-600"
      >
        {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
      </button>
      <div className="flex shrink-0 items-center">
        <button type="button" aria-label="Previous year" onClick={() => changeYear(-1)} disabled={year <= firstYear} className="rounded p-1 text-fg-muted hover:text-fg disabled:opacity-30">
          <ChevronLeft className="size-4" />
        </button>
        <span className="w-10 text-center font-mono text-sm font-semibold text-fg">{year}</span>
        <button type="button" aria-label="Next year" onClick={() => changeYear(1)} disabled={year >= lastYear} className="rounded p-1 text-fg-muted hover:text-fg disabled:opacity-30">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="relative min-w-0 flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H + 12}`}
          preserveAspectRatio="none"
          className="block h-14 w-full cursor-pointer"
          role="slider"
          aria-label="Date"
          aria-valuetext={fmtDate(date)}
          tabIndex={0}
          onKeyDown={(e) => {
            const i = days.findIndex((d) => d.date === date)
            if (e.key === 'ArrowRight' && days[i + 1]) onChange(days[i + 1]!.date)
            if (e.key === 'ArrowLeft' && days[i - 1]) onChange(days[i - 1]!.date)
          }}
          onMouseMove={(e) => setHover(pick(e.clientX))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const i = pick(e.clientX)
            const d = i !== null ? byDoy.get(i) : undefined
            if (d) onChange(d.date)
          }}
        >
          {winStartIdx >= 0 && winEndIdx >= winStartIdx && (
            <rect x={winStartIdx * bw} y={0} width={(winEndIdx - winStartIdx + 1) * bw} height={H} fill={tokens.text} opacity={0.08} />
          )}
          {days.map((d) => {
            const h = d.cls === 'none' ? (d.quality === 'limited' ? 4 : 2) : 4 + (d.bai / 100) * (H - 6)
            return (
              <rect
                key={d.date}
                x={(d.doy - 1) * bw}
                y={H - h}
                width={Math.max(bw - 0.6, 0.8)}
                height={h}
                fill={d.cls === 'none' ? (d.quality === 'limited' ? tokens.unknown : tokens.zero) : tokens.bai[d.cls]}
              />
            )
          })}
          {selectedIdx !== undefined && (
            <rect x={(selectedIdx - 1) * bw - 1} y={0} width={Math.max(bw, 2.5)} height={H} fill={tokens.accentRing} />
          )}
          {MONTHS.map((m, i) => (
            <text key={i} x={(i / 12) * W + 4} y={H + 10} fontSize="9" fill={tokens.textFaint}>
              {m}
            </text>
          ))}
        </svg>
        {hoverDay && (
          <div
            className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-md border border-line-strong bg-ink-850 px-2 py-1 text-[11px] text-fg shadow-lg"
            style={{ left: `${((hover ?? 0) / SLOTS) * 100}%`, transform: 'translateX(-50%)' }}
          >
            {fmtDate(hoverDay.date)} · <span className="font-semibold">{CLASS_LABEL[hoverDay.cls]}</span> · BAI{' '}
            {hoverDay.bai.toFixed(0)}
          </div>
        )}
      </div>
    </div>
  )
}
