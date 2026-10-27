import type { ThemeTokens } from '@/context/ThemeContext'

/** Shared Recharts styling derived from the active theme tokens, so every chart reads as one system. */
export function chartStyles(t: ThemeTokens) {
  return {
    tick: { fill: t.chart.tick, fontSize: 11 },
    grid: t.chart.grid,
    axis: t.chart.axis,
    tooltip: {
      contentStyle: {
        background: t.chart.tooltipBg,
        border: `1px solid ${t.chart.tooltipBorder}`,
        borderRadius: 8,
        fontSize: 12,
        color: t.text,
        padding: '8px 10px',
      },
      labelStyle: { color: t.text, fontWeight: 600, marginBottom: 4 },
      itemStyle: { color: t.textMuted, padding: 0 },
      cursor: { stroke: t.borderStrong, strokeWidth: 1 },
    },
  }
}
