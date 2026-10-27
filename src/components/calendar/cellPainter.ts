import type { ThemeTokens } from '@/context/ThemeContext'
import type { CellState } from '@/utils/calendarLayout'
import { toRGBA } from '@/components/map/colorUtils'

/** Visual encoding of one calendar cell; identical across Year, Multi-year and (via CSS) Month views. */
export interface CellPaint {
  state: CellState
  fill: string | null // used when state === 'active'
  limited: boolean
  scaled: boolean
  anomaly: 'none' | 'above_normal' | 'extreme'
  dim: boolean
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export function paintCell(ctx: CanvasRenderingContext2D, t: ThemeTokens, x: number, y: number, w: number, h: number, p: CellPaint) {
  const r = Math.min(3, w / 4)
  ctx.save()
  ctx.globalAlpha = p.dim ? 0.18 : 1

  if (p.state === 'unknown') {
    // Unknown coverage: empty cell with a dashed border — never drawn as zero.
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r)
    ctx.setLineDash([2, 2])
    ctx.strokeStyle = t.unknown
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
    return
  }

  if (p.state === 'no_coverage') {
    // No satellite coverage: neutral diagonal hatch.
    roundRect(ctx, x, y, w, h, r)
    ctx.fillStyle = t.surface
    ctx.fill()
    ctx.save()
    roundRect(ctx, x, y, w, h, r)
    ctx.clip()
    ctx.strokeStyle = t.nocov
    ctx.lineWidth = 1
    for (let k = -h; k < w; k += 4) {
      ctx.beginPath()
      ctx.moveTo(x + k, y + h)
      ctx.lineTo(x + k + h, y)
      ctx.stroke()
    }
    ctx.restore()
    ctx.restore()
    return
  }

  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = p.state === 'zero' ? t.zero : (p.fill ?? t.zero)
  ctx.fill()

  if (p.limited) {
    // Limited observation: small corner triangle (top-right).
    const s = Math.max(4, Math.min(w, h) * 0.42)
    ctx.beginPath()
    ctx.moveTo(x + w - s, y)
    ctx.lineTo(x + w, y)
    ctx.lineTo(x + w, y + s)
    ctx.closePath()
    ctx.fillStyle = t.limited
    ctx.fill()
  }

  if (p.scaled) {
    // MODIS-scaled estimate: small centre dot.
    ctx.beginPath()
    ctx.arc(x + w / 2, y + h / 2, Math.max(1.3, Math.min(w, h) * 0.13), 0, Math.PI * 2)
    ctx.fillStyle = t.scaledDot
    ctx.fill()
  }

  if (p.anomaly !== 'none' && Math.min(w, h) >= 7) {
    // Anomaly: single ring; extreme anomaly: double ring. Kept thin so dense anomalous seasons stay readable.
    ctx.strokeStyle = t.anomalyRing
    ctx.lineWidth = 1.5
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, r)
    ctx.stroke()
    if (p.anomaly === 'extreme' && Math.min(w, h) >= 11) {
      roundRect(ctx, x + 3.5, y + 3.5, w - 7, h - 7, Math.max(1, r - 1))
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Five-step single-hue ramp from the empty-cell colour to a sensor colour, for raw-count views. */
export function rawRamp(t: ThemeTokens, sensor: 'MODIS' | 'VIIRS'): string[] {
  const a = toRGBA(t.zero)
  const b = toRGBA(t.sensors[sensor])
  return [0.28, 0.46, 0.64, 0.82, 1].map((k) => {
    const c = [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * k))
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
  })
}

/** Prepares a crisp HiDPI canvas of CSS size w×h and returns its 2D context. */
export function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return ctx
}
