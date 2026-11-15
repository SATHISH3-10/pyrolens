import type { FireObservation } from '@/types/fire'
import type {
  CreatePredictionOptions,
  FirePrediction,
  PredictedCell,
  PredictionEvaluation,
} from '@/types/prediction'
import { getGridCellKey } from '@/utils/aggregation'
import { calculatePercentile, getDayOfYear } from '@/utils/criticalPeriods'

/**
 * Checks whether a given Day of Year (1..366) falls within a window (+/- windowDays) of the target DOY,
 * correctly accounting for calendar year wrap-around (e.g., Dec 31 to Jan 2).
 */
export function isDoyInWindow(doy: number, targetDoy: number, windowDays = 3): boolean {
  if (doy < 1 || doy > 366 || targetDoy < 1 || targetDoy > 366) return false
  const diff = Math.abs(doy - targetDoy)
  const circularDiff = Math.min(diff, Math.abs(365 - diff), Math.abs(366 - diff))
  return circularDiff <= windowDays
}

/**
 * Computes median value for an array of numbers.
 * Ignores non-positive, NaN, null, and undefined values.
 */
export function calculateMedian(values: readonly (number | null | undefined)[]): number {
  const valid = values
    .filter((v): v is number => typeof v === 'number' && !isNaN(v) && isFinite(v) && v > 0)
    .sort((a, b) => a - b)

  if (valid.length === 0) return 0
  const mid = Math.floor(valid.length / 2)
  if (valid.length % 2 !== 0) {
    return Number(valid[mid]!.toFixed(2))
  }
  return Number(((valid[mid - 1]! + valid[mid]!) / 2).toFixed(2))
}

/**
 * Checks if a point (lat, lng) falls within a rectangular bounding box.
 */
export function isPointInBounds(
  lat: number,
  lng: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng
}

/**
 * Generates an explainable historical seasonal baseline fire likelihood prediction for a target date and AOI.
 *
 * Algorithm:
 * 1. Filter historical FIRMS records to the selected AOI bounding box.
 * 2. Calculate the Day of Year (DOY) for the target date.
 * 3. Select records within a +/- windowDays (default 3) DOY window, wrapping across year boundaries.
 * 4. Group records into spatial grid cells (default 0.25-degree).
 * 5. Compute historicalRecurrenceRate = distinct active years in cell / total valid observation years.
 * 6. Compute medianFRP across all hotspots in that cell during the seasonal window.
 * 7. Mark cells as predictedActive if recurrence rate >= configurable percentile threshold (default 75th percentile).
 */
export function generateFirePrediction(
  historicalRecords: readonly FireObservation[],
  options: CreatePredictionOptions,
): FirePrediction {
  const {
    targetDate,
    aoiName,
    aoiBounds,
    thresholdPercentile = 75,
    gridResolution = 0.25,
    windowDays = 3,
  } = options

  const targetDoy = getDayOfYear(targetDate)

  // 1. Filter historical records within the AOI bounds and exclude observations on the exact target date
  const aoiRecords = historicalRecords.filter(
    (r) =>
      r.acqDate !== targetDate &&
      isPointInBounds(r.latitude, r.longitude, aoiBounds),
  )

  // 2. Select historical records within +/- windowDays DOY window with wrap-around
  const windowRecords = aoiRecords.filter((r) => {
    const doy = getDayOfYear(r.acqDate)
    return isDoyInWindow(doy, targetDoy, windowDays)
  })

  // 3. Determine total valid observation years
  const aoiWindowYears = new Set<number>()
  for (const r of windowRecords) {
    const year = parseInt(r.acqDate.slice(0, 4), 10)
    if (!isNaN(year)) aoiWindowYears.add(year)
  }

  const totalValidYears =
    options.totalValidObservationYears !== undefined
      ? options.totalValidObservationYears
      : aoiWindowYears.size

  // 4. Group records by spatial grid cell
  interface CellAccumulator {
    cellId: string
    bounds: [number, number, number, number]
    years: Set<number>
    frps: number[]
  }

  const cellMap = new Map<string, CellAccumulator>()

  for (const r of windowRecords) {
    const cellId = getGridCellKey(r.latitude, r.longitude, gridResolution)
    let cell = cellMap.get(cellId)
    if (!cell) {
      const gridLat = Math.floor(r.latitude / gridResolution) * gridResolution
      const gridLng = Math.floor(r.longitude / gridResolution) * gridResolution
      cell = {
        cellId,
        bounds: [
          Number(gridLng.toFixed(4)),
          Number(gridLat.toFixed(4)),
          Number((gridLng + gridResolution).toFixed(4)),
          Number((gridLat + gridResolution).toFixed(4)),
        ],
        years: new Set<number>(),
        frps: [],
      }
      cellMap.set(cellId, cell)
    }

    const year = parseInt(r.acqDate.slice(0, 4), 10)
    if (!isNaN(year)) cell.years.add(year)
    if (typeof r.frp === 'number' && !isNaN(r.frp) && r.frp > 0) {
      cell.frps.push(r.frp)
    }
  }

  // 5. Compute recurrence rate and median FRP for each cell
  const cells: PredictedCell[] = []
  for (const acc of cellMap.values()) {
    const recurrenceRate =
      totalValidYears > 0 ? Number((acc.years.size / totalValidYears).toFixed(4)) : 0
    const medianFrp = calculateMedian(acc.frps)

    cells.push({
      cellId: acc.cellId,
      bounds: acc.bounds,
      historicalRecurrenceRate: recurrenceRate,
      medianFRP: medianFrp,
      predictedActive: false,
    })
  }

  // 6. Percentile thresholding (default 75th percentile of recurrence rates across cells)
  const recurrenceRates = cells.map((c) => c.historicalRecurrenceRate)
  const threshold =
    recurrenceRates.length > 0
      ? calculatePercentile(recurrenceRates, thresholdPercentile)
      : 0

  for (const cell of cells) {
    cell.predictedActive =
      cell.historicalRecurrenceRate > 0 &&
      (threshold > 0 ? cell.historicalRecurrenceRate >= threshold : false)
  }

  // Sort cells by recurrence rate descending
  cells.sort((a, b) => b.historicalRecurrenceRate - a.historicalRecurrenceRate)

  return {
    id: `pred_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    createdAt: new Date().toISOString(),
    targetDate,
    aoiName,
    aoiBounds,
    thresholdPercentile,
    gridResolution,
    status: 'PENDING',
    predictedCells: cells,
  }
}

/**
 * Evaluates an existing FirePrediction against live/ground-truth FIRMS observations.
 *
 * IMMUTABILITY GUARANTEE:
 * Returns a new FirePrediction object with status "EVALUATED" and evaluation populated.
 * The original prediction and its predictedCells remain completely untouched.
 */
export function evaluatePrediction(
  prediction: FirePrediction,
  observedHotspots: readonly FireObservation[],
): FirePrediction {
  const { aoiBounds, targetDate, gridResolution } = prediction

  // 1. Filter observed hotspots to the target date and AOI bounds
  const obsInAoi = observedHotspots.filter(
    (r) =>
      (!r.acqDate || r.acqDate === targetDate) &&
      isPointInBounds(r.latitude, r.longitude, aoiBounds),
  )

  // 2. Map observed hotspots into grid cells
  const observedCellKeys = new Set<string>()
  for (const r of obsInAoi) {
    const key = getGridCellKey(r.latitude, r.longitude, gridResolution)
    observedCellKeys.add(key)
  }

  // 3. Compute confusion matrix (TP, FP, FN, TN)
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0

  const predictedMap = new Map(prediction.predictedCells.map((c) => [c.cellId, c]))

  for (const cell of prediction.predictedCells) {
    const isObservedActive = observedCellKeys.has(cell.cellId)
    if (cell.predictedActive && isObservedActive) {
      tp++
    } else if (cell.predictedActive && !isObservedActive) {
      fp++
    } else if (!cell.predictedActive && isObservedActive) {
      fn++
    } else {
      tn++
    }
  }

  // Any observed cell that was not in predictedCells is an unpredicted fire (False Negative)
  for (const cellKey of observedCellKeys) {
    if (!predictedMap.has(cellKey)) {
      fn++
    }
  }

  // 4. Metrics calculation
  const predictedHotspotsCount = prediction.predictedCells.filter(
    (c) => c.predictedActive,
  ).length
  const observedHotspotsCount = obsInAoi.length

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  const absoluteCountError = Math.abs(predictedHotspotsCount - observedHotspotsCount)
  const percentageError =
    observedHotspotsCount > 0 ? (absoluteCountError / observedHotspotsCount) * 100 : 0

  const evaluation: PredictionEvaluation = {
    evaluatedAt: new Date().toISOString(),
    observedHotspotsCount,
    predictedHotspotsCount,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    trueNegatives: tn,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1Score: Number(f1Score.toFixed(4)),
    absoluteCountError,
    percentageError: Number(percentageError.toFixed(2)),
  }

  // Return a cloned, immutable updated prediction object
  return {
    ...prediction,
    status: 'EVALUATED',
    evaluation,
  }
}

/**
 * Checks whether the target date's observation window has closed.
 * NASA FIRMS passes for a given UTC calendar date finish when the current UTC date is strictly greater
 * than the target date.
 */
export function isObservationWindowClosed(targetDate: string, now: Date = new Date()): boolean {
  const target = new Date(`${targetDate}T23:59:59Z`)
  return now.getTime() > target.getTime()
}
