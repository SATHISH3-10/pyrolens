import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { Download, GitCompareArrows } from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { Button, Card, CardHeader, EmptyState, PageHeader, Stat } from '@/components/ui'
import { SENSOR_COLORS } from '@/components/viz/activityScale'
import { chartStyles } from '@/components/viz/chartTheme'
import { useTheme } from '@/context/ThemeContext'
import { exportHarmonizationCsv } from '@/utils/exportActivity'
import { fmtCompact, fmtDate, fmtNum, monthName } from '@/lib'

export default function HarmonizationPage() {
  const { analysis, area } = useFireData()
  const { tokens } = useTheme()
  const cs = chartStyles(tokens)

  const monthly = useMemo(() => {
    if (!analysis) return []
    const map = new Map<string, { key: string; modis: number | null; viirs: number | null; harmonized: number; scaled: boolean }>()
    for (const d of analysis.days) {
      if (d.source === 'none') continue
      const key = d.date.slice(0, 7)
      const r = map.get(key) ?? { key, modis: null, viirs: null, harmonized: 0, scaled: false }
      if (d.modisSats > 0) r.modis = (r.modis ?? 0) + d.modisCount / d.modisSats
      if (d.viirsSats > 0) r.viirs = (r.viirs ?? 0) + d.viirsCount / d.viirsSats
      r.harmonized += d.harmonizedCount
      if (d.source === 'modis_scaled') r.scaled = true
      map.set(key, r)
    }
    return [...map.values()]
  }, [analysis])

  if (!analysis) {
    return <EmptyState icon={GitCompareArrows} title="No detections in this area" description="Choose another study area or clear the custom AOI." />
  }

  const { model } = analysis
  const factors = model.factors.map((f) => ({
    month: monthName(f.month),
    r: f.countRatio,
    err: [f.countRatio - f.countQ25, f.countQ75 - f.countRatio] as [number, number],
    frp: f.frpRatio,
    samples: f.samples,
    fallback: f.fallback,
  }))
  const rMin = Math.min(...model.factors.map((f) => f.countRatio))
  const rMax = Math.max(...model.factors.map((f) => f.countRatio))
  const validation = model.validation.points.filter((p) => p.observed > 0)
  const vMax = Math.max(1, ...validation.map((p) => Math.max(p.observed, p.predicted)))
  const improvement =
    model.validation.mapeMonthly !== null && model.validation.mapePooled !== null
      ? model.validation.mapePooled - model.validation.mapeMonthly
      : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Sensor harmonization"
        title="Putting MODIS and VIIRS on one scale"
        description={
          <>
            VIIRS (375 m) sees roughly {model.pooledCountRatio.toFixed(1)}× more hotspots than MODIS (1 km) over {area.name} for the same fires.
            PyroLens learns that relationship month by month from the years both sensors flew, then uses it to bring the MODIS-only record onto the VIIRS scale.
          </>
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => exportHarmonizationCsv(analysis, `pyrolens_harmonization_${area.id}.csv`)}>
            <Download className="size-3.5" aria-hidden="true" /> Factors CSV
          </Button>
        }
      />

      <ol className="grid gap-3 md:grid-cols-3">
        {[
          [
            '1',
            'Normalize per satellite',
            'Detections are divided by the number of satellites flying each sensor that day (Terra + Aqua; S-NPP, NOAA-20, NOAA-21), so new launches do not look like more fire.',
          ],
          [
            '2',
            'Learn monthly factors r(m)',
            model.available
              ? `For each calendar month, r(m) = median over ${model.overlapYears} overlap years of VIIRS ÷ MODIS. Factors range ${rMin.toFixed(2)}–${rMax.toFixed(2)}, so a single global multiplier would be wrong.`
              : 'No overlap between MODIS and VIIRS in this dataset, so factors cannot be learned; values remain unscaled.',
          ],
          [
            '3',
            'Scale MODIS-only years',
            `Before ${model.viirsStart ? fmtDate(model.viirsStart) : 'VIIRS'}, activity = MODIS × r(m), with the inter-quartile range of r(m) carried as uncertainty and every modelled day flagged.`,
          ],
        ].map(([n, t, d]) => (
          <li key={n} className="relative rounded-2xl border border-line bg-ink-850 p-4">
            <span className="flex size-7 items-center justify-center rounded-full bg-ember-500/15 text-xs font-bold text-ember-300">{n}</span>
            <h3 className="mt-3 text-sm font-semibold text-fg">{t}</h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">{d}</p>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Overlap period"
          value={model.overlapStart ? `${model.overlapYears} years` : '—'}
          hint={model.overlapStart ? `${model.overlapStart.slice(0, 4)} → ${model.overlapEnd?.slice(0, 4)}` : 'no overlap'}
        />
        <Stat label="Pooled VIIRS : MODIS" value={`${model.pooledCountRatio.toFixed(2)}×`} hint={`FRP ratio ${model.pooledFrpRatio.toFixed(2)}×`} info="Ratio of total per-satellite VIIRS to MODIS detections across all overlap months. Shown for comparison only." />
        <Stat
          label="Monthly-factor error"
          value={model.validation.mapeMonthly !== null ? `${model.validation.mapeMonthly.toFixed(1)}%` : '—'}
          hint={model.validation.mapePooled !== null ? `vs ${model.validation.mapePooled.toFixed(1)}% with one factor` : undefined}
          info="Leave-one-year-out mean absolute percentage error when predicting each overlap month's VIIRS activity from MODIS. Lower is better."
        />
        <Stat
          label="Explained variance (R²)"
          value={model.validation.r2Monthly !== null ? model.validation.r2Monthly.toFixed(3) : '—'}
          hint={improvement !== null ? (improvement > 0 ? `${improvement.toFixed(1)} pts better than pooled` : 'similar to pooled factor') : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Monthly continuity factors r(m)"
            description="Median VIIRS ÷ MODIS per calendar month, with the inter-quartile range across years. Dashed line: a single pooled factor."
          />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={factors} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={cs.grid} vertical={false} />
                <XAxis dataKey="month" tick={cs.tick} axisLine={{ stroke: cs.axis }} tickLine={false} />
                <YAxis tick={cs.tick} axisLine={false} tickLine={false} width={44} domain={[0, 'auto']} />
                <Tooltip
                  {...cs.tooltip}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(v, _n, item) => {
                    const p = item.payload as (typeof factors)[number]
                    return [`${Number(v).toFixed(2)}× (IQR ${(p.r - p.err[0]).toFixed(2)}–${(p.r + p.err[1]).toFixed(2)}, ${p.samples} yrs${p.fallback ? ', pooled fallback' : ''})`, 'r(m)']
                  }}
                />
                <ReferenceLine y={model.pooledCountRatio} stroke={tokens.textMuted} strokeDasharray="5 4" label={{ value: `pooled ${model.pooledCountRatio.toFixed(2)}`, fill: tokens.textMuted, fontSize: 10, position: 'insideTopRight' }} />
                <Bar dataKey="r" fill={tokens.sensors.harmonized} radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={22}>
                  <ErrorBar dataKey="err" direction="y" stroke={tokens.text} strokeWidth={1.2} width={5} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Out-of-sample validation"
            description="Each dot is one overlap month: VIIRS observed vs predicted from MODIS with a factor learned without that year. Dots on the diagonal are perfect."
          />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 12, left: -8 }}>
                <CartesianGrid stroke={cs.grid} />
                <XAxis type="number" dataKey="observed" name="Observed" tick={cs.tick} axisLine={{ stroke: cs.axis }} tickLine={false} domain={[0, Math.ceil(vMax)]} tickFormatter={fmtCompact} label={{ value: 'VIIRS observed', fill: tokens.textFaint, fontSize: 11, position: 'insideBottom', offset: -6 }} />
                <YAxis type="number" dataKey="predicted" name="Predicted" tick={cs.tick} axisLine={false} tickLine={false} domain={[0, Math.ceil(vMax)]} tickFormatter={fmtCompact} width={48} />
                <ZAxis range={[28, 28]} />
                <Tooltip
                  {...cs.tooltip}
                  formatter={(v, n) => [fmtNum(Number(v), 1), String(n)]}
                  labelFormatter={() => ''}
                />
                <ReferenceLine
                  segment={[
                    { x: 0, y: 0 },
                    { x: Math.ceil(vMax), y: Math.ceil(vMax) },
                  ]}
                  stroke={tokens.textFaint}
                  strokeDasharray="4 4"
                />
                <Scatter data={validation} fill={tokens.sensors.VIIRS} fillOpacity={0.7} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="One continuous record across the sensor change"
          description="Monthly detections per satellite. Raw VIIRS jumps above MODIS when it starts; the harmonized series (MODIS × r(m) before, VIIRS after) is continuous."
          action={
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SENSOR_COLORS.MODIS }} /> MODIS raw</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SENSOR_COLORS.VIIRS }} /> VIIRS raw</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SENSOR_COLORS.harmonized }} /> Harmonized</span>
            </div>
          }
        />
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={cs.grid} vertical={false} />
              <XAxis dataKey="key" tick={cs.tick} axisLine={{ stroke: cs.axis }} tickLine={false} minTickGap={48} tickFormatter={(k: string) => k.slice(0, 4)} />
              <YAxis tick={cs.tick} axisLine={false} tickLine={false} tickFormatter={fmtCompact} width={48} />
              <Tooltip
                {...cs.tooltip}
                formatter={(v, n) => [v === null ? '—' : fmtNum(Number(v), 1), n === 'modis' ? 'MODIS raw' : n === 'viirs' ? 'VIIRS raw' : 'Harmonized']}
              />
              {model.viirsStart && (
                <ReferenceLine x={model.viirsStart.slice(0, 7)} stroke={tokens.textMuted} strokeDasharray="4 4" label={{ value: 'VIIRS starts', fill: tokens.textMuted, fontSize: 10, position: 'insideTopLeft' }} />
              )}
              {/* Harmonized drawn first as a wide translucent band: after VIIRS starts it equals raw VIIRS. */}
              <Line dataKey="harmonized" stroke={tokens.sensors.harmonized} strokeOpacity={0.45} strokeWidth={4} dot={false} isAnimationActive={false} />
              <Line dataKey="modis" stroke={tokens.sensors.MODIS} strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls={false} />
              <Line dataKey="viirs" stroke={tokens.sensors.VIIRS} strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card padding="none" className="lg:col-span-3">
          <div className="p-5 pb-3">
            <CardHeader className="mb-0" title="Factor table" description="Separate factors are also learned for FRP and cluster counts, which feed the other two BAI terms." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-xs">
              <thead className="border-y border-line bg-ink-900 text-[11px] uppercase tracking-wider text-fg-faint">
                <tr>
                  <th className="px-5 py-2 font-medium">Month</th>
                  <th className="px-3 py-2 text-right font-medium">Count r(m)</th>
                  <th className="px-3 py-2 text-right font-medium">IQR</th>
                  <th className="px-3 py-2 text-right font-medium">FRP ratio</th>
                  <th className="px-3 py-2 text-right font-medium">Cluster ratio</th>
                  <th className="px-5 py-2 text-right font-medium">Years</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {model.factors.map((f) => (
                  <tr key={f.month}>
                    <td className="px-5 py-2 font-medium text-fg">{monthName(f.month)}</td>
                    <td className="px-3 py-2 text-right tabular text-fg">{f.countRatio.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular text-fg-muted">
                      {f.countQ25.toFixed(2)}–{f.countQ75.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular text-fg-muted">{f.frpRatio.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular text-fg-muted">{f.clusterRatio.toFixed(2)}</td>
                    <td className="px-5 py-2 text-right tabular text-fg-muted">
                      {f.samples}
                      {f.fallback && <span className="ml-1 text-amber-300" title="Too few overlap years: pooled factor used">*</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Why counts cannot simply be added" />
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-fg-faint">
                <th className="pb-2 font-medium" />
                <th className="pb-2 font-medium"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: SENSOR_COLORS.MODIS }} />MODIS</th>
                <th className="pb-2 font-medium"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: SENSOR_COLORS.VIIRS }} />VIIRS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-fg-muted">
              {[
                ['Pixel at nadir', '1 km', '375 m'],
                ['Satellites', 'Terra, Aqua', 'S-NPP, NOAA-20, NOAA-21'],
                ['Record from', '2000 / 2002', '2012'],
                ['Local overpass', '10:30, 13:30', '~13:30'],
                ['Small fires', 'Often missed', 'Detected'],
                ['Pixels per fire', '1×', `~${model.pooledCountRatio.toFixed(1)}× here`],
              ].map(([k, a, b]) => (
                <tr key={k}>
                  <td className="py-2 pr-2 text-fg-faint">{k}</td>
                  <td className="py-2 pr-2 text-fg">{a}</td>
                  <td className="py-2 text-fg">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] leading-relaxed text-fg-faint">
            Factors are learned per area and per month, so crop-burning months (many small fires) and forest-fire months (fewer, larger fires) each get their own conversion.
          </p>
        </Card>
      </div>
    </div>
  )
}
