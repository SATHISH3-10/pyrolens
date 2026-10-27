export type RGBA = [number, number, number, number]

/** Parses "#rgb", "#rrggbb", "rgb(r g b / a)" or "rgb(r, g, b)" token strings into a deck.gl RGBA tuple. */
export function toRGBA(color: string, alpha = 255): RGBA {
  const c = color.trim()
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7)
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha]
  }
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
    const a = parts[3] !== undefined ? Math.round(parts[3] * 255) : alpha
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, a]
  }
  return [128, 128, 128, alpha]
}

export function withAlpha([r, g, b]: readonly number[], a: number): RGBA {
  return [r ?? 0, g ?? 0, b ?? 0, a]
}
