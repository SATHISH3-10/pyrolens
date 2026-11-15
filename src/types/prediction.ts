export type PredictionStatus = 'PENDING' | 'OBSERVED' | 'EVALUATED'

export interface PredictedCell {
  cellId: string
  bounds: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
  historicalRecurrenceRate: number
  medianFRP: number
  predictedActive: boolean
}

export interface PredictionEvaluation {
  evaluatedAt: string
  observedHotspotsCount: number
  predictedHotspotsCount: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  trueNegatives: number
  precision: number
  recall: number
  f1Score: number
  absoluteCountError: number
  percentageError: number
}

export interface FirePrediction {
  id: string
  createdAt: string
  targetDate: string
  aoiName: string
  aoiBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  thresholdPercentile: number
  gridResolution: number
  status: PredictionStatus
  predictedCells: PredictedCell[]
  evaluation?: PredictionEvaluation
}

export interface CreatePredictionOptions {
  targetDate: string
  aoiName: string
  aoiBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  thresholdPercentile?: number
  gridResolution?: number
  windowDays?: number
  totalValidObservationYears?: number
}
