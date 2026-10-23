import type {
  DateAggregate,
  FireObservation,
  HarmonizationMetrics,
  MonthAggregate,
  ObservationFilter,
  RegionAggregate,
  SpatialGridCell,
  SummaryMetrics,
} from '@/types/fire'
import { getRegionById, REGIONS } from '@/data/regions'

/**
 * Filter observations by sensor, date range, region, and optional criteria.
 */
export function filterObservations(
  records: readonly FireObservation[],
  filter: ObservationFilter,
): FireObservation[] {
  const { sensor, startDate, endDate, regionId, daynight, minFrp } = filter

  const targetRegion = regionId !== 'all' ? getRegionById(regionId) : undefined

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

    // 3. Region check
    if (regionId && regionId !== 'all') {
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

    // 4. Day / Night check
    if (daynight && daynight !== 'ALL' && obs.daynight !== daynight) {
      return false
    }

    // 5. Min FRP check
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
 * Ensures zero hardcoded numbers and safe handling of null FRPs.
 */
export function calculateSummaryMetrics(records: readonly FireObservation[]): SummaryMetrics {
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

  for (const obs of records) {
    datesSet.add(obs.acqDate)

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
 * Aggregate observations by calendar date.
 */
export function aggregateByDate(records: readonly FireObservation[]): DateAggregate[] {
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
      }
      map.set(obs.acqDate, entry)
    }

    entry.total++
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
 * Aggregate observations by month.
 */
export function aggregateByMonth(records: readonly FireObservation[]): MonthAggregate[] {
  const map = new Map<
    string,
    {
      total: number
      modis: number
      viirs: number
      frpSum: number
      validFrpCount: number
    }
  >()

  for (const obs of records) {
    const monthKey = obs.acqDate.slice(0, 7) // YYYY-MM
    let entry = map.get(monthKey)
    if (!entry) {
      entry = { total: 0, modis: 0, viirs: 0, frpSum: 0, validFrpCount: 0 }
      map.set(monthKey, entry)
    }

    entry.total++
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
      modis: d.modis,
      viirs: d.viirs,
      avgFrp: d.validFrpCount > 0 ? Number((d.frpSum / d.validFrpCount).toFixed(1)) : null,
    })
  }

  return result
}

/**
 * Aggregate observations by predefined regional envelopes.
 */
export function aggregateByRegion(records: readonly FireObservation[]): RegionAggregate[] {
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
    })
  }
  map.set('other_india', {
    name: 'Other Regions (India)',
    total: 0,
    modis: 0,
    viirs: 0,
    frpSum: 0,
    validFrpCount: 0,
  })

  for (const obs of records) {
    const regId = map.has(obs.regionId) ? obs.regionId : 'other_india'
    const entry = map.get(regId)!
    entry.total++
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
      modis: data.modis,
      viirs: data.viirs,
      avgFrp: data.validFrpCount > 0 ? Number((data.frpSum / data.validFrpCount).toFixed(1)) : null,
    })
  }

  // Sort descending by total observations
  return result.sort((a, b) => b.total - a.total)
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
