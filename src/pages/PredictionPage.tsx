import { useMemo, useRef, useState } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import type { FeatureCollection } from 'geojson'
import {
  CheckCircle2,
  Download,
  Info,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  Upload,
} from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { Card, CardHeader, PageHeader, Stat } from '@/components/ui'
import { MapCanvas } from '@/components/map/MapCanvas'
import { buildPredictionDeckLayers } from '@/components/map/deckLayers'
import { STUDY_AREAS } from '@/data/studyAreas'
import { parseFirmsCsv } from '@/data/firmsCsvImporter'
import { isObservationWindowClosed } from '@/utils/predictionEngine'
import type { PredictedCell } from '@/types/prediction'
import type { FireObservation } from '@/types/fire'
import { cn, fmtDate } from '@/lib'

const MANDATORY_DISCLAIMER =
  'PyroLens predictions indicate historical fire-activity likelihood based on NASA FIRMS hotspot patterns. They are not ground-confirmed wildfire forecasts and should not replace official emergency warnings.'

export default function PredictionPage() {
  const {
    observations,
    area,
    customAoi,
    predictions,
    activePrediction,
    setActivePredictionId,
    createPrediction,
    evaluatePredictionRecord,
    deletePrediction,
    exportPredictionsJson,
    importPredictionsJson,
  } = useFireData()

  const mapRef = useRef<MapRef | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Creation form state
  const defaultFutureDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }, [])

  const [targetDate, setTargetDate] = useState<string>(defaultFutureDate)
  const [selectedAoiId, setSelectedAoiId] = useState<string>(area.preset ? area.id : 'current')
  const [percentile, setPercentile] = useState<number>(75)
  const [resolution, setResolution] = useState<number>(0.25)
  const [windowDays, setWindowDays] = useState<number>(3)

  // Evaluation & observation state
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [liveFetching, setLiveFetching] = useState<boolean>(false)
  const [liveMessage, setLiveMessage] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<PredictedCell | null>(null)
  const [allowEarlyEval, setAllowEarlyEval] = useState<boolean>(false)

  // Resolve AOI bounds for prediction creation
  const resolvedAoi = useMemo(() => {
    if (selectedAoiId === 'custom' && customAoi) {
      return {
        name: `Custom AOI (${customAoi.name})`,
        bounds: customAoi.bounds,
      }
    }
    const foundPreset = STUDY_AREAS.find((s) => s.id === selectedAoiId)
    if (foundPreset) {
      return {
        name: foundPreset.name,
        bounds: foundPreset.bounds,
      }
    }
    return {
      name: area.name,
      bounds: area.bounds,
    }
  }, [selectedAoiId, customAoi, area])

  // Current active prediction
  const pred = activePrediction ?? (predictions.length > 0 ? predictions[0] : null)

  // Observed hotspots matching the prediction target date and AOI
  const observedHotspots = useMemo<FireObservation[]>(() => {
    if (!pred) return []
    return observations.filter((o) => {
      if (o.acqDate && o.acqDate !== pred.targetDate) return false
      const { minLat, maxLat, minLng, maxLng } = pred.aoiBounds
      return o.latitude >= minLat && o.latitude <= maxLat && o.longitude >= minLng && o.longitude <= maxLng
    })
  }, [pred, observations])

  // Is observation window closed for the selected prediction?
  const windowClosed = useMemo(() => {
    if (!pred) return false
    return isObservationWindowClosed(pred.targetDate)
  }, [pred])

  // deck.gl layers for map visualization
  const layers = useMemo(() => {
    if (!pred) return []
    return buildPredictionDeckLayers({
      prediction: pred,
      observedHotspots,
      selectedCellId: selectedCell?.cellId ?? null,
      onCellClick: (cell) => setSelectedCell(cell),
    })
  }, [pred, observedHotspots, selectedCell])

  // Outlines GeoJSON for the AOI
  const outlines = useMemo<FeatureCollection>(() => {
    if (!pred) return { type: 'FeatureCollection', features: [] }
    const { minLat, maxLat, minLng, maxLng } = pred.aoiBounds
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: pred.aoiName },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [minLng, minLat],
                [maxLng, minLat],
                [maxLng, maxLat],
                [minLng, maxLat],
                [minLng, minLat],
              ],
            ],
          },
        },
      ],
    }
  }, [pred])

  // Map fitting bounds
  const mapBounds = useMemo<[[number, number], [number, number]]>(() => {
    if (!pred) {
      return [
        [area.bounds.minLng, area.bounds.minLat],
        [area.bounds.maxLng, area.bounds.maxLat],
      ]
    }
    return [
      [pred.aoiBounds.minLng, pred.aoiBounds.minLat],
      [pred.aoiBounds.maxLng, pred.aoiBounds.maxLat],
    ]
  }, [pred, area])

  // Handle new prediction generation
  const handleCreatePrediction = () => {
    try {
      setEvalError(null)
      const newPred = createPrediction({
        targetDate,
        aoiName: resolvedAoi.name,
        aoiBounds: resolvedAoi.bounds,
        thresholdPercentile: percentile,
        gridResolution: resolution,
        windowDays,
      })
      setSelectedCell(null)
      setActivePredictionId(newPred.id)
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : String(err))
    }
  }

  // Handle evaluation
  const handleEvaluate = (customObs?: FireObservation[]) => {
    if (!pred) return
    setIsEvaluating(true)
    setEvalError(null)
    try {
      evaluatePredictionRecord(pred.id, customObs)
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsEvaluating(false)
    }
  }

  // Handle live FIRMS API fetch for target date
  const handleFetchLiveObservations = async () => {
    if (!pred) return
    setLiveFetching(true)
    setLiveMessage(null)
    setEvalError(null)
    try {
      const { minLng, minLat, maxLng, maxLat } = pred.aoiBounds
      const areaParam = `${minLng},${minLat},${maxLng},${maxLat}`
      const url = `/api/firms/live?source=VIIRS_SNPP_NRT&days=1&date=${pred.targetDate}&area=${areaParam}`
      const resp = await fetch(url)
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null)
        throw new Error(errJson?.error || `NASA FIRMS proxy returned status ${resp.status}`)
      }
      const csv = await resp.text()
      const parsed = parseFirmsCsv(csv, `firms_${pred.targetDate}.csv`)
      if (!parsed.success) {
        throw new Error('Could not parse NASA FIRMS response.')
      }
      setLiveMessage(`Retrieved ${parsed.observations.length} live FIRMS observations for ${pred.targetDate}.`)
      // Automatically evaluate with the retrieved live observations
      handleEvaluate(parsed.observations)
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : String(err))
    } finally {
      setLiveFetching(false)
    }
  }

  // Export JSON
  const handleExportJson = () => {
    const jsonStr = exportPredictionsJson()
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pyrolens_predictions_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Import JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const res = importPredictionsJson(String(reader.result))
      if (!res.success) {
        setEvalError(res.error || 'Failed to import predictions JSON.')
      } else {
        setEvalError(null)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <PageHeader
        title="Fire Likelihood Prediction & Verification"
        description="Generate explainable seasonal fire-activity likelihood predictions from historical NASA FIRMS patterns, and rigorously measure prediction-versus-observation accuracy when live satellite data arrives."
      />

      {/* ── Mandatory Disclaimer Banner ─────────────────────────────────── */}
      <div
        role="alert"
        className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
          <div>
            <span className="font-semibold text-amber-300">Mandatory NASA FIRMS Disclaimer: </span>
            {MANDATORY_DISCLAIMER}
          </div>
        </div>
      </div>

      {/* ── Top Layout: Creator Card + Prediction Manager ─────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Creator Form */}
        <Card className="p-5 lg:col-span-5">
          <CardHeader
            title="Create Fire Prediction"
            description="Seasonal baseline model over multi-year satellite observations."
          />

          <div className="mt-4 space-y-4 text-xs">
            {/* Area of Interest */}
            <div>
              <label className="mb-1 block font-medium text-fg">Area of Interest (AOI)</label>
              <select
                value={selectedAoiId}
                onChange={(e) => setSelectedAoiId(e.target.value)}
                className="w-full rounded-xl border border-line bg-ink-800 px-3 py-2 text-fg outline-none focus:border-ember-500"
              >
                {customAoi && <option value="custom">Drawn AOI: {customAoi.name}</option>}
                <option value="current">Current Area: {area.name}</option>
                {STUDY_AREAS.map((sa) => (
                  <option key={sa.id} value={sa.id}>
                    {sa.name} ({sa.country})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Date */}
            <div>
              <label className="mb-1 block font-medium text-fg">Prediction Target Date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-xl border border-line bg-ink-800 px-3 py-2 text-fg outline-none focus:border-ember-500"
              />
              <span className="mt-1 block text-[11px] text-fg-muted">
                Target date for which fire likelihood is estimated.
              </span>
            </div>

            {/* Threshold Percentile */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="font-medium text-fg">Likelihood Threshold Percentile</label>
                <span className="font-mono text-ember-400">{percentile}th %ile</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={percentile}
                onChange={(e) => setPercentile(parseInt(e.target.value, 10))}
                className="w-full accent-ember-500"
              />
              <span className="mt-1 block text-[11px] text-fg-muted">
                Cells with historical recurrence rate $\ge$ {percentile}th percentile are flagged active.
              </span>
            </div>

            {/* Grid Resolution & Window */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-medium text-fg">Grid Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(parseFloat(e.target.value))}
                  className="w-full rounded-xl border border-line bg-ink-800 px-2.5 py-2 text-fg outline-none focus:border-ember-500"
                >
                  <option value={0.1}>0.10° (~11 km)</option>
                  <option value={0.25}>0.25° (~28 km)</option>
                  <option value={0.5}>0.50° (~55 km)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block font-medium text-fg">DOY Window</label>
                <select
                  value={windowDays}
                  onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
                  className="w-full rounded-xl border border-line bg-ink-800 px-2.5 py-2 text-fg outline-none focus:border-ember-500"
                >
                  <option value={1}>$\pm$ 1 Day</option>
                  <option value={3}>$\pm$ 3 Days (Standard)</option>
                  <option value={5}>$\pm$ 5 Days</option>
                  <option value={7}>$\pm$ 7 Days</option>
                </select>
              </div>
            </div>

            {/* Generate Button */}
            <button
              type="button"
              onClick={handleCreatePrediction}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-ember-500 px-4 py-2.5 font-semibold text-on-accent transition-colors hover:bg-ember-600"
            >
              <Sparkles className="size-4" />
              Generate Prediction
            </button>
          </div>
        </Card>

        {/* Prediction Registry & Management */}
        <Card className="flex flex-col p-5 lg:col-span-7">
          <div className="flex items-center justify-between">
            <CardHeader
              title={`Saved Predictions (${predictions.length})`}
              description="Stored locally in pyrolens_predictions_v1."
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportJson}
                disabled={predictions.length === 0}
                title="Export predictions to JSON file"
                className="flex items-center gap-1.5 rounded-lg border border-line bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-ink-700 disabled:opacity-50"
              >
                <Download className="size-3.5" />
                Export
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Import predictions from JSON file"
                className="flex items-center gap-1.5 rounded-lg border border-line bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-ink-700"
              >
                <Upload className="size-3.5" />
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportJson}
                className="hidden"
              />
            </div>
          </div>

          {predictions.length === 0 ? (
            <div className="my-auto py-8 text-center text-xs text-fg-muted">
              <Target className="mx-auto mb-2 size-8 text-fg-faint" />
              No predictions generated yet. Select an AOI and target date to compute your first seasonal fire forecast.
            </div>
          ) : (
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
              {predictions.map((p) => {
                const isActive = p.id === pred?.id
                const activeCellsCount = p.predictedCells.filter((c) => c.predictedActive).length
                return (
                  <div
                    key={p.id}
                    onClick={() => setActivePredictionId(p.id)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors',
                      isActive
                        ? 'border-ember-500/60 bg-ink-800'
                        : 'border-line bg-ink-850 hover:border-line-strong hover:bg-ink-800',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-fg">{p.aoiName}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            p.status === 'EVALUATED'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : p.status === 'OBSERVED'
                                ? 'bg-sky-500/15 text-sky-400'
                                : 'bg-amber-500/15 text-amber-400',
                          )}
                        >
                          {p.status}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-fg-muted">
                        <span>Target: {fmtDate(p.targetDate)}</span>
                        <span>High-Risk Cells: {activeCellsCount}</span>
                        <span>Res: {p.gridResolution}°</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.evaluation && (
                        <div className="text-right text-[11px]">
                          <div className="font-semibold text-emerald-400">
                            F1: {(p.evaluation.f1Score * 100).toFixed(0)}%
                          </div>
                          <div className="text-fg-faint">
                            P: {(p.evaluation.precision * 100).toFixed(0)}% | R:{' '}
                            {(p.evaluation.recall * 100).toFixed(0)}%
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          deletePrediction(p.id)
                        }}
                        className="rounded-lg p-1.5 text-fg-faint hover:bg-red-500/10 hover:text-red-400"
                        title="Delete prediction"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Active Prediction Overview & Evaluation Panel ─────────────── */}
      {pred && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-fg">Active Prediction: {pred.aoiName}</h3>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-bold uppercase',
                      pred.status === 'EVALUATED'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400',
                    )}
                  >
                    {pred.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Target Date: <strong className="text-fg">{fmtDate(pred.targetDate)}</strong> · Created:{' '}
                  {new Date(pred.createdAt).toLocaleString()} · {pred.predictedCells.length} spatial cells evaluated.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleFetchLiveObservations}
                  disabled={liveFetching}
                  className="flex items-center gap-1.5 rounded-xl border border-line bg-ink-800 px-3 py-2 text-xs font-semibold text-fg transition-colors hover:bg-ink-700 disabled:opacity-50"
                >
                  <RefreshCw className={cn('size-3.5', liveFetching && 'animate-spin')} />
                  {liveFetching ? 'Fetching Live FIRMS…' : 'Fetch & Verify Live FIRMS'}
                </button>

                <button
                  type="button"
                  onClick={() => handleEvaluate()}
                  disabled={isEvaluating || (!windowClosed && !allowEarlyEval)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-on-accent transition-colors',
                    windowClosed || allowEarlyEval
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'cursor-not-allowed bg-ink-700 text-fg-faint',
                  )}
                  title={
                    windowClosed || allowEarlyEval
                      ? 'Evaluate prediction against observations'
                      : 'Observation window closes after UTC midnight of the target date.'
                  }
                >
                  <CheckCircle2 className="size-4" />
                  Evaluate Accuracy
                </button>
              </div>
            </div>

            {/* Observation Window Status Notice */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-ink-850 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-sky-400" />
                <span className="text-fg-muted">
                  Observation Window Status:{' '}
                  <strong className={windowClosed ? 'text-emerald-400' : 'text-amber-400'}>
                    {windowClosed
                      ? 'CLOSED (NASA satellite passes for this date are complete)'
                      : 'OPEN (Awaiting satellite overpasses)'}
                  </strong>
                </span>
              </div>

              {!windowClosed && (
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted hover:text-fg">
                  <input
                    type="checkbox"
                    checked={allowEarlyEval}
                    onChange={(e) => setAllowEarlyEval(e.target.checked)}
                    className="accent-ember-500"
                  />
                  <span>Enable early evaluation (for backtesting / demo)</span>
                </label>
              )}
            </div>

            {liveMessage && (
              <div className="mt-2 text-xs text-emerald-400">{liveMessage}</div>
            )}
            {evalError && (
              <div className="mt-2 text-xs text-red-400">Error: {evalError}</div>
            )}
          </Card>

          {/* ── Accuracy Evaluation Dashboard ─────────────────────────── */}
          {pred.evaluation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="F1 Score"
                  value={`${(pred.evaluation.f1Score * 100).toFixed(1)}%`}
                  hint="Harmonic mean of precision and recall"
                />
                <Stat
                  label="Precision"
                  value={`${(pred.evaluation.precision * 100).toFixed(1)}%`}
                  hint="True Positives / All Predicted Active Cells"
                />
                <Stat
                  label="Recall"
                  value={`${(pred.evaluation.recall * 100).toFixed(1)}%`}
                  hint="True Positives / All Observed Active Cells"
                />
                <Stat
                  label="Count Error"
                  value={`${pred.evaluation.absoluteCountError} (${pred.evaluation.percentageError.toFixed(0)}%)`}
                  hint="|Predicted - Observed| count"
                />
              </div>

              {/* Confusion Matrix Card */}
              <Card className="p-5">
                <CardHeader
                  title="Spatial Prediction-versus-Observation Verification"
                  description="Detailed breakdown of spatial cell predictions compared against satellite ground-truth."
                />

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Confusion Matrix Grid */}
                  <div className="overflow-hidden rounded-xl border border-line bg-ink-900 text-xs">
                    <div className="grid grid-cols-3 border-b border-line bg-ink-800 p-2.5 font-semibold text-fg">
                      <div>Prediction \ Observation</div>
                      <div className="text-center text-emerald-400">Observed Active</div>
                      <div className="text-center text-fg-muted">Observed Quiet</div>
                    </div>
                    <div className="grid grid-cols-3 border-b border-line p-3">
                      <div className="font-semibold text-amber-400">Predicted Active</div>
                      <div className="text-center">
                        <span className="font-bold text-emerald-400">{pred.evaluation.truePositives}</span>
                        <div className="text-[10px] text-fg-muted">True Positive (Hit)</div>
                      </div>
                      <div className="text-center">
                        <span className="font-bold text-amber-400">{pred.evaluation.falsePositives}</span>
                        <div className="text-[10px] text-fg-muted">False Positive (False Alarm)</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 p-3">
                      <div className="font-semibold text-fg-muted">Predicted Quiet</div>
                      <div className="text-center">
                        <span className="font-bold text-red-400">{pred.evaluation.falseNegatives}</span>
                        <div className="text-[10px] text-fg-muted">False Negative (Miss)</div>
                      </div>
                      <div className="text-center">
                        <span className="font-bold text-fg-muted">{pred.evaluation.trueNegatives}</span>
                        <div className="text-[10px] text-fg-muted">True Negative (Quiet)</div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Details */}
                  <div className="flex flex-col justify-between space-y-3 rounded-xl border border-line bg-ink-850 p-4 text-xs">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-fg-muted">Predicted High-Risk Cells:</span>
                        <strong className="text-amber-400">{pred.evaluation.predictedHotspotsCount}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-fg-muted">Observed Active Hotspots:</span>
                        <strong className="text-emerald-400">{pred.evaluation.observedHotspotsCount}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-fg-muted">Evaluated At:</span>
                        <span className="text-fg">{new Date(pred.evaluation.evaluatedAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-ink-800 p-3 text-[11px] leading-relaxed text-fg-muted">
                      <strong className="text-fg">Immutability Guaranteed: </strong>
                      The baseline prediction created on {new Date(pred.createdAt).toLocaleDateString()} was locked
                      before the observation window. Live satellite detections have been compared without altering the
                      original prediction.
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── Map Canvas Visualization ──────────────────────────────── */}
          <Card className="overflow-hidden p-0">
            <div className="border-b border-line bg-ink-850 p-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h4 className="text-sm font-semibold text-fg">Prediction Spatial Grid Overlay</h4>
                  <p className="text-xs text-fg-muted">
                    Displaying 0.25° predicted cells, correctly predicted hits (emerald outlines), and observed satellite
                    hotspots.
                  </p>
                </div>

                {/* Map Legend */}
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded border border-amber-500 bg-amber-500/50" />
                    <span className="text-fg-muted">Predicted High-Risk</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded border-2 border-emerald-500 bg-emerald-500/20" />
                    <span className="text-emerald-400 font-semibold">Hit (Correct)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-orange-500" />
                    <span className="text-fg-muted">Observed Fire</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="relative h-[480px] w-full">
              <MapCanvas
                mapRef={mapRef}
                bounds={mapBounds}
                boundsKey={pred.id}
                basemap="dark"
                gibs={null}
                satLabels={false}
                layers={layers}
                outlines={outlines}
                drawTool="none"
                onDrawComplete={() => {}}
                onDrawCancel={() => {}}
              />

              {/* Cell inspection panel */}
              {selectedCell && (
                <div className="panel-float absolute right-4 top-4 z-10 max-w-xs p-3 text-xs">
                  <div className="flex items-center justify-between border-b border-line pb-1.5">
                    <span className="font-semibold text-fg">Cell: {selectedCell.cellId}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCell(null)}
                      className="text-fg-muted hover:text-fg"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 space-y-1.5 text-fg-muted">
                    <div>
                      Historical Recurrence Rate:{' '}
                      <strong className="text-fg">
                        {(selectedCell.historicalRecurrenceRate * 100).toFixed(1)}%
                      </strong>
                    </div>
                    <div>
                      Historical Median FRP:{' '}
                      <strong className="text-fg">{selectedCell.medianFRP} MW</strong>
                    </div>
                    <div>
                      Status:{' '}
                      <strong
                        className={selectedCell.predictedActive ? 'text-amber-400' : 'text-fg-faint'}
                      >
                        {selectedCell.predictedActive ? 'Predicted High-Risk' : 'Baseline / Inactive'}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
