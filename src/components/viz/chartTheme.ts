/** Shared Recharts styling so every chart reads as one system. */
export const AXIS_TICK = { fill: '#6c7584', fontSize: 11 }
export const GRID_STROKE = '#20252e'
export const AXIS_STROKE = '#2d3440'

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(17,20,25,0.96)',
    border: '1px solid #2d3440',
    borderRadius: 8,
    fontSize: 12,
    color: '#eceef2',
    padding: '8px 10px',
  },
  labelStyle: { color: '#eceef2', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: '#a1a9b6', padding: 0 },
  cursor: { stroke: '#4b5563', strokeWidth: 1 },
} as const
