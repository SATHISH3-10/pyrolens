import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  CustomAoi,
  DatasetMeta,
  FireObservation,
  ObservationFilter,
  SummaryMetrics,
} from '@/types/fire'
import { generateSyntheticObservations } from '@/data/syntheticData'
import { parseFirmsCsv } from '@/data/firmsCsvImporter'
import { calculateSummaryMetrics, filterObservations } from '@/utils/aggregation'

interface FireDataContextValue {
  observations: FireObservation[]
  metadata: DatasetMeta
  filter: ObservationFilter
  setFilter: (patch: Partial<ObservationFilter>) => void
  resetFilter: () => void
  customAoi: CustomAoi | null
  setCustomAoi: (aoi: CustomAoi | null) => void
  clearCustomAoi: () => void
  filteredObservations: FireObservation[]
  summaryMetrics: SummaryMetrics
  selectedObservation: FireObservation | undefined
  selectedObservationId: string | null
  setSelectedObservationId: (id: string | null) => void
  loadSyntheticData: () => void
  importCsvContent: (
    csvText: string,
    fileName?: string,
    provenance?: 'imported-firms-csv' | 'firms-live-api',
  ) => { success: boolean; message: string; warnings?: string[] }
  isCsvModalOpen: boolean
  setIsCsvModalOpen: (open: boolean) => void
}

const FireDataContext = createContext<FireDataContextValue | null>(null)

// Initialize default synthetic dataset
const initialSynthetic = generateSyntheticObservations(1500)
const initialDates = Array.from(new Set(initialSynthetic.map((o) => o.acqDate))).sort()
const initialModis = initialSynthetic.filter((o) => o.instrument === 'MODIS').length
const initialViirs = initialSynthetic.filter((o) => o.instrument === 'VIIRS').length

const initialMeta: DatasetMeta = {
  source: 'synthetic-demo',
  isSynthetic: true,
  title: 'Synthetic Demonstration Dataset (India 2024)',
  recordCount: initialSynthetic.length,
  modisCount: initialModis,
  viirsCount: initialViirs,
  distinctDatesCount: initialDates.length,
  dateRange: {
    start: initialDates[0] ?? '2024-01-01',
    end: initialDates[initialDates.length - 1] ?? '2024-12-31',
  },
  loadedAt: new Date().toISOString(),
  duplicateCount: 0,
}

export function FireDataProvider({ children }: { children: ReactNode }) {
  const [observations, setObservations] = useState<FireObservation[]>(initialSynthetic)
  const [metadata, setMetadata] = useState<DatasetMeta>(initialMeta)
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [customAoi, setCustomAoiState] = useState<CustomAoi | null>(null)

  const [filter, setFilterState] = useState<ObservationFilter>({
    sensor: 'ALL',
    metricType: 'harmonized', // Harmonized Grid Activity Index by default
    startDate: initialMeta.dateRange.start,
    endDate: initialMeta.dateRange.end,
    regionId: 'all',
    customPolygon: undefined,
    daynight: 'ALL',
    minFrp: 0,
    gridResolution: 0.25,
  })

  const setFilter = useCallback((patch: Partial<ObservationFilter>) => {
    setFilterState((prev) => ({ ...prev, ...patch }))
  }, [])

  const setCustomAoi = useCallback((aoi: CustomAoi | null) => {
    setCustomAoiState(aoi)
    if (aoi) {
      setFilterState((prev) => ({
        ...prev,
        regionId: 'custom',
        customPolygon: aoi.points,
      }))
    }
  }, [])

  const clearCustomAoi = useCallback(() => {
    setCustomAoiState(null)
    setFilterState((prev) => ({
      ...prev,
      regionId: 'all',
      customPolygon: undefined,
    }))
  }, [])

  const resetFilter = useCallback(() => {
    setCustomAoiState(null)
    setFilterState({
      sensor: 'ALL',
      metricType: 'harmonized',
      startDate: metadata.dateRange.start,
      endDate: metadata.dateRange.end,
      regionId: 'all',
      customPolygon: undefined,
      daynight: 'ALL',
      minFrp: 0,
      gridResolution: 0.25,
    })
    setSelectedObservationId(null)
  }, [metadata.dateRange.start, metadata.dateRange.end])

  const loadSyntheticData = useCallback(() => {
    const data = generateSyntheticObservations(1500)
    const dates = Array.from(new Set(data.map((o) => o.acqDate))).sort()
    const modis = data.filter((o) => o.instrument === 'MODIS').length
    const viirs = data.filter((o) => o.instrument === 'VIIRS').length

    const meta: DatasetMeta = {
      source: 'synthetic-demo',
      isSynthetic: true,
      title: 'Synthetic Demonstration Dataset (India 2024)',
      recordCount: data.length,
      modisCount: modis,
      viirsCount: viirs,
      distinctDatesCount: dates.length,
      dateRange: {
        start: dates[0] ?? '2024-01-01',
        end: dates[dates.length - 1] ?? '2024-12-31',
      },
      loadedAt: new Date().toISOString(),
      duplicateCount: 0,
    }

    setObservations(data)
    setMetadata(meta)
    setCustomAoiState(null)
    setFilterState({
      sensor: 'ALL',
      metricType: 'harmonized',
      startDate: meta.dateRange.start,
      endDate: meta.dateRange.end,
      regionId: 'all',
      customPolygon: undefined,
      daynight: 'ALL',
      minFrp: 0,
      gridResolution: 0.25,
    })
    setSelectedObservationId(null)
  }, [])

  const importCsvContent = useCallback(
    (
      csvText: string,
      fileName = 'custom_firms_import.csv',
      provenance: 'imported-firms-csv' | 'firms-live-api' = 'imported-firms-csv',
    ) => {
      const result = parseFirmsCsv(csvText, fileName)
      if (!result.success || result.observations.length === 0) {
        return {
          success: false,
          message: result.error || 'Failed to parse CSV file.',
        }
      }

      // Update provenance
      const finalObs = result.observations.map((o) => ({ ...o, provenance }))
      const updatedMeta: DatasetMeta = {
        ...result.metadata,
        source: provenance,
      }

      setObservations(finalObs)
      setMetadata(updatedMeta)
      setCustomAoiState(null)
      setFilterState({
        sensor: 'ALL',
        metricType: 'harmonized',
        startDate: result.metadata.dateRange.start,
        endDate: result.metadata.dateRange.end,
        regionId: 'all',
        customPolygon: undefined,
        daynight: 'ALL',
        minFrp: 0,
        gridResolution: 0.25,
      })
      setSelectedObservationId(null)

      const dupeMsg = result.duplicateCount > 0 ? ` (${result.duplicateCount} duplicates omitted)` : ''
      const rejectMsg = result.rejectedCount > 0 ? ` (${result.rejectedCount} invalid rows rejected)` : ''

      return {
        success: true,
        message: `Successfully loaded ${result.observations.length.toLocaleString()} active-fire records from ${fileName}.${dupeMsg}${rejectMsg}`,
        warnings: result.warnings,
      }
    },
    [],
  )

  const filteredObservations = useMemo(() => {
    return filterObservations(observations, filter)
  }, [observations, filter])

  const summaryMetrics = useMemo(() => {
    return calculateSummaryMetrics(filteredObservations, filter.gridResolution ?? 0.25)
  }, [filteredObservations, filter.gridResolution])

  const selectedObservation = useMemo(() => {
    if (!selectedObservationId) return undefined
    return observations.find((o) => o.id === selectedObservationId)
  }, [observations, selectedObservationId])

  const value = useMemo(
    () => ({
      observations,
      metadata,
      filter,
      setFilter,
      resetFilter,
      customAoi,
      setCustomAoi,
      clearCustomAoi,
      filteredObservations,
      summaryMetrics,
      selectedObservation,
      selectedObservationId,
      setSelectedObservationId,
      loadSyntheticData,
      importCsvContent,
      isCsvModalOpen,
      setIsCsvModalOpen,
    }),
    [
      observations,
      metadata,
      filter,
      setFilter,
      resetFilter,
      customAoi,
      setCustomAoi,
      clearCustomAoi,
      filteredObservations,
      summaryMetrics,
      selectedObservation,
      selectedObservationId,
      loadSyntheticData,
      importCsvContent,
      isCsvModalOpen,
    ],
  )

  return <FireDataContext.Provider value={value}>{children}</FireDataContext.Provider>
}

export function useFireData(): FireDataContextValue {
  const context = useContext(FireDataContext)
  if (!context) {
    throw new Error('useFireData must be used within a FireDataProvider')
  }
  return context
}
