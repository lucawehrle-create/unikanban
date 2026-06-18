import {
  differenceInCalendarDays,
  format,
  isThisWeek,
  isToday,
  isTomorrow,
  parseISO,
} from 'date-fns'
import { de } from 'date-fns/locale'

export type DueClass = 'none' | 'overdue' | 'today' | 'soon' | 'week' | 'later'

export function classifyDue(dueISO?: string, done?: boolean): DueClass {
  if (!dueISO || done) return 'none'
  const d = parseISO(dueISO)
  const now = new Date()
  if (d.getTime() < now.getTime() && !isToday(d)) return 'overdue'
  if (isToday(d)) return 'today'
  if (isTomorrow(d)) return 'soon'
  if (isThisWeek(d, { weekStartsOn: 1 })) return 'week'
  return 'later'
}

export const DUE_META: Record<DueClass, { label: string; dot: string; text: string }> = {
  overdue: { label: 'überfällig', dot: 'bg-red-500', text: 'text-red-600' },
  today: { label: 'heute', dot: 'bg-orange-500', text: 'text-orange-600' },
  soon: { label: 'morgen', dot: 'bg-amber-500', text: 'text-amber-600' },
  week: { label: 'diese Woche', dot: 'bg-yellow-400', text: 'text-yellow-600' },
  later: { label: 'später', dot: 'bg-stone-300', text: 'text-stone-500' },
  none: { label: '', dot: '', text: '' },
}

/** Kurzes, menschenlesbares Fälligkeitslabel. */
export function formatDue(dueISO?: string): string {
  if (!dueISO) return ''
  const d = parseISO(dueISO)
  if (isToday(d)) return 'heute'
  if (isTomorrow(d)) return 'morgen'
  const diff = differenceInCalendarDays(d, new Date())
  if (diff < 0) return `${format(d, 'd. MMM', { locale: de })} (${Math.abs(diff)} Tage)`
  if (diff < 7) return format(d, 'EEEE', { locale: de })
  return format(d, 'd. MMM', { locale: de })
}

export function dueSortKey(dueISO?: string): number {
  return dueISO ? parseISO(dueISO).getTime() : Number.MAX_SAFE_INTEGER
}
