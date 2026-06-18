import { addDays, addWeeks, differenceInCalendarDays, parseISO } from 'date-fns'
import type { Semester } from '@/db/types'

/** Montag (Datum) der gegebenen Semesterwoche (1-basiert). */
export function mondayOfWeek(semester: Semester, week: number): Date {
  return addWeeks(parseISO(semester.startDate), week - 1)
}

/** Konkretes Datum für (Woche, Wochentag) — weekday: 1=Mo … 7=So. */
export function dateForWeekday(semester: Semester, week: number, weekday: number): Date {
  return addDays(mondayOfWeek(semester, week), weekday - 1)
}

/** Setzt eine Uhrzeit "HH:mm" auf ein Datum. */
export function withTime(date: Date, time?: string): Date {
  const d = new Date(date)
  if (time) {
    const [h, m] = time.split(':').map(Number)
    d.setHours(h || 0, m || 0, 0, 0)
  } else {
    d.setHours(23, 59, 0, 0)
  }
  return d
}

/**
 * Aktuelle Semesterwoche (1-basiert) für ein Datum.
 * Gibt < 1 zurück, wenn vor Semesterstart, > weeks wenn danach.
 */
export function currentSemesterWeek(semester: Semester, now: Date = new Date()): number {
  const start = parseISO(semester.startDate)
  const days = differenceInCalendarDays(now, start)
  return Math.floor(days / 7) + 1
}

/** Klemmt eine Wochenzahl auf den sinnvollen Anzeigebereich. */
export function clampWeek(semester: Semester, week: number): number {
  return Math.max(1, Math.min(semester.weeks, week))
}
