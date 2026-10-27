import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { IMPORTED_AREA_ID, useFireData } from '@/context/FireDataContext'

/**
 * Keeps the shared selected date and study area in the URL (?date=YYYY-MM-DD&area=<id>) so links are shareable
 * and every page opens on the same day. Reading happens once when FireDataProvider initializes its state from
 * the URL; this hook only writes state back, so there is no hydration race (also under StrictMode).
 */
export function useUrlSync() {
  const [params, setParams] = useSearchParams()
  const { area, selectedDate } = useFireData()

  useEffect(() => {
    const next = new URLSearchParams(params)
    if (selectedDate) next.set('date', selectedDate)
    else next.delete('date')
    if (area.id !== IMPORTED_AREA_ID) next.set('area', area.id)
    else next.delete('area')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
    // `params` is intentionally excluded: state is the source of truth after initialization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, area.id])
}
