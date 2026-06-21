import type { Task } from '@/db/types'
import { db } from '@/db/db'
import { createTask } from './actions'

/**
 * Lernplan-Meilensteine: Tage vor der Klausur + Fokus der Session. Bewusst
 * „verteilt" (Spacing) statt alles am Ende – siehe /lernplan-klausurphase.
 */
const MILESTONES: { daysBefore: number; label: string }[] = [
  { daysBefore: 21, label: 'Stoff sichten & Überblick' },
  { daysBefore: 14, label: 'Zusammenfassung erstellen' },
  { daysBefore: 10, label: 'Vertiefen & üben' },
  { daysBefore: 7, label: 'Altklausuren rechnen' },
  { daysBefore: 3, label: 'Schwächen wiederholen' },
  { daysBefore: 1, label: 'Endspurt-Wiederholung' },
]

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export interface PlannedSession {
  date: Date
  label: string
}

/** Zukünftige Lern-Sessions für eine Klausur (nur Termine ab heute, vor der Klausur). */
export function planSessions(examISO: string): PlannedSession[] {
  const exam = new Date(examISO)
  if (isNaN(exam.getTime())) return []
  const todayMs = startOfTodayMs()
  const out: PlannedSession[] = []
  for (const m of MILESTONES) {
    const day = new Date(exam)
    day.setDate(day.getDate() - m.daysBefore)
    day.setHours(18, 0, 0, 0) // fester Lern-Slot 18:00
    if (day.getTime() >= todayMs && day.getTime() < exam.getTime()) {
      out.push({ date: day, label: m.label })
    }
  }
  return out
}

/** Anzahl bereits angelegter Lern-Sessions zu einer Klausur. */
export function studyPlanCount(tasks: Task[], examId: string): number {
  return tasks.filter((t) => t.examId === examId).length
}

/** Lern-Sessions als Aufgaben anlegen (rückwärts vom Klausurtermin). */
export async function createStudyPlan(exam: Task): Promise<number> {
  if (!exam.dueDate) return 0
  const sessions = planSessions(exam.dueDate)
  for (const s of sessions) {
    await createTask({
      semesterId: exam.semesterId,
      title: `Lernen – ${s.label}`,
      type: 'sonstiges',
      courseId: exam.courseId,
      dueDate: s.date.toISOString(),
      notes: `Vorbereitung auf: ${exam.title}`,
      examId: exam.id,
    })
  }
  return sessions.length
}

/** Alle Lern-Sessions zu einer Klausur wieder entfernen. */
export async function removeStudyPlan(tasks: Task[], examId: string): Promise<void> {
  const ids = tasks.filter((t) => t.examId === examId).map((t) => t.id)
  if (ids.length) await db.tasks.bulkDelete(ids)
}
