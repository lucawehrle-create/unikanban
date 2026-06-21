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
  /** Inhalte automatisch aus dem Kursmaterial einbeziehen. */
  includeSummary: boolean
  includeUebung: boolean
  includeTut: boolean
  includeAltklausuren: boolean
  /** Optionale eigene Themen – ersetzen die automatischen Inhalte. */
  topics: string[]
}

export const DEFAULT_LERNPLAN: LernplanConfig = {
  startWeeksBefore: 3,
  weekdays: [1, 3, 5], // Mo, Mi, Fr
  time: '18:00',
  includeSummary: true,
  includeUebung: true,
  includeTut: true,
  includeAltklausuren: true,
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

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Anzahl Aufgaben eines Typs im jeweiligen Kurs (Material zum Wiederholen). */
export function courseMaterial(
  allTasks: Task[],
  courseId: string | undefined,
): { uebung: number; tut: number } {
  let uebung = 0
  let tut = 0
  for (const t of allTasks) {
    if (t.courseId !== courseId) continue
    if (t.type === 'uebung') uebung++
    else if (t.type === 'tutoriumsblatt') tut++
  }
  return { uebung, tut }
}

function materialItems(label: string, count: number): string[] {
  if (count <= 0) return []
  if (count <= 4) return [`${label} wiederholen`]
  const half = Math.ceil(count / 2)
  return [`${label} 1–${half} wiederholen`, `${label} ${half + 1}–${count} wiederholen`]
}

/** Was gelernt wird – aus Kursmaterial abgeleitet (oder eigene Themen). */
function buildContent(exam: Task, allTasks: Task[], cfg: LernplanConfig): string[] {
  if (cfg.topics.length) return cfg.topics
  const mat = courseMaterial(allTasks, exam.courseId)
  const items: string[] = []
  if (cfg.includeSummary) items.push('Zusammenfassung erstellen')
  if (cfg.includeUebung) items.push(...materialItems('Übungsblätter', mat.uebung))
  if (cfg.includeTut) items.push(...materialItems('Tutoriumsblätter', mat.tut))
  if (cfg.includeAltklausuren) items.push('Altklausuren rechnen')
  items.push('Endspurt-Wiederholung')
  return items
}

/** Tage, die wegen anderer Klausuren bzw. deren Lern-Sessions tabu sind. */
function conflictDayKeys(exam: Task, allTasks: Task[]): Set<string> {
  const s = new Set<string>()
  for (const t of allTasks) {
    if (!t.dueDate) continue
    const otherExam = t.type === 'klausur' && t.id !== exam.id
    const otherSession = !!t.examId && t.examId !== exam.id
    if (otherExam || otherSession) s.add(dayKey(new Date(t.dueDate)))
  }
  return s
}

/** Freie Lern-Tage im Zeitfenster (Wochentage, ab heute, ohne Konflikte). */
function availableDays(exam: Task, allTasks: Task[], cfg: LernplanConfig): Date[] {
  if (!exam.dueDate || cfg.weekdays.length === 0) return []
  const exam0 = new Date(exam.dueDate)
  if (isNaN(exam0.getTime())) return []
  const examDay = new Date(exam0)
  examDay.setHours(0, 0, 0, 0)
  const start = new Date(examDay)
  start.setDate(start.getDate() - Math.max(1, cfg.startWeeksBefore) * 7)

  const [h, m] = cfg.time.split(':').map(Number)
  const wd = new Set(cfg.weekdays)
  const conflicts = conflictDayKeys(exam, allTasks)
  const todayMs = startOfTodayMs()

  const out: Date[] = []
  const cur = new Date(Math.max(start.getTime(), todayMs))
  cur.setHours(0, 0, 0, 0)
  while (cur.getTime() < examDay.getTime() && out.length < 60) {
    if (wd.has(isoWeekday(cur)) && !conflicts.has(dayKey(cur))) {
      const d = new Date(cur)
      d.setHours(h || 18, m || 0, 0, 0)
      if (d.getTime() >= todayMs) out.push(d)
    }
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

// n Elemente gleichmäßig aus arr wählen (chronologisch).
function pickSpread<T>(arr: T[], n: number): T[] {
  if (n <= 0) return []
  if (n >= arr.length) return arr.slice()
  if (n === 1) return [arr[arr.length - 1]] // einzelne Session möglichst nah an der Klausur
  const res: T[] = []
  for (let i = 0; i < n; i++) res.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))])
  return res
}

// arr fair auf n Gruppen verteilen (Reihenfolge bleibt erhalten).
function chunkInto<T>(arr: T[], n: number): T[][] {
  const out: T[][] = Array.from({ length: n }, () => [])
  arr.forEach((x, i) => out[Math.min(n - 1, Math.floor((i * n) / arr.length))].push(x))
  return out
}

/**
 * Ganzheitlicher Lernplan: Inhalte aus dem Kursmaterial (Übungs-/Tutoriums-
 * blätter, Altklausuren, Zusammenfassung) verteilt auf freie Lern-Tage –
 * Termine anderer Klausuren werden ausgespart.
 */
export function planSessionsConfig(
  exam: Task,
  allTasks: Task[],
  cfg: LernplanConfig,
): PlannedSession[] {
  const content = buildContent(exam, allTasks, cfg)
  const days = availableDays(exam, allTasks, cfg)
  if (content.length === 0 || days.length === 0) return []
  const n = Math.min(content.length, days.length)
  const used = pickSpread(days, n)
  const buckets = chunkInto(content, n)
  return used.map((date, i) => ({ date, label: buckets[i].join(' · ') }))
}

/** Standard-Plan (für „kann man planen?"-Prüfung & Schnellweg). */
export function planSessions(exam: Task, allTasks: Task[]): PlannedSession[] {
  return planSessionsConfig(exam, allTasks, DEFAULT_LERNPLAN)
}

/** Anzahl bereits angelegter Lern-Sessions zu einer Klausur. */
export function studyPlanCount(tasks: Task[], examId: string): number {
  return tasks.filter((t) => t.examId === examId).length
}

/** Lern-Sessions als Aufgaben anlegen (ersetzt einen vorhandenen Plan). */
export async function createStudyPlan(
  exam: Task,
  allTasks: Task[],
  cfg: LernplanConfig,
): Promise<number> {
  if (!exam.dueDate) return 0
  await removeStudyPlan(allTasks, exam.id)
  const sessions = planSessionsConfig(exam, allTasks, cfg)
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
