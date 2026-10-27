import type {
  AnomalyReport,
  CustomAoi,
  DateAggregate,
  FireObservation,
  ObservationFilter,
  SpatialGridCell,
  SummaryMetrics,
} from '@/types/fire'

/**
 * Escapes a field for safe CSV output.
 */
export function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Triggers a file download in the browser.
 */
export function triggerDownload(content: string, fileName: string, mimeType: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Context written into every export: area, date range, data source and the synthetic-data flag. */
export interface ExportMeta {
  area: string
  start: string
  end: string
  source: string
  isDemo: boolean
}

export const EXPORT_DEFINITIONS = [
  'Hotspot = satellite-detected thermal anomaly (MODIS 1 km, VIIRS 375 m); not necessarily a confirmed wildfire.',
  'Harmonized count = VIIRS detections per satellite; before VIIRS, MODIS per satellite x monthly factor r(m) (modelled).',
  'BAI = 100*(0.4*H + 0.4*F + 0.2*C) of log-scaled harmonized count, FRP and cluster count; classes are percentiles of active days.',
]

export const EXPORT_LIMITATIONS = [
  'Zero detections do not prove no fire: clouds, smoke and overpass timing hide fires.',
  'Pre-VIIRS values rely on the MODIS-to-VIIRS harmonization and carry wider uncertainty.',
  'Agricultural, prescribed and industrial burning also appear as hotspots. Not for life-safety decisions.',
]

export function metaLines(meta: ExportMeta): string[] {
  return [
    `PyroLens export generated ${new Date().toISOString()}`,
    `Area: ${meta.area}`,
    `Date range: ${meta.start} to ${meta.end}`,
    `Data source: ${meta.isDemo ? 'SYNTHETIC DEMO DATA — not NASA observations' : meta.source}`,
    ...EXPORT_DEFINITIONS.map((d) => `Definition: ${d}`),
    ...EXPORT_LIMITATIONS.map((l) => `Limitation: ${l}`),
  ]
}

/** CSV preamble as '#'-comment lines (most CSV readers can skip comment lines). */
export function csvPreamble(meta: ExportMeta | undefined): string {
  return meta ? metaLines(meta).map((l) => `# ${l.replace(/\n/g, ' ')}`).join('\n') + '\n' : ''
}

export function geojsonMetadata(meta: ExportMeta | undefined) {
  if (!meta) return {}
  return {
    area: meta.area,
    dateRange: { start: meta.start, end: meta.end },
    dataSource: meta.isDemo ? 'SYNTHETIC DEMO DATA — not NASA observations' : meta.source,
    synthetic: meta.isDemo,
    definitions: EXPORT_DEFINITIONS,
    limitations: EXPORT_LIMITATIONS,
  }
}

/**
 * Exports filtered observation records as CSV.
 */
export function exportObservationsCsv(
  records: readonly FireObservation[],
  fileName = 'pyrolens_observations.csv',
  meta?: ExportMeta,
) {
  const headers = [
    'Observation_ID',
    'Acquisition_Date',
    'Acquisition_Time_UTC',
    'Sensor_Instrument',
    'Satellite',
    'Latitude',
    'Longitude',
    'Confidence',
    'FRP_MW',
    'DayNight',
    'Assigned_Region',
    'Data_Provenance',
  ]

  const rows = records.map((obs) => [
    escapeCsv(obs.id),
    escapeCsv(obs.acqDate),
    escapeCsv(obs.acqTime),
    escapeCsv(obs.instrument),
    escapeCsv(obs.satellite),
    escapeCsv(obs.latitude),
    escapeCsv(obs.longitude),
    escapeCsv(obs.confidence),
    escapeCsv(obs.frp !== null ? obs.frp : 'Not available'),
    escapeCsv(obs.daynight),
    escapeCsv(obs.regionName),
    escapeCsv(obs.provenance),
  ])

  // The notice reflects the actual data provenance instead of always claiming demo data.
  const provenanceNote = records.some((o) => o.provenance === 'synthetic-demo')
    ? '# DEMO DATA NOTICE: Synthetic demonstration data. Not official NASA observations.\n'
    : '# Source: NASA FIRMS active-fire detections.\n'
  const csvContent = (meta ? csvPreamble(meta) : provenanceNote) + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

  triggerDownload(csvContent, fileName, 'text/csv;charset=utf-8;')
}

/**
 * Exports aggregated daily summaries as CSV including the Harmonized Grid Activity Index.
 */
export function exportAggregatedDailyCsv(
  aggregates: readonly DateAggregate[],
  fileName = 'pyrolens_daily_aggregates.csv',
) {
  const headers = [
    'Date',
    'Harmonized_Active_Grid_Cells',
    'Total_Raw_Hotspots',
    'MODIS_Hotspots',
    'VIIRS_Hotspots',
    'Average_FRP_MW',
    'MODIS_Avg_FRP_MW',
    'VIIRS_Avg_FRP_MW',
  ]

  const rows = aggregates.map((d) => [
    escapeCsv(d.date),
    escapeCsv(d.harmonizedActiveCells),
    escapeCsv(d.total),
    escapeCsv(d.modis),
    escapeCsv(d.viirs),
    escapeCsv(d.avgFrp !== null ? d.avgFrp : 'N/A'),
    escapeCsv(d.modisAvgFrp !== null ? d.modisAvgFrp : 'N/A'),
    escapeCsv(d.viirsAvgFrp !== null ? d.viirsAvgFrp : 'N/A'),
  ])

  const csvContent =
    '# NOTICE: Hotspots represent satellite thermal anomalies. Raw counts must not be summed blindly across sensors.\n' +
    [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

  triggerDownload(csvContent, fileName, 'text/csv;charset=utf-8;')
}

/**
 * Exports active fire observations as GeoJSON FeatureCollection (Point geometries).
 */
export function exportObservationsGeoJson(
  records: readonly FireObservation[],
  fileName = 'pyrolens_observations.geojson',
  meta?: ExportMeta,
) {
  // Cap at 15,000 to prevent browser string freeze
  const exportSet = records.slice(0, 15000)

  const featureCollection = {
    type: 'FeatureCollection',
    metadata: {
      generatedAt: new Date().toISOString(),
      platform: 'PyroLens — NASA Fire Activity Intelligence Platform',
      disclaimer: 'Hotspots represent satellite thermal anomalies, not confirmed fire perimeters or burned area.',
      totalExported: exportSet.length,
      totalMatching: records.length,
      ...geojsonMetadata(meta),
    },
    features: exportSet.map((obs) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [obs.longitude, obs.latitude], // GeoJSON order: [lng, lat]
      },
      properties: {
        id: obs.id,
        acqDate: obs.acqDate,
        acqTime: obs.acqTime,
        instrument: obs.instrument,
        satellite: obs.satellite,
        confidence: obs.confidence,
        frp: obs.frp,
        daynight: obs.daynight,
        region: obs.regionName,
        provenance: obs.provenance,
      },
    })),
  }

  triggerDownload(JSON.stringify(featureCollection, null, 2), fileName, 'application/geo+json;charset=utf-8;')
}

/**
 * Exports Harmonized Spatial Grid Cells as GeoJSON FeatureCollection (Polygon geometries).
 */
export function exportSpatialGridGeoJson(
  cells: readonly SpatialGridCell[],
  fileName = 'pyrolens_harmonized_grid.geojson',
) {
  const featureCollection = {
    type: 'FeatureCollection',
    metadata: {
      generatedAt: new Date().toISOString(),
      platform: 'PyroLens Harmonization Engine',
      definition: 'Spatial grid cells with coincident detection and cross-sensor activity metrics. Polygons represent grid bins, NOT fire boundaries.',
      totalCells: cells.length,
    },
    features: cells.map((c) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [c.minLng, c.minLat],
            [c.maxLng, c.minLat],
            [c.maxLng, c.maxLat],
            [c.minLng, c.maxLat],
            [c.minLng, c.minLat],
          ],
        ],
      },
      properties: {
        cellId: c.cellId,
        category: c.category,
        modisCount: c.modisCount,
        viirsCount: c.viirsCount,
        totalRawCount: c.totalCount,
        avgFrp: c.avgFrp,
        modisFrpSum: c.modisFrpSum,
        viirsFrpSum: c.viirsFrpSum,
      },
    })),
  }

  triggerDownload(JSON.stringify(featureCollection, null, 2), fileName, 'application/geo+json;charset=utf-8;')
}

/**
 * Exports a user-drawn Custom Area of Interest (AOI) as GeoJSON Polygon.
 */
export function exportCustomAoiGeoJson(
  aoi: CustomAoi,
  fileName = 'pyrolens_custom_aoi.geojson',
) {
  // Convert [lat, lng] to GeoJSON [lng, lat]
  const coordinates = aoi.points.map(([lat, lng]) => [lng, lat])
  // Ensure closed ring
  if (
    coordinates.length > 0 &&
    (coordinates[0]![0] !== coordinates[coordinates.length - 1]![0] ||
      coordinates[0]![1] !== coordinates[coordinates.length - 1]![1])
  ) {
    coordinates.push(coordinates[0]!)
  }

  const geoJson = {
    type: 'Feature',
    properties: {
      name: aoi.name,
      createdAt: aoi.createdAt,
      type: 'Custom Area of Interest (AOI)',
      bounds: aoi.bounds,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  }

  triggerDownload(JSON.stringify(geoJson, null, 2), fileName, 'application/geo+json;charset=utf-8;')
}

/**
 * Generates and downloads a complete Markdown report summary.
 */
export function exportReportSummary(options: {
  filter: ObservationFilter
  summary: SummaryMetrics
  anomalyReport: AnomalyReport
  fileName?: string
}) {
  const { filter, summary, anomalyReport, fileName = 'pyrolens_activity_report.md' } = options

  const lines = [
    '# PyroLens — Fire Activity Intelligence Report',
    '',
    '> **DEMO DATA — NOT OFFICIAL NASA OBSERVATIONS**',
    '> PyroLens is an educational intelligence platform built for the NASA Space Apps Challenge.',
    '> Hotspots represent satellite thermal anomalies, not confirmed wildfires or burned area.',
    '',
    '## 1. Filter Parameters & Scope',
    `- **Sensor Selection:** ${filter.sensor}`,
    `- **Primary Metric:** ${filter.metricType}`,
    `- **Date Range:** ${filter.startDate || 'Unbounded'} to ${filter.endDate || 'Unbounded'}`,
    `- **Region Filter:** ${filter.regionId === 'all' ? 'All India' : filter.regionId}`,
    `- **Report Generated At:** ${new Date().toUTCString()}`,
    '',
    '## 2. Observation Summary',
    `- **Total Raw Detections:** ${summary.totalCount}`,
    `- **Harmonized Active Grid Cells (0.25°):** ${summary.harmonizedActiveCells}`,
    `- **MODIS Detections (1 km):** ${summary.modisCount} (${summary.totalCount > 0 ? ((summary.modisCount / summary.totalCount) * 100).toFixed(1) : 0}%)`,
    `- **VIIRS Detections (375 m):** ${summary.viirsCount} (${summary.totalCount > 0 ? ((summary.viirsCount / summary.totalCount) * 100).toFixed(1) : 0}%)`,
    `- **Active Observation Dates:** ${summary.distinctDatesCount}`,
    `- **Average Fire Radiative Power (FRP):** ${summary.avgFrp !== null ? `${summary.avgFrp} MW` : 'Not available'}`,
    `- **MODIS Average FRP:** ${summary.modisAvgFrp !== null ? `${summary.modisAvgFrp} MW` : 'N/A'}`,
    `- **VIIRS Average FRP:** ${summary.viirsAvgFrp !== null ? `${summary.viirsAvgFrp} MW` : 'N/A'}`,
    `- **Day / Night Distribution:** ${summary.dayCount} Day, ${summary.nightCount} Night`,
    '',
    '## 3. Sensor Harmonization & Methodology Note',
    '- **Spatial Resolution:** MODIS operates at 1000m nadir resolution with substantial bow-tie distortion at scan edges. VIIRS 375m I-Band preserves a sharper ~375m footprint across the swath.',
    '- **Count Disparity:** Because VIIRS has ~9x the pixel resolution of MODIS, raw hotspot counts from VIIRS are typically 2x to 4x higher for the same fire episode.',
    '- **Scientific Rule:** Raw counts must not be summed blindly. The Harmonized Grid Activity Index groups observations into uniform spatial cells.',
    '',
    '## 4. Statistical Anomaly Detection Findings',
    `- **Baseline Method:** ${anomalyReport.baselineMethod}`,
    `- **Baseline Median:** ${anomalyReport.baselineMedian}`,
    `- **MAD Spread:** ${anomalyReport.madValue}`,
    `- **Threshold Multiplier:** ${anomalyReport.thresholdMultiplier}x (Cutoff: ${anomalyReport.thresholdValue})`,
    `- **Days Analyzed:** ${anomalyReport.totalDaysAnalyzed}`,
    `- **Flagged Anomaly Periods:** ${anomalyReport.anomalies.length}`,
    '',
  ]

  if (anomalyReport.anomalies.length > 0) {
    lines.push('| Date | Observed Value | Baseline Median | Anomaly Score | Severity | Explanation |')
    lines.push('| ---- | -------------- | --------------- | ------------- | -------- | ----------- |')
    for (const anom of anomalyReport.anomalies) {
      lines.push(
        `| ${anom.date} | ${anom.observedCount} | ${anom.baselineValue} | +${anom.anomalyScore} | ${anom.severity} | ${anom.explanation} |`,
      )
    }
  } else {
    lines.push('_No statistical observation anomalies detected for the active period._')
  }

  lines.push('')
  lines.push('## 5. Scientific Accuracy & Limitations')
  lines.push('- **Thermal Anomaly != Wildfire:** Hotspots identify thermal contrasts, including agricultural burning, industrial heat, or prescribed fires.')
  lines.push('- **Cloud & Smoke Occlusion:** Clouds and heavy smoke plumes prevent satellite sensors from detecting ground thermal radiance.')
  lines.push('- **FRP Interpretation:** Fire Radiative Power measures the instantaneous rate of radiative energy release in Megawatts, NOT total burned area.')
  lines.push('')

  triggerDownload(lines.join('\n'), fileName, 'text/markdown;charset=utf-8;')
}
