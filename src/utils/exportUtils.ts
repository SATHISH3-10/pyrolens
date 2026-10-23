import type {
  AnomalyReport,
  DateAggregate,
  FireObservation,
  ObservationFilter,
  SummaryMetrics,
} from '@/types/fire'

/**
 * Escapes a field for safe CSV output.
 */
function escapeCsv(val: unknown): string {
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
function triggerDownload(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Exports filtered observation records as CSV.
 */
export function exportObservationsCsv(
  records: readonly FireObservation[],
  fileName = 'pyrolens_observations.csv',
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

  const csvContent =
    '# DEMO DATA NOTICE: Synthetic demonstration data. Not official NASA observations.\n' +
    [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

  triggerDownload(csvContent, fileName, 'text/csv;charset=utf-8;')
}

/**
 * Exports aggregated daily summaries as CSV.
 */
export function exportAggregatedDailyCsv(
  aggregates: readonly DateAggregate[],
  fileName = 'pyrolens_daily_aggregates.csv',
) {
  const headers = [
    'Date',
    'Total_Hotspots',
    'MODIS_Hotspots',
    'VIIRS_Hotspots',
    'Average_FRP_MW',
    'MODIS_Avg_FRP_MW',
    'VIIRS_Avg_FRP_MW',
  ]

  const rows = aggregates.map((d) => [
    escapeCsv(d.date),
    escapeCsv(d.total),
    escapeCsv(d.modis),
    escapeCsv(d.viirs),
    escapeCsv(d.avgFrp !== null ? d.avgFrp : 'N/A'),
    escapeCsv(d.modisAvgFrp !== null ? d.modisAvgFrp : 'N/A'),
    escapeCsv(d.viirsAvgFrp !== null ? d.viirsAvgFrp : 'N/A'),
  ])

  const csvContent =
    '# DEMO DATA NOTICE: Synthetic demonstration data. Not official NASA observations.\n' +
    [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

  triggerDownload(csvContent, fileName, 'text/csv;charset=utf-8;')
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
    `- **Date Range:** ${filter.startDate || 'Unbounded'} to ${filter.endDate || 'Unbounded'}`,
    `- **Region Filter:** ${filter.regionId === 'all' ? 'All India' : filter.regionId}`,
    `- **Report Generated At:** ${new Date().toUTCString()}`,
    '',
    '## 2. Observation Summary',
    `- **Total Observations:** ${summary.totalCount}`,
    `- **MODIS Detections:** ${summary.modisCount} (${summary.totalCount > 0 ? ((summary.modisCount / summary.totalCount) * 100).toFixed(1) : 0}%)`,
    `- **VIIRS Detections:** ${summary.viirsCount} (${summary.totalCount > 0 ? ((summary.viirsCount / summary.totalCount) * 100).toFixed(1) : 0}%)`,
    `- **Active Observation Dates:** ${summary.distinctDatesCount}`,
    `- **Average Fire Radiative Power (FRP):** ${summary.avgFrp !== null ? `${summary.avgFrp} MW` : 'Not available'}`,
    `- **MODIS Average FRP:** ${summary.modisAvgFrp !== null ? `${summary.modisAvgFrp} MW` : 'N/A'}`,
    `- **VIIRS Average FRP:** ${summary.viirsAvgFrp !== null ? `${summary.viirsAvgFrp} MW` : 'N/A'}`,
    `- **Day / Night Distribution:** ${summary.dayCount} Day, ${summary.nightCount} Night`,
    '',
    '## 3. Sensor Harmonization & Methodology Note',
    '- **Spatial Resolution:** MODIS operates at 1000m nadir resolution with substantial bow-tie distortion at scan edges. VIIRS 375m I-Band preserves a sharper ~375m footprint across the swath.',
    '- **Count Disparity:** Because VIIRS has ~9x the pixel resolution of MODIS, raw hotspot counts from VIIRS are typically 2x to 4x higher for the same fire episode.',
    '- **Scientific Rule:** Raw counts must not be summed blindly. Comparing activity requires spatial-temporal grid cell binning.',
    '',
    '## 4. Statistical Anomaly Detection Findings',
    `- **Baseline Method:** ${anomalyReport.baselineMethod}`,
    `- **Baseline Median:** ${anomalyReport.baselineMedian} hotspots/day`,
    `- **MAD Spread:** ${anomalyReport.madValue}`,
    `- **Threshold Multiplier:** ${anomalyReport.thresholdMultiplier}x (Cutoff: ${anomalyReport.thresholdValue} hotspots/day)`,
    `- **Days Analyzed:** ${anomalyReport.totalDaysAnalyzed}`,
    `- **Flagged Anomaly Periods:** ${anomalyReport.anomalies.length}`,
    '',
  ]

  if (anomalyReport.anomalies.length > 0) {
    lines.push('| Date | Observed Count | Baseline | Anomaly Score | Severity | Explanation |')
    lines.push('| ---- | -------------- | -------- | ------------- | -------- | ----------- |')
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
