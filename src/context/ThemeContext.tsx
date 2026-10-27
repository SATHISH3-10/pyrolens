import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ActivityClass } from '@/types/activity'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'pyrolens.theme'

/** Resolved colour tokens for renderers that cannot use CSS variables directly (canvas, SVG attributes). */
export interface ThemeTokens {
  mode: ResolvedTheme
  bai: Record<ActivityClass, string>
  zero: string
  nocov: string
  unknown: string
  limited: string
  scaledDot: string
  anomalyRing: string
  sensors: { MODIS: string; VIIRS: string; harmonized: string }
  chart: {
    grid: string
    axis: string
    tick: string
    band: string
    median: string
    threshold: string
    tooltipBg: string
    tooltipBorder: string
  }
  page: string
  surface: string
  raised: string
  chip: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  accentText: string
  signal: string
  accentRing: string
  focusRing: string
  aoi: string
  mapBg: string
  panelBg: string
}

export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  return systemPrefersLight ? 'light' : 'dark'
}

export function parseStoredPreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function readPreference(): ThemePreference {
  try {
    return parseStoredPreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches === true
}

export function readTokens(mode: ResolvedTheme): ThemeTokens {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(name).trim()
  return {
    mode,
    bai: {
      none: v('--bai-zero'),
      low: v('--bai-low'),
      moderate: v('--bai-moderate'),
      high: v('--bai-high'),
      very_high: v('--bai-very-high'),
      extreme: v('--bai-extreme'),
    },
    zero: v('--bai-zero'),
    nocov: v('--bai-nocov'),
    unknown: v('--bai-unknown'),
    limited: v('--bai-limited'),
    scaledDot: v('--bai-scaled-dot'),
    anomalyRing: v('--bai-anomaly-ring'),
    sensors: { MODIS: v('--sensor-modis'), VIIRS: v('--sensor-viirs'), harmonized: v('--sensor-harmonized') },
    chart: {
      grid: v('--chart-grid'),
      axis: v('--chart-axis'),
      tick: v('--chart-tick'),
      band: v('--chart-band'),
      median: v('--chart-median'),
      threshold: v('--chart-threshold'),
      tooltipBg: v('--chart-tooltip-bg'),
      tooltipBorder: v('--chart-tooltip-border'),
    },
    page: v('--color-ink-950'),
    surface: v('--color-ink-850'),
    raised: v('--color-ink-800'),
    chip: v('--color-ink-700'),
    border: v('--color-line'),
    borderStrong: v('--color-line-strong'),
    text: v('--color-fg'),
    textMuted: v('--color-fg-muted'),
    textFaint: v('--color-fg-faint'),
    accent: v('--color-ember-500'),
    accentText: v('--color-ember-400'),
    signal: v('--color-signal-400'),
    accentRing: v('--accent-ring'),
    focusRing: v('--focus-ring'),
    aoi: v('--aoi-stroke'),
    mapBg: v('--map-bg'),
    panelBg: v('--panel-bg'),
  }
}

interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (p: ThemePreference) => void
  tokens: ThemeTokens
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const [systemLight, setSystemLight] = useState<boolean>(systemPrefersLight)
  const resolved = resolveTheme(preference, systemLight)
  const [tokens, setTokens] = useState<ThemeTokens>(() => {
    document.documentElement.setAttribute('data-theme', resolved)
    return readTokens(resolved)
  })

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!mq) return
    const onChange = () => setSystemLight(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Apply the attribute, then re-read tokens synchronously so canvas/charts redraw in the same frame.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolved)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f4f5f7' : '#08090c')
    setTokens(readTokens(resolved))
  }, [resolved])

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, p)
    } catch {
      /* storage unavailable: keep in-memory preference only */
    }
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference, tokens }), [preference, resolved, setPreference, tokens])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
