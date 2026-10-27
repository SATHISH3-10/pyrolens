/** Pure hotspot styling maths (no deck.gl import, so it is testable in Node). */
export const HOTSPOT_RADIUS = { min: 2.5, max: 9 }

/** Pixel radius from FRP, clamped so very large fires do not hide their neighbours. */
export function hotspotRadius(frp: number | null): number {
  const f = frp !== null && Number.isFinite(frp) && frp > 0 ? frp : 0
  return Math.min(HOTSPOT_RADIUS.max, Math.max(HOTSPOT_RADIUS.min, 2.5 + 1.6 * Math.sqrt(f / 10)))
}
