import type {
  DateAggregate,
  FireObservation,
  HarmonizationMetrics,
  MonthAggregate,
  MultiYearComparisonRecord,
  MultiYearDayData,
  MultiYearMonthData,
  ObservationFilter,
  PrimaryMetricType,
  RegionAggregate,
  SpatialGridCell,
  SummaryMetrics,
} from '@/types/fire'
import { getRegionById, REGIONS } from '@/data/regions'

/**
 * Standard spatial grid snapping key.
 * Formats coordinates into consistent string hashes for cell identification.
 */
export function getGridCellKey(lat: number, lng: number, cellSizeDegrees = 0.25): string {
  const gridLat = Math.floor(lat / cellSizeDegrees) * cellSizeDegrees
  const gridLng = Math.floor(lng / cellSizeDegrees) * cellSizeDegrees
  return `cell_${gridLat.toFixed(3)}_${gridLng.toFixed(3)}`
}

/**
 * Ray-casting algorithm (Jordan Curve Theorem) to determine if a point is inside a polygon.
 * Points array is expected in [latitude, longitude] format.
 */
export function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: readonly [number, number][],
): boolean {
  if (!polygon || polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Filter observations by sensor, date range, region, custom polygon, and optional criteria.
 */
export function filterObservations(
  records: readonly FireObservation[],
  filter: ObservationFilter,
): FireObservation[] {
  const { sensor, startDate, endDate, regionId, customPolygon, customAoi, daynight, minFrp } = filter

  const targetRegion = regionId !== 'all' && regionId !== 'custom' ? getRegionById(regionId) : undefined
  const activePolygon = customAoi?.points ?? customPolygon

  return records.filter((obs) => {
    // 1. Sensor check
    if (sensor !== 'ALL' && obs.instrument !== sensor) {
      return false
    }

    // 2. Date range check
    if (startDate && obs.acqDate < startDate) {
      return false
    }
    if (endDate && obs.acqDate > endDate) {
      return false
    }

    // 3. Custom Polygon AOI check (supports customAoi and customPolygon)
    if (activePolygon && activePolygon.length >= 3) {
      if (!isPointInPolygon(obs.latitude, obs.longitude, activePolygon)) {
        return false
      }
    } else if (regionId && regionId !== 'all' && regionId !== 'custom') {
      // 4. Predefined Region bounds check
      if (targetRegion) {
        const { minLat, maxLat, minLng, maxLng } = targetRegion.bounds
        if (
          obs.latitude < minLat ||
          obs.latitude > maxLat ||
          obs.longitude < minLng ||
          obs.longitude > maxLng
        ) {
          return false
        }
      } else if (obs.regionId !== regionId) {
        return false
      }
    }

    // 5. Day / Night check
    if (daynight && daynight !== 'ALL' && obs.daynight !== daynight) {
      return false
    }

    // 6. Min FRP check
    if (minFrp !== undefined && minFrp > 0) {
      if (obs.frp === null || obs.frp < minFrp) {
        return false
      }
    }

    return true
  })
}

/**
 * Calculate summary metrics from an observation subset.
 * Safely computes distinct active spatial grid cells (0.25°) and handles null FRPs cleanly.
 */
export function calculateSummaryMetrics(
  records: readonly FireObservation[],
  gridResolution = 0.25,
): SummaryMetrics {
  let modisCount = 0
  let viirsCount = 0
  let dayCount = 0
  let nightCount = 0

  let frpSum = 0
  let validFrpCount = 0
  let maxFrp: number | null = null
  let minFrp: number | null = null

  let modisFrpSum = 0
  let modisValidFrpCount = 0

  let viirsFrpSum = 0
  let viirsValidFrpCount = 0

  const datesSet = new Set<string>()
  const gridCellsSet = new Set<string>()

  for (const obs of records) {
    datesSet.add(obs.acqDate)
    gridCellsSet.add(getGridCellKey(obs.latitude, obs.longitude, gridResolution))

    if (obs.instrument === 'MODIS') {
      modisCount++
      if (obs.frp !== null && !isNaN(obs.frp)) {
        modisFrpSum += obs.frp
        modisValidFrpCount++
      }
    } else {
      viirsCount++
      if (obs.frp !== null && !isNaN(obs.frp)) {
        viirsFrpSum += obs.frp
        viirsValidFrpCount++
      }
    }

    if (obs.daynight === 'D') {
      dayCount++
    } else {
      nightCount++
    }

    if (obs.frp !== null && !isNaN(obs.frp)) {
      frpSum += obs.frp
      validFrpCount++
      if (maxFrp === null || obs.frp > maxFrp) maxFrp = obs.frp
      if (minFrp === null || obs.frp < minFrp) minFrp = obs.frp
    }
  }

  const sortedDates = Array.from(datesSet).sort()

  return {
    totalCount: records.length,
    modisCount,
    viirsCount,
    harmonizedActiveCells: gridCellsSet.size,
    distinctDatesCount: datesSet.size,
    avgFrp: validFrpCount > 0 ? Number((frpSum / validFrpCount).toFixed(1)) : null,
    validFrpCount,
    maxFrp: maxFrp !== null ? Number(maxFrp.toFixed(1)) : null,
    minFrp: minFrp !== null ? Number(minFrp.toFixed(1)) : null,
    dateRange: {
      min: sortedDates[0] ?? '',
      max: sortedDates[sortedDates.length - 1] ?? '',
    },
    modisAvgFrp:
      modisValidFrpCount > 0 ? Number((modisFrpSum / modisValidFrpCount).toFixed(1)) : null,
    viirsAvgFrp:
      viirsValidFrpCount > 0 ? Number((viirsFrpSum / viirsValidFrpCount).toFixed(1)) : null,
    dayCount,
    nightCount,
  }
}

/**
 * Aggregate observations by calendar date, calculating both raw counts and harmonized active cells.
 */
export function aggregateByDate(
  records: readonly FireObservation[],
  gridResolution = 0.25,
): DateAggregate[] {
  const map = new Map<
    string,
    {
      total: number
      modis: number
      viirs: number
      frpSum: number
      validFrpCount: number
      modisFrpSum: number
      modisValidFrpCount: number
      viirsFrpSum: number
      viirsValidFrpCount: number
      activeCells: Set<string>
    }
  >()

  for (const obs of records) {
    let entry = map.get(obs.acqDate)
    if (!entry) {
      entry = {
        total: 0,
        modis: 0,
        viirs: 0,
        frpSum: 0,
        validFrpCount: 0,
        modisFrpSum: 0,
        modisValidFrpCount: 0,
        viirsFrpSum: 0,
        viirsValidFrpCount: 0,
        activeCells: new Set<string>(),
      }
      map.set(obs.acqDate, entry)
    }

    entry.total++
    entry.activeCells.add(getGridCellKey(obs.latitude, obs.longitude, gridResolution))

    if (obs.instrument === 'MODIS') {
      entry.modis++
      if (obs.frp !== null && !isNaN(obs.frp)) {
        entry.modisFrpSum += obs.frp
        entry.modisValidFrpCount++
      }
    } else {
      entry.viirs++
      if (obs.frp !== null && !isNaN(obs.frp)) {
        entry.viirsFrpSum += obs.frp
        entry.viirsValidFrpCount++
      }
    }

    if (obs.frp !== null && !isNaN(obs.frp)) {
      entry.frpSum += obs.frp
      entry.validFrpCount++
    }
  }

  const result: DateAggregate[] = []
  const sortedDates = Array.from(map.keys()).sort()

  for (const date of sortedDates) {
    const d = map.get(date)!
    result.push({
      date,
      total: d.total,
      harmonizedActiveCells: d.activeCells.size,
      modis: d.modis,
      viirs: d.viirs,
      avgFrp: d.validFrpCount > 0 ? Number((d.frpSum / d.validFrpCount).toFixed(1)) : null,
      modisAvgFrp:
        d.modisValidFrpCount > 0 ? Number((d.modisFrpSum / d.modisValidFrpCount).toFixed(1)) : null,
      viirsAvgFrp:
        d.viirsValidFrpCount > 0 ? Number((d.viirsFrpSum / d.viirsValidFrpCount).toFixed(1)) : null,
    })
  }

  return result
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Aggregate observations by month with harmonized active cell counts.
 */
export function aggregateByMonth(
  records: readonly FireObservation[],
  gridResolution = 0.25,
): MonthAggregate[] {
  const map = new Map<
    string,
    {
      total: number
      modis: number
      viirs: number
      frpSum: number
      validFrpCount: number
      activeCells: Set<string>
    }
  >()

  for (const obs of records) {
    const monthKey = obs.acqDate.slice(0, 7) // YYYY-MM
    let entry = map.get(monthKey)
    if (!entry) {
      entry = {
        total: 0,
        modis: 0,
        viirs: 0,
        frpSum: 0,
        validFrpCount: 0,
        activeCells: new Set<string>(),
      }
      map.set(monthKey, entry)
    }

    entry.total++
    entry.activeCells.add(getGridCellKey(obs.latitude, obs.longitude, gridResolution))
    if (obs.instrument === 'MODIS') entry.modis++
    else entry.viirs++

    if (obs.frp !== null && !isNaN(obs.frp)) {
      entry.frpSum += obs.frp
      entry.validFrpCount++
    }
  }

  const result: MonthAggregate[] = []
  const sortedKeys = Array.from(map.keys()).sort()

  for (const key of sortedKeys) {
    const parts = key.split('-')
    const year = parseInt(parts[0] ?? '2024', 10)
    const monthNum = parseInt(parts[1] ?? '1', 10)
    const label = `${MONTH_NAMES[monthNum - 1] ?? 'Month'} ${year}`

    const d = map.get(key)!
    result.push({
      monthKey: key,
      label,
      monthNumber: monthNum,
      year,
      total: d.total,
      harmonizedActiveCells: d.activeCells.size,
      modis: d.modis,
      viirs: d.viirs,
      avgFrp: d.validFrpCount > 0 ? Number((d.frpSum / d.validFrpCount).toFixed(1)) : null,
    })
  }

  return result
}

/**
 * Aggregate multi-year historical comparison for a target month (1–12).
 * Allows year-over-year comparative analysis (e.g., March 2020 vs March 2021..2026).
 */
export function aggregateMultiYearComparison(
  records: readonly FireObservation[],
  targetMonth: number,
  gridResolution = 0.25,
): MultiYearComparisonRecord[] {
  // 1. Group records by year for the specified month
  const yearMap = new Map<number, FireObservation[]>()

  for (const obs of records) {
    const parts = obs.acqDate.split('-')
    const year = parseInt(parts[0] ?? '0', 10)
    const month = parseInt(parts[1] ?? '0', 10)

    if (month === targetMonth && year > 1999) {
      let list = yearMap.get(year)
      if (!list) {
        list = []
        yearMap.set(year, list)
      }
      list.push(obs)
    }
  }

  const result: MultiYearComparisonRecord[] = []
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b)

  for (const yr of sortedYears) {
    const yrRecords = yearMap.get(yr)!
    const daysInMonth = new Date(yr, targetMonth, 0).getDate()
    const dayMap = new Map<number, { obsList: FireObservation[]; cells: Set<string> }>()

    for (let d = 1; d <= daysInMonth; d++) {
      dayMap.set(d, { obsList: [], cells: new Set() })
    }

    let activeDaysCount = 0
    let peakDay = { date: '', value: 0 }
    const totalYearCells = new Set<string>()

    for (const obs of yrRecords) {
      const dayNum = parseInt(obs.acqDate.split('-')[2] ?? '0', 10)
      const entry = dayMap.get(dayNum)
      if (entry) {
        entry.obsList.push(obs)
        const cellKey = getGridCellKey(obs.latitude, obs.longitude, gridResolution)
        entry.cells.add(cellKey)
        totalYearCells.add(cellKey)
      }
    }

    const days = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${yr}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const entry = dayMap.get(d)!
      const count = entry.obsList.length
      const cellsCount = entry.cells.size

      if (count > 0) activeDaysCount++
      if (cellsCount > peakDay.value) {
        peakDay = { date: dateStr, value: cellsCount }
      }

      let frpSum = 0
      let validFrp = 0
      let modis = 0
      let viirs = 0

      for (const o of entry.obsList) {
        if (o.instrument === 'MODIS') modis++
        else viirs++
        if (o.frp !== null && !isNaN(o.frp)) {
          frpSum += o.frp
          validFrp++
        }
      }

      days.push({
        date: dateStr,
        day: d,
        rawTotal: count,
        modisCount: modis,
        viirsCount: viirs,
        harmonizedActiveCells: cellsCount,
        avgFrp: validFrp > 0 ? Number((frpSum / validFrp).toFixed(1)) : null,
      })
    }

    result.push({
      year: yr,
      month: targetMonth,
      days,
      totalRawCount: yrRecords.length,
      harmonizedActiveCellsTotal: totalYearCells.size,
      activeDaysCount,
      peakDay,
    })
  }

  return result
}

/**
 * Aggregate observations by predefined regional envelopes with harmonized cell counts.
 */
export function aggregateByRegion(
  records: readonly FireObservation[],
  gridResolution = 0.25,
): RegionAggregate[] {
  const regionsToCount = REGIONS.filter((r) => r.id !== 'all')
  const map = new Map<
    string,
    {
      name: string
      total: number
      modis: number
      viirs: number
      frpSum: number
      validFrpCount: number
      activeCells: Set<string>
    }
  >()

  for (const r of regionsToCount) {
    map.set(r.id, {
      name: r.name,
      total: 0,
      modis: 0,
      viirs: 0,
      frpSum: 0,
      validFrpCount: 0,
      activeCells: new Set<string>(),
    })
  }
  map.set('other_india', {
    name: 'Other Regions (India)',
    total: 0,
    modis: 0,
    viirs: 0,
    frpSum: 0,
    validFrpCount: 0,
    activeCells: new Set<string>(),
  })

  for (const obs of records) {
    const regId = map.has(obs.regionId) ? obs.regionId : 'other_india'
    const entry = map.get(regId)!
    entry.total++
    entry.activeCells.add(getGridCellKey(obs.latitude, obs.longitude, gridResolution))
    if (obs.instrument === 'MODIS') entry.modis++
    else entry.viirs++

    if (obs.frp !== null && !isNaN(obs.frp)) {
      entry.frpSum += obs.frp
      entry.validFrpCount++
    }
  }

  const result: RegionAggregate[] = []
  for (const [id, data] of map.entries()) {
    result.push({
      regionId: id,
      regionName: data.name,
      total: data.total,
      harmonizedActiveCells: data.activeCells.size,
      modis: data.modis,
      viirs: data.viirs,
      avgFrp: data.validFrpCount > 0 ? Number((data.frpSum / data.validFrpCount).toFixed(1)) : null,
    })
  }

  // Sort descending by harmonized active cells (or total)
  return result.sort((a, b) => b.harmonizedActiveCells - a.harmonizedActiveCells)
}

/**
 * Spatiotemporal grid binning for sensor harmonization.
 * Bins coordinates into grid cells of size `cellSizeDegrees` (e.g. 0.1°, 0.25°, 0.5°).
 */
export function aggregateSpatialGrid(
  records: readonly FireObservation[],
  cellSizeDegrees = 0.25,
): { cells: SpatialGridCell[]; metrics: HarmonizationMetrics } {
  const map = new Map<
    string,
    {
      minLat: number
      maxLat: number
      minLng: number
      maxLng: number
      modisCount: number
      viirsCount: number
      totalCount: number
      modisFrpSum: number
      viirsFrpSum: number
      frpSum: number
      validFrpCount: number
    }
  >()

  let totalModis = 0
  let totalViirs = 0
  let totalModisFrp = 0
  let totalModisValidFrp = 0
  let totalViirsFrp = 0
  let totalViirsValidFrp = 0

  for (const obs of records) {
    // Snap to grid corner
    const gridLat = Math.floor(obs.latitude / cellSizeDegrees) * cellSizeDegrees
    const gridLng = Math.floor(obs.longitude / cellSizeDegrees) * cellSizeDegrees
    const cellId = `cell_${gridLat.toFixed(3)}_${gridLng.toFixed(3)}`

    let cell = map.get(cellId)
    if (!cell) {
      cell = {
        minLat: Number(gridLat.toFixed(3)),
        maxLat: Number((gridLat + cellSizeDegrees).toFixed(3)),
        minLng: Number(gridLng.toFixed(3)),
        maxLng: Number((gridLng + cellSizeDegrees).toFixed(3)),
        modisCount: 0,
        viirsCount: 0,
        totalCount: 0,
        modisFrpSum: 0,
        viirsFrpSum: 0,
        frpSum: 0,
        validFrpCount: 0,
      }
      map.set(cellId, cell)
    }

    cell.totalCount++
    if (obs.instrument === 'MODIS') {
      cell.modisCount++
      totalModis++
      if (obs.frp !== null && !isNaN(obs.frp)) {
        cell.modisFrpSum += obs.frp
        totalModisFrp += obs.frp
        totalModisValidFrp++
      }
    } else {
      cell.viirsCount++
      totalViirs++
      if (obs.frp !== null && !isNaN(obs.frp)) {
        cell.viirsFrpSum += obs.frp
        totalViirsFrp += obs.frp
        totalViirsValidFrp++
      }
    }

    if (obs.frp !== null && !isNaN(obs.frp)) {
      cell.frpSum += obs.frp
      cell.validFrpCount++
    }
  }

  let coincidentCellsCount = 0
  let modisOnlyCellsCount = 0
  let viirsOnlyCellsCount = 0

  let coincidentViirsTotal = 0
  let coincidentModisTotal = 0

  const cells: SpatialGridCell[] = []

  for (const [cellId, data] of map.entries()) {
    let category: 'MODIS_ONLY' | 'VIIRS_ONLY' | 'BOTH_COINCIDENT' = 'BOTH_COINCIDENT'
    if (data.modisCount > 0 && data.viirsCount > 0) {
      category = 'BOTH_COINCIDENT'
      coincidentCellsCount++
      coincidentViirsTotal += data.viirsCount
      coincidentModisTotal += data.modisCount
    } else if (data.modisCount > 0) {
      category = 'MODIS_ONLY'
      modisOnlyCellsCount++
    } else {
      category = 'VIIRS_ONLY'
      viirsOnlyCellsCount++
    }

    cells.push({
      cellId,
      minLat: data.minLat,
      maxLat: data.maxLat,
      minLng: data.minLng,
      maxLng: data.maxLng,
      centerLat: Number(((data.minLat + data.maxLat) / 2).toFixed(3)),
      centerLng: Number(((data.minLng + data.maxLng) / 2).toFixed(3)),
      modisCount: data.modisCount,
      viirsCount: data.viirsCount,
      totalCount: data.totalCount,
      modisFrpSum: Number(data.modisFrpSum.toFixed(1)),
      viirsFrpSum: Number(data.viirsFrpSum.toFixed(1)),
      avgFrp: data.validFrpCount > 0 ? Number((data.frpSum / data.validFrpCount).toFixed(1)) : null,
      category,
    })
  }

  const unionCells = coincidentCellsCount + modisOnlyCellsCount + viirsOnlyCellsCount
  const jaccard = unionCells > 0 ? Number((coincidentCellsCount / unionCells).toFixed(3)) : 0

  const viirsToModisRatio = totalModis > 0 ? Number((totalViirs / totalModis).toFixed(2)) : null
  const coincidentViirsToModisRatio =
    coincidentModisTotal > 0 ? Number((coincidentViirsTotal / coincidentModisTotal).toFixed(2)) : null

  const metrics: HarmonizationMetrics = {
    gridCellSizeDegrees: cellSizeDegrees,
    temporalInterval: 'daily',
    totalActiveCells: cells.length,
    coincidentCellsCount,
    modisOnlyCellsCount,
    viirsOnlyCellsCount,
    jaccardSimilarityIndex: jaccard,
    viirsToModisRatio,
    coincidentViirsToModisRatio,
    avgModisFrp:
      totalModisValidFrp > 0 ? Number((totalModisFrp / totalModisValidFrp).toFixed(1)) : null,
    avgViirsFrp:
      totalViirsValidFrp > 0 ? Number((totalViirsFrp / totalViirsValidFrp).toFixed(1)) : null,
  }

  return {
    cells: cells.sort((a, b) => b.totalCount - a.totalCount),
    metrics,
  }
}

/**
 * Safe metric value extractor based on active user-selected PrimaryMetricType.
 */
export function getMetricValue(
  agg: DateAggregate | MonthAggregate,
  metricType: PrimaryMetricType,
): number {
  switch (metricType) {
    case 'harmonized':
      return agg.harmonizedActiveCells
    case 'modis':
      return agg.modis
    case 'viirs':
      return agg.viirs
    case 'frp':
      return agg.avgFrp ?? 0
    case 'raw_total':
    default:
      return agg.total
  }
}

/**
 * Aggregates a given month (1..12) across multiple years (e.g. 2020-2026)
 * for year-over-year comparative analysis.
 */
export function aggregateMultiYearMonth(
  records: readonly FireObservation[],
  targetMonth: number,
  metricType: PrimaryMetricType = 'harmonized',
  gridResolution = 0.25,
  coverageBounds?: { start: string; end: string },
): {
  years: number[]
  monthSummary: MultiYearMonthData[]
  days: MultiYearDayData[]
} {
  // Determine actual years and date bounds with observation records
  const yearsWithRecords = new Set<number>()
  let datasetMinDate: string | undefined = coverageBounds?.start
  let datasetMaxDate: string | undefined = coverageBounds?.end

  for (const obs of records) {
    const y = parseInt(obs.acqDate.slice(0, 4), 10)
    if (!isNaN(y)) yearsWithRecords.add(y)
    if (!datasetMinDate || obs.acqDate < datasetMinDate) datasetMinDate = obs.acqDate
    if (!datasetMaxDate || obs.acqDate > datasetMaxDate) datasetMaxDate = obs.acqDate
  }

  // Include standard multi-year comparison range 2020-2026 plus any data years
  const comparisonYears = new Set<number>([2020, 2021, 2022, 2023, 2024, 2025, 2026])
  for (const y of yearsWithRecords) {
    comparisonYears.add(y)
  }
  const years = Array.from(comparisonYears).sort((a, b) => a - b)

  // Map of year -> observations in targetMonth
  const yearRecordsMap = new Map<number, FireObservation[]>()
  for (const y of years) {
    yearRecordsMap.set(y, [])
  }

  for (const obs of records) {
    const y = parseInt(obs.acqDate.slice(0, 4), 10)
    const m = parseInt(obs.acqDate.slice(5, 7), 10)
    if (m === targetMonth && yearRecordsMap.has(y)) {
      yearRecordsMap.get(y)!.push(obs)
    }
  }

  // Days in month: standard month length
  const maxDays = [1, 3, 5, 7, 8, 10, 12].includes(targetMonth)
    ? 31
    : targetMonth === 2
      ? 29
      : 30

  // Compute month summaries
  const monthSummary: MultiYearMonthData[] = []
  const yearDayAggregates = new Map<
    string,
    {
      total: number
      modis: number
      viirs: number
      activeCells: Set<string>
      frpSum: number
      validFrpCount: number
    }
  >()

  for (const y of years) {
    const yearObs = yearRecordsMap.get(y) || []
    let totalCount = 0
    let modisCount = 0
    let viirsCount = 0
    let frpSum = 0
    let validFrpCount = 0
    const activeCells = new Set<string>()
    const activeDays = new Set<number>()

    let firstObsDate: string | undefined
    let lastObsDate: string | undefined

    for (const obs of yearObs) {
      totalCount++
      const day = parseInt(obs.acqDate.slice(8, 10), 10)
      activeDays.add(day)
      const cellKey = getGridCellKey(obs.latitude, obs.longitude, gridResolution)
      activeCells.add(cellKey)

      if (!firstObsDate || obs.acqDate < firstObsDate) firstObsDate = obs.acqDate
      if (!lastObsDate || obs.acqDate > lastObsDate) lastObsDate = obs.acqDate

      if (obs.instrument === 'MODIS') modisCount++
      else viirsCount++

      if (obs.frp !== null && !isNaN(obs.frp)) {
        frpSum += obs.frp
        validFrpCount++
      }

      const dayKey = `${y}-${day}`
      let dayEntry = yearDayAggregates.get(dayKey)
      if (!dayEntry) {
        dayEntry = {
          total: 0,
          modis: 0,
          viirs: 0,
          activeCells: new Set(),
          frpSum: 0,
          validFrpCount: 0,
        }
        yearDayAggregates.set(dayKey, dayEntry)
      }
      dayEntry.total++
      dayEntry.activeCells.add(cellKey)
      if (obs.instrument === 'MODIS') dayEntry.modis++
      else dayEntry.viirs++
      if (obs.frp !== null && !isNaN(obs.frp)) {
        dayEntry.frpSum += obs.frp
        dayEntry.validFrpCount++
      }
    }

    // Determine coverage for this specific year & month
    const targetMonthStart = `${y}-${String(targetMonth).padStart(2, '0')}-01`
    const targetMonthEnd = `${y}-${String(targetMonth).padStart(2, '0')}-${String(maxDays).padStart(2, '0')}`

    const hasYearObservations = yearsWithRecords.has(y)
    const isWithinDatasetBounds = Boolean(
      datasetMinDate &&
      datasetMaxDate &&
      targetMonthEnd >= datasetMinDate &&
      targetMonthStart <= datasetMaxDate
    )
    const hasCoverage = hasYearObservations && isWithinDatasetBounds

    // 2026 is partial (up to October)
    const isPartial = y === 2026 && targetMonth >= 10
    const status: 'available' | 'no_data' | 'partial' = !hasCoverage
      ? 'no_data'
      : isPartial
        ? 'partial'
        : 'available'

    monthSummary.push({
      year: y,
      month: targetMonth,
      totalCount,
      harmonizedActiveCells: activeCells.size,
      modisCount,
      viirsCount,
      avgFrp: validFrpCount > 0 ? Number((frpSum / validFrpCount).toFixed(1)) : null,
      activeDaysCount: activeDays.size,
      isPartial,
      hasCoverage,
      status,
      firstObsDate,
      lastObsDate,
    })
  }

  const days: MultiYearDayData[] = []

  for (let d = 1; d <= maxDays; d++) {
    const byYear: MultiYearDayData['byYear'] = {}

    for (const y of years) {
      const isFeb29 = targetMonth === 2 && d === 29
      const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

      if (isFeb29 && !isLeap) {
        byYear[y] = {
          value: null,
          rawCount: null,
          harmonizedCells: null,
          hasData: false,
          status: 'leap_day',
          isLeapDay: true,
        }
        continue
      }

      const dateStr = `${y}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const hasCoverageForDate = Boolean(
        yearsWithRecords.has(y) &&
        datasetMinDate &&
        datasetMaxDate &&
        dateStr >= datasetMinDate &&
        dateStr <= datasetMaxDate
      )

      if (!hasCoverageForDate) {
        // No satellite observation records exist for this period
        byYear[y] = {
          value: null,
          rawCount: null,
          harmonizedCells: null,
          hasData: false,
          status: 'no_coverage',
        }
        continue
      }

      const dayEntry = yearDayAggregates.get(`${y}-${d}`)
      if (dayEntry) {
        let val = dayEntry.activeCells.size
        if (metricType === 'modis') val = dayEntry.modis
        else if (metricType === 'viirs') val = dayEntry.viirs
        else if (metricType === 'raw_total') val = dayEntry.total
        else if (metricType === 'frp') {
          val =
            dayEntry.validFrpCount > 0
              ? Number((dayEntry.frpSum / dayEntry.validFrpCount).toFixed(1))
              : 0
        }

        byYear[y] = {
          value: val,
          rawCount: dayEntry.total,
          harmonizedCells: dayEntry.activeCells.size,
          hasData: true,
          status: 'observed_active',
        }
      } else {
        // Confirmed zero observed activity: actively monitored period with 0 detections
        byYear[y] = {
          value: 0,
          rawCount: 0,
          harmonizedCells: 0,
          hasData: true,
          status: 'observed_zero',
        }
      }
    }

    days.push({
      dayOfMonth: d,
      byYear,
    })
  }

  return { years, monthSummary, days }
}

export {
  calculatePercentile,
  getDayOfYear,
  getWeekOfYear,
  identifyCriticalPeriods,
} from '@/utils/criticalPeriods'
export { generateMonitoringAdvisory } from '@/utils/monitoringAdvisory'

/**
 * Uniformly samples observations using systematic spatial-temporal stratification.
 * Eliminates array-order and geographic truncation bias (e.g. cutting off southern regions).
 * Always preserves the selected observation if specified.
 */
export function sampleObservationsStratified(
  records: readonly FireObservation[],
  maxLimit: number,
  selectedId?: string | null,
): FireObservation[] {
  if (records.length <= maxLimit) {
    return [...records]
  }

  const step = records.length / maxLimit
  const sampled: FireObservation[] = []
  let selectedFound = false

  for (let i = 0; i < maxLimit; i++) {
    const idx = Math.min(records.length - 1, Math.floor(i * step))
    const item = records[idx]
    if (item) {
      sampled.push(item)
      if (selectedId && item.id === selectedId) {
        selectedFound = true
      }
    }
  }

  // Ensure selected observation is always retained
  if (selectedId && !selectedFound) {
    const target = records.find((r) => r.id === selectedId)
    if (target && sampled.length > 0) {
      sampled[sampled.length - 1] = target
    }
  }

  return sampled
}

