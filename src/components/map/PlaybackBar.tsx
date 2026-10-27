import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import type { ActivityAnalysis } from '@/types/activity'
import { useTheme } from '@/context/ThemeContext'
import { WINDOW_LABELS, type WindowMode } from '@/utils/mapFilters'
import { Segmented } from '@/components/ui'
import { cn, fmtDate } from '@/lib'

export type PlaybackSpeed = 1 | 3 | 7

interface PlaybackBarProps {
  analysis: ActivityAnalysis
  date: string
  onChange: (date: string) => void
  playing: boolean
  onPlayingChange: (playing: boolean) => void
  speed: PlaybackSpeed
  onSpeedChange: (s: PlaybackSpeed) => void
  windowMode: WindowMode
  onWindowModeChange: (m: WindowMode) => void
  className?: string
}

/** Scrubber over the whole loaded range, with a daily-BAI sparkline and play/pause at 1/3/7 days per second. */
export function PlaybackBar({
  analysis,
  date,
  onChange,
  playing,
  onPlayingChange,
  speed,
  onSpeedChange,
  windowMode,
  onWindowModeChange,
  className,
}: PlaybackBarProps) {
  const { tokens } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const n = analysis.days.length
  const index = analysis.dayIndex.get(date) ?? 0

  // Sparkline: maximum BAI per pixel column across the loaded range, coloured by that day's class.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cols = Math.max(1, Math.floor(w))
      for (let c = 0; c < cols; c++) {
        const i0 = Math.floor((c / cols) * n)
        const i1 = Math.max(i0 + 1, Math.floor(((c + 1) / cols) * n))
        let best = analysis.days[i0]
        for (let i = i0; i < i1 && i < n; i++) if (best && analysis.days[i]!.bai > best.bai) best = analysis.days[i]
        if (!best) continue
        if (best.source === 'none') {
          ctx.fillStyle = tokens.nocov
          ctx.fillRect(c, h - 2, 1, 2)
          continue
        }
        const bh = best.cls === 'none' ? 1.5 : 2 + (best.bai / 100) * (h - 3)
        ctx.fillStyle = best.cls === 'none' ? tokens.zero : tokens.bai[best.cls]
        ctx.fillRect(c, h - bh, 1, bh)
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [analysis, n, tokens])

  const step = (delta: number) => {
    onPlayingChange(false)
    const next = analysis.days[Math.min(n - 1, Math.max(0, index + delta))]
    if (next) onChange(next.date)
  }

  return (
    <div className={cn('panel-float flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5', className)}>
      <button
        type="button"
        onClick={() => onPlayingChange(!playing)}
        aria-label={playing ? 'Pause playback' : 'Play through time'}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ember-500 text-on-accent transition-colors hover:bg-ember-600"
      >
        {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="ml-0.5 size-4" aria-hidden="true" />}
      </button>
      <div className="flex shrink-0 items-center">
        <button type="button" aria-label="Previous day" onClick={() => step(-1)} className="rounded p-1 text-fg-muted hover:text-fg">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="w-[6.5rem] text-center text-[13px] font-semibold tabular text-fg" aria-live="polite">
          {fmtDate(date)}
        </span>
        <button type="button" aria-label="Next day" onClick={() => step(1)} className="rounded p-1 text-fg-muted hover:text-fg">
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="relative order-last h-12 min-w-0 basis-full md:order-none md:basis-0 md:flex-1">
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-x-0 top-0 h-6 w-full" aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={Math.max(0, n - 1)}
          value={index}
          aria-label="Date"
          aria-valuetext={fmtDate(date)}
          onPointerDown={() => onPlayingChange(false)}
          onKeyDown={() => onPlayingChange(false)}
          onChange={(e) => {
            const d = analysis.days[Number(e.target.value)]
            if (d) onChange(d.date)
          }}
          className="absolute inset-x-0 top-[1.125rem] w-full"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px] leading-none text-fg-faint">
          <span>{analysis.firstDate.slice(0, 4)}</span>
          <span>{analysis.lastDate.slice(0, 4)}</span>
        </div>
      </div>

      <Segmented
        aria-label="Playback speed"
        value={String(speed) as '1' | '3' | '7'}
        onChange={(v) => onSpeedChange(Number(v) as PlaybackSpeed)}
        options={[
          { value: '1', label: '1 d/s', title: '1 day per second' },
          { value: '3', label: '3 d/s', title: '3 days per second' },
          { value: '7', label: '7 d/s', title: '7 days per second' },
        ]}
      />
      <label className="flex items-center gap-1.5 text-xs text-fg-muted">
        <span className="sr-only sm:not-sr-only">Window</span>
        <select
          value={windowMode}
          onChange={(e) => {
            onPlayingChange(false)
            onWindowModeChange(e.target.value as WindowMode)
          }}
          className="field py-1 text-xs"
        >
          {(Object.keys(WINDOW_LABELS) as WindowMode[]).map((m) => (
            <option key={m} value={m}>
              {WINDOW_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
