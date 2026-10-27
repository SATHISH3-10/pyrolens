import type { ActivityClass, DataSource, RiskLevel } from '@/types/activity'
import type { ResolvedTheme } from '@/context/ThemeContext'

/**
 * CSS-variable references for DOM styles (inline `style`), so they follow the theme without a re-render.
 * Canvas and SVG/Recharts attributes must use the resolved hex values from `useTheme().tokens` instead.
 */
export const ACTIVITY_COLORS: Record<ActivityClass, string> = {
  none: 'var(--bai-zero)',
  low: 'var(--bai-low)',
  moderate: 'var(--bai-moderate)',
  high: 'var(--bai-high)',
  very_high: 'var(--bai-very-high)',
  extreme: 'var(--bai-extreme)',
}

export const SENSOR_COLORS = {
  MODIS: 'var(--sensor-modis)',
  VIIRS: 'var(--sensor-viirs)',
  harmonized: 'var(--sensor-harmonized)',
} as const

export const ACTIVITY_ORDER: ActivityClass[] = ['low', 'moderate', 'high', 'very_high', 'extreme']

/** Status palette for the outlook (fixed, never themed); always paired with a text label. */
export const RISK_STYLES: Record<RiskLevel, { label: string; color: string; text: string; ring: string; bg: string }> = {
  low: { label: 'Low', color: '#2f8f72', text: 'text-emerald-300', ring: 'ring-emerald-400/30', bg: 'bg-emerald-400/10' },
  moderate: { label: 'Moderate', color: '#e3b53b', text: 'text-amber-200', ring: 'ring-amber-300/30', bg: 'bg-amber-300/10' },
  elevated: { label: 'Elevated', color: '#f0862c', text: 'text-orange-300', ring: 'ring-orange-400/40', bg: 'bg-orange-400/10' },
  critical: { label: 'Critical', color: '#e0412f', text: 'text-red-300', ring: 'ring-red-400/40', bg: 'bg-red-500/15' },
}

export const SOURCE_LABEL: Record<DataSource, string> = {
  combined: 'MODIS + VIIRS observed',
  viirs: 'VIIRS observed',
  modis_scaled: 'MODIS scaled to VIIRS',
  modis_unscaled: 'MODIS (unscaled)',
  none: 'No coverage',
}

export const SOURCE_SHORT: Record<DataSource, string> = {
  combined: 'M+V',
  viirs: 'V',
  modis_scaled: 'M→V',
  modis_unscaled: 'M',
  none: '—',
}

/** Text colour that stays legible (≥4.5:1) on an activity fill, per theme palette. */
export function inkOn(cls: ActivityClass, mode: ResolvedTheme): string {
  if (cls === 'none') return mode === 'light' ? '#111111' : '#ffffff'
  if (mode === 'dark') return cls === 'low' || cls === 'moderate' ? '#ffffff' : '#111111'
  return cls === 'low' || cls === 'moderate' ? '#111111' : '#ffffff'
}
