import type { ActivityAnalysis, CriticalOutlook, DailyActivity, FireEvent } from '@/types/activity'
import type { ThemeTokens } from '@/context/ThemeContext'
import { calendarLegendRegistry } from '@/components/calendar/exportRegistry'
import { paintCell } from '@/components/calendar/cellPainter'
import { CLASS_LABEL } from './burningActivity'
import type { SensorView } from './calendarLayout'
import { csvPreamble, escapeCsv, geojsonMetadata, triggerDownload, type ExportMeta } from './exportUtils'

export type { ExportMeta }

const DISCLAIMER =
  'Active-fire hotspots are satellite thermal anomalies, not a complete record of fires. Pre-VIIRS values are modelled from MODIS. The BAI identifies unusual activity; it does not predict individual wildfires.'

/**
 * Composes the calendar's current view (all of its canvases), title, data source, legend and limitations into
 * one PNG in the active theme. Returns the data URL (also used by the printable report).
 */
export function composeCalendarImage(opts: {
  exportId: string
  tokens: ThemeTokens
  title: string
  subtitle: string
}): string | null {
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>(`canvas[id^="${opts.exportId}-"]`)]
  if (canvases.length === 0) return null
  const legend = calendarLegendRegistry.get(opts.exportId)
  const t = opts.tokens
  const dpr = window.devicePixelRatio || 1
  const pad = 24
  const cssW = Math.max(...canvases.map((c) => c.width / dpr)) + pad * 2
  const blocksH = canvases.reduce((s, c) => s + c.height / dpr + 16, 0)
  const legendRows = legend ? 1 + Math.ceil(legend.marks.length / 2) : 0
  const footer = [
    'BAI = 100·(0.4·Ĥ + 0.4·F̂ + 0.2·Ĉ) of log-scaled harmonized count, FRP and clusters; classes are percentiles of active days.',
    ...DISCLAIMER.split(/(?<=\.)\s+/),
  ]
  const cssH = pad + 46 + blocksH + legendRows * 22 + 12 + footer.length * 15 + pad
  const out = document.createElement('canvas')
  out.width = Math.round(cssW * dpr)
  out.height = Math.round(cssH * dpr)
  const ctx = out.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = t.surface
  ctx.fillRect(0, 0, cssW, cssH)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = t.text
  ctx.font = '600 16px Inter, system-ui, sans-serif'
  ctx.fillText(opts.title, pad, pad + 14)
  ctx.fillStyle = t.textMuted
  ctx.font = '400 12px Inter, system-ui, sans-serif'
  ctx.fillText(opts.subtitle, pad, pad + 34)
  let y = pad + 50
  for (const c of canvases) {
    const h = c.height / dpr
    ctx.drawImage(c, pad, y, c.width / dpr, h)
    y += h + 16
  }
  if (legend) {
    const sw = 14
    ctx.font = '600 11px Inter, system-ui, sans-serif'
    ctx.fillStyle = t.textMuted
    ctx.fillText(legend.scaleTitle, pad, y + 11)
    let x = pad + ctx.measureText(legend.scaleTitle).width + 14
    ctx.font = '400 11px Inter, system-ui, sans-serif'
    for (const item of legend.scale) {
      paintCell(ctx, t, x, y, sw, sw, item.paint)
      ctx.fillStyle = t.text
      ctx.fillText(item.label, x + sw + 5, y + 11)
      x += sw + 12 + ctx.measureText(item.label).width
    }
    y += 22
    legend.marks.forEach((m, i) => {
      const col = i % 2
      const mx = pad + col * ((cssW - pad * 2) / 2)
      const my = y + Math.floor(i / 2) * 22
      paintCell(ctx, t, mx, my, sw, sw, m.paint)
      ctx.fillStyle = t.text
      ctx.fillText(`${m.label} — ${m.note}`, mx + sw + 6, my + 11)
    })
    y += Math.ceil(legend.marks.length / 2) * 22
  }
  ctx.fillStyle = t.textFaint
  ctx.font = '400 10.5px Inter, system-ui, sans-serif'
  footer.forEach((line, i) => ctx.fillText(line, pad, y + 16 + i * 15))
  return out.toDataURL('image/png')
}

export function exportCalendarImage(opts: {
  exportId: string
  tokens: ThemeTokens
  sensorView: SensorView
  title: string
  subtitle: string
  fileName: string
}) {
  const url = composeCalendarImage(opts)
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = opts.fileName
  a.click()
}

export function exportDailyBaiCsv(days: readonly DailyActivity[], meta: ExportMeta, fileName = 'pyrolens_daily_bai.csv') {
  const areaName = meta.area
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
  triggerDownload(csvPreamble(meta) + [header.join(','), ...rows].join('\n'), fileName, 'text/csv;charset=utf-8;')
}

/** Side-by-side MODIS raw, VIIRS raw and harmonized daily values, with the factor used for scaled days. */
export function exportComparisonCsv(days: readonly DailyActivity[], analysis: ActivityAnalysis, meta: ExportMeta, fileName = 'pyrolens_sensor_comparison.csv') {
  const header = [
    'date',
    'modis_raw',
    'modis_satellites',
    'modis_per_satellite',
    'viirs_raw',
    'viirs_satellites',
    'viirs_per_satellite',
    'harmonized_per_satellite',
    'harmonized_low',
    'harmonized_high',
    'source',
    'r_m_used',
    'r_m_q25',
    'r_m_q75',
  ]
  const rows = days.map((d) => {
    const f = analysis.model.factors[d.month - 1]!
    const scaled = d.source === 'modis_scaled'
    return [
      d.date,
      d.modisCount,
      d.modisSats,
      d.modisSats > 0 ? (d.modisCount / d.modisSats).toFixed(3) : '',
      d.viirsCount,
      d.viirsSats,
      d.viirsSats > 0 ? (d.viirsCount / d.viirsSats).toFixed(3) : '',
      d.source === 'none' ? '' : d.harmonizedCount.toFixed(3),
      d.source === 'none' ? '' : d.harmonizedCountLow.toFixed(3),
      d.source === 'none' ? '' : d.harmonizedCountHigh.toFixed(3),
      d.source,
      scaled ? f.countRatio.toFixed(4) : '',
      scaled ? f.countQ25.toFixed(4) : '',
      scaled ? f.countQ75.toFixed(4) : '',
    ]
      .map(escapeCsv)
      .join(',')
  })
  triggerDownload(
    csvPreamble(meta) + '# Empty values mean "no coverage" (unknown), never zero.\n' + [header.join(','), ...rows].join('\n'),
    fileName,
    'text/csv;charset=utf-8;',
  )
}

export function exportFireEventsGeoJson(events: readonly FireEvent[], meta: ExportMeta, fileName = 'pyrolens_fire_clusters.geojson') {
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
    JSON.stringify({ type: 'FeatureCollection', metadata: { generatedAt: new Date().toISOString(), ...geojsonMetadata(meta) }, features }, null, 2),
    fileName,
    'application/geo+json;charset=utf-8;',
  )
}

export function exportHarmonizationCsv(analysis: ActivityAnalysis, meta: ExportMeta, fileName = 'pyrolens_harmonization_factors.csv') {
  const header = 'month,count_ratio_r,count_ratio_q25,count_ratio_q75,frp_ratio,cluster_ratio,overlap_years,fallback_to_pooled'
  const rows = analysis.model.factors.map((f) =>
    [f.month, f.countRatio.toFixed(4), f.countQ25.toFixed(4), f.countQ75.toFixed(4), f.frpRatio.toFixed(4), f.clusterRatio.toFixed(4), f.samples, f.fallback].join(','),
  )
  triggerDownload(csvPreamble(meta) + [header, ...rows].join('\n'), fileName, 'text/csv;charset=utf-8;')
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
export function openPrintableReport(input: SummaryInput, calendarImage?: string | null) {
  const { analysis, areaName, start, end, outlook, isDemo } = input
  const s = rangeStats(input)
  const n = analysis.seasonNorms
  const img = calendarImage ? `<img src="${calendarImage}" alt="Burning activity calendar with legend" style="width:100%;border-radius:8px"/>` : ''
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
