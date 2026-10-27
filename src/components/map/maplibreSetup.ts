import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

/**
 * MapLibre 6 derives its worker URL at runtime from `import.meta.url`, which Vite can neither see nor emit:
 * in dev the pre-bundled copy points at a missing file, and the production build omits the worker. Importing
 * the (self-contained) worker with `?url` makes Vite emit it as an asset, and setWorkerUrl points MapLibre at it.
 * Must run before the first Map is created.
 */
setWorkerUrl(workerUrl)
