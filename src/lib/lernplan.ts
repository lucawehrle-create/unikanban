import type { Task } from '@/db/types'
import { db } from '@/db/db'
import { createTask } from './actions'

/** Konfiguration eines individuellen Lernplans. */
export interface LernplanConfig {
  /** Wie viele Wochen vor der Klausur beginnen (frühestens heute). */
  startWeeksBefore: number
  /** Lern-Wochentage (1 = Mo … 7 = So). */
  weekdays: number[]
  /** Uhrzeit der Sessions, "HH:mm". */
  time: string
  /** Optionale eigene Themen/Foki – werden der Reihe nach durchlaufen. */
  topics: string[]
}

export const DEFAULT_LERNPLAN: LernplanConfig = {
  startWeeksBefore: 3,
  weekdays: [1, 3, 5], // Mo, Mi, Fr
  time: '18:00',
  topics: [],
}

export interface PlannedSession {
  date: Date
  label: string
}

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// getDay(): 0=So..6=Sa  →  1=Mo..7=So
function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

function labelFor(i: number, total: number, topics: string[]): string {
  if (topics.length) return topics[i % topics.length]
  if (total > 1 && i === total - 1) return 'Endspurt-Wiederholung'
  if (i === 0) return 'Überblick & Stoff sichten'
  return 'Vertiefen & üben'
}

/** Lern-Sessions nach individueller Konfiguration (nur Termine ab heute, vor der Klausur). */
export function planSessionsConfig(examISO: string, cfg: LernplanConfig): PlannedSession[] {
  const exam = new Date(examISO)
  if (isNaN(exam.getTime()) || cfg.weekdays.length === 0) return []
  const todayMs = startOfTodayMs()

  const examDay = new Date(exam)
  examDay.setHours(0, 0, 0, 0)
  const start = new Date(examDay)
  start.setDate(start.getDate() - Math.max(1, cfg.startWeeksBefore) * 7)

  const [h, m] = cfg.time.split(':').map(Number)
  const wd = new Set(cfg.weekdays)

  const raw: Date[] = []
  const cursor = new Date(Math.max(start.getTime(), todayMs))
  cursor.setHours(0, 0, 0, 0)
  // Sicherheitslimit gegen versehentliche Flut.
  while (cursor.getTime() < examDay.getTime() && raw.length < 60) {
    if (wd.has(isoWeekday(cursor))) {
      const d = new Date(cursor)
      d.setHours(h || 18, m || 0, 0, 0)
      if (d.getTime() >= todayMs) raw.push(d)
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return raw.map((date, i) => ({ date, label: labelFor(i, raw.length, cfg.topics) }))
}

/** Standard-Plan (für „kann man planen?"-Prüfung & Schnellweg). */
export function planSessions(examISO: string): PlannedSession[] {
  return planSessionsConfig(examISO, DEFAULT_LERNPLAN)
}

/** Anzahl bereits angelegter Lern-Sessions zu einer Klausur. */
export function studyPlanCount(tasks: Task[], examId: string): number {
  return tasks.filter((t) => t.examId === examId).length
}

/**
 * Lern-Sessions als Aufgaben anlegen (ersetzt einen evtl. vorhandenen Plan
 * derselben Klausur, damit „anpassen" sauber funktioniert).
 */
export async function createStudyPlan(
  exam: Task,
  cfg: LernplanConfig,
  existing: Task[] = [],
): Promise<number> {
  if (!exam.dueDate) return 0
  await removeStudyPlan(existing, exam.id)
  const sessions = planSessionsConfig(exam.dueDate, cfg)
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
