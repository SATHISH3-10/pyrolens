import {
  Database,
  FileSpreadsheet,
  Layers,
  Satellite,
} from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui'
import { REGIONAL_BOUNDS_DISCLAIMER, REGIONS } from '@/data/regions'

export default function MethodologyPage() {
  const { metadata, setIsCsvModalOpen, loadSyntheticData } = useFireData()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Scientific Methodology & Data Governance"
        description="Comprehensive documentation of satellite thermal anomaly detection, sensor physics, aggregation rules, and operational limitations."
        meta={
          <Badge tone={metadata.isSynthetic ? 'ember' : 'signal'} dot>
            {metadata.isSynthetic ? 'Synthetic Demonstration Mode' : 'Live Imported CSV'}
          </Badge>
        }
      />

      {/* Live Dataset Provenance & Metadata Card */}
      <Card aria-labelledby="live-metadata-title" className="border-line-strong bg-ink-900/90">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-ember-400" />
            <h3 id="live-metadata-title" className="text-sm font-semibold text-fg">
              Active Dataset Provenance &amp; Metadata
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {!metadata.isSynthetic ? (
              <button
                type="button"
                onClick={loadSyntheticData}
                className="rounded-lg border border-line bg-ink-800 px-3 py-1.5 text-xs text-fg-muted hover:text-fg"
              >
                Restore 1,500 Demo Records
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsCsvModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-ink-800 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-ink-700 hover:border-signal-400/50 transition-colors"
            >
              <FileSpreadsheet className="size-3.5 text-signal-400" />
              <span>Import Official FIRMS CSV</span>
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Dataset Source</span>
            <span className="font-semibold text-fg text-sm">{metadata.title}</span>
            <span className="text-fg-faint text-[10px] block mt-0.5">
              {metadata.isSynthetic
                ? 'Deterministic synthetic demo (India 2024)'
                : 'User-imported NASA FIRMS CSV'}
            </span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Observation Period</span>
            <span className="font-semibold text-fg text-sm">
              {metadata.dateRange.start || 'N/A'} to {metadata.dateRange.end || 'N/A'}
            </span>
            <span className="text-fg-faint text-[10px] block mt-0.5">
              {metadata.distinctDatesCount} active observation dates
            </span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Record Breakdown</span>
            <span className="font-semibold text-fg text-sm">
              {metadata.recordCount.toLocaleString()} total hotspots
            </span>
            <span className="text-fg-faint text-[10px] block mt-0.5">
              {metadata.modisCount} MODIS (1 km) · {metadata.viirsCount} VIIRS (375 m)
            </span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Ingestion &amp; Validation</span>
            <span className="font-semibold text-ok text-sm">Strict Schema Validated</span>
            <span className="text-fg-faint text-[10px] block mt-0.5">
              {metadata.rejectedCount && metadata.rejectedCount > 0
                ? `${metadata.rejectedCount} invalid coordinates/rows rejected`
                : 'Zero parse errors'}
            </span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Processing Timestamp</span>
            <span className="font-mono text-fg text-xs truncate block">
              {new Date(metadata.loadedAt).toUTCString()}
            </span>
            <span className="text-fg-faint text-[10px] block mt-0.5">Client-side parser</span>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-3">
            <span className="text-fg-faint text-[11px] block">Scientific Notice</span>
            <span className="font-semibold text-ember-400 text-xs block">
              {metadata.isSynthetic ? 'DEMO DATA — NOT OFFICIAL OBSERVATIONS' : 'User Supplied FIRMS Data'}
            </span>
            <span className="text-fg-faint text-[10px] block mt-0.5">
              Educational intelligence platform
            </span>
          </div>
        </div>
      </Card>

      {/* 1. What is an Active Fire Hotspot */}
      <Card aria-labelledby="section-hotspot">
        <CardHeader
          id="section-hotspot"
          title="1. What is an Active-Fire Hotspot Observation?"
          description="Principles of satellite mid-infrared thermal anomaly detection."
        />
        <div className="space-y-3 text-xs text-fg-muted leading-relaxed">
          <p>
            An <strong>active-fire hotspot</strong> is not a photo or direct image of a flame. It is a <strong className="text-fg">satellite-detected thermal anomaly</strong> identified by specialized radiometric detectors aboard Sun-synchronous polar-orbiting satellites.
          </p>
          <p>
            Thermal anomaly detection algorithms (such as the MODIS MOD14/MYD14 and VIIRS VNP14IMGTDL contextual algorithms developed by NASA and University of Maryland) monitor radiation emitted in the <strong className="text-fg">mid-infrared (MIR ~3.7 to 4.0 µm)</strong> and <strong className="text-fg">thermal infrared (TIR ~10.5 to 12.0 µm)</strong> spectral bands. Because hot burning vegetation emits radiation with peak intensity in the 3.9 µm window according to Wien&apos;s displacement law, a sub-pixel fire occupying as little as 0.01% of a pixel can elevate the observed brightness temperature significantly above the background landscape.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <div className="rounded-lg border border-line bg-ink-950 p-3">
              <span className="font-semibold text-fg block mb-1">Contextual Background Thresholding</span>
              <p className="text-[11px] text-fg-faint">
                Algorithms sample surrounding non-fire pixels (a window from 3×3 up to 21×21 pixels) to estimate background temperature and variance, flagging pixels that exceed both absolute and relative statistical thresholds.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-950 p-3">
              <span className="font-semibold text-fg block mb-1">False Alarm Rejection</span>
              <p className="text-[11px] text-fg-faint">
                Specialized test filters eliminate sunglint reflections off water bodies, hot bare desert rock, elevated cloud borders, and sensor noise before an anomaly is confirmed.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Sensor Differences: MODIS vs VIIRS */}
      <Card aria-labelledby="section-sensors">
        <CardHeader
          id="section-sensors"
          title="2. Sensor Architecture: Why MODIS and VIIRS Detections Differ"
          description="Optical spatial resolution, swath geometry, and orbital mechanics."
        />
        <div className="space-y-4 text-xs text-fg-muted leading-relaxed">
          <p>
            NASA FIRMS provides observations from two distinct instrument families. Understanding their differences is essential for correct scientific interpretation:
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-ember-500/30 bg-ink-950 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Satellite className="size-4 text-ember-400" />
                <h4 className="font-semibold text-fg text-sm">MODIS (Moderate Resolution Imaging Spectroradiometer)</h4>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-fg-faint">
                <li><strong className="text-fg-muted">Platforms:</strong> Terra (morning overpass ~10:30 AM/PM) and Aqua (afternoon ~01:30 PM/AM).</li>
                <li><strong className="text-fg-muted">Spatial Resolution:</strong> 1,000 m (1 km) at nadir.</li>
                <li><strong className="text-fg-muted">Swath Edge Bow-Tie Effect:</strong> Pixel size grows to ~2 km × 4.8 km near swath edges due to scan angle expansion, causing geometric distortion and pixel overlapping.</li>
                <li><strong className="text-fg-muted">Detection Sensitivity:</strong> Typically requires ~100–1,000 m² of active flaming front to trigger detection under standard conditions.</li>
                <li><strong className="text-fg-muted">Confidence:</strong> 0% to 100% continuous probabilistic metric.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-signal-400/30 bg-ink-950 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-signal-400" />
                <h4 className="font-semibold text-fg text-sm">VIIRS (Visible Infrared Imaging Radiometer Suite)</h4>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-fg-faint">
                <li><strong className="text-fg-muted">Platforms:</strong> Suomi-NPP (~01:30 PM/AM), NOAA-20 (~01:20 PM/AM), NOAA-21.</li>
                <li><strong className="text-fg-muted">Spatial Resolution:</strong> 375 m imagery bands (I-Band I4/I5).</li>
                <li><strong className="text-fg-muted">Aggregation Scheme:</strong> Utilizes a 3-zone on-board detector aggregation (3:1 at nadir, 2:1, 1:1 at scan edge) that constrains pixel expansion to ~375 m × 800 m at the swath edge.</li>
                <li><strong className="text-fg-muted">Detection Sensitivity:</strong> Can detect flaming fires as small as ~1 m² to 5 m², revealing small agricultural fires completely invisible to MODIS.</li>
                <li><strong className="text-fg-muted">Confidence:</strong> Categorical quality score ('low', 'nominal', 'high').</li>
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-ink-950 p-3 text-fg-faint">
            <strong className="text-fg-muted">The Resolution Disparity Rule:</strong> Because VIIRS 375m has ~9x the pixel density of MODIS 1000m, a single agricultural field or forest fire front that registers as 1 MODIS hotspot pixel will typically trigger 3 to 8 distinct VIIRS hotspot pixels. Adding their counts together results in double-counting and scientific distortion.
          </div>
        </div>
      </Card>

      {/* 3. Fire Radiative Power (FRP) */}
      <Card aria-labelledby="section-frp">
        <CardHeader
          id="section-frp"
          title="3. Fire Radiative Power (FRP) Measurement"
          description="Radiative energy release rate in Megawatts (MW) and its scientific limits."
        />
        <div className="space-y-3 text-xs text-fg-muted leading-relaxed">
          <p>
            <strong>Fire Radiative Power (FRP)</strong> quantifies the instantaneous rate of radiant heat energy emitted by the fire in <strong className="text-fg">Megawatts (MW)</strong> at the precise moment of satellite overpass.
          </p>
          <p>
            FRP is derived through the Wooster et al. or Kaufman et al. MIR radiance method:
          </p>
          <div className="rounded-lg border border-line bg-ink-950 p-3 font-mono text-center text-xs text-ember-400">
            FRP = (A_pixel × σ_MIR / a) × (L_4_fire - L_4_background)
          </div>
          <p>
            where <code>A_pixel</code> is pixel area, <code>L_4</code> is 4 µm spectral radiance, and <code>a</code> is an empirical sensor calibration constant.
          </p>
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-fg-muted">
            <strong className="text-danger block mb-1">Crucial Scientific Constraint: FRP != Burned Area</strong>
            <p className="text-[11px] leading-relaxed">
              FRP is an instantaneous power measurement (rate of energy release). It does NOT measure total burned area (hectares) or total fuel consumed. A small, high-intensity flaming fire can produce higher FRP than a widespread, low-temperature smoldering peat or mulch burn. Furthermore, FRP can only be calculated when the 4 µm detector does not saturate and cloud obstruction is minimal; observations with missing FRP are safely recorded as &quot;Not available&quot;.
            </p>
          </div>
        </div>
      </Card>

      {/* 4. Spatiotemporal Harmonization Methodology */}
      <Card aria-labelledby="section-harmonization">
        <CardHeader
          id="section-harmonization"
          title="4. Spatiotemporal Aggregation & Harmonization Method"
          description="How PyroLens reconciles sensor differences without misleading arithmetic."
        />
        <div className="space-y-3 text-xs text-fg-muted leading-relaxed">
          <p>
            To compare observations across sensors with radically different pixel footprints, PyroLens implements a documented <strong className="text-fg">Harmonized Grid Activity Index</strong>:
          </p>
          <div className="rounded-lg border border-line bg-ink-950 p-3 font-mono text-center text-xs text-signal-300">
            H_t = | &#x22C3;_s &#123; Cell(lat_i, lon_i, &Delta;) : (lat_i, lon_i) &isin; Detections_s(t) &#125; |
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 text-[11px] text-fg-faint">
            <li>
              <strong className="text-fg-muted">Spatial Quantization (&Delta;):</strong> Observation coordinates are mapped into uniform spatial cells (&Delta; = 0.10°, 0.25°, or 0.50° latitude and longitude).
            </li>
            <li>
              <strong className="text-fg-muted">Temporal Binning (t):</strong> Observations within each spatial cell are grouped into uniform daily or monthly comparison intervals.
            </li>
            <li>
              <strong className="text-fg-muted">Occupancy Invariance:</strong> Rather than summing raw pixels (where VIIRS produces ~9x more detections for the same fire footprint), the index measures whether a given spatial cell experienced active burning.
            </li>
            <li>
              <strong className="text-fg-muted">Coincident Fire Presence:</strong> Cells containing both MODIS and VIIRS detections within the same space-time window are classified as <code>BOTH_COINCIDENT</code>. Cells with detections from only one sensor are tagged as <code>MODIS_ONLY</code> or <code>VIIRS_ONLY</code>.
            </li>
            <li>
              <strong className="text-fg-muted">Jaccard Spatial Similarity Index:</strong> Spatial agreement between sensors is computed as:
              <br />
              <code className="text-signal-300 font-mono">J = N_coincident / (N_modis_only + N_viirs_only + N_coincident)</code>
            </li>
          </ol>
        </div>
      </Card>

      {/* 5. Custom AOI & Ray-Casting Geometry */}
      <Card aria-labelledby="section-aoi">
        <CardHeader
          id="section-aoi"
          title="5. Custom Area of Interest (AOI) & Point-in-Polygon Ray-Casting"
          description="Vector geometry filtering for user-drawn polygons and GeoJSON imports."
        />
        <div className="space-y-3 text-xs text-fg-muted leading-relaxed">
          <p>
            When users draw a custom polygon or import GeoJSON boundaries, PyroLens performs spatial containment testing using the classical <strong className="text-fg">Jordan Curve Theorem (Ray-Casting Algorithm)</strong>:
          </p>
          <div className="rounded-lg border border-line bg-ink-950 p-3 font-mono text-center text-xs text-ember-300">
            intersect = ((y_j &gt; y) &ne; (y_k &gt; y)) &amp;&amp; (x &lt; (x_k - x_j) * (y - y_j) / (y_k - y_j) + x_j)
          </div>
          <p>
            A horizontal ray is cast from each observation point <code>(x, y)</code> toward infinity. If the ray intersects an odd number of polygon boundary segments, the observation lies inside the custom AOI. An initial bounding box pre-filter minimizes compute overhead for large archive datasets.
          </p>
        </div>
      </Card>

      {/* 6. Robust Baseline & MAD Anomaly Detection */}
      <Card aria-labelledby="section-anomaly">
        <CardHeader
          id="section-anomaly"
          title="6. Robust Historical Baseline & MAD Anomaly Detection"
          description="Non-parametric anomaly detection resistant to extreme wildfire outliers."
        />
        <div className="space-y-3 text-xs text-fg-muted leading-relaxed">
          <p>
            Wildfire activity exhibits severe skewness with long right tails. Classical parametric statistics (mean and standard deviation) are easily distorted by extreme fire events. PyroLens implements a robust, non-parametric <strong className="text-fg">Median Absolute Deviation (MAD)</strong> anomaly detector:
          </p>
          <div className="grid sm:grid-cols-2 gap-3 font-mono text-center text-xs">
            <div className="rounded-lg border border-line bg-ink-950 p-2.5 text-ember-400">
              M = median(X)
            </div>
            <div className="rounded-lg border border-line bg-ink-950 p-2.5 text-signal-400">
              MAD = median(|X_i - M|)
            </div>
          </div>
          <p>
            An observation day with count <code>x</code> is flagged as an unusual activity surge if:
          </p>
          <div className="rounded-lg border border-line bg-ink-950 p-3 font-mono text-center text-xs text-emerald-400">
            x &gt; M + k &times; max(MAD, 1.0)
          </div>
          <p>
            where <code>k</code> is the configurable sensitivity multiplier (2.0x, 2.5x, or 3.0x). When the baseline median is zero (e.g. during wet monsoon months with zero detections), the formula gracefully falls back to an absolute threshold to prevent division by zero.
          </p>
        </div>
      </Card>

      {/* 7. Regional Bounding Envelopes */}
      <Card aria-labelledby="section-regions">
        <CardHeader
          id="section-regions"
          title="7. Regional Bounding Envelopes & Geographic Limitations"
          description="Simplified spatial envelopes used for regional filtering."
        />
        <div className="space-y-3 text-xs text-fg-muted leading-relaxed">
          <p>
            {REGIONAL_BOUNDS_DISCLAIMER}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line bg-ink-950 text-fg-muted">
                  <th className="py-2.5 px-3 font-semibold">Region ID</th>
                  <th className="py-2.5 px-3 font-semibold">Region Name</th>
                  <th className="py-2.5 px-3 font-semibold">Latitude Bounds</th>
                  <th className="py-2.5 px-3 font-semibold">Longitude Bounds</th>
                  <th className="py-2.5 px-3 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {REGIONS.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-700/40">
                    <td className="py-2 px-3 font-mono text-fg-muted">{r.id}</td>
                    <td className="py-2 px-3 font-semibold text-fg">{r.name}</td>
                    <td className="py-2 px-3 font-mono text-fg-muted">
                      {r.bounds.minLat}°N to {r.bounds.maxLat}°N
                    </td>
                    <td className="py-2 px-3 font-mono text-fg-muted">
                      {r.bounds.minLng}°E to {r.bounds.maxLng}°E
                    </td>
                    <td className="py-2 px-3 text-fg-faint">{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* 8. Literature & Scientific References */}
      <Card aria-labelledby="section-references">
        <CardHeader
          id="section-references"
          title="8. Scientific References & Remote-Sensing Literature"
          description="Peer-reviewed foundations governing satellite active-fire observation and sensor harmonization."
        />
        <div className="space-y-2.5 text-xs text-fg-muted leading-relaxed">
          <ul className="list-disc pl-5 space-y-2 text-[11px] text-fg-faint">
            <li>
              <strong className="text-fg">Giglio, L., Schroeder, W., &amp; Justice, C. O. (2016).</strong> The collection 6 MODIS active fire detection algorithm and fire products. <em>Remote Sensing of Environment</em>, 178, 31–41.
            </li>
            <li>
              <strong className="text-fg">Schroeder, W., Oliva, P., Giglio, L., &amp; Csiszar, I. A. (2014).</strong> The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment. <em>Remote Sensing of Environment</em>, 143, 85–96.
            </li>
            <li>
              <strong className="text-fg">Wooster, M. J., Zhukov, B., &amp; Oertel, D. (2003).</strong> Fire radiative energy for quantitative study of biomass burning: derivation from the BIRD experimental satellite and comparison to MODIS fire products. <em>Remote Sensing of Environment</em>, 86(1), 83–107.
            </li>
            <li>
              <strong className="text-fg">Kaufman, Y. J., Justice, C. O., Flynn, L. P., et al. (1998).</strong> Potential global fire monitoring from EOS-MODIS. <em>Journal of Geophysical Research: Atmospheres</em>, 103(D24), 32215–32238.
            </li>
            <li>
              <strong className="text-fg">NASA FIRMS (2024).</strong> Fire Information for Resource Management System User Documentation &amp; Active Fire Frequently Asked Questions. <em>NASA Earthdata / MODAPS</em>.
            </li>
          </ul>
        </div>
      </Card>
    </div>
  )
}
