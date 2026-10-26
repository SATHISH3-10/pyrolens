import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { Card, PageHeader } from '@/components/ui'
import { ACTIVITY_COLORS, SENSOR_COLORS } from '@/components/viz/activityScale'
import { CLASS_THRESHOLDS } from '@/utils/burningActivity'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-3 text-lg font-semibold tracking-tight text-fg">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  )
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-ink-900 px-4 py-3 font-mono text-[13px] leading-relaxed text-fg">
      {children}
    </div>
  )
}

const PIPELINE = [
  ['Area', 'Polygon, rectangle or preset → FIRMS bbox'],
  ['Ingest', 'MODIS + VIIRS archives, cached'],
  ['Quality control', 'Low confidence, duplicates, invalid rows'],
  ['Daily aggregates', 'Counts, FRP, clusters per sensor'],
  ['Harmonize', 'Monthly r(m) from overlap years'],
  ['BAI', 'Count + FRP + clusters, 0–100'],
  ['Calendar', 'Climatology, anomalies, critical periods'],
  ['Outlook', 'Early-warning risk level'],
]

const TOC = [
  ['data', 'Data sources'],
  ['pipeline', 'Processing pipeline'],
  ['harmonization', 'MODIS–VIIRS harmonization'],
  ['bai', 'Burning Activity Index'],
  ['calendar', 'Calendar, anomalies & seasons'],
  ['outlook', 'Critical Period Outlook'],
  ['limitations', 'Limitations'],
  ['references', 'References'],
]

export default function MethodologyPage() {
  const { baiWeights } = useFireData()
  const wSum = baiWeights.count + baiWeights.frp + baiWeights.clusters || 1
  const w = (x: number) => (x / wSum).toFixed(2)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="How it works"
        title="From scattered hotspots to one burning calendar"
        description="MODIS has watched fires since 2000; VIIRS, since 2012, sees far more of them. PyroLens turns both records into a single, comparable Burning Activity Index for any area, then compares every day with that area's own history."
      />

      <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-0 space-y-1 border-l border-line text-[13px]">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="-ml-px block border-l border-transparent py-1 pl-3 text-fg-muted transition-colors hover:border-ember-500 hover:text-fg">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl space-y-10">
          <Section id="data" title="Data sources">
            <p>
              Active-fire detections come from NASA <strong className="text-fg">FIRMS</strong> (Fire Information for Resource Management System),
              via archive CSV downloads or the Area API (<code className="rounded bg-ink-700 px-1 font-mono text-xs text-fg">/api/area/csv/MAP_KEY/SOURCE/west,south,east,north/days</code>).
              For each detection PyroLens keeps latitude, longitude, acquisition date and time, satellite, sensor, confidence, brightness temperature, Fire Radiative Power (FRP) and the day/night flag.
            </p>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full whitespace-nowrap text-left text-xs">
                <thead className="bg-ink-900 text-[11px] uppercase tracking-wider text-fg-faint">
                  <tr>
                    <th className="px-4 py-2 font-medium">Sensor</th>
                    <th className="px-4 py-2 font-medium">Satellites (FIRMS record from)</th>
                    <th className="px-4 py-2 font-medium">Pixel</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <td className="px-4 py-2 font-semibold" style={{ color: SENSOR_COLORS.MODIS }}>MODIS C6.1</td>
                    <td className="px-4 py-2">Terra (2000), Aqua (2002)</td>
                    <td className="px-4 py-2">1 km</td>
                    <td className="px-4 py-2">Long historical baseline</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-semibold" style={{ color: SENSOR_COLORS.VIIRS }}>VIIRS 375 m</td>
                    <td className="px-4 py-2">S-NPP (2012), NOAA-20 (2018), NOAA-21 (2024)</td>
                    <td className="px-4 py-2">375 m</td>
                    <td className="px-4 py-2">Modern reference scale</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-fg-faint">
              The preloaded study areas use a deterministic synthetic archive that mimics these sensors (including satellite launch dates, cloud gaps and the VIIRS:MODIS
              detection ratio) so the app works offline. Load real FIRMS CSVs or use the API from the data menu for real analysis.
            </p>
          </Section>

          <Section id="pipeline" title="Processing pipeline">
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE.map(([t, d], i) => (
                <li key={t} className="relative rounded-xl border border-line bg-ink-850 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-ember-500/15 text-[10px] font-bold text-ember-300">{i + 1}</span>
                    <span className="text-[13px] font-semibold text-fg">{t}</span>
                    {i < PIPELINE.length - 1 && <ArrowRight className="ml-auto size-3.5 text-fg-faint" aria-hidden="true" />}
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{d}</p>
                </li>
              ))}
            </ol>
            <p>
              <strong className="text-fg">Quality control</strong> removes low-confidence detections (VIIRS “low”, MODIS &lt; 30%), duplicates from overlapping files, and
              rows with invalid coordinates or dates. <strong className="text-fg">Fire clusters</strong> join detections whose ~5 km grid cells touch within a day of each
              other, so a large fire is one event, not hundreds of fires; each cluster gets a centroid, start/end, duration, total and max FRP, convex-hull area and the
              satellites involved.
            </p>
          </Section>

          <Section id="harmonization" title="MODIS–VIIRS harmonization">
            <p>
              Counts from the two sensors cannot be added or compared directly: VIIRS pixels are ~7× smaller, so one fire produces several times more VIIRS hotspots and
              many small fires are seen only by VIIRS. The ratio also changes with the kind of burning, so it is learned per area and per calendar month.
            </p>
            <Formula>
              <div>M<sub>d</sub> = MODIS detections<sub>d</sub> ÷ MODIS satellites<sub>d</sub>  ·  V<sub>d</sub> = VIIRS detections<sub>d</sub> ÷ VIIRS satellites<sub>d</sub></div>
              <div className="mt-2">r(m) = median<sub>years in overlap</sub> ( Σ V ÷ Σ M ) for calendar month m</div>
              <div className="mt-2">H<sub>d</sub> = V<sub>d</sub> when VIIRS flew, otherwise M<sub>d</sub> × r(m)   with range [M<sub>d</sub>·r<sub>25</sub>(m), M<sub>d</sub>·r<sub>75</sub>(m)]</div>
            </Formula>
            <p>
              The same procedure gives separate factors for FRP and cluster counts. Months with fewer than two overlap years fall back to the pooled ratio. Factors are
              validated by leave-one-year-out prediction of VIIRS from MODIS (see the Harmonization page). Every modelled value is labelled “MODIS scaled to VIIRS” in the
              interface and exports.
            </p>
          </Section>

          <Section id="bai" title="Burning Activity Index (BAI)">
            <p>One number per day that combines how many hotspots there were, how intense they were, and how many separate fires burned:</p>
            <Formula>
              BAI<sub>d</sub> = 100 × ( {w(baiWeights.count)}·Ĥ<sub>d</sub> + {w(baiWeights.frp)}·F̂<sub>d</sub> + {w(baiWeights.clusters)}·Ĉ<sub>d</sub> )
              <div className="mt-2 text-fg-muted">x̂ = min(1, log(1 + x) ÷ P99[log(1 + x)])  — log transform for skewed FRP, robust 99th-percentile scaling</div>
            </Formula>
            <p>Weights are configurable from the Burning Calendar. Each active day is then classed by its percentile among all active days in the area's record:</p>
            <div className="grid gap-2 sm:grid-cols-5">
              {CLASS_THRESHOLDS.map((t) => (
                <div key={t.cls} className="rounded-xl border border-line bg-ink-850 p-3">
                  <span className="block h-2 rounded-full" style={{ background: ACTIVITY_COLORS[t.cls] }} />
                  <div className="mt-2 text-[13px] font-semibold text-fg">{t.label}</div>
                  <div className="text-xs text-fg-faint">{t.range} percentile</div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="calendar" title="Calendar, anomalies & seasons">
            <ul className="list-disc space-y-2 pl-5 marker:text-ember-500">
              <li>
                <strong className="text-fg">Climatology:</strong> for every day of the year, BAI values from a ±7-day window across all years give the 10th, 50th, 90th and
                97th percentiles — the “normal range” drawn on charts.
              </li>
              <li>
                <strong className="text-fg">Anomalous day:</strong> BAI above the 90th percentile for that time of year (extreme above the 97th), and at least Moderate.
              </li>
              <li>
                <strong className="text-fg">Critical period:</strong> three or more consecutive days classed High or above (a single weaker day inside the run is tolerated).
              </li>
              <li>
                <strong className="text-fg">Fire season:</strong> each fire-year starts in the area's quietest month. Start, peak and end are the dates by which 10%, the
                highest 7-day mean and 90% of that year's activity occurred. Seasons are flagged early/late (±14 days vs median), intense (top 10%), prolonged or weak.
              </li>
              <li>
                <strong className="text-fg">Limited observation:</strong> zero detections are never read as “no fire”. A day is flagged when detections fall below 25% of
                the surrounding days, or are absent during a normally active period — typical of cloud, smoke or missed overpasses. These appear hatched.
              </li>
            </ul>
          </Section>

          <Section id="outlook" title="Critical Period Outlook">
            <p>An early-warning indicator — not a forecast. Points are added for:</p>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-line">
                  {[
                    ['7-day mean BAI above the median / 90th / 97th percentile for the date', '+1 / +2 / +3'],
                    ['Rising 7-day trend (> 1.2 BAI per day)', '+1'],
                    ['3–4 / 5+ of the last 7 days High or above', '+1 / +2'],
                    ['Max FRP in the last week in the top 5% of the record', '+1'],
                    ['The next 4 weeks are climatologically ≥ 30% more active', '+1'],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="px-4 py-2">{k}</td>
                      <td className="px-4 py-2 text-right font-mono text-fg">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>Score 0 → Low, 1–2 → Moderate, 3–4 → Elevated, 5+ → Critical. Every contributing reason is listed in plain language next to the risk level.</p>
          </Section>

          <Section id="limitations" title="Limitations">
            <Card padding="sm" className="border-amber-400/30 bg-amber-400/5">
              <ul className="list-disc space-y-1.5 pl-5 text-[13px] marker:text-amber-400">
                <li>Active-fire hotspots are thermal anomalies, not a complete record of every fire, nor burned area.</li>
                <li>Cloud cover, smoke and the timing of satellite overpasses affect what is detected.</li>
                <li>MODIS and VIIRS have different detection capabilities; pre-VIIRS years rely on the harmonization assumptions and carry wider uncertainty.</li>
                <li>Agricultural burns, prescribed burns, wildfires and industrial heat sources can all appear as hotspots.</li>
                <li>The system identifies unusual activity and critical periods; it does not predict individual wildfires and must not be used for life-safety decisions.</li>
                <li>Preset study-area boxes are simplified envelopes, not official boundaries.</li>
              </ul>
            </Card>
          </Section>

          <Section id="references" title="References">
            <ul className="space-y-1.5 text-xs">
              <li>Giglio, L., Schroeder, W. &amp; Justice, C. O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. <em>Remote Sensing of Environment</em> 178, 31–41.</li>
              <li>Schroeder, W. et al. (2014). The New VIIRS 375 m active fire detection data product. <em>Remote Sensing of Environment</em> 143, 85–96.</li>
              <li>Wooster, M. J. et al. (2003). Fire radiative energy for quantitative study of biomass burning. <em>Remote Sensing of Environment</em> 86, 83–107.</li>
              <li>
                NASA FIRMS —{' '}
                <a className="text-signal-400 hover:underline" href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">
                  firms.modaps.eosdis.nasa.gov
                </a>
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}
