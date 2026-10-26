import { useMemo } from 'react'
import { useFireData } from '@/context/FireDataContext'
import type { DailyActivity } from '@/types/activity'

/** Daily activity records inside the global date filter. */
export function useRangeDays(): DailyActivity[] {
  const { analysis, filter } = useFireData()
  return useMemo(() => {
    if (!analysis) return []
    return analysis.days.filter((d) => d.date >= filter.startDate && d.date <= filter.endDate)
  }, [analysis, filter.startDate, filter.endDate])
}
