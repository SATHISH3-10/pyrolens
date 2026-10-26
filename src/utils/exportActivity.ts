import type { ActivityAnalysis, CriticalOutlook, DailyActivity, FireEvent } from '@/types/activity'
import { CLASS_LABEL } from './burningActivity'
import { escapeCsv, triggerDownload } from './exportUtils'

const DISCLAIMER =
  'Active-fire hotspots are satellite thermal anomalies, not a complete record of fires. Pre-VIIRS values are modelled from MODIS. The BAI identifies unusual activity; it does not predict individual wildfires.'

/** Save a canvas element (e.g. the calendar heatmap) as PNG on a solid background. */
export function downloadCanvasPng(canvasId: string, fileName: string) {
  const src = document.getElementById(canvasId) as HTMLCanvasElement | null
  if (!src) return
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#111419'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(src, 0, 0)
  const a = document.createElement('a')
  a.href = out.toDataURL('image/png')
  a.download = fileName
  a.click()
}

export function exportDailyBaiCsv(days: readonly DailyActivity[], areaName: string, fileName = 'pyrolens_daily_bai.csv') {
  const header = [
    'date',
    'area',
    'bai',
    'bai_percentile',
    'class',
    'harmonized_detections_per_sat',
    'harmonized_low',
    'harmonized_high',
    'harmonized_frp_mw',
    'harmonized_clusters',
    'modis_detections',
    'viirs_detections',
    'modis_satellites',
    'viirs_satellites',
    'modis_frp_mw',
    'viirs_frp_mw',
    'max_frp_mw',
    'day_detections',
    'night_detections',
    'low_confidence_removed',
    'data_source',
    'observation_quality',
    'quality_score',
    'clim_p50',
    'clim_p90',
    'clim_p97',
    'anomaly',
    'critical_period_id',
  ]
  const rows = days.map((d) =>
    [
      d.date,
      areaName,
      d.bai.toFixed(2),
      d.percentile !== null ? d.percentile.toFixed(1) : '',
      d.cls === 'none' ? (d.quality === 'limited' ? 'limited_observation' : 'none') : d.cls,
      d.harmonizedCount.toFixed(3),
      d.harmonizedCountLow.toFixed(3),
      d.harmonizedCountHigh.toFixed(3),
      d.harmonizedFrp.toFixed(2),
      d.harmonizedClusters.toFixed(3),
      d.modisCount,
      d.viirsCount,
      d.modisSats,
      d.viirsSats,
      d.modisFrp.toFixed(1),
      d.viirsFrp.toFixed(1),
      d.maxFrp ?? '',
      d.dayDetections,
      d.nightDetections,
      d.lowConfidenceRemoved,
      d.source,
      d.quality,
      d.qualityScore.toFixed(2),
      d.climP50.toFixed(2),
      d.climP90.toFixed(2),
      d.climP97.toFixed(2),
      d.anomaly,
      d.criticalPeriodId ?? '',
    ]
      .map(escapeCsv)
      .join(','),
  )
  triggerDownload([header.join(','), ...rows].join('\n'), fileName, 'text/csv;charset=utf-8;')
}

export function exportFireEventsGeoJson(events: readonly FireEvent[], fileName = 'pyrolens_fire_clusters.geojson') {
  const features = events.map((e) => {
    const ring = e.hull.map(([lat, lng]) => [lng, lat])
    const geometry =
      ring.length >= 3
        ? { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
        : { type: 'Point', coordinates: [e.centroid[1], e.centroid[0]] }
    return {
      type: 'Feature',
      geometry,
      properties: {
        id: e.id,
        start: e.start,
        end: e.end,
        duration_days: e.durationDays,
        detections: e.count,
        modis_detections: e.modisCount,
        viirs_detections: e.viirsCount,
        total_frp_mw: Number(e.totalFrp.toFixed(1)),
        max_frp_mw: e.maxFrp,
        hull_area_km2: Number(e.areaKm2.toFixed(2)),
        centroid_lat: Number(e.centroid[0].toFixed(5)),
        centroid_lng: Number(e.centroid[1].toFixed(5)),
        satellites: e.satellites.join(';'),
      },
    }
  })
  triggerDownload(
    JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
    fileName,
    'application/geo+json;charset=utf-8;',
  )
}

export function exportHarmonizationCsv(analysis: ActivityAnalysis, fileName = 'pyrolens_harmonization_factors.csv') {
  const header = 'month,count_ratio_r,count_ratio_q25,count_ratio_q75,frp_ratio,cluster_ratio,overlap_years,fallback_to_pooled'
  const rows = analysis.model.factors.map((f) =>
    [f.month, f.countRatio.toFixed(4), f.countQ25.toFixed(4), f.countQ75.toFixed(4), f.frpRatio.toFixed(4), f.clusterRatio.toFixed(4), f.samples, f.fallback].join(','),
  )
  triggerDownload([header, ...rows].join('\n'), fileName, 'text/csv;charset=utf-8;')
}

interface SummaryInput {
  analysis: ActivityAnalysis
  areaName: string
  start: string
  end: string
  outlook: CriticalOutlook | null
  isDemo: boolean
}

function rangeStats({ analysis, start, end }: SummaryInput) {
  const days = analysis.days.filter((d) => d.date >= start && d.date <= end)
  const covered = days.filter((d) => d.source !== 'none')
  const active = covered.filter((d) => d.harmonizedCount > 0)
  const byClass: Record<string, number> = {}
  for (const d of covered) {
    const k = d.cls === 'none' && d.quality === 'limited' ? 'limited' : d.cls
    byClass[k] = (byClass[k] ?? 0) + 1
  }
  const periods = analysis.criticalPeriods.filter((p) => p.end >= start && p.start <= end)
  const peak = covered.reduce<DailyActivity | null>((b, d) => (!b || d.bai > b.bai ? d : b), null)
  return {
    days,
    covered,
    active,
    byClass,
    periods,
    peak,
    modis: days.reduce((s, d) => s + d.modisCount, 0),
    viirs: days.reduce((s, d) => s + d.viirsCount, 0),
    harmonized: days.reduce((s, d) => s + d.harmonizedCount, 0),
    anomalies: covered.filter((d) => d.anomaly !== 'none'),
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function exportSummaryMarkdown(input: SummaryInput, fileName = 'pyrolens_summary.md') {
  const { analysis, areaName, start, end, outlook, isDemo } = input
  const s = rangeStats(input)
  const n = analysis.seasonNorms
  const lines = [
    `# Burning Activity Summary — ${areaName}`,
    '',
    isDemo ? '> **Demo data — synthetic archive, not official NASA observations.**' : '> Source: NASA FIRMS active-fire detections (MODIS C6.1, VIIRS 375 m).',
    '',
    `Period: **${start} → ${end}** · generated ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## Headline numbers',
    `- Observed days: ${s.covered.length}; active fire days: ${s.active.length}`,
    `- Raw detections: MODIS ${s.modis}, VIIRS ${s.viirs} (not additive)`,
    `- Harmonized VIIRS-equivalent detections (per satellite): ${s.harmonized.toFixed(0)}`,
    `- Critical periods (≥3 consecutive High+ days): ${s.periods.length}`,
    `- Anomalous days (> 90th percentile for date): ${s.anomalies.length}`,
    s.peak ? `- Peak day: ${s.peak.date} (BAI ${s.peak.bai.toFixed(0)}, ${CLASS_LABEL[s.peak.cls]})` : '',
    '',
    '## Days by activity class',
    '| Class | Days |',
    '| --- | ---: |',
    ...['extreme', 'very_high', 'high', 'moderate', 'low', 'none', 'limited'].map(
      (k) => `| ${k === 'limited' ? 'Limited observation' : CLASS_LABEL[k as keyof typeof CLASS_LABEL]} | ${s.byClass[k] ?? 0} |`,
    ),
    '',
  ]
  if (n) {
    lines.push(
      '## Typical fire season',
      `- Start ${n.typicalStart}, peak ${n.typicalPeak}, end ${n.typicalEnd} (median ${Math.round(n.medianDuration)} days)`,
      `- Most fire-prone months: ${n.topMonths.map((m) => MONTHS[m - 1]).join(', ')}`,
      '',
    )
  }
  if (outlook) {
    lines.push(
      `## Critical Period Outlook (as of ${outlook.referenceDate})`,
      `- Risk level: **${outlook.risk.toUpperCase()}** · current BAI ${outlook.latestBai.toFixed(0)} · 7-day trend ${outlook.trendPerDay.toFixed(1)}/day`,
      ...outlook.reasons.map((r) => `- ${r}`),
      '',
    )
  }
  lines.push('## Critical periods', '| Start | End | Days | Peak date | Peak BAI |', '| --- | --- | ---: | --- | ---: |')
  for (const p of s.periods.slice(-40)) lines.push(`| ${p.start} | ${p.end} | ${p.days} | ${p.peakDate} | ${p.peakBai.toFixed(0)} |`)
  lines.push(
    '',
    '## Harmonization',
    analysis.model.available
      ? `Monthly VIIRS:MODIS factors r(m) learned over ${analysis.model.overlapYears} overlap years (${analysis.model.overlapStart} → ${analysis.model.overlapEnd}). Pooled single factor: ${analysis.model.pooledCountRatio.toFixed(2)}.`
      : 'No MODIS–VIIRS overlap in the data; values are not cross-calibrated.',
    '',
    '| Month | r(m) | IQR | Years |',
    '| --- | ---: | --- | ---: |',
    ...analysis.model.factors.map((f) => `| ${MONTHS[f.month - 1]} | ${f.countRatio.toFixed(2)} | ${f.countQ25.toFixed(2)}–${f.countQ75.toFixed(2)} | ${f.samples} |`),
    '',
    '## Limitations',
    `- ${DISCLAIMER}`,
    '- Cloud cover, smoke and overpass timing reduce detections; zero detections do not prove absence of fire.',
    '- Agricultural, prescribed and industrial burning also appear as hotspots.',
  )
  triggerDownload(lines.filter((l) => l !== undefined).join('\n'), fileName, 'text/markdown;charset=utf-8;')
}

/** Opens a print-ready HTML report in a new tab (use the browser's "Save as PDF"). */
export function openPrintableReport(input: SummaryInput, calendarCanvasId?: string) {
  const { analysis, areaName, start, end, outlook, isDemo } = input
  const s = rangeStats(input)
  const n = analysis.seasonNorms
  let img = ''
  const canvas = calendarCanvasId ? (document.getElementById(calendarCanvasId) as HTMLCanvasElement | null) : null
  if (canvas) {
    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#111419'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, 0, 0)
    img = `<img src="${out.toDataURL('image/png')}" alt="Burning activity calendar" style="width:100%;border-radius:8px"/>`
  }
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Burning Activity Report — ${esc(areaName)}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;color:#111;max-width:860px;margin:32px auto;padding:0 24px;line-height:1.5}
h1{font-size:24px;margin:0} h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
.muted{color:#555;font-size:13px} table{border-collapse:collapse;width:100%;font-size:12px} td,th{border-bottom:1px solid #eee;padding:4px 6px;text-align:left}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.tile{border:1px solid #ddd;border-radius:8px;padding:10px}.tile b{display:block;font-size:20px}
.warn{background:#fff7e6;border:1px solid #f5c26b;padding:8px 12px;border-radius:8px;font-size:12px}
@media print{body{margin:0}}
</style></head><body>
<h1>Burning Activity Report — ${esc(areaName)}</h1>
<p class="muted">${start} → ${end} · generated ${new Date().toISOString().slice(0, 10)} with PyroLens</p>
${isDemo ? '<p class="warn"><b>Demo data</b> — synthetic archive, not official NASA observations.</p>' : ''}
<div class="grid">
<div class="tile">Active fire days<b>${s.active.length}</b><span class="muted">of ${s.covered.length} observed</span></div>
<div class="tile">Critical periods<b>${s.periods.length}</b><span class="muted">${s.periods.reduce((a, p) => a + p.days, 0)} days High+</span></div>
<div class="tile">Anomalous days<b>${s.anomalies.length}</b><span class="muted">&gt; 90th pct for date</span></div>
<div class="tile">Harmonized detections<b>${Math.round(s.harmonized).toLocaleString()}</b><span class="muted">VIIRS-equivalent</span></div>
<div class="tile">Raw MODIS / VIIRS<b>${s.modis.toLocaleString()} / ${s.viirs.toLocaleString()}</b><span class="muted">not additive</span></div>
<div class="tile">Peak day<b>${s.peak ? s.peak.date : '—'}</b><span class="muted">${s.peak ? `BAI ${s.peak.bai.toFixed(0)} · ${CLASS_LABEL[s.peak.cls]}` : ''}</span></div>
</div>
${outlook ? `<h2>Critical Period Outlook — ${outlook.risk.toUpperCase()}</h2><ul>${outlook.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><p class="muted">Early-warning indicator from historical patterns; not a forecast of individual fires.</p>` : ''}
${img ? `<h2>Burning Activity Calendar</h2>${img}` : ''}
${n ? `<h2>Typical fire season</h2><p>Start <b>${n.typicalStart}</b>, peak <b>${n.typicalPeak}</b>, end <b>${n.typicalEnd}</b> (median ${Math.round(n.medianDuration)} days). Most fire-prone months: ${n.topMonths.map((m) => MONTHS[m - 1]).join(', ')}.</p>` : ''}
<h2>Fire seasons</h2><table><tr><th>Fire year</th><th>Start</th><th>Peak</th><th>End</th><th>Days</th><th>Flags</th></tr>
${analysis.seasons.filter((x) => x.rangeEnd >= start && x.rangeStart <= end).map((x) => `<tr><td>${x.label}</td><td>${x.start}</td><td>${x.peak}</td><td>${x.end}</td><td>${x.durationDays}</td><td>${x.flags.join(', ')}</td></tr>`).join('')}
</table>
<h2>Harmonization factors r(m)</h2><table><tr><th>Month</th>${analysis.model.factors.map((f) => `<th>${MONTHS[f.month - 1]}</th>`).join('')}</tr><tr><td>VIIRS:MODIS</td>${analysis.model.factors.map((f) => `<td>${f.countRatio.toFixed(2)}</td>`).join('')}</tr></table>
<h2>Limitations</h2><p class="muted">${esc(DISCLAIMER)} Cloud cover, smoke and overpass timing reduce detections; agricultural and prescribed burns also appear as hotspots.</p>
<script>setTimeout(()=>window.print(),400)</script>
</body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}
