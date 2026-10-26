/** Join class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "14 Mar 2024" */
export function fmtDate(date: string | null | undefined): string {
  if (!date) return '—'
  const [y, m, d] = date.split('-')
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]} ${y}`
}

/** "14 Mar" */
export function fmtDayMonth(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]}`
}

export function monthName(month: number): string {
  return MONTHS_SHORT[month - 1] ?? ''
}

export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function fmtCompact(n: number): string {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}
