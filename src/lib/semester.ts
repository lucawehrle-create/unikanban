import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  isWithinInterval,
  parseISO,
  startOfWeek,
} from 'date-fns'
import type { ExamPhase, Semester } from '@/db/types'

/** Normalisiert ein Startdatum auf den Montag seiner Woche (die Wochenlogik
 *  geht von Montag = Beginn von Woche 1 aus). */
export function mondayISO(isoDate: string): string {
  const d = parseISO(isoDate)
  if (isNaN(d.getTime())) return isoDate
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

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

/** Ende der Vorlesungszeit. */
export function lectureEnd(semester: Semester): Date {
  return addWeeks(parseISO(semester.startDate), semester.weeks)
}

export type PhaseId = 'vor' | 'vorlesung' | 'klausurphase' | 'vorlesungsfrei'

export interface PhaseInfo {
  phase: PhaseId
  label: string
  week?: number // bei 'vorlesung'
  weeks: number
  currentExam?: ExamPhase
  /** nächste anstehende Klausurenphase (für Countdown). */
  nextExam?: { phase: ExamPhase; daysUntil: number }
}

/** Ermittelt die aktuelle Semesterphase + Countdown zur nächsten Klausurenphase. */
export function getPhaseInfo(semester: Semester, now: Date = new Date()): PhaseInfo {
  const start = parseISO(semester.startDate)
  const lecEnd = lectureEnd(semester)
  const exams = [...(semester.examPhases ?? [])].sort(
    (a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime(),
  )

  const nextExamPhase = exams.find((e) => parseISO(e.start).getTime() > now.getTime())
  const nextExam = nextExamPhase
    ? { phase: nextExamPhase, daysUntil: differenceInCalendarDays(parseISO(nextExamPhase.start), now) }
    : undefined

  const currentExam = exams.find((e) =>
    isWithinInterval(now, { start: parseISO(e.start), end: parseISO(e.end) }),
  )
  if (currentExam) {
    return { phase: 'klausurphase', label: currentExam.label, weeks: semester.weeks, currentExam, nextExam }
  }

  if (now < start) {
    return { phase: 'vor', label: 'vor Vorlesungsbeginn', weeks: semester.weeks, nextExam }
  }

  if (now >= start && now < lecEnd) {
    return {
      phase: 'vorlesung',
      label: 'Vorlesungszeit',
      week: clampWeek(semester, currentSemesterWeek(semester, now)),
      weeks: semester.weeks,
      nextExam,
    }
  }

  return { phase: 'vorlesungsfrei', label: 'vorlesungsfreie Zeit', weeks: semester.weeks, nextExam }
}
