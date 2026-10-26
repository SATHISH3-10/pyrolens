import type { ActivityClass, DataSource, RiskLevel } from '@/types/activity'

/** Hex values mirror the --color-act-* tokens so canvas and SVG renderers can use them directly. */
export const ACTIVITY_COLORS: Record<ActivityClass, string> = {
  none: '#1a1f27',
  low: '#2f8f72',
  moderate: '#e3b53b',
  high: '#f0862c',
  very_high: '#e0412f',
  extreme: '#a3123a',
}

export const LIMITED_COLOR = '#4a515d'
export const NO_COVERAGE_COLOR = '#0f1216'

export const SENSOR_COLORS = {
  MODIS: '#e8703a',
  VIIRS: '#3987e5',
  harmonized: '#22b07d',
} as const

export const ACTIVITY_ORDER: ActivityClass[] = ['low', 'moderate', 'high', 'very_high', 'extreme']

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

/** Text color that stays legible on top of an activity fill. */
export function inkOn(cls: ActivityClass): string {
  return cls === 'moderate' || cls === 'high' ? '#111' : '#fff'
}
