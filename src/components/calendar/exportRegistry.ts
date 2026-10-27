import type { LegendItem } from './CalendarLegend'

/** Latest legend per mounted calendar (keyed by its export id), so image export can draw the same legend. */
export const calendarLegendRegistry = new Map<string, { scale: LegendItem[]; marks: LegendItem[]; scaleTitle: string }>()
