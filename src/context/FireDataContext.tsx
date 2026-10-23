import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
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
  filteredObservations: FireObservation[]
  summaryMetrics: SummaryMetrics
  selectedObservation: FireObservation | undefined
  selectedObservationId: string | null
  setSelectedObservationId: (id: string | null) => void
  loadSyntheticData: () => void
  importCsvContent: (csvText: string, fileName?: string) => { success: boolean; message: string }
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
}

export function FireDataProvider({ children }: { children: ReactNode }) {
  const [observations, setObservations] = useState<FireObservation[]>(initialSynthetic)
  const [metadata, setMetadata] = useState<DatasetMeta>(initialMeta)
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)

  const [filter, setFilterState] = useState<ObservationFilter>({
    sensor: 'ALL',
    startDate: initialMeta.dateRange.start,
    endDate: initialMeta.dateRange.end,
    regionId: 'all',
    daynight: 'ALL',
    minFrp: 0,
  })

  const setFilter = useCallback((patch: Partial<ObservationFilter>) => {
    setFilterState((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetFilter = useCallback(() => {
    setFilterState({
      sensor: 'ALL',
      startDate: metadata.dateRange.start,
      endDate: metadata.dateRange.end,
      regionId: 'all',
      daynight: 'ALL',
      minFrp: 0,
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
    }

    setObservations(data)
    setMetadata(meta)
    setFilterState({
      sensor: 'ALL',
      startDate: meta.dateRange.start,
      endDate: meta.dateRange.end,
      regionId: 'all',
      daynight: 'ALL',
      minFrp: 0,
    })
    setSelectedObservationId(null)
  }, [])

  const importCsvContent = useCallback(
    (csvText: string, fileName = 'custom_firms_import.csv') => {
      const result = parseFirmsCsv(csvText, fileName)
      if (!result.success || result.observations.length === 0) {
        return {
          success: false,
          message: result.error || 'Failed to parse CSV file.',
        }
      }

      setObservations(result.observations)
      setMetadata(result.metadata)
      setFilterState({
        sensor: 'ALL',
        startDate: result.metadata.dateRange.start,
        endDate: result.metadata.dateRange.end,
        regionId: 'all',
        daynight: 'ALL',
        minFrp: 0,
      })
      setSelectedObservationId(null)

      return {
        success: true,
        message: `Successfully loaded ${result.observations.length} active-fire records from ${fileName}.${result.rejectedCount > 0 ? ` (${result.rejectedCount} invalid rows skipped)` : ''}`,
      }
    },
    [],
  )

  const filteredObservations = useMemo(() => {
    return filterObservations(observations, filter)
  }, [observations, filter])

  const summaryMetrics = useMemo(() => {
    return calculateSummaryMetrics(filteredObservations)
  }, [filteredObservations])

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
