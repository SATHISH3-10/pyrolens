import { useEffect, useRef, type ReactNode } from 'react'
import { Popup } from 'react-map-gl/maplibre'
import { CalendarDays, Crosshair } from 'lucide-react'
import type { FireObservation } from '@/types/fire'
import type { FireEvent } from '@/types/activity'
import { confidenceLevel, detectionAgeHours, localSolarTime, satelliteKey } from '@/utils/mapFilters'
import { fmtDate, fmtNum } from '@/lib'

function PopupShell({
  longitude,
  latitude,
  title,
  onClose,
  children,
}: {
  longitude: number
  latitude: number
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Popup longitude={longitude} latitude={latitude} onClose={onClose} closeOnClick={false} maxWidth="300px" className="pl-popup">
      <div ref={ref} tabIndex={-1} role="dialog" aria-label={title} className="outline-none">
        <div className="pr-5 text-[13px] font-semibold text-fg">{title}</div>
        {children}
      </div>
    </Popup>
  )
}

function Rows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-faint">{k}</dt>
          <dd className="text-right font-medium text-fg tabular">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const actionClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-ink-700 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-ink-600'

export function HotspotPopup({
  obs,
  windowEndMs,
  onClose,
  onOpenDay,
}: {
  obs: FireObservation
  windowEndMs: number
  onClose: () => void
  onOpenDay: (date: string) => void
}) {
  const age = detectionAgeHours(obs, windowEndMs)
  const conf = confidenceLevel(obs)
  const hhmm = `${obs.acqTime.slice(0, 2)}:${obs.acqTime.slice(2, 4)}`
  return (
    <PopupShell longitude={obs.longitude} latitude={obs.latitude} title={`${obs.instrument} hotspot`} onClose={onClose}>
      <Rows
        rows={[
          ['Location', `${obs.latitude.toFixed(4)}, ${obs.longitude.toFixed(4)}`],
          ['Acquired (UTC)', `${fmtDate(obs.acqDate)} ${hhmm}`],
          ['Local solar time', `≈ ${localSolarTime(obs).slice(11)}`],
          ['Age', `${age < 1 ? '< 1' : age.toFixed(age < 10 ? 1 : 0)} h before window end`],
          ['Satellite', `${satelliteKey(obs)} (${obs.satellite})`],
          ['Instrument', obs.instrument === 'MODIS' ? 'MODIS · 1 km' : 'VIIRS · 375 m'],
          ['Confidence', `${conf}${typeof obs.confidence === 'number' ? ` (${obs.confidence}%)` : ''}`],
          ['FRP', obs.frp !== null ? `${obs.frp} MW` : 'not reported'],
          ['Pass', obs.daynight === 'D' ? 'Day' : 'Night'],
          ...(obs.brightness !== undefined ? ([['Brightness', `${obs.brightness} K`]] as Array<[string, ReactNode]>) : []),
        ]}
      />
      <p className="mt-2 text-[11px] leading-snug text-fg-faint">A hotspot is a satellite-detected thermal anomaly, not necessarily a confirmed wildfire.</p>
      <button type="button" className={`${actionClass} mt-2.5 w-full`} onClick={() => onOpenDay(obs.acqDate)}>
        <CalendarDays className="size-3.5" aria-hidden="true" /> Open this day in the Burning Calendar
      </button>
    </PopupShell>
  )
}

export function ClusterPopup({
  event,
  onClose,
  onFocus,
  onOpenDay,
}: {
  event: FireEvent
  onClose: () => void
  onFocus: (e: FireEvent) => void
  onOpenDay: (date: string) => void
}) {
  const dominant =
    event.viirsCount === event.modisCount ? 'Both equally' : event.viirsCount > event.modisCount ? 'VIIRS' : 'MODIS'
  return (
    <PopupShell longitude={event.centroid[1]} latitude={event.centroid[0]} title="Fire cluster" onClose={onClose}>
      <Rows
        rows={[
          ['Detections', `${fmtNum(event.count)} (${event.modisCount} MODIS · ${event.viirsCount} VIIRS)`],
          ['Total FRP', `${fmtNum(event.totalFrp)} MW`],
          ['Max FRP', event.maxFrp !== null ? `${fmtNum(event.maxFrp)} MW` : 'not reported'],
          ['Dates', event.start === event.end ? fmtDate(event.start) : `${fmtDate(event.start)} – ${fmtDate(event.end)}`],
          ['Dominant sensor', dominant],
          ['Hull area', `${event.areaKm2.toFixed(1)} km²`],
        ]}
      />
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <button type="button" className={actionClass} onClick={() => onFocus(event)}>
          <Crosshair className="size-3.5" aria-hidden="true" /> Focus
        </button>
        <button type="button" className={actionClass} onClick={() => onOpenDay(event.start)}>
          <CalendarDays className="size-3.5" aria-hidden="true" /> Open in calendar
        </button>
      </div>
    </PopupShell>
  )
}
