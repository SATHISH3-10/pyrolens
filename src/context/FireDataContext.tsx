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
import type { ActivityAnalysis, BaiWeights } from '@/types/activity'
import { parseFirmsCsv } from '@/data/firmsCsvImporter'
import { generateAreaArchive } from '@/data/demoArchive'
import { DEFAULT_STUDY_AREA_ID, getStudyArea, type StudyArea } from '@/data/studyAreas'
import { parseUrlDate } from '@/utils/calendarLayout'
import { calculateSummaryMetrics, filterObservations } from '@/utils/aggregation'
import { analyzeBurningActivity, DEFAULT_BAI_WEIGHTS } from '@/utils/burningActivity'

export const IMPORTED_AREA_ID = 'imported'

/** Geographic frame for the active dataset: a preset study area or the extent of an imported file. */
export interface AreaFrame {
  id: string
  name: string
  subtitle: string
  bounds: StudyArea['bounds']
  center: [number, number]
  zoom: number
  preset: StudyArea | null
}

interface FireDataContextValue {
  observations: FireObservation[]
  metadata: DatasetMeta
  area: AreaFrame
  studyAreaId: string
  setStudyAreaId: (id: string) => void
  filter: ObservationFilter
  setFilter: (patch: Partial<ObservationFilter>) => void
  resetFilter: () => void
  customAoi: CustomAoi | null
  setCustomAoi: (aoi: CustomAoi | null) => void
  clearCustomAoi: () => void
  /** Detections inside the active area / AOI, all dates and sensors (input to the BAI pipeline). */
  areaObservations: FireObservation[]
  /** Detections matching every active filter (dates, sensor, pass, AOI). */
  filteredObservations: FireObservation[]
  summaryMetrics: SummaryMetrics
  analysis: ActivityAnalysis | null
  baiWeights: BaiWeights
  setBaiWeights: (w: BaiWeights) => void
  selectedDate: string | null
  setSelectedDate: (date: string | null) => void
  /** True while map playback is animating the selected date (the calendar shows an animated ring). */
  isPlaying: boolean
  setIsPlaying: (playing: boolean) => void
  selectedObservation: FireObservation | undefined
  selectedObservationId: string | null
  setSelectedObservationId: (id: string | null) => void
  loadSyntheticData: () => void
  importCsvContent: (
    csvText: string | string[],
    fileName?: string,
    provenance?: 'imported-firms-csv' | 'firms-live-api',
  ) => { success: boolean; message: string; warnings?: string[] }
  isCsvModalOpen: boolean
  setIsCsvModalOpen: (open: boolean) => void
}

const FireDataContext = createContext<FireDataContextValue | null>(null)

function buildMeta(
  data: readonly FireObservation[],
  source: DatasetMeta['source'],
  title: string,
  extra: Partial<DatasetMeta> = {},
): DatasetMeta {
  let modis = 0
  let start = '9999-12-31'
  let end = '0000-01-01'
  const dates = new Set<string>()
  for (const o of data) {
    if (o.instrument === 'MODIS') modis++
    dates.add(o.acqDate)
    if (o.acqDate < start) start = o.acqDate
    if (o.acqDate > end) end = o.acqDate
  }
  return {
    source,
    isSynthetic: source === 'synthetic-demo',
    title,
    recordCount: data.length,
    modisCount: modis,
    viirsCount: data.length - modis,
    distinctDatesCount: dates.size,
    dateRange: { start: data.length ? start : '', end: data.length ? end : '' },
    loadedAt: new Date().toISOString(),
    duplicateCount: 0,
    ...extra,
  }
}

function defaultFilter(meta: DatasetMeta): ObservationFilter {
  return {
    sensor: 'ALL',
    metricType: 'harmonized',
    startDate: meta.dateRange.start,
    endDate: meta.dateRange.end,
    regionId: 'all',
    customPolygon: undefined,
    daynight: 'ALL',
    minFrp: 0,
    gridResolution: 0.25,
  }
}

function frameFromData(data: readonly FireObservation[], name: string): AreaFrame {
  let minLat = 90
  let maxLat = -90
  let minLng = 180
  let maxLng = -180
  for (const o of data) {
    if (o.latitude < minLat) minLat = o.latitude
    if (o.latitude > maxLat) maxLat = o.latitude
    if (o.longitude < minLng) minLng = o.longitude
    if (o.longitude > maxLng) maxLng = o.longitude
  }
  const span = Math.max(maxLat - minLat, maxLng - minLng, 0.5)
  const zoom = Math.max(3, Math.min(10, Math.round(8 - Math.log2(span))))
  return {
    id: IMPORTED_AREA_ID,
    name,
    subtitle: 'Imported FIRMS data',
    bounds: { minLat, maxLat, minLng, maxLng },
    center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
    zoom,
    preset: null,
  }
}

function frameFromPreset(area: StudyArea): AreaFrame {
  return {
    id: area.id,
    name: area.name,
    subtitle: area.country,
    bounds: area.bounds,
    center: area.center,
    zoom: area.zoom,
    preset: area,
  }
}

function loadPreset(id: string) {
  const area = getStudyArea(id) ?? getStudyArea(DEFAULT_STUDY_AREA_ID)!
  const data = generateAreaArchive(area.id)
  const meta = buildMeta(data, 'synthetic-demo', `Demo archive · ${area.name}`)
  return { area, data, meta }
}

/**
 * Shareable links: the initial study area and selected date come from ?area=…&date=… when valid, so a link
 * opens on the same view without a post-mount correction (useUrlSync only writes state back to the URL).
 */
function readUrlSelection(): { areaId: string; date: string | null } {
  try {
    const params = new URLSearchParams(window.location.search)
    const urlArea = params.get('area')
    return {
      areaId: urlArea && getStudyArea(urlArea) ? urlArea : DEFAULT_STUDY_AREA_ID,
      date: parseUrlDate(params.get('date')),
    }
  } catch {
    return { areaId: DEFAULT_STUDY_AREA_ID, date: null }
  }
}

const urlSelection = readUrlSelection()
const initial = loadPreset(urlSelection.areaId)

export function FireDataProvider({ children }: { children: ReactNode }) {
  const [observations, setObservations] = useState<FireObservation[]>(initial.data)
  const [metadata, setMetadata] = useState<DatasetMeta>(initial.meta)
  const [area, setArea] = useState<AreaFrame>(frameFromPreset(initial.area))
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(urlSelection.date)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [customAoi, setCustomAoiState] = useState<CustomAoi | null>(null)
  const [baiWeights, setBaiWeights] = useState<BaiWeights>(DEFAULT_BAI_WEIGHTS)
  const [filter, setFilterState] = useState<ObservationFilter>(defaultFilter(initial.meta))

  const setFilter = useCallback((patch: Partial<ObservationFilter>) => {
    setFilterState((prev) => ({ ...prev, ...patch }))
  }, [])

  const setCustomAoi = useCallback((aoi: CustomAoi | null) => {
    setCustomAoiState(aoi)
    if (aoi) {
      setFilterState((prev) => ({ ...prev, regionId: 'custom', customPolygon: aoi.points }))
    }
  }, [])

  const clearCustomAoi = useCallback(() => {
    setCustomAoiState(null)
    setFilterState((prev) => ({ ...prev, regionId: 'all', customPolygon: undefined }))
  }, [])

  const resetDatasetState = useCallback((meta: DatasetMeta) => {
    setCustomAoiState(null)
    setFilterState(defaultFilter(meta))
    setSelectedObservationId(null)
    setSelectedDate(null)
  }, [])

  const resetFilter = useCallback(() => {
    resetDatasetState(metadata)
  }, [metadata, resetDatasetState])

  const setStudyAreaId = useCallback(
    (id: string) => {
      const next = loadPreset(id)
      setObservations(next.data)
      setMetadata(next.meta)
      setArea(frameFromPreset(next.area))
      resetDatasetState(next.meta)
    },
    [resetDatasetState],
  )

  const loadSyntheticData = useCallback(() => {
    setStudyAreaId(area.preset?.id ?? DEFAULT_STUDY_AREA_ID)
  }, [area.preset, setStudyAreaId])

  const importCsvContent = useCallback(
    (
      csvText: string | string[],
      fileName = 'custom_firms_import.csv',
      provenance: 'imported-firms-csv' | 'firms-live-api' = 'imported-firms-csv',
    ) => {
      // Several files (e.g. separate MODIS and VIIRS downloads) are parsed independently and merged.
      const texts = Array.isArray(csvText) ? csvText : [csvText]
      const merged: FireObservation[] = []
      const seen = new Set<string>()
      const warnings: string[] = []
      let duplicates = 0
      let rejected = 0
      let lastError = ''
      texts.forEach((text, i) => {
        const result = parseFirmsCsv(text, texts.length > 1 ? `${fileName}#${i + 1}` : fileName)
        if (!result.success) {
          lastError = result.error || 'Failed to parse CSV file.'
          return
        }
        warnings.push(...result.warnings)
        duplicates += result.duplicateCount
        rejected += result.rejectedCount
        for (const o of result.observations) {
          const key = `${o.satellite}|${o.acqDate}|${o.acqTime}|${o.latitude}|${o.longitude}`
          if (seen.has(key)) {
            duplicates++
            continue
          }
          seen.add(key)
          merged.push({ ...o, id: `${o.instrument[0]}${merged.length + 1}`, provenance })
        }
      })
      if (merged.length === 0) {
        return { success: false, message: lastError || 'No valid detections found.' }
      }
      const name = fileName.replace(/\.[^/.]+$/, '')
      const meta = buildMeta(merged, provenance, name, { fileName, duplicateCount: duplicates, rejectedCount: rejected })
      setObservations(merged)
      setMetadata(meta)
      setArea(frameFromData(merged, name))
      resetDatasetState(meta)

      const dupeMsg = duplicates > 0 ? ` (${duplicates} duplicates omitted)` : ''
      const rejectMsg = rejected > 0 ? ` (${rejected} invalid rows rejected)` : ''
      return {
        success: true,
        message: `Loaded ${merged.length.toLocaleString()} detections from ${fileName}.${dupeMsg}${rejectMsg}`,
        warnings,
      }
    },
    [resetDatasetState],
  )

  const areaObservations = useMemo(
    () =>
      filterObservations(observations, {
        sensor: 'ALL',
        startDate: '',
        endDate: '',
        regionId: filter.regionId,
        customPolygon: filter.customPolygon,
      }),
    [observations, filter.regionId, filter.customPolygon],
  )

  const filteredObservations = useMemo(
    () => filterObservations(observations, filter),
    [observations, filter],
  )

  const summaryMetrics = useMemo(
    () => calculateSummaryMetrics(filteredObservations, filter.gridResolution ?? 0.25),
    [filteredObservations, filter.gridResolution],
  )

  const analysis = useMemo(
    () => analyzeBurningActivity(areaObservations, baiWeights),
    [areaObservations, baiWeights],
  )

  const selectedObservation = useMemo(() => {
    if (!selectedObservationId) return undefined
    return observations.find((o) => o.id === selectedObservationId)
  }, [observations, selectedObservationId])

  const value = useMemo<FireDataContextValue>(
    () => ({
      observations,
      metadata,
      area,
      studyAreaId: area.id,
      setStudyAreaId,
      filter,
      setFilter,
      resetFilter,
      customAoi,
      setCustomAoi,
      clearCustomAoi,
      areaObservations,
      filteredObservations,
      summaryMetrics,
      analysis,
      baiWeights,
      setBaiWeights,
      selectedDate,
      setSelectedDate,
      isPlaying,
      setIsPlaying,
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
      area,
      setStudyAreaId,
      filter,
      setFilter,
      resetFilter,
      customAoi,
      setCustomAoi,
      clearCustomAoi,
      areaObservations,
      filteredObservations,
      summaryMetrics,
      analysis,
      baiWeights,
      selectedDate,
      isPlaying,
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
