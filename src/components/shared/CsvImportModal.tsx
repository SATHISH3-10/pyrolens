import { useEffect, useRef, useState, type DragEvent } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Globe2, Key, Loader2, Satellite, Upload, X } from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { parseFirmsCsv, MAX_SAFE_BROWSER_RECORDS } from '@/data/firmsCsvImporter'
import { STUDY_AREAS, toFirmsBbox } from '@/data/studyAreas'
import { Button, Segmented } from '@/components/ui'
import { cn } from '@/lib'

const SAMPLE_FIRMS_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
11.4521,76.7821,332.4,1.1,1.0,2024-03-15,0530,Terra,MODIS,85,6.1NRT,308.2,34.8,D
11.4682,76.7915,340.1,0.4,0.38,2024-03-15,0610,Suomi-NPP,VIIRS,nominal,2.0NRT,312.4,12.5,D
11.4705,76.7942,336.8,0.39,0.37,2024-03-15,0610,Suomi-NPP,VIIRS,high,2.0NRT,310.1,9.8,D
12.3512,78.8415,328.6,1.2,1.1,2024-03-16,0815,Aqua,MODIS,72,6.1NRT,305.5,22.1,D
11.7421,78.9614,345.2,1.0,1.0,2024-03-18,0520,Terra,MODIS,92,6.1NRT,314.2,58.4,D
11.7512,78.9723,352.1,0.38,0.36,2024-03-18,0605,NOAA-20,VIIRS,high,2.0NRT,318.6,24.1,D
11.7584,78.9812,348.5,0.38,0.36,2024-03-18,0605,NOAA-20,VIIRS,high,2.0NRT,316.2,18.9,D`

type Tab = 'demo' | 'file' | 'api'
type Status = { type: 'success' | 'error'; text: string } | null

const API_SOURCES = [
  { id: 'both', label: 'MODIS + VIIRS (S-NPP & NOAA-20)', sources: ['MODIS_NRT', 'VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT'] },
  { id: 'viirs', label: 'VIIRS S-NPP only', sources: ['VIIRS_SNPP_NRT'] },
  { id: 'modis', label: 'MODIS only', sources: ['MODIS_NRT'] },
] as const

export function CsvImportModal() {
  const {
    isCsvModalOpen,
    setIsCsvModalOpen,
    importCsvContent,
    setStudyAreaId,
    area,
    customAoi,
    metadata,
  } = useFireData()

  const [tab, setTab] = useState<Tab>('demo')
  const [files, setFiles] = useState<Array<{ name: string; text: string; rows: number; modis: number; viirs: number }>>([])
  const [status, setStatus] = useState<Status>(null)
  const [dragging, setDragging] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiChoice, setApiChoice] = useState<(typeof API_SOURCES)[number]['id']>('both')
  const [apiDays, setApiDays] = useState(5)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

  useEffect(() => {
    if (!isCsvModalOpen) return
    setStatus(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsCsvModalOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isCsvModalOpen, setIsCsvModalOpen])

  if (!isCsvModalOpen) return null

  const bbox = toFirmsBbox(customAoi ? customAoi.bounds : area.bounds)
  const close = () => setIsCsvModalOpen(false)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    Array.from(list).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result)
        const res = parseFirmsCsv(text, file.name)
        if (!res.success) {
          setStatus({ type: 'error', text: `${file.name}: ${res.error ?? 'not a FIRMS CSV'}` })
          return
        }
        setFiles((prev) => [
          ...prev.filter((f) => f.name !== file.name),
          { name: file.name, text, rows: res.observations.length, modis: res.metadata.modisCount, viirs: res.metadata.viirsCount },
        ])
        setStatus(null)
      }
      reader.readAsText(file)
    })
  }

  const applyFiles = () => {
    if (files.length === 0) return
    const name = files.length === 1 ? files[0]!.name : `${files.length} FIRMS files`
    const res = importCsvContent(
      files.map((f) => f.text),
      name,
    )
    if (res.success) {
      setFiles([])
      close()
    } else setStatus({ type: 'error', text: res.message })
  }

  const fetchApi = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const choice = API_SOURCES.find((s) => s.id === apiChoice)!
      const headers: Record<string, string> = {}
      if (apiKey.trim()) headers['x-firms-map-key'] = apiKey.trim()
      const texts = await Promise.all(
        choice.sources.map(async (source) => {
          const resp = await fetch(`${apiBaseUrl}/api/firms/live?source=${source}&days=${apiDays}&area=${bbox}`, { headers })
          if (!resp.ok) {
            let msg = `HTTP ${resp.status}`
            try {
              const j = await resp.json()
              if (j.error) msg = j.error
            } catch {
              /* non-JSON error body */
            }
            throw new Error(`${source}: ${msg}`)
          }
          return resp.text()
        }),
      )
      const usable = texts.filter((t) => t.trim().split('\n').length > 1)
      if (usable.length === 0) throw new Error('FIRMS returned no detections for this area and period.')
      const res = importCsvContent(usable, `FIRMS ${area.name} last ${apiDays} days.csv`, 'firms-live-api')
      if (!res.success) throw new Error(res.message)
      close()
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="data-modal-title" className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={close} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative flex max-h-[90vh] w-full max-w-xl animate-fade-in flex-col overflow-hidden rounded-2xl border border-line-strong bg-ink-850 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id="data-modal-title" className="text-base font-semibold text-fg">Data source</h2>
            <p className="mt-0.5 text-xs text-fg-muted">
              Currently: <span className="text-fg">{metadata.title}</span> · {metadata.recordCount.toLocaleString()} detections
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-fg-muted hover:bg-ink-700 hover:text-fg">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <Segmented
            className="w-full"
            aria-label="Data source type"
            value={tab}
            onChange={(t) => {
              setTab(t)
              setStatus(null)
            }}
            options={[
              { value: 'demo', label: 'Demo areas' },
              { value: 'file', label: 'Upload FIRMS CSV' },
              { value: 'api', label: 'FIRMS API' },
            ]}
            size="md"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'demo' && (
            <div className="grid gap-2 sm:grid-cols-2">
              {STUDY_AREAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setStudyAreaId(a.id)
                    close()
                  }}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors',
                    a.id === area.id ? 'border-ember-500/50 bg-ember-500/10' : 'border-line bg-ink-800 hover:border-line-strong',
                  )}
                >
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                    <Globe2 className="size-4 text-ember-400" /> {a.name}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-fg-muted">{a.shortDescription}</p>
                  <p className="mt-1.5 text-[11px] text-fg-faint">2003–2025 · peak {a.typicalSeasonLabel}</p>
                </button>
              ))}
              <p className="text-[11px] leading-relaxed text-fg-faint sm:col-span-2">
                Demo archives are synthetic and deterministic; they reproduce sensor behaviour (launch dates, resolution, cloud gaps) but are not NASA observations.
              </p>
            </div>
          )}

          {tab === 'file' && (
            <div className="space-y-4">
              <div
                onDragOver={(e: DragEvent) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e: DragEvent) => {
                  e.preventDefault()
                  setDragging(false)
                  addFiles(e.dataTransfer.files)
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
                  dragging ? 'border-ember-500 bg-ember-500/5' : 'border-line-strong hover:border-ink-500',
                )}
              >
                <Upload className="size-6 text-ember-400" />
                <p className="mt-2 text-sm font-medium text-fg">Drop FIRMS CSV files here, or click to browse</p>
                <p className="mt-1 text-xs text-fg-muted">Add MODIS and VIIRS archives together to harmonize them. Up to {MAX_SAFE_BROWSER_RECORDS.toLocaleString()} rows per file.</p>
                <input ref={inputRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </div>
              {files.length > 0 && (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {files.map((f) => (
                    <li key={f.name} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <FileSpreadsheet className="size-4 text-signal-400" />
                      <span className="min-w-0 flex-1 truncate text-fg">{f.name}</span>
                      <span className="text-fg-muted">
                        {f.modis.toLocaleString()} MODIS · {f.viirs.toLocaleString()} VIIRS
                      </span>
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x.name !== f.name))} className="text-fg-faint hover:text-fg">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setFiles([{ name: 'sample_firms_subset.csv', text: SAMPLE_FIRMS_CSV, rows: 7, modis: 3, viirs: 4 }])}
                  className="text-xs text-signal-400 hover:underline"
                >
                  Use a 7-row sample file
                </button>
                <Button variant="primary" onClick={applyFiles} disabled={files.length === 0}>
                  Load {files.length > 1 ? `${files.length} files` : 'file'}
                </Button>
              </div>
            </div>
          )}

          {tab === 'api' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-ink-800 p-3 text-xs">
                <div className="text-fg-faint">Area query (west,south,east,north)</div>
                <div className="mt-0.5 font-mono text-fg">{bbox}</div>
                <div className="mt-1 text-fg-faint">{customAoi ? `from AOI “${customAoi.name}”` : `from ${area.name}`}</div>
              </div>
              <label className="block text-xs text-fg-muted">
                Sensors
                <select value={apiChoice} onChange={(e) => setApiChoice(e.target.value as typeof apiChoice)} className="field mt-1 w-full">
                  {API_SOURCES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-fg-muted">
                Days of near-real-time data: <span className="text-fg">{apiDays}</span>
                <input type="range" min={1} max={5} value={apiDays} onChange={(e) => setApiDays(Number(e.target.value))} className="mt-1 w-full" />
              </label>
              <label className="block text-xs text-fg-muted">
                <span className="flex items-center gap-1.5">
                  <Key className="size-3.5" /> FIRMS MAP_KEY (optional if the server has one)
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="32-character key"
                  autoComplete="off"
                  className="field mt-1 w-full font-mono"
                />
              </label>
              <p className="text-[11px] leading-relaxed text-fg-faint">
                Requests go through the app's server proxy, so the key is never exposed in the page. Get a free key at firms.modaps.eosdis.nasa.gov/api/map_key.
                Near-real-time data covers recent days only; use archive CSVs for multi-year calendars.
              </p>
              <div className="flex justify-end">
                <Button variant="primary" onClick={fetchApi} disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Satellite className="size-4" />}
                  Fetch from FIRMS
                </Button>
              </div>
            </div>
          )}

          {status && (
            <div
              role="status"
              className={cn(
                'mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs',
                status.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
              )}
            >
              {status.type === 'error' ? <AlertCircle className="mt-px size-4 shrink-0" /> : <CheckCircle2 className="mt-px size-4 shrink-0" />}
              {status.text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
