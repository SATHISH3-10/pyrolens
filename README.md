# PyroLens — Harmonized Burning Activity Calendar

**NASA Space Apps Challenge · Harmonization of MODIS and VIIRS Hot Spots**

PyroLens combines historical MODIS and VIIRS active-fire hotspots into one consistent **Burning Activity Calendar** for any area of interest. Instead of plotting raw points, it turns fragmented detections from two sensor generations into a single comparable **Burning Activity Index (BAI)**. It then compares every day with that area's own history to flag anomalies, critical periods and unusual fire seasons, and gives an early-warning **Critical Period Outlook**.

> **Disclaimer.** Hotspots are satellite thermal anomalies, not confirmed wildfires or burned area. The preloaded study areas use a **synthetic demo archive** that mimics MODIS/VIIRS behaviour; load NASA FIRMS data for real analysis. Not for life-safety decisions.

---

## What you can do

| Page | Purpose |
| --- | --- |
| **Dashboard** | Critical Period Outlook, key numbers, typical fire season, compact calendar, seasonal pattern vs normal, annual harmonized activity, most severe critical periods and unusual seasons. |
| **Fire Map** | Full-screen MapLibre + deck.gl map: every filtered hotspot coloured by detection age (relative to the playback time) or FRP, confidence as solid/translucent/hollow; fire-cluster polygons; density heatmap (count, FRP or clusters); day / 24 h / 48 h / 7-day / all windows with 1/3/7-days-per-second playback; filters for satellite, confidence, FRP and day/night; rectangle or polygon AOIs with GeoJSON import/export; CARTO dark/light, Esri satellite, and NASA GIBS true-colour imagery for the selected date. |
| **Burning Calendar** | Years × days/weeks/months heatmap coloured by BAI class, with anomaly and critical-period highlight modes, hatched limited-observation days, configurable BAI weights, daily time series with normal band and 97th-percentile line, fire-season table and a day detail panel with a plain-language explanation and mini map. |
| **Harmonization** | Monthly VIIRS:MODIS factors r(m) with IQR, out-of-sample validation, raw vs harmonized record across the 2012 sensor change, factor table. |
| **Reports & Export** | Daily BAI CSV, fire clusters GeoJSON, filtered hotspots CSV/GeoJSON, calendar PNG, printable PDF report, Markdown summary, harmonization factors CSV. |
| **How it works** | Data sources, pipeline, formulas, class thresholds, outlook scoring, limitations, references. |

The study area (six presets: Tamil Nadu, Southern Amazon, Sumatra & Kalimantan, California, Mediterranean Europe, Australia), the custom AOI and the date range live in the header and apply to every page.

---

## Method

```
detections ─QC─▶ daily per-sensor aggregates ─÷ satellites─▶ per-overpass counts
   ─overlap years─▶ monthly factors r(m) ─scale MODIS-only days─▶ harmonized series
   ─log + robust normalize─▶ BAI (0–100) ─climatology─▶ classes, anomalies, critical periods, seasons, outlook
```

1. **Area & ingest.** Preset box, drawn rectangle/polygon or GeoJSON → FIRMS bbox `west,south,east,north`. FIRMS archive CSVs (multiple files merged) or the Area API via a server proxy.
2. **Quality control.** Removes low-confidence detections (VIIRS `low`, MODIS < 30%), duplicates across overlapping files, invalid coordinates/dates.
3. **Daily aggregation.** Hotspot count, total/mean/max FRP, distinct fire clusters, day/night split and satellites contributing, per sensor.
4. **Satellite normalization.** Counts are divided by the number of satellites operating for each sensor (Terra + Aqua; S-NPP, NOAA-20, NOAA-21), so new launches do not look like more fire.
5. **Harmonization.** For each calendar month, `r(m) = median over overlap years of ΣVIIRS / ΣMODIS`. VIIRS is the reference scale. Days with VIIRS use observed VIIRS; MODIS-only days use `MODIS × r(m)` with the IQR of r(m) as uncertainty. Separate factors are learned for FRP and cluster counts. They are validated leave-one-year-out against a single pooled factor.
6. **Burning Activity Index.** `BAI = 100 · (w₁·Ĥ + w₂·F̂ + w₃·Ĉ)` with `x̂ = min(1, log(1+x) / P99[log(1+x)])`; default weights 0.4 / 0.4 / 0.2 (configurable). Classes are percentiles among active days: Low < 40, Moderate 40–70, High 70–90, Very high 90–97, Extreme ≥ 97.
7. **Calendar engine.** A day-of-year climatology (±7-day window, all years) gives p10/p50/p90/p97. A day is anomalous if its BAI is above p90 (extreme above p97). A critical period is ≥ 3 consecutive High+ days. Fire seasons are defined per fire-year from 10% / peak 7-day / 90% of activity, with early, late, intense, prolonged and weak flags. A day is a **limited observation** when detections collapse versus the surrounding days or vanish in a normally active period. Zero detections are never treated as "no fire".
8. **Fire events.** Spatio-temporal clustering: detections whose ~5 km cells touch within 1 day form one event, with a convex hull, duration, FRP and sensors.
9. **Outlook.** A score from 7-day activity vs the date's percentiles, trend, persistence, extreme FRP and the coming climatological weeks maps to Low / Moderate / Elevated / Critical, with the reasons listed.

The core is `src/utils/burningActivity.ts`, a pure TypeScript module covered by unit tests.

---

## Architecture

```
src/
  data/studyAreas.ts        preset areas + fire-regime profiles, FIRMS bbox helper
  data/demoArchive.ts       deterministic 2003–2025 MODIS/VIIRS demo archive generator
  data/firmsCsvImporter.ts  FIRMS CSV parser (validation, de-duplication)
  utils/burningActivity.ts  QC → harmonization → BAI → climatology → seasons → outlook → clustering
  utils/exportActivity.ts   CSV / GeoJSON / PNG / Markdown / printable report exports
  context/FireDataContext   dataset, area, AOI, date range, BAI weights, selected date, analysis
  components/viz/           calendar heatmap (canvas), outlook, charts, legends, day detail
  components/map/           canvas hotspot/cluster/density layers, drawing tools, timeline
  pages/                    Dashboard, Fire Map, Burning Calendar, Harmonization, Reports, How it works
api/firms/live.ts           serverless FIRMS Area API proxy (keeps MAP_KEY server-side)
```

Stack: React 19, TypeScript (strict), Vite, Tailwind CSS 4 (light/dark theme tokens), MapLibre GL 6 + react-map-gl 8 + deck.gl 9, Recharts, Vitest. Everything runs in the browser; the only server piece is the FIRMS proxy (a Vite middleware in development, `api/firms/live.ts` on Vercel).

---

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 62 unit tests
npm run build      # type-check + production bundle
```

Optional: put `NASA_FIRMS_MAP_KEY=...` in `.env` to enable the FIRMS API tab without typing a key. A free key is available at <https://firms.modaps.eosdis.nasa.gov/api/map_key>.

### FIRMS proxy API

`GET /api/firms/live?source=<SOURCE>&area=<west,south,east,north>&days=<1-5>`

- `source`: `MODIS_NRT`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `MODIS_SP`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`
- Key: the server environment variable `NASA_FIRMS_MAP_KEY`, or an `x-firms-map-key` header
- Returns FIRMS CSV; errors are returned as JSON `{ "error": "..." }`

For multi-year calendars, download archive CSVs from FIRMS (MODIS C6.1 and VIIRS 375 m for the same area) and drop them all into **Data source → Upload FIRMS CSV**. They are merged, de-duplicated and harmonized together.

---

## Limitations

- Active-fire hotspots are thermal anomalies, not a complete record of every fire, nor burned area.
- Cloud cover, smoke and satellite overpass timing affect detections.
- MODIS and VIIRS have different detection capabilities; pre-VIIRS years rely on harmonization assumptions and carry wider uncertainty.
- Agricultural, prescribed and industrial burning appear as hotspots alongside wildfires.
- The outlook identifies unusual activity and critical periods; it does not predict individual wildfires.
- Preset study-area boxes are simplified envelopes, not official boundaries. Browser memory limits imports to about 50,000 rows per file.

## References

- Giglio, Schroeder & Justice (2016). The collection 6 MODIS active fire detection algorithm and fire products. *Remote Sensing of Environment* 178.
- Schroeder et al. (2014). The New VIIRS 375 m active fire detection data product. *Remote Sensing of Environment* 143.
- Wooster et al. (2003). Fire radiative energy for quantitative study of biomass burning. *Remote Sensing of Environment* 86.
- NASA FIRMS — <https://firms.modaps.eosdis.nasa.gov/>

MIT License. NASA FIRMS data are subject to the NASA ESDIS open data policy.
