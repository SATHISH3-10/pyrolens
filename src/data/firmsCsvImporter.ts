import type {
  ConfidenceCategory,
  DatasetMeta,
  FireObservation,
  SensorType,
} from '@/types/fire'
import { assignRegion } from './regions'

export interface CsvImportResult {
  success: boolean
  observations: FireObservation[]
  metadata: DatasetMeta
  error?: string
  warnings: string[]
  rejectedCount: number
  rejectedReasons: string[]
  duplicateCount: number
}

export const MAX_SAFE_BROWSER_RECORDS = 50000

/**
 * Split CSV line handling quoted fields safely.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Parses official NASA FIRMS CSV text (MODIS or VIIRS 375m active-fire products).
 * Enforces coordinate validation, duplicate filtering, missing data guards, and memory safety.
 */
export function parseFirmsCsv(
  csvText: string,
  fileName = 'nasa_firms_import.csv',
  maxRecords = MAX_SAFE_BROWSER_RECORDS,
): CsvImportResult {
  const warnings: string[] = []
  const rejectedReasons: string[] = []

  if (!csvText || !csvText.trim()) {
    return {
      success: false,
      observations: [],
      metadata: {
        source: 'imported-firms-csv',
        isSynthetic: false,
        title: 'Empty File',
        recordCount: 0,
        modisCount: 0,
        viirsCount: 0,
        distinctDatesCount: 0,
        dateRange: { start: '', end: '' },
        loadedAt: new Date().toISOString(),
        rejectedCount: 0,
        rejectedReasons: ['The file is completely empty.'],
        duplicateCount: 0,
        totalRowsInFile: 0,
      },
      error: 'The uploaded file is empty.',
      warnings: [],
      rejectedCount: 0,
      rejectedReasons: ['Empty file'],
      duplicateCount: 0,
    }
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length < 2) {
    return {
      success: false,
      observations: [],
      metadata: {
        source: 'imported-firms-csv',
        isSynthetic: false,
        title: fileName,
        recordCount: 0,
        modisCount: 0,
        viirsCount: 0,
        distinctDatesCount: 0,
        dateRange: { start: '', end: '' },
        loadedAt: new Date().toISOString(),
        rejectedCount: 0,
        duplicateCount: 0,
        totalRowsInFile: lines.length - 1,
      },
      error: 'CSV file must contain a header row and at least one observation row.',
      warnings: [],
      rejectedCount: 0,
      rejectedReasons: ['Missing header or data lines.'],
      duplicateCount: 0,
    }
  }

  // Parse header
  const headerLine = lines[0]!
  const rawHeaders = parseCsvLine(headerLine)
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[\s_]+/g, ''))

  // Required header detection
  const latIndex = headers.findIndex((h) => h === 'latitude' || h === 'lat')
  const lngIndex = headers.findIndex((h) => h === 'longitude' || h === 'lon' || h === 'lng')
  const dateIndex = headers.findIndex((h) => h === 'acqdate' || h === 'date')
  const timeIndex = headers.findIndex((h) => h === 'acqtime' || h === 'time')

  if (latIndex === -1 || lngIndex === -1 || dateIndex === -1) {
    return {
      success: false,
      observations: [],
      metadata: {
        source: 'imported-firms-csv',
        isSynthetic: false,
        title: fileName,
        recordCount: 0,
        modisCount: 0,
        viirsCount: 0,
        distinctDatesCount: 0,
        dateRange: { start: '', end: '' },
        loadedAt: new Date().toISOString(),
        duplicateCount: 0,
        totalRowsInFile: lines.length - 1,
      },
      error: `Missing required FIRMS columns. Found headers: [${rawHeaders.join(', ')}]. Required: latitude, longitude, acq_date.`,
      warnings: [],
      rejectedCount: lines.length - 1,
      rejectedReasons: ['Header validation failed: latitude, longitude, and acq_date are required.'],
      duplicateCount: 0,
    }
  }

  // Optional headers
  const instrumentIndex = headers.findIndex((h) => h === 'instrument' || h === 'sensor')
  const satelliteIndex = headers.findIndex((h) => h === 'satellite' || h === 'sat')
  const confidenceIndex = headers.findIndex((h) => h === 'confidence' || h === 'conf')
  const frpIndex = headers.findIndex((h) => h === 'frp' || h === 'power')
  const daynightIndex = headers.findIndex((h) => h === 'daynight' || h === 'dn')
  const brightnessIndex = headers.findIndex(
    (h) => h === 'brightness' || h === 'brightti4' || h === 'bright_ti4' || h === 'bt4',
  )
  const brightT31Index = headers.findIndex(
    (h) => h === 'brightt31' || h === 'brightti5' || h === 'bright_ti5' || h === 'bt31' || h === 'bt5',
  )
  const scanIndex = headers.findIndex((h) => h === 'scan')
  const trackIndex = headers.findIndex((h) => h === 'track')
  const versionIndex = headers.findIndex((h) => h === 'version')

  const observations: FireObservation[] = []
  const seenObservationKeys = new Set<string>()
  let rejectedCount = 0
  let duplicateCount = 0

  const totalDataRows = lines.length - 1
  const processLimit = Math.min(lines.length, maxRecords + 1)

  for (let r = 1; r < processLimit; r++) {
    const rawLine = lines[r]!
    const cols = parseCsvLine(rawLine)

    // Parse coordinates
    const latStr = cols[latIndex]
    const lngStr = cols[lngIndex]
    const lat = latStr ? parseFloat(latStr) : NaN
    const lng = lngStr ? parseFloat(lngStr) : NaN

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      rejectedCount++
      if (rejectedReasons.length < 5) {
        rejectedReasons.push(`Row ${r}: Invalid coordinates (${latStr}, ${lngStr})`)
      }
      continue
    }

    // Parse date
    const rawDate = cols[dateIndex]
    if (!rawDate || !rawDate.trim()) {
      rejectedCount++
      if (rejectedReasons.length < 5) {
        rejectedReasons.push(`Row ${r}: Missing acquisition date`)
      }
      continue
    }
    // Normalize date YYYY-MM-DD
    const dateNorm = rawDate.replace(/\//g, '-').trim()

    // Parse time
    const rawTime = timeIndex !== -1 ? cols[timeIndex] : ''
    const acqTime = rawTime ? rawTime.padStart(4, '0').slice(0, 4) : '0000'

    // Parse Instrument / Sensor
    let instrument: SensorType = 'VIIRS'
    const rawInst = instrumentIndex !== -1 ? cols[instrumentIndex]?.toUpperCase() : ''
    const rawSat = satelliteIndex !== -1 ? cols[satelliteIndex]?.toUpperCase() : ''

    if (rawInst?.includes('MODIS') || rawSat?.includes('TERRA') || rawSat?.includes('AQUA')) {
      instrument = 'MODIS'
    } else if (rawInst?.includes('VIIRS') || rawSat?.includes('NPP') || rawSat?.includes('NOAA') || rawInst?.includes('SNPP')) {
      instrument = 'VIIRS'
    } else {
      // Check column names for hint (e.g. bright_ti4 indicates VIIRS I-band)
      if (headers.some((h) => h.includes('ti4') || h.includes('ti5'))) {
        instrument = 'VIIRS'
      } else {
        instrument = 'MODIS'
      }
    }

    // Duplicate detection key
    const dedupeKey = `${instrument}_${dateNorm}_${acqTime}_${lat.toFixed(3)}_${lng.toFixed(3)}`
    if (seenObservationKeys.has(dedupeKey)) {
      duplicateCount++
      continue
    }
    seenObservationKeys.add(dedupeKey)

    // Parse Satellite
    const satellite =
      (satelliteIndex !== -1 && cols[satelliteIndex]?.trim()) ||
      (instrument === 'MODIS' ? 'Terra' : 'Suomi-NPP')

    // Parse FRP
    let frp: number | null = null
    if (frpIndex !== -1 && cols[frpIndex]) {
      const val = parseFloat(cols[frpIndex]!)
      if (!isNaN(val) && val >= 0) {
        frp = Number(val.toFixed(2))
      }
    }

    // Parse Confidence
    let confidence: number | ConfidenceCategory | string = 'nominal'
    if (confidenceIndex !== -1 && cols[confidenceIndex]) {
      const cStr = cols[confidenceIndex]!.trim().toLowerCase()
      const cNum = parseInt(cStr, 10)
      if (!isNaN(cNum) && cNum >= 0 && cNum <= 100) {
        confidence = cNum
      } else if (cStr === 'l' || cStr === 'low') {
        confidence = 'low'
      } else if (cStr === 'n' || cStr === 'nominal') {
        confidence = 'nominal'
      } else if (cStr === 'h' || cStr === 'high') {
        confidence = 'high'
      } else {
        confidence = cStr
      }
    }

    // Day/Night
    let daynight: 'D' | 'N' = 'D'
    if (daynightIndex !== -1 && cols[daynightIndex]) {
      const dn = cols[daynightIndex]!.trim().toUpperCase()
      if (dn === 'N' || dn === 'NIGHT') {
        daynight = 'N'
      }
    }

    // Brightness
    const brightness =
      brightnessIndex !== -1 && cols[brightnessIndex]
        ? parseFloat(cols[brightnessIndex]!)
        : undefined

    const brightT31 =
      brightT31Index !== -1 && cols[brightT31Index]
        ? parseFloat(cols[brightT31Index]!)
        : undefined

    const scan =
      scanIndex !== -1 && cols[scanIndex] ? parseFloat(cols[scanIndex]!) : undefined
    const track =
      trackIndex !== -1 && cols[trackIndex] ? parseFloat(cols[trackIndex]!) : undefined
    const version = versionIndex !== -1 ? cols[versionIndex]?.trim() : undefined

    const reg = assignRegion(lat, lng)

    observations.push({
      id: `IMP-${instrument}-${r}`,
      latitude: Number(lat.toFixed(4)),
      longitude: Number(lng.toFixed(4)),
      brightness: brightness && !isNaN(brightness) ? Number(brightness.toFixed(1)) : undefined,
      brightT31: brightT31 && !isNaN(brightT31) ? Number(brightT31.toFixed(1)) : undefined,
      scan: scan && !isNaN(scan) ? Number(scan.toFixed(2)) : undefined,
      track: track && !isNaN(track) ? Number(track.toFixed(2)) : undefined,
      acqDate: dateNorm,
      acqTime,
      satellite,
      instrument,
      confidence,
      version: version || '1.0',
      frp,
      daynight,
      regionId: reg.id,
      regionName: reg.name,
      provenance: 'imported-firms-csv',
    })
  }

  if (totalDataRows > maxRecords) {
    warnings.push(
      `File contains ${totalDataRows.toLocaleString()} rows. Loaded the first ${observations.length.toLocaleString()} records to protect browser responsiveness.`,
    )
  }

  if (observations.length === 0) {
    return {
      success: false,
      observations: [],
      metadata: {
        source: 'imported-firms-csv',
        isSynthetic: false,
        title: fileName,
        recordCount: 0,
        modisCount: 0,
        viirsCount: 0,
        distinctDatesCount: 0,
        dateRange: { start: '', end: '' },
        loadedAt: new Date().toISOString(),
        rejectedCount,
        rejectedReasons,
        duplicateCount,
        totalRowsInFile: totalDataRows,
      },
      error: 'No valid observation rows could be extracted from this CSV file.',
      warnings,
      rejectedCount,
      rejectedReasons,
      duplicateCount,
    }
  }

  // Calculate metadata
  const modisCount = observations.filter((o) => o.instrument === 'MODIS').length
  const viirsCount = observations.filter((o) => o.instrument === 'VIIRS').length
  const distinctDates = new Set(observations.map((o) => o.acqDate))
  const sortedDates = Array.from(distinctDates).sort()

  const metadata: DatasetMeta = {
    source: 'imported-firms-csv',
    isSynthetic: false,
    title: fileName,
    recordCount: observations.length,
    modisCount,
    viirsCount,
    distinctDatesCount: distinctDates.size,
    dateRange: {
      start: sortedDates[0] ?? '',
      end: sortedDates[sortedDates.length - 1] ?? '',
    },
    loadedAt: new Date().toISOString(),
    fileName,
    rejectedCount,
    rejectedReasons,
    duplicateCount,
    totalRowsInFile: totalDataRows,
  }

  if (rejectedCount > 0) {
    warnings.push(`Loaded ${observations.length} valid rows. Rejected ${rejectedCount} invalid rows.`)
  }
  if (duplicateCount > 0) {
    warnings.push(`Deduplicated ${duplicateCount} coincident duplicate records.`)
  }

  return {
    success: true,
    observations,
    metadata,
    warnings,
    rejectedCount,
    rejectedReasons,
    duplicateCount,
  }
}
