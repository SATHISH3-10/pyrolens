import { describe, expect, it } from 'vitest'
import type { DailyActivity } from '@/types/activity'
import {
  dayCellState,
  displayedAnomaly,
  historyYearsByDoy,
  isLeapYear,
  MIN_ANOMALY_HISTORY_YEARS,
  monthGrid,
  parseUrlDate,
  rawBinIndex,
  rawBins,
  weekdayMon0,
  yearGrid,
} from '@/utils/calendarLayout'

function day(p: Partial<DailyActivity> & { date: string }): DailyActivity {
  return {
    year: Number(p.date.slice(0, 4)),
    month: Number(p.date.slice(5, 7)),
    doy: 1,
    modisCount: 0,
    viirsCount: 0,
    modisFrp: 0,
    viirsFrp: 0,
    modisSats: 2,
    viirsSats: 1,
    modisClusters: 0,
    viirsClusters: 0,
    dayDetections: 0,
    nightDetections: 0,
    lowConfidenceRemoved: 0,
    maxFrp: null,
    harmonizedCount: 0,
    harmonizedCountLow: 0,
    harmonizedCountHigh: 0,
    harmonizedFrp: 0,
    harmonizedClusters: 0,
    source: 'combined',
    bai: 0,
    percentile: null,
    cls: 'none',
    quality: 'good',
    qualityScore: 1,
    climP50: 0,
    climP90: 0,
    climP97: 0,
    anomaly: 'none',
    criticalPeriodId: null,
    ...p,
  }
}

describe('year grid (GitHub layout, Monday-first)', () => {
  it('needs 54 columns for a leap year that starts on a Sunday (2012)', () => {
    expect(weekdayMon0('2012-01-01')).toBe(6)
    const g = yearGrid(2012)
    expect(g.cells).toHaveLength(366)
    expect(g.columns).toBe(54)
    expect(g.cells[0]).toEqual({ date: '2012-01-01', col: 0, row: 6 })
    expect(g.cells[365]!.col).toBe(53)
  })

  it('needs 53 columns for a common year starting on a Sunday (2023) and a leap year starting on a Monday (2024)', () => {
    expect(yearGrid(2023).columns).toBe(53)
    expect(yearGrid(2023).cells).toHaveLength(365)
    expect(yearGrid(2024).columns).toBe(53)
    expect(yearGrid(2024).cells[0]).toEqual({ date: '2024-01-01', col: 0, row: 0 })
  })

  it('places Feb 29 and month starts correctly in a leap year', () => {
    const g = yearGrid(2024)
    expect(g.cells.find((c) => c.date === '2024-02-29')).toBeDefined()
    expect(g.monthStartCols[0]).toBe(0)
    // 1 March 2024 is day index 60; Jan 1 is Monday, so column 60/7 → 8
    expect(g.monthStartCols[2]).toBe(8)
    expect(isLeapYear(2024) && !isLeapYear(2100) && isLeapYear(2000)).toBe(true)
  })
})

describe('month grid', () => {
  it('pads a month starting on Sunday to five Monday-first rows (Feb 2026)', () => {
    const g = monthGrid(2026, 2)
    expect(g).toHaveLength(5)
    expect(g[0]!.slice(0, 6).every((c) => c === null)).toBe(true)
    expect(g[0]![6]).toBe('2026-02-01')
    expect(g.flat().filter(Boolean)).toHaveLength(28)
  })

  it('fits a 28-day February that starts on Monday into exactly four rows (Feb 2021)', () => {
    expect(monthGrid(2021, 2)).toHaveLength(4)
  })

  it('includes Feb 29 in leap years', () => {
    expect(monthGrid(2024, 2).flat()).toContain('2024-02-29')
  })
})

describe('cell state resolution', () => {
  it('distinguishes unknown, no coverage, zero and active', () => {
    expect(dayCellState(undefined)).toBe('unknown')
    expect(dayCellState(day({ date: '2020-01-01', source: 'none', modisSats: 0, viirsSats: 0 }))).toBe('no_coverage')
    expect(dayCellState(day({ date: '2020-01-01' }))).toBe('zero')
    expect(dayCellState(day({ date: '2020-01-01', harmonizedCount: 2 }))).toBe('active')
  })

  it('uses per-sensor coverage in raw views', () => {
    const preViirs = day({ date: '2008-01-01', viirsSats: 0, modisCount: 3, source: 'modis_scaled', harmonizedCount: 9 })
    expect(dayCellState(preViirs, 'viirs')).toBe('no_coverage')
    expect(dayCellState(preViirs, 'modis')).toBe('active')
  })
})

describe('anomaly honesty', () => {
  it('reports insufficient history below the minimum number of covered years', () => {
    const days = Array.from({ length: MIN_ANOMALY_HISTORY_YEARS - 1 }, (_, i) =>
      day({ date: `${2020 + i}-01-01`, doy: 1, anomaly: 'extreme' }),
    )
    const history = historyYearsByDoy(days)
    expect(history[0]).toBe(MIN_ANOMALY_HISTORY_YEARS - 1)
    expect(displayedAnomaly(days[0]!, history)).toBe('insufficient')
    const more = [...days, day({ date: '2030-01-01', doy: 1 })]
    expect(displayedAnomaly(days[0]!, historyYearsByDoy(more))).toBe('extreme')
  })

  it('does not count days without coverage as history', () => {
    const h = historyYearsByDoy([day({ date: '2020-01-01', doy: 1, source: 'none' })])
    expect(h[0]).toBe(0)
  })
})

describe('raw-count bins', () => {
  it('produces strictly increasing bounds and five reachable bins', () => {
    const bins = rawBins([1, 1, 1, 1, 2, 5, 9, 30])
    for (let i = 1; i < bins.length; i++) expect(bins[i]!).toBeGreaterThan(bins[i - 1]!)
    expect(rawBinIndex(1, bins)).toBe(0)
    expect(rawBinIndex(1000, bins)).toBe(4)
  })
})

describe('URL date parsing', () => {
  it('accepts valid ISO dates and rejects malformed or impossible ones', () => {
    expect(parseUrlDate('2024-02-29')).toBe('2024-02-29')
    expect(parseUrlDate('2023-02-29')).toBeNull()
    expect(parseUrlDate('2024-13-01')).toBeNull()
    expect(parseUrlDate('20240301')).toBeNull()
    expect(parseUrlDate(null)).toBeNull()
  })
})
