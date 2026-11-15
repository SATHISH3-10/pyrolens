import { describe, expect, it } from 'vitest'
import {
  calculateMedian,
  evaluatePrediction,
  generateFirePrediction,
  isDoyInWindow,
  isObservationWindowClosed,
} from '@/utils/predictionEngine'
import { getGridCellKey } from '@/utils/aggregation'
import { getDayOfYear } from '@/utils/criticalPeriods'
import type { FireObservation } from '@/types/fire'
import type { FirePrediction } from '@/types/prediction'

function mockObs(partial: Partial<FireObservation>): FireObservation {
  return {
    id: `obs_${Math.random().toString(36).substring(2, 9)}`,
    latitude: 10.5,
    longitude: 78.5,
    acqDate: '2024-03-15',
    acqTime: '1200',
    satellite: 'Terra',
    instrument: 'MODIS',
    confidence: 'nominal',
    frp: 15.0,
    daynight: 'D',
    regionId: 'tamil_nadu',
    regionName: 'Tamil Nadu',
    provenance: 'imported-firms-csv',
    ...partial,
  }
}

describe('Fire Likelihood Prediction & Evaluation Engine', () => {
  describe('1. DOY Window & Wrap-around Handling', () => {
    it('correctly matches dates within normal calendar window', () => {
      // DOY 100 with window +/- 3 days covers DOY 97..103
      expect(isDoyInWindow(100, 100, 3)).toBe(true)
      expect(isDoyInWindow(102, 100, 3)).toBe(true)
      expect(isDoyInWindow(97, 100, 3)).toBe(true)
      expect(isDoyInWindow(104, 100, 3)).toBe(false)
      expect(isDoyInWindow(96, 100, 3)).toBe(false)
    })

    it('correctly handles year wrap-around near Jan 1 and Dec 31', () => {
      // Target: Jan 2 (DOY = 2). Window +/- 3 days:
      // Includes DOY 1, 2, 3, 4, 5 AND Dec 30 (DOY 364), Dec 31 (DOY 365), and leap DOY 366.
      expect(isDoyInWindow(2, 2, 3)).toBe(true)
      expect(isDoyInWindow(1, 2, 3)).toBe(true)
      expect(isDoyInWindow(5, 2, 3)).toBe(true)
      expect(isDoyInWindow(365, 2, 3)).toBe(true) // Dec 31
      expect(isDoyInWindow(364, 2, 3)).toBe(true) // Dec 30
      expect(isDoyInWindow(363, 2, 3)).toBe(false) // Dec 29 (4 days away)
      expect(isDoyInWindow(6, 2, 3)).toBe(false) // Jan 6 (4 days away)

      // Target: Dec 31 (DOY = 365). Window +/- 3 days:
      // Includes DOY 362, 363, 364, 365 AND Jan 1 (DOY 1), Jan 2 (DOY 2), Jan 3 (DOY 3).
      expect(isDoyInWindow(365, 365, 3)).toBe(true)
      expect(isDoyInWindow(362, 365, 3)).toBe(true)
      expect(isDoyInWindow(1, 365, 3)).toBe(true) // Jan 1
      expect(isDoyInWindow(2, 365, 3)).toBe(true) // Jan 2
      expect(isDoyInWindow(3, 365, 3)).toBe(true) // Jan 3
      expect(isDoyInWindow(4, 365, 3)).toBe(false) // Jan 4 (4 days away)
    })

    it('getDayOfYear accurately translates date strings', () => {
      expect(getDayOfYear('2024-01-01')).toBe(1)
      expect(getDayOfYear('2024-01-02')).toBe(2)
      expect(getDayOfYear('2023-12-31')).toBe(365)
      expect(getDayOfYear('2024-12-31')).toBe(366) // Leap year
    })
  })

  describe('2. Spatial Grid Snapping and Bounds Calculation', () => {
    it('snaps coordinates to 0.25-degree grid cell keys and bounds', () => {
      const key = getGridCellKey(10.483, 78.926, 0.25)
      expect(key).toBe('cell_10.250_78.750')

      const key2 = getGridCellKey(10.39, 78.138, 0.25)
      expect(key2).toBe('cell_10.250_78.000')

      // Test prediction cell bounds
      const records: FireObservation[] = [
        mockObs({ latitude: 10.483, longitude: 78.926, acqDate: '2023-11-20', frp: 12 }),
      ]

      const pred = generateFirePrediction(records, {
        targetDate: '2026-11-20',
        aoiName: 'Tamil Nadu',
        aoiBounds: { minLat: 10.0, maxLat: 11.0, minLng: 78.0, maxLng: 79.0 },
        gridResolution: 0.25,
      })

      expect(pred.predictedCells.length).toBe(1)
      const cell = pred.predictedCells[0]!
      expect(cell.cellId).toBe('cell_10.250_78.750')
      expect(cell.bounds).toEqual([78.75, 10.25, 79.0, 10.5])
    })
  })

  describe('3. Recurrence Rate Calculation', () => {
    it('computes historical recurrence rate as distinct years / valid observation years', () => {
      // 3 records in the same cell across 3 distinct years: 2021, 2022, 2023
      // Total observation window covers 4 years: 2021, 2022, 2023, 2024
      const records: FireObservation[] = [
        mockObs({ latitude: 10.3, longitude: 78.3, acqDate: '2021-03-14', frp: 10 }),
        mockObs({ latitude: 10.3, longitude: 78.3, acqDate: '2022-03-15', frp: 15 }),
        mockObs({ latitude: 10.3, longitude: 78.3, acqDate: '2023-03-16', frp: 20 }),
        // Another observation elsewhere in AOI in 2024 establishing 2024 as valid observation year
        mockObs({ latitude: 10.8, longitude: 78.8, acqDate: '2024-03-15', frp: 5 }),
      ]

      const pred = generateFirePrediction(records, {
        targetDate: '2026-03-15',
        aoiName: 'Test AOI',
        aoiBounds: { minLat: 10.0, maxLat: 11.0, minLng: 78.0, maxLng: 79.0 },
        thresholdPercentile: 50,
        gridResolution: 0.25,
      })

      const targetCell = pred.predictedCells.find((c) => c.cellId === 'cell_10.250_78.250')
      expect(targetCell).toBeDefined()
      // 3 years with fire / 4 total valid years = 0.75
      expect(targetCell!.historicalRecurrenceRate).toBe(0.75)
    })
  })

  describe('4. Median FRP Calculation', () => {
    it('calculates median for odd, even, and dirty numeric datasets', () => {
      expect(calculateMedian([10, 20, 30])).toBe(20)
      expect(calculateMedian([10, 20, 30, 40])).toBe(25)
      expect(calculateMedian([30, 10, 40, 20])).toBe(25)
      // Ignores null, undefined, NaN, and non-positive numbers
      expect(calculateMedian([10, null, NaN, -5, 30, undefined])).toBe(20)
      expect(calculateMedian([])).toBe(0)
    })

    it('assigns correct median FRP to predicted cells', () => {
      const records: FireObservation[] = [
        mockObs({ latitude: 10.3, longitude: 78.3, acqDate: '2021-03-14', frp: 10 }),
        mockObs({ latitude: 10.3, longitude: 78.3, acqDate: '2022-03-15', frp: 20 }),
        mockObs({ latitude: 10.3, longitude: 78.3, acqDate: '2023-03-16', frp: 30 }),
      ]

      const pred = generateFirePrediction(records, {
        targetDate: '2026-03-15',
        aoiName: 'Test AOI',
        aoiBounds: { minLat: 10.0, maxLat: 11.0, minLng: 78.0, maxLng: 79.0 },
      })

      expect(pred.predictedCells[0]!.medianFRP).toBe(20)
    })
  })

  describe('5. 75th Percentile Thresholding', () => {
    it('flags only cells at or above the 75th percentile as predictedActive', () => {
      // 4 cells with distinct recurrence rates: 0.25, 0.50, 0.75, 1.00
      // 75th percentile of [0.25, 0.50, 0.75, 1.00] is 0.75 + 0.25*(0.25) ~ 0.8125 (or >= 75th percentile)
      const records: FireObservation[] = [
        // Cell A (lat 10.1, lng 78.1): 1 year (2021) -> 0.25
        mockObs({ latitude: 10.1, longitude: 78.1, acqDate: '2021-03-15' }),
        // Cell B (lat 10.1, lng 78.4): 2 years (2021, 2022) -> 0.50
        mockObs({ latitude: 10.1, longitude: 78.4, acqDate: '2021-03-15' }),
        mockObs({ latitude: 10.1, longitude: 78.4, acqDate: '2022-03-15' }),
        // Cell C (lat 10.6, lng 78.1): 3 years (2021, 2022, 2023) -> 0.75
        mockObs({ latitude: 10.6, longitude: 78.1, acqDate: '2021-03-15' }),
        mockObs({ latitude: 10.6, longitude: 78.1, acqDate: '2022-03-15' }),
        mockObs({ latitude: 10.6, longitude: 78.1, acqDate: '2023-03-15' }),
        // Cell D (lat 10.6, lng 78.6): 4 years (2021, 2022, 2023, 2024) -> 1.00
        mockObs({ latitude: 10.6, longitude: 78.6, acqDate: '2021-03-15' }),
        mockObs({ latitude: 10.6, longitude: 78.6, acqDate: '2022-03-15' }),
        mockObs({ latitude: 10.6, longitude: 78.6, acqDate: '2023-03-15' }),
        mockObs({ latitude: 10.6, longitude: 78.6, acqDate: '2024-03-15' }),
      ]

      const pred = generateFirePrediction(records, {
        targetDate: '2026-03-15',
        aoiName: 'Tamil Nadu',
        aoiBounds: { minLat: 10.0, maxLat: 11.0, minLng: 78.0, maxLng: 79.0 },
        thresholdPercentile: 75,
        gridResolution: 0.25,
      })

      expect(pred.predictedCells.length).toBe(4)
      const topCell = pred.predictedCells.find((c) => c.cellId === 'cell_10.500_78.500')
      expect(topCell?.historicalRecurrenceRate).toBe(1.0)
      expect(topCell?.predictedActive).toBe(true)

      const bottomCell = pred.predictedCells.find((c) => c.cellId === 'cell_10.000_78.000')
      expect(bottomCell?.historicalRecurrenceRate).toBe(0.25)
      expect(bottomCell?.predictedActive).toBe(false)
    })
  })

  describe('6. Confusion Matrix & Accuracy Metrics (TP, FP, FN, TN)', () => {
    it('computes exact confusion matrix and precision/recall/F1', () => {
      const pred: FirePrediction = {
        id: 'pred_test_1',
        createdAt: '2026-11-15T10:00:00Z',
        targetDate: '2026-11-20',
        aoiName: 'Test AOI',
        aoiBounds: { minLat: 10.0, maxLat: 11.0, minLng: 78.0, maxLng: 79.0 },
        thresholdPercentile: 75,
        gridResolution: 0.25,
        status: 'PENDING',
        predictedCells: [
          // Cell 1: predicted active
          {
            cellId: 'cell_10.000_78.000',
            bounds: [78.0, 10.0, 78.25, 10.25],
            historicalRecurrenceRate: 0.9,
            medianFRP: 15,
            predictedActive: true,
          },
          // Cell 2: predicted active
          {
            cellId: 'cell_10.250_78.250',
            bounds: [78.25, 10.25, 78.5, 10.5],
            historicalRecurrenceRate: 0.8,
            medianFRP: 20,
            predictedActive: true,
          },
          // Cell 3: predicted quiet
          {
            cellId: 'cell_10.500_78.500',
            bounds: [78.5, 10.5, 78.75, 10.75],
            historicalRecurrenceRate: 0.3,
            medianFRP: 5,
            predictedActive: false,
          },
          // Cell 4: predicted quiet
          {
            cellId: 'cell_10.750_78.750',
            bounds: [78.75, 10.75, 79.0, 11.0],
            historicalRecurrenceRate: 0.1,
            medianFRP: 4,
            predictedActive: false,
          },
        ],
      }

      // Live observations arrive on 2026-11-20:
      // - Hotspot in Cell 1 (True Positive)
      // - NO hotspot in Cell 2 (False Positive)
      // - Hotspot in Cell 3 (False Negative)
      // - NO hotspot in Cell 4 (True Negative)
      const liveHotspots: FireObservation[] = [
        mockObs({ latitude: 10.1, longitude: 78.1, acqDate: '2026-11-20' }), // Cell 1
        mockObs({ latitude: 10.6, longitude: 78.6, acqDate: '2026-11-20' }), // Cell 3
      ]

      const evaluated = evaluatePrediction(pred, liveHotspots)

      expect(evaluated.status).toBe('EVALUATED')
      expect(evaluated.evaluation).toBeDefined()
      const ev = evaluated.evaluation!

      expect(ev.truePositives).toBe(1)
      expect(ev.falsePositives).toBe(1)
      expect(ev.falseNegatives).toBe(1)
      expect(ev.trueNegatives).toBe(1)

      // Precision = TP / (TP + FP) = 1 / (1 + 1) = 0.50
      expect(ev.precision).toBe(0.5)
      // Recall = TP / (TP + FN) = 1 / (1 + 1) = 0.50
      expect(ev.recall).toBe(0.5)
      // F1 Score = 2 * (0.5 * 0.5) / (0.5 + 0.5) = 0.50
      expect(ev.f1Score).toBe(0.5)

      // Predicted count = 2, Observed count = 2 -> error = 0
      expect(ev.predictedHotspotsCount).toBe(2)
      expect(ev.observedHotspotsCount).toBe(2)
      expect(ev.absoluteCountError).toBe(0)
      expect(ev.percentageError).toBe(0)
    })
  })

  describe('7. Edge Cases: Zero-Hotspot & Missing Data', () => {
    it('handles zero historical records cleanly without division by zero', () => {
      const pred = generateFirePrediction([], {
        targetDate: '2026-11-20',
        aoiName: 'Empty AOI',
        aoiBounds: { minLat: 10.0, maxLat: 11.0, minLng: 78.0, maxLng: 79.0 },
      })

      expect(pred.predictedCells).toEqual([])

      const evaluated = evaluatePrediction(pred, [])
      expect(evaluated.status).toBe('EVALUATED')
      const ev = evaluated.evaluation!
      expect(ev.truePositives).toBe(0)
      expect(ev.falsePositives).toBe(0)
      expect(ev.falseNegatives).toBe(0)
      expect(ev.trueNegatives).toBe(0)
      expect(ev.precision).toBe(0)
      expect(ev.recall).toBe(0)
      expect(ev.f1Score).toBe(0)
      expect(ev.absoluteCountError).toBe(0)
      expect(ev.percentageError).toBe(0)
    })

    it('handles zero observed hotspots when predictions were active', () => {
      const pred: FirePrediction = {
        id: 'pred_zero_obs',
        createdAt: '2026-11-15T10:00:00Z',
        targetDate: '2026-11-20',
        aoiName: 'Test AOI',
        aoiBounds: { minLat: 10.0, maxLat: 11.0, minLng: 78.0, maxLng: 79.0 },
        thresholdPercentile: 75,
        gridResolution: 0.25,
        status: 'PENDING',
        predictedCells: [
          {
            cellId: 'cell_10.000_78.000',
            bounds: [78.0, 10.0, 78.25, 10.25],
            historicalRecurrenceRate: 0.8,
            medianFRP: 10,
            predictedActive: true,
          },
        ],
      }

      const evaluated = evaluatePrediction(pred, [])
      const ev = evaluated.evaluation!
      expect(ev.truePositives).toBe(0)
      expect(ev.falsePositives).toBe(1)
      expect(ev.falseNegatives).toBe(0)
      expect(ev.precision).toBe(0)
      expect(ev.recall).toBe(0)
      expect(ev.f1Score).toBe(0)
      expect(ev.observedHotspotsCount).toBe(0)
      expect(ev.absoluteCountError).toBe(1)
      expect(ev.percentageError).toBe(0) // division by zero handled cleanly
    })

    it('handles unexpected hotspots in previously quiet or unobserved grid cells', () => {
      const pred: FirePrediction = {
        id: 'pred_unpredicted',
        createdAt: '2026-11-15T10:00:00Z',
        targetDate: '2026-11-20',
        aoiName: 'Test AOI',
        aoiBounds: { minLat: 10.0, maxLat: 11.0, minLng: 78.0, maxLng: 79.0 },
        thresholdPercentile: 75,
        gridResolution: 0.25,
        status: 'PENDING',
        predictedCells: [],
      }

      // Fire happens in a cell that had 0 historical fires
      const liveHotspots = [
        mockObs({ latitude: 10.8, longitude: 78.8, acqDate: '2026-11-20' }),
      ]

      const evaluated = evaluatePrediction(pred, liveHotspots)
      const ev = evaluated.evaluation!
      expect(ev.falseNegatives).toBe(1) // Unpredicted fire counted as False Negative
      expect(ev.observedHotspotsCount).toBe(1)
      expect(ev.absoluteCountError).toBe(1)
      expect(ev.percentageError).toBe(100)
    })
  })

  describe('8. Prediction Immutability Guarantee', () => {
    it('never mutates the original prediction object when evaluation is performed', () => {
      const originalPred: FirePrediction = {
        id: 'pred_immutable_test',
        createdAt: '2026-11-15T10:00:00Z',
        targetDate: '2026-11-20',
        aoiName: 'Immutable AOI',
        aoiBounds: { minLat: 10.0, maxLat: 11.0, minLng: 78.0, maxLng: 79.0 },
        thresholdPercentile: 75,
        gridResolution: 0.25,
        status: 'PENDING',
        predictedCells: [
          {
            cellId: 'cell_10.000_78.000',
            bounds: [78.0, 10.0, 78.25, 10.25],
            historicalRecurrenceRate: 0.8,
            medianFRP: 12.5,
            predictedActive: true,
          },
        ],
      }

      // Freeze original prediction to strictly enforce immutability at runtime
      Object.freeze(originalPred)
      Object.freeze(originalPred.predictedCells)
      Object.freeze(originalPred.predictedCells[0])

      const liveHotspots = [
        mockObs({ latitude: 10.1, longitude: 78.1, acqDate: '2026-11-20' }),
      ]

      // evaluatePrediction must not throw TypeError from mutation
      const evaluated = evaluatePrediction(originalPred, liveHotspots)

      expect(originalPred.status).toBe('PENDING')
      expect(originalPred.evaluation).toBeUndefined()

      expect(evaluated.status).toBe('EVALUATED')
      expect(evaluated.evaluation).toBeDefined()
      expect(evaluated).not.toBe(originalPred)
      expect(evaluated.predictedCells).toBe(originalPred.predictedCells)
    })
  })

  describe('9. Observation Window Timing Verification', () => {
    it('verifies observation window closes only after UTC midnight of target date', () => {
      const now = new Date('2026-11-21T02:00:00Z')
      expect(isObservationWindowClosed('2026-11-20', now)).toBe(true)

      const sameDay = new Date('2026-11-20T14:00:00Z')
      expect(isObservationWindowClosed('2026-11-20', sameDay)).toBe(false)

      const futureDay = new Date('2026-11-15T00:00:00Z')
      expect(isObservationWindowClosed('2026-11-20', futureDay)).toBe(false)
    })
  })
})
