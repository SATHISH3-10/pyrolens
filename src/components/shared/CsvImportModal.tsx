import { useState, type ChangeEvent, type DragEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileText,
  Key,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { parseFirmsCsv } from '@/data/firmsCsvImporter'

const SAMPLE_FIRMS_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
11.4521,76.7821,332.4,1.1,1.0,2024-03-15,0530,Terra,MODIS,85,6.1NRT,308.2,34.8,D
11.4682,76.7915,340.1,0.4,0.38,2024-03-15,0610,Suomi-NPP,VIIRS,nominal,2.0NRT,312.4,12.5,D
11.4705,76.7942,336.8,0.39,0.37,2024-03-15,0610,Suomi-NPP,VIIRS,high,2.0NRT,310.1,9.8,D
12.3512,78.8415,328.6,1.2,1.1,2024-03-16,0815,Aqua,MODIS,72,6.1NRT,305.5,22.1,D
15.7421,78.9614,345.2,1.0,1.0,2024-03-18,0520,Terra,MODIS,92,6.1NRT,314.2,58.4,D
15.7512,78.9723,352.1,0.38,0.36,2024-03-18,0605,NOAA-20,VIIRS,high,2.0NRT,318.6,24.1,D
15.7584,78.9812,348.5,0.38,0.36,2024-03-18,0605,NOAA-20,VIIRS,high,2.0NRT,316.2,18.9,D
16.6421,78.8512,331.0,1.1,1.0,2024-03-21,0830,Aqua,MODIS,68,6.1NRT,309.0,19.5,D
16.6542,78.8621,339.4,0.4,0.38,2024-03-21,0840,Suomi-NPP,VIIRS,nominal,2.0NRT,311.5,11.2,D`

export function CsvImportModal() {
  const {
    isCsvModalOpen,
    setIsCsvModalOpen,
    importCsvContent,
    loadSyntheticData,
    metadata,
  } = useFireData()

  // Tab: 'file' (upload CSV from DL_FIRE_...) vs 'api' (fetch live with MAP_KEY)
  const [modalTab, setModalTab] = useState<'file' | 'api'>('file')

  // File upload state
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('uploaded_firms.csv')
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // NASA FIRMS Live API state
  const envKey = (import.meta.env.VITE_NASA_FIRMS_MAP_KEY as string | undefined) ?? ''
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  const [apiKey, setApiKey] = useState(envKey)
  const [apiSource, setApiSource] = useState<'VIIRS_SNPP_NRT' | 'MODIS_NRT' | 'VIIRS_NOAA20_NRT'>('VIIRS_SNPP_NRT')
  const [apiDays, setApiDays] = useState<number>(3)
  const [isLoadingApi, setIsLoadingApi] = useState(false)

  if (!isCsvModalOpen) return null

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setCsvText(text)
      validatePreview(text, file.name)
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setCsvText(text)
      validatePreview(text, file.name)
    }
    reader.readAsText(file)
  }

  const validatePreview = (text: string, fName: string) => {
    const res = parseFirmsCsv(text, fName)
    if (!res.success) {
      setStatusMessage({ type: 'error', text: res.error || 'Invalid CSV format' })
    } else {
      setStatusMessage({
        type: 'success',
        text: `Valid FIRMS dataset: ${res.observations.length} observations found (${res.metadata.modisCount} MODIS, ${res.metadata.viirsCount} VIIRS).`,
      })
    }
  }

  const handleApply = () => {
    if (!csvText.trim()) {
      setStatusMessage({ type: 'error', text: 'Please select a file or paste CSV text first.' })
      return
    }

    const res = importCsvContent(csvText, fileName)
    if (res.success) {
      setIsCsvModalOpen(false)
    } else {
      setStatusMessage({ type: 'error', text: res.message })
    }
  }

  const handleLoadSample = () => {
    setCsvText(SAMPLE_FIRMS_CSV)
    setFileName('sample_firms_india_subset.csv')
    validatePreview(SAMPLE_FIRMS_CSV, 'sample_firms_india_subset.csv')
  }

  const handleResetToDemo = () => {
    loadSyntheticData()
    setIsCsvModalOpen(false)
  }

  // Fetch live NASA FIRMS API
  const handleFetchFromNasaApi = async () => {
    const cleanKey = apiKey.trim()
    if (!cleanKey) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter your NASA FIRMS MAP_KEY (32-character key from NASA).',
      })
      return
    }

    setIsLoadingApi(true)
    setStatusMessage(null)

    try {
      // Call through the proxy (or configurable backend) to avoid CORS
      // NASA FIRMS recommends area bounding box queries (west,south,east,north) for India (68,8,97,37)
      const daysCount = Math.min(5, Math.max(1, apiDays))
      const endpoint = `${apiBaseUrl}/api/firms/area/csv/${cleanKey}/${apiSource}/68,8,97,37/${daysCount}`
      const response = await fetch(endpoint)

      if (!response.ok) {
        throw new Error(
          `NASA FIRMS API returned HTTP ${response.status}: ${response.statusText}`,
        )
      }

      const text = await response.text()

      // Check if NASA returned an error string instead of CSV
      if (text.includes('Invalid MAP_KEY') || text.includes('Error:')) {
        throw new Error(text.trim())
      }

      const fetchFileName = `NASA_${apiSource}_IND_${apiDays}days.csv`
      setCsvText(text)
      setFileName(fetchFileName)

      const parsed = parseFirmsCsv(text, fetchFileName)
      if (!parsed.success || parsed.observations.length === 0) {
        throw new Error(parsed.error || 'No valid observation rows returned by NASA for India.')
      }

      const applyRes = importCsvContent(text, fetchFileName)
      if (applyRes.success) {
        setIsCsvModalOpen(false)
      } else {
        setStatusMessage({ type: 'error', text: applyRes.message })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatusMessage({
        type: 'error',
        text: `NASA API Error: ${msg}. Make sure your MAP_KEY is active or use the extracted CSV files from your DL_FIRE folders.`,
      })
    } finally {
      setIsLoadingApi(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-line-strong bg-ink-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-ink-950">
          <div className="flex items-center gap-2">
            <Upload className="size-5 text-ember-400" aria-hidden="true" />
            <div>
              <h2 id="csv-modal-title" className="text-base font-semibold text-fg">
                Load Official NASA FIRMS Data
              </h2>
              <p className="text-xs text-fg-muted">
                Import extracted CSV files or fetch live observations using your NASA MAP_KEY
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(false)}
            className="rounded-lg p-1.5 text-fg-muted hover:bg-ink-800 hover:text-fg"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab selection: Local CSV vs Live API */}
        <div className="flex border-b border-line bg-ink-950/60 px-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setModalTab('file')
              setStatusMessage(null)
            }}
            className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 transition-colors ${
              modalTab === 'file'
                ? 'border-ember-500 text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            <FileSpreadsheet className="size-3.5 text-ember-400" />
            <span>Extracted CSV Files (DL_FIRE_...)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setModalTab('api')
              setStatusMessage(null)
            }}
            className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 transition-colors ${
              modalTab === 'api'
                ? 'border-signal-400 text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            <Key className="size-3.5 text-signal-400" />
            <span>NASA FIRMS API Key (MAP_KEY)</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Active dataset info */}
          <div className="flex items-center justify-between rounded-lg border border-line bg-ink-800/80 p-3 text-xs">
            <div>
              <span className="text-fg-faint">Currently Loaded: </span>
              <span className="font-semibold text-fg">{metadata.title}</span>
              <span className="text-fg-muted"> ({metadata.recordCount.toLocaleString()} records)</span>
            </div>
            {!metadata.isSynthetic && (
              <button
                type="button"
                onClick={handleResetToDemo}
                className="inline-flex items-center gap-1 text-ember-400 hover:text-ember-300 font-medium"
              >
                <RotateCcw className="size-3" />
                Reset to Demo
              </button>
            )}
          </div>

          {/* TAB 1: File Upload (for DL_FIRE_M-C61 and DL_FIRE_SV-C2 folders) */}
          {modalTab === 'file' && (
            <div className="space-y-4">
              {/* Guidance for the user's extracted folders */}
              <div className="rounded-lg border border-signal-400/30 bg-signal-400/10 p-3 text-xs text-signal-300 space-y-1">
                <p className="font-semibold text-fg flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-signal-400" />
                  Your Extracted Folders are Ready to Load Directly:
                </p>
                <p className="text-[11px] leading-relaxed">
                  The files you extracted in <code>e:\Nasa\DL_FIRE_M-C61_...</code> and <code>e:\Nasa\DL_FIRE_SV-C2_...</code> already contain official NASA data. Click <strong>&quot;Browse File&quot;</strong> below and select:
                </p>
                <ul className="list-disc pl-4 text-[11px] space-y-0.5 text-fg-muted">
                  <li><code>e:\Nasa\DL_FIRE_M-C61_829743\fire_nrt_M-C61_829743.csv</code> (MODIS 1 km)</li>
                  <li><code>e:\Nasa\DL_FIRE_SV-C2_829744\fire_nrt_SV-C2_829744.csv</code> (VIIRS 375 m)</li>
                </ul>
              </div>

              {/* Drag & Drop Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  isDragging
                    ? 'border-ember-500 bg-ember-500/10'
                    : 'border-line-strong bg-ink-950/60 hover:border-line'
                }`}
              >
                <FileText className="size-8 text-fg-faint mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-fg">
                  Drag and drop a FIRMS CSV file here
                </p>
                <p className="text-xs text-fg-muted mt-1">
                  Supports standard MODIS (1km) and VIIRS (375m) CSV formats
                </p>
                <label className="mt-3 cursor-pointer rounded-lg border border-line-strong bg-ink-800 px-4 py-1.5 text-xs font-semibold text-fg hover:bg-ink-700">
                  Browse File
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Or Paste Raw CSV Text */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="csv-raw-input" className="text-xs font-medium text-fg-muted">
                    Or Paste CSV Content
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="text-xs text-signal-400 hover:text-signal-300"
                  >
                    Load Sample Test CSV
                  </button>
                </div>
                <textarea
                  id="csv-raw-input"
                  rows={3}
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value)
                    if (e.target.value.trim()) {
                      validatePreview(e.target.value, fileName)
                    }
                  }}
                  placeholder="latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight..."
                  className="w-full font-mono text-xs rounded-lg border border-line-strong bg-ink-950 p-3 text-fg placeholder:text-fg-faint focus:border-signal-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* TAB 2: NASA FIRMS Live API Key (MAP_KEY) */}
          {modalTab === 'api' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-line bg-ink-950 p-3.5 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-fg font-semibold">
                  <Key className="size-4 text-signal-400" />
                  <span>Where to Place Your NASA FIRMS MAP_KEY:</span>
                </div>
                <p className="text-fg-muted leading-relaxed text-[11px]">
                  You have two ways to use your NASA FIRMS MAP_KEY:
                </p>
                <ol className="list-decimal pl-4 space-y-1 text-[11px] text-fg-faint">
                  <li>
                    <strong className="text-fg">In your environment file:</strong> Open or create{' '}
                    <code className="text-ember-400">e:\Nasa\PyroLens_Part1\pyrolens\.env</code> and add:
                    <br />
                    <code className="font-mono text-fg bg-ink-900 px-1 py-0.5 rounded">
                      VITE_NASA_FIRMS_MAP_KEY=your_32_char_key_here
                    </code>
                  </li>
                  <li>
                    <strong className="text-fg">Directly below in this dialog:</strong> Paste your key below to fetch live observations for India right now.
                  </li>
                </ol>
              </div>

              {/* API Form */}
              <div className="space-y-3 rounded-xl border border-line-strong bg-ink-950/70 p-4 text-xs">
                <div>
                  <label htmlFor="map-key-input" className="block text-xs font-semibold text-fg mb-1">
                    NASA FIRMS MAP_KEY (32 characters)
                  </label>
                  <input
                    type="password"
                    id="map-key-input"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="e.g. 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
                    className="w-full font-mono text-xs rounded-lg border border-line-strong bg-ink-900 px-3 py-2 text-fg placeholder:text-fg-faint focus:border-signal-400 focus:outline-none"
                  />
                  <p className="text-[10px] text-fg-faint mt-1">
                    Don&apos;t have a key? Request a free key at{' '}
                    <a
                      href="https://firms.modaps.eosdis.nasa.gov/api/map_key/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-signal-400 hover:underline"
                    >
                      firms.modaps.eosdis.nasa.gov/api/map_key/
                    </a>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="api-source-select" className="block text-xs font-medium text-fg-muted mb-1">
                      Satellite Sensor / Product
                    </label>
                    <select
                      id="api-source-select"
                      value={apiSource}
                      onChange={(e) =>
                        setApiSource(
                          e.target.value as 'VIIRS_SNPP_NRT' | 'MODIS_NRT' | 'VIIRS_NOAA20_NRT',
                        )
                      }
                      className="w-full rounded-lg border border-line-strong bg-ink-900 px-3 py-1.5 text-xs text-fg focus:outline-none"
                    >
                      <option value="VIIRS_SNPP_NRT">VIIRS Suomi-NPP (375 m NRT)</option>
                      <option value="MODIS_NRT">MODIS Terra &amp; Aqua (1 km NRT)</option>
                      <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20 (375 m NRT)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="api-days-select" className="block text-xs font-medium text-fg-muted mb-1">
                      Time Span (India)
                    </label>
                    <select
                      id="api-days-select"
                      value={apiDays}
                      onChange={(e) => setApiDays(parseInt(e.target.value, 10))}
                      className="w-full rounded-lg border border-line-strong bg-ink-900 px-3 py-1.5 text-xs text-fg focus:outline-none"
                    >
                      <option value={1}>Last 24 Hours (1 Day)</option>
                      <option value={2}>Last 2 Days</option>
                      <option value={3}>Last 3 Days</option>
                      <option value={4}>Last 4 Days</option>
                      <option value={5}>Last 5 Days (Max)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFetchFromNasaApi}
                  disabled={isLoadingApi || !apiKey.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-signal-500 py-2 text-xs font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoadingApi ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Querying NASA FIRMS API for India...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      <span>Fetch Live Observations for India</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs ${
                statusMessage.type === 'success'
                  ? 'border-ok/40 bg-ok/10 text-ok'
                  : 'border-danger/40 bg-danger/10 text-danger'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
              )}
              <p className="leading-relaxed">{statusMessage.text}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line px-6 py-3.5 bg-ink-950">
          <button
            type="button"
            onClick={handleResetToDemo}
            className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
          >
            <Database className="size-3.5 text-ember-400" />
            Restore 1,500 Demo Observations
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCsvModalOpen(false)}
              className="rounded-lg border border-line bg-ink-800 px-3.5 py-1.5 text-xs font-semibold text-fg hover:bg-ink-700"
            >
              Close
            </button>
            {modalTab === 'file' && (
              <button
                type="button"
                onClick={handleApply}
                disabled={!csvText.trim()}
                className="rounded-lg bg-ember-500 px-4 py-1.5 text-xs font-semibold text-ink-950 hover:bg-ember-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Apply CSV
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
