import type { Course, StudyPlanConfig, StudyStrategy, Task } from '@/db/types'
import { db } from '@/db/db'
import { createTask } from './actions'
import { pickSessionTime, toMin } from './schedule'

// Zeitbudgets (Minuten)
const CHAPTER_MIN = 60
const SHEET_REVIEW_MIN = 30
const CARD_MIN = 0.3 // ~18 s pro Karte (Heuristik)
const DAY_LOAD_CAP = 2 // max. fremde Klausur-Termine/Sessions pro Tag

export type ItemKind = 'altklausur' | 'kapitel' | 'uebung' | 'tut' | 'karten'

export const KIND_META: Record<ItemKind, { label: string; color: string }> = {
  altklausur: { label: 'Altklausuren', color: '#e9633c' },
  kapitel: { label: 'Kapitel', color: '#6366f1' },
  uebung: { label: 'Übungsblätter', color: '#0ea5e9' },
  tut: { label: 'Tutoriumsblätter', color: '#14b8a6' },
  karten: { label: 'Karteikarten', color: '#f5c645' },
}

export interface PlanSession {
  date: Date
  durationMin: number
  label: string
  kind: ItemKind
}

const STRATEGY: Record<StudyStrategy, { startFrac: number; reps: number; dayUse: number }> = {
  now: { startFrac: 0, reps: 2, dayUse: 1 }, // sofort, viele Wiederholungen
  breaks: { startFrac: 0, reps: 2, dayUse: 0.65 }, // sofort, mit Pausentagen
  later: { startFrac: 0.55, reps: 1, dayUse: 1 }, // später, einmal durch
}

export const STRATEGY_META: Record<
  StudyStrategy,
  { title: string; desc: string; reps: string }
> = {
  now: { title: 'Sofort starten', desc: 'Jetzt lernen, bis zur Klausur üben.', reps: '~2× pro Material' },
  breaks: {
    title: 'Sofort, mit Pausen',
    desc: 'Jetzt starten, mit Erholungstagen.',
    reps: '~2× pro Material',
  },
  later: { title: 'Später starten', desc: 'Näher an der Klausur, einmal durch.', reps: '1× pro Material' },
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function chunkInto<T>(arr: T[], n: number): T[][] {
  const out: T[][] = Array.from({ length: Math.max(1, n) }, () => [])
  arr.forEach((x, i) => out[Math.min(out.length - 1, Math.floor((i * out.length) / arr.length))].push(x))
  return out
}

/** Sinnvolle Standard-Konfiguration für einen Kurs. */
export function defaultPlanConfig(
  examDate: string,
  uebungCount: number,
  tutCount: number,
): StudyPlanConfig {
  return {
    examDate,
    examDurationMin: 120,
    cardsPerDay: 15,
    altklausuren: 0,
    chapters: 0,
    uebungReview: uebungCount,
    tutReview: tutCount,
    strategy: 'breaks',
    time: '18:00',
  }
}

/** Karteikarten-Minuten pro Tag (für Anzeige & Budget). */
export function cardMinutesPerDay(cfg: StudyPlanConfig): number {
  return Math.round(cfg.cardsPerDay * CARD_MIN)
}

/** Ein „Material-Stück" = eine Session-Einheit (vor Wiederholung). */
function materialItems(cfg: StudyPlanConfig): { label: string; kind: ItemKind; durationMin: number }[] {
  const out: { label: string; kind: ItemKind; durationMin: number }[] = []
  for (let i = 1; i <= cfg.altklausuren; i++)
    out.push({ label: `Altklausur ${i} rechnen`, kind: 'altklausur', durationMin: cfg.examDurationMin * 2 })
  for (let i = 1; i <= cfg.chapters; i++)
    out.push({ label: `Kapitel ${i} durchgehen`, kind: 'kapitel', durationMin: CHAPTER_MIN })
  for (let i = 1; i <= cfg.uebungReview; i++)
    out.push({ label: `Übungsblatt wiederholen`, kind: 'uebung', durationMin: SHEET_REVIEW_MIN })
  for (let i = 1; i <= cfg.tutReview; i++)
    out.push({ label: `Tutoriumsblatt wiederholen`, kind: 'tut', durationMin: SHEET_REVIEW_MIN })
  return out
}

/** Tage anderer Klausuren / fremder Lern-Sessions (für Konflikt & Cap). */
function blockedDayLoad(courseId: string, allTasks: Task[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of allTasks) {
    if (!t.dueDate || t.status === 'erledigt') continue
    const otherExam = t.type === 'klausur'
    const otherSession = !!t.examId && t.examId !== courseId
    if (otherExam || otherSession) {
      const k = dayKey(new Date(t.dueDate))
      m.set(k, (m.get(k) ?? 0) + 1)
    }
  }
  return m
}

/**
 * Lernplan für einen Kurs erzeugen: Material (× Wiederholungen je Strategie) +
 * tägliche Karteikarten, verteilt auf freie Tage/Slots bis zur Klausur.
 */
export function generatePlanSessions(
  cfg: StudyPlanConfig,
  courseId: string,
  courses: Course[],
  allTasks: Task[],
): PlanSession[] {
  const exam = new Date(cfg.examDate + 'T00:00:00')
  if (isNaN(exam.getTime())) return []
  const today = startOfToday()
  const total = diffDays(today, exam)
  if (total <= 0) return []

  const s = STRATEGY[cfg.strategy]
  const start = addDays(today, Math.floor(s.startFrac * total))
  const load = blockedDayLoad(courseId, allTasks)

  // verfügbare Tage (jeden Tag, ohne Konflikt-/Last-Tage)
  const allDays: Date[] = []
  for (let d = new Date(start); d.getTime() < exam.getTime(); d = addDays(d, 1)) {
    if ((load.get(dayKey(d)) ?? 0) < DAY_LOAD_CAP) allDays.push(new Date(d))
  }
  if (allDays.length === 0) return []

  // Material-Pool (mit Wiederholungen)
  const base = materialItems(cfg)
  const pool: { label: string; kind: ItemKind; durationMin: number }[] = []
  for (let r = 0; r < s.reps; r++) pool.push(...base)

  // Material-Tage (bei „Pausen" weniger Tage)
  const matDayCount = Math.max(1, Math.round(allDays.length * s.dayUse))
  const matDays = pickSpread(allDays, Math.min(matDayCount, allDays.length))
  const buckets = chunkInto(pool, matDays.length)
  const matByDay = new Map<string, typeof pool>()
  matDays.forEach((d, i) => matByDay.set(dayKey(d), buckets[i] ?? []))

  const cardMin = cardMinutesPerDay(cfg)
  const pref = toMin(cfg.time)
  const sessions: PlanSession[] = []

  for (const day of allDays) {
    const items = matByDay.get(dayKey(day)) ?? []
    const todays: { label: string; kind: ItemKind; durationMin: number }[] = []
    if (cfg.cardsPerDay > 0 && cardMin > 0)
      todays.push({ label: `Karteikarten (${cfg.cardsPerDay})`, kind: 'karten', durationMin: cardMin })
    todays.push(...items)
    if (todays.length === 0) continue
    // Sessions des Tages sequentiell ab erster freier Zeit stapeln
    let cursor = pickSessionTime(courses, day, pref, todays[0].durationMin)
    for (const it of todays) {
      const date = new Date(day)
      date.setHours(Math.floor(cursor / 60), cursor % 60, 0, 0)
      sessions.push({ date, durationMin: it.durationMin, label: it.label, kind: it.kind })
      cursor += it.durationMin
    }
  }
  return sessions.sort((a, b) => a.date.getTime() - b.date.getTime())
}

function pickSpread<T>(arr: T[], n: number): T[] {
  if (n <= 0) return []
  if (n >= arr.length) return arr.slice()
  if (n === 1) return [arr[0]]
  const res: T[] = []
  for (let i = 0; i < n; i++) res.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))])
  return res
}

export interface PlanSummary {
  sessions: number
  totalMin: number
  perDayMin: number
  days: number
}

export function summarize(sessions: PlanSession[]): PlanSummary {
  if (sessions.length === 0) return { sessions: 0, totalMin: 0, perDayMin: 0, days: 0 }
  const totalMin = sessions.reduce((s, x) => s + x.durationMin, 0)
  const days = new Set(sessions.map((s) => dayKey(s.date))).size
  return { sessions: sessions.length, totalMin, perDayMin: Math.round(totalMin / days), days }
}

export interface DayBar {
  date: Date
  byKind: Record<ItemKind, number> // Minuten je Art
  total: number
}

/** Tageweise Minuten je Material-Art – für die Timeline-Visualisierung. */
export function timeline(cfg: StudyPlanConfig, sessions: PlanSession[]): DayBar[] {
  const exam = new Date(cfg.examDate + 'T00:00:00')
  const today = startOfToday()
  if (isNaN(exam.getTime()) || diffDays(today, exam) <= 0) return []
  const map = new Map<string, DayBar>()
  for (let d = new Date(today); d.getTime() < exam.getTime(); d = addDays(d, 1)) {
    map.set(dayKey(d), {
      date: new Date(d),
      total: 0,
      byKind: { altklausur: 0, kapitel: 0, uebung: 0, tut: 0, karten: 0 },
    })
  }
  for (const s of sessions) {
    const bar = map.get(dayKey(s.date))
    if (bar) {
      bar.byKind[s.kind] += s.durationMin
      bar.total += s.durationMin
    }
  }
  return [...map.values()]
}

/** Plan bestätigen: alte Sessions ersetzen, neue als Aufgaben anlegen, Config speichern. */
export async function savePlan(
  course: Course,
  cfg: StudyPlanConfig,
  courses: Course[],
  allTasks: Task[],
): Promise<number> {
  await removePlanSessions(course.id, allTasks)
  const sessions = generatePlanSessions(cfg, course.id, courses, allTasks)
  for (const s of sessions) {
    await createTask({
      semesterId: course.semesterId,
      title: `${course.short}: ${s.label}`,
      type: 'sonstiges',
      courseId: course.id,
      dueDate: s.date.toISOString(),
      notes: `Lernplan ${course.name} · ${s.durationMin} Min`,
      examId: course.id,
    })
  }
  await db.courses.update(course.id, { studyPlan: cfg })
  return sessions.length
}

/** Lern-Sessions eines Kurses entfernen. */
export async function removePlanSessions(courseId: string, allTasks: Task[]): Promise<void> {
  const ids = allTasks.filter((t) => t.examId === courseId).map((t) => t.id)
  if (ids.length) await db.tasks.bulkDelete(ids)
}

/** Plan ganz löschen (Sessions + Config). */
export async function deletePlan(courseId: string, allTasks: Task[]): Promise<void> {
  await removePlanSessions(courseId, allTasks)
  await db.courses.update(courseId, { studyPlan: undefined })
}

export function planSessionCount(allTasks: Task[], courseId: string): number {
  return allTasks.filter((t) => t.examId === courseId).length
}
