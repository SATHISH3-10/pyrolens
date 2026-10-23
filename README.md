# PyroLens — A Harmonized NASA Fire Activity Intelligence Platform

A NASA Space Apps Challenge student project for exploring, visualizing, and harmonizing active-fire hotspot observations from NASA's MODIS and VIIRS satellite instruments across India.

> **DEMO DATA — NOT OFFICIAL NASA OBSERVATIONS**
> PyroLens is an educational demonstration project and is not affiliated with or endorsed by NASA. Hotspots represent satellite-detected thermal anomalies, not confirmed wildfires, fire perimeters, or burned area. Nothing in this platform should be used for operational or emergency safety decisions.

---

## 1. Project Overview

Satellite fire observation products such as NASA FIRMS provide critical global visibility into thermal anomalies. However, users frequently encounter significant cross-sensor discrepancies: **MODIS (1 km nadir resolution)** and **VIIRS (375 m nadir resolution)** have different spatial footprints, swath-edge geometry, detection thresholds, and overpass timing. 

**PyroLens** provides a transparent, scientifically sound intelligence platform that:
- **Disallows blind summation:** Prevents users from naively adding raw MODIS and VIIRS counts together.
- **Demonstrates Spatiotemporal Harmonization:** Groups observations into uniform spatial grid cells (0.10°, 0.25°, 0.50°) to identify coincident detections, compute Jaccard spatial similarity, and derive relative detection multipliers.
- **Explores Hotspots Geospatially:** Features an interactive Leaflet and OpenStreetMap exploration interface with custom sensor markers, FRP scaling, and detail inspection panels.
- **Tracks Temporal Cycles:** Provides a daily heatmap calendar with a zero-detection advisory notice, 12-month overview, and deep-links to locate days on the map.
- **Flags Statistical Anomalies:** Uses robust, non-parametric Median Absolute Deviation (MAD) anomaly detection to highlight unusual observation periods without implying predictive fire forecasts.
- **Exports Reproducible Reports:** Allows instant CSV export of filtered observations, daily aggregated summaries, and comprehensive Markdown intelligence reports.
- **Supports Official NASA FIRMS CSV Ingestion:** Features a client-side parser that validates column headers, data types, and coordinates, allowing users to toggle between the synthetic demonstration dataset and official NASA FIRMS CSV exports.

---

## 2. Technology Stack

- **Framework:** React 19, TypeScript (strict type checking with `noUncheckedIndexedAccess`)
- **Build Tool:** Vite 8
- **Styling:** Tailwind CSS 4 (`@tailwindcss/vite`, CSS-first configuration, dark mode palette with ember `--color-ember-*` and signal `--color-signal-*` accents)
- **Routing:** React Router 7
- **Mapping:** Leaflet & React Leaflet with OpenStreetMap tiles (standard attribution included)
- **Charts:** Recharts (Responsive Area, Bar, and Pie charts with dark tooltips)
- **Icons:** Lucide React
- **Testing:** Vitest 5 (14 unit tests covering filtering, aggregation, metrics, anomaly detection, and CSV parsing)

---

## 3. Installation & Setup

### Requirements
- Node.js 20.19+ or 22.12+
- npm 10+

### Setup Commands
```bash
# Navigate to project directory
cd e:\Nasa\PyroLens_Part1\pyrolens

# Install dependencies
npm install
```

---

## 4. Development, Build & Test Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Vite development server at `http://localhost:5173/` |
| `npm run build` | Type-check with `tsc --noEmit` and build production bundle in `dist/` |
| `npm run typecheck` | Run TypeScript strict compiler verification only |
| `npm test` | Run Vitest unit test suite (14 tests covering filtering, metrics, grid binning, MAD anomalies, and CSV parsing) |
| `npm run preview` | Serve the production `dist/` bundle locally |

---

## 5. Application Structure & Pages

```
src/
  app/              Navigation definitions (NAV_ITEMS) and dataset metadata status
  components/
    layout/         AppShell, Header, Sidebar, MobileNav, NavList, DemoBanner, Logo, DatasetStatusIndicator
    shared/         FilterBar (shared filter controls), CsvImportModal (NASA FIRMS drag-and-drop parser)
    ui/             Card, Badge, PageHeader, EmptyState, SectionHeading, LinkButton
  context/          FireDataContext.tsx (central data state, filtering, CSV import, selected hotspot)
  data/             regions.ts (simplified bounding envelopes), syntheticData.ts (deterministic PRNG), firmsCsvImporter.ts
  pages/            OverviewPage, FireExplorerPage, HarmonizationPage, HistoricalCalendarPage, InsightsReportsPage, MethodologyPage, NotFoundPage
  styles/           index.css (Tailwind v4 theme tokens, Leaflet dark mode tile filter, slim scrollbars)
  test/             fireData.test.ts (Vitest unit test suite)
  types/            fire.ts (strict TypeScript data models)
  utils/            aggregation.ts, anomalyDetection.ts, exportUtils.ts
```

### Page Descriptions

1. **Overview (`/`):** Summary KPI cards (Total Hotspots, MODIS count, VIIRS count, Active Dates, Average FRP), Recharts time-series activity, monthly distribution, regional breakdown, diurnal day vs. night pass distribution, filterable observations table, and quick entry links.
2. **Fire Explorer (`/explorer`):** Geospatial Leaflet map centered on India with OpenStreetMap tiles. MODIS (ember orange) and VIIRS (signal cyan) markers scaled by Fire Radiative Power (FRP), click-to-popup, side detail panel, and "Fit Hotspots" / "Reset View" controls.
3. **Sensor Harmonization (`/harmonization`):** Spatiotemporal grid binning demo (0.10°, 0.25°, 0.50° cells), coincident detection classification (`BOTH_COINCIDENT`, `VIIRS_ONLY`, `MODIS_ONLY`), Jaccard similarity index, detection multiplier, instrument comparison specs, and scientific limitations.
4. **Historical Calendar (`/calendar`):** Daily heatmap calendar with color scale legend, month navigation, March 2024 peak dry season jump button, day inspection details with deep-link to view the day on map, 12-month overview, and the zero-detection disclaimer.
5. **Insights & Reports (`/insights`):** Robust statistical anomaly detection using Median and MAD with configurable sensitivity (2.0x, 2.5x, 3.0x), baseline transparency parameters, time series reference line, and CSV/Markdown export center.
6. **Methodology (`/methodology`):** Detailed documentation of satellite thermal anomaly detection, MODIS vs VIIRS sensor physics, FRP definition (MW != burned area), confidence metrics, regional bounding envelope documentation, and dataset provenance.

---

## 6. Data Model

All records conform to strict TypeScript interfaces defined in `src/types/fire.ts`:

```typescript
export interface FireObservation {
  id: string                   // Unique identifier (e.g. MODIS-10024 or VIIRS-10025)
  latitude: number            // WGS84 Latitude (-90 to 90)
  longitude: number           // WGS84 Longitude (-180 to 180)
  brightness?: number         // 4 µm channel brightness temperature in Kelvin
  brightT31?: number          // 11/12 µm channel brightness temperature in Kelvin
  scan?: number               // Pixel scan footprint in km
  track?: number              // Pixel track footprint in km
  acqDate: string             // Acquisition date (YYYY-MM-DD)
  acqTime: string             // Acquisition time (HHMM UTC)
  satellite: SatelliteName    // Terra, Aqua, Suomi-NPP, NOAA-20, NOAA-21
  instrument: SensorType      // 'MODIS' | 'VIIRS'
  confidence: FireConfidence  // 0-100% (MODIS) or 'low' | 'nominal' | 'high' (VIIRS)
  version?: string            // Product algorithm version (e.g. 6.1NRT, 2.0NRT)
  frp: number | null          // Fire Radiative Power in Megawatts (MW) or null
  daynight: 'D' | 'N'         // Daytime (solar noon) vs Nighttime pass
  regionId: string            // Assigned regional bounding box ID
  regionName: string          // Regional display name (e.g. Tamil Nadu)
  provenance: DataProvenance  // 'synthetic-demo' | 'imported-firms-csv'
}
```

---

## 7. Scientific Rules & Synthetic Data Limitations

1. **Thermal Anomaly != Wildfire:** A hotspot represents elevated surface radiance in the 3.9 µm spectrum. This includes agricultural residue clearing, controlled forestry burns, industrial flares, and prescribed fires.
2. **Hotspots != Burned Area:** Hotspot counts and FRP do not measure square kilometers burned. A small, intense fire front may emit high radiant heat while consuming minimal ground area.
3. **Sensor Disparity:** VIIRS 375m has ~9x the spatial resolution of MODIS 1000m. A single fire front that registers as 1 MODIS pixel will typically produce 3 to 8 distinct VIIRS pixels. Raw counts must not be summed.
4. **Cloud & Smoke Occlusion:** Thick convective smoke, monsoon cloud cover, and heavy rain attenuate mid-infrared signals. A day with zero detected hotspots must not be interpreted as a day with no fires.
5. **No Official NASA Affiliation:** The synthetic demo dataset was generated using a deterministic pseudo-random generator (Mulberry32) calibrated to real Indian fire seasonality (peaking in March–April) for educational testing.

---

## 8. Harmonization Methodology

PyroLens utilizes **Spatiotemporal Grid Binning**:
1. Coordinates are binned into uniform spatial cells ($\Delta \phi = 0.10^\circ, 0.25^\circ, \text{ or } 0.50^\circ$).
2. Observations are grouped into temporal bins (Daily, Weekly, Monthly).
3. Coincident presence is identified when both sensors detect thermal activity in the same space-time cell:
   $$\text{Jaccard Index } J = \frac{N_{\text{coincident}}}{N_{\text{modis\_only}} + N_{\text{viirs\_only}} + N_{\text{coincident}}}$$
4. Relative detection multiplier is derived as $\text{Ratio} = N_{\text{viirs}} / N_{\text{modis}}$.

---

## 9. NASA FIRMS CSV Import Guide

Users can load official NASA FIRMS CSV files at runtime via the **Import CSV** modal:
- **MODIS CSV Columns:** `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight`
- **VIIRS CSV Columns:** `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight`
- The parser tolerates missing optional fields, validates coordinate bounds, normalizes UTC times, rejects malformed records, and updates the UI dataset status.

---

## 10. Future NASA FIRMS API Integration

For direct automated synchronization with NASA FIRMS:
- NASA FIRMS requires a personal `MAP_KEY`.
- **Security Rule:** Never place or commit API keys into frontend client code.
- Future architecture will implement a backend proxy service (e.g. FastAPI / Node.js) with server-side environment variables (`FIRMS_MAP_KEY`), request throttling, and local caching.

---

## 11. Deployment Instructions

PyroLens is pre-configured with routing rewrites and API proxies for **Vercel**, **Netlify**, and **Render**.

### A. Deploying to Vercel (Recommended)
1. Push your repository to GitHub, GitLab, or Bitbucket.
2. In Vercel, click **"Add New Project"** and import the repository (or select root directory `PyroLens_Part1/pyrolens`).
3. Framework Preset will auto-detect **Vite**.
4. In **Environment Variables**, add:
   - `VITE_NASA_FIRMS_MAP_KEY` = `your_32_char_nasa_key`
5. Click **Deploy**.
6. The included [`vercel.json`](file:///e:/Nasa/PyroLens_Part1/pyrolens/vercel.json) handles client-side React Router rewrites (`/* -> /index.html`) and proxies NASA FIRMS API requests (`/api/firms/* -> https://firms.modaps.eosdis.nasa.gov/api/*`) seamlessly without CORS issues.

### B. Deploying to Netlify
1. Connect your repository on Netlify.
2. Build Settings:
   - **Base directory:** `PyroLens_Part1/pyrolens` (if monorepo) or root
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
3. In **Site Configuration > Environment Variables**, add:
   - `VITE_NASA_FIRMS_MAP_KEY` = `your_32_char_nasa_key`
4. The included [`netlify.toml`](file:///e:/Nasa/PyroLens_Part1/pyrolens/netlify.toml) and [`public/_redirects`](file:///e:/Nasa/PyroLens_Part1/pyrolens/public/_redirects) configure the proxy and SPA routing automatically.

### C. Deploying to Render
1. In Render, select **"New Static Site"** and connect your repository.
2. Configuration:
   - **Root Directory:** `PyroLens_Part1/pyrolens`
   - **Build Command:** `npm run build`
   - **Publish Directory:** `dist`
3. Under **Redirects/Rewrites**:
   - Add a rewrite rule: Source `/*` -> Destination `/index.html` (Rewrite).
4. Under **Environment Variables**:
   - Add `VITE_NASA_FIRMS_MAP_KEY` = `your_32_char_nasa_key`.
5. Click **Save & Deploy**.

