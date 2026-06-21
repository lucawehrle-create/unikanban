import type { Course, Task } from '@/db/types'
import { db } from '@/db/db'
import { createTask, updateTask } from './actions'
import { pickSessionTime, toMin } from './schedule'

/** Intensität als einfache Voreinstellung – mehr/weniger VERTEILTE Sessions
 *  (nicht längere Cram-Blöcke; vgl. Lernforschung: Spacing schlägt Cramming). */
export type Intensity = 'locker' | 'normal' | 'endspurt'

export const PRESETS: Record<Intensity, { weekdays: number[]; startWeeksBefore: number }> = {
  locker: { weekdays: [2, 4], startWeeksBefore: 4 }, // Di/Do, früh & entspannt
  normal: { weekdays: [1, 3, 5], startWeeksBefore: 3 }, // Mo/Mi/Fr
  endspurt: { weekdays: [1, 2, 3, 4, 5], startWeeksBefore: 2 }, // Mo–Fr, dichter
}

export interface LernplanConfig {
  intensity: Intensity
  /** Wie viele Wochen vor der Klausur beginnen (frühestens heute). */
  startWeeksBefore: number
  /** Lern-Wochentage (1 = Mo … 7 = So). */
  weekdays: number[]
  /** Bevorzugte (früheste) Uhrzeit, "HH:mm". */
  time: string
  /** Session-Dauer in Minuten (für freie-Block-Suche). */
  duration: number
  /** Inhalte automatisch aus dem Kursmaterial. */
  includeSummary: boolean
  includeUebung: boolean
  includeTut: boolean
  includeAltklausuren: boolean
  /** Schwerpunkte (Selbsteinschätzung): schwere Themen bekommen mehr/dichtere
   *  Wiederholungen kurz vor der Klausur (SM-2-Idee, vereinfacht). */
  weak: { summary: boolean; uebung: boolean; tut: boolean; altklausuren: boolean }
  /** Eigene Themen – ersetzen die automatischen Inhalte. */
  topics: string[]
  /** Welche eigenen Themen als „schwer" markiert sind. */
  weakTopics: string[]
}

export const DEFAULT_LERNPLAN: LernplanConfig = {
  intensity: 'normal',
  startWeeksBefore: PRESETS.normal.startWeeksBefore,
  weekdays: PRESETS.normal.weekdays,
  time: '18:00',
  duration: 60,
  includeSummary: true,
  includeUebung: true,
  includeTut: true,
  includeAltklausuren: true,
  weak: { summary: false, uebung: false, tut: false, altklausuren: false },
  topics: [],
  weakTopics: [],
}

/** Preset auf eine Konfiguration anwenden (Wochentage + Vorlauf). */
export function applyPreset(cfg: LernplanConfig, intensity: Intensity): LernplanConfig {
  return { ...cfg, intensity, ...PRESETS[intensity] }
}

export interface PlannedSession {
  date: Date
  label: string
}

// Höchstens so viele FREMDE Lern-Sessions/Termine pro Tag, sonst gilt der Tag
// als überlastet (Lastausgleich über mehrere Klausuren).
const DAY_LOAD_CAP = 2

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Anzahl Übungs-/Tutoriumsblätter des Kurses (Material zum Wiederholen). */
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

export interface ContentItem {
  label: string
  weak: boolean
}

function materialItems(label: string, count: number, weak: boolean): ContentItem[] {
  if (count <= 0) return []
  if (count <= 4) return [{ label: `${label} wiederholen`, weak }]
  const half = Math.ceil(count / 2)
  return [
    { label: `${label} 1–${half} wiederholen`, weak },
    { label: `${label} ${half + 1}–${count} wiederholen`, weak },
  ]
}

/** Lerninhalte – aus Kursmaterial abgeleitet (oder eigene Themen). Retrieval-orientiert. */
function buildContent(exam: Task, allTasks: Task[], cfg: LernplanConfig): ContentItem[] {
  if (cfg.topics.length) {
    return cfg.topics.map((t) => ({ label: t, weak: cfg.weakTopics.includes(t) }))
  }
  const mat = courseMaterial(allTasks, exam.courseId)
  const items: ContentItem[] = []
  if (cfg.includeSummary) items.push({ label: 'Zusammenfassung erstellen', weak: cfg.weak.summary })
  if (cfg.includeUebung) items.push(...materialItems('Übungsblätter', mat.uebung, cfg.weak.uebung))
  if (cfg.includeTut) items.push(...materialItems('Tutoriumsblätter', mat.tut, cfg.weak.tut))
  if (cfg.includeAltklausuren) items.push({ label: 'Altklausuren rechnen', weak: cfg.weak.altklausuren })
  items.push({ label: 'Aktiv abrufen & Selbsttest', weak: false })
  items.push({ label: ENDSPURT_LABEL, weak: false })
  return items
}

/** Tabu-Tage: andere Klausuren bzw. deren Lern-Sessions. */
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

/** Wie viele FREMDE Lern-Sessions liegen schon auf einem Tag (für den Last-Cap). */
function foreignSessionLoad(exam: Task, allTasks: Task[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of allTasks) {
    if (!t.dueDate || t.status === 'erledigt') continue
    if (t.examId && t.examId !== exam.id) {
      const k = dayKey(new Date(t.dueDate))
      m.set(k, (m.get(k) ?? 0) + 1)
    }
  }
  return m
}

/** Freie Lern-Tage (Mitternacht-Daten): Wochentage, ab heute, ohne Konflikte, unter Last-Cap. */
function availableDays(exam: Task, allTasks: Task[], cfg: LernplanConfig): Date[] {
  if (!exam.dueDate || cfg.weekdays.length === 0) return []
  const exam0 = new Date(exam.dueDate)
  if (isNaN(exam0.getTime())) return []
  const examDay = new Date(exam0)
  examDay.setHours(0, 0, 0, 0)
  const start = new Date(examDay)
  start.setDate(start.getDate() - Math.max(1, cfg.startWeeksBefore) * 7)

  const wd = new Set(cfg.weekdays)
  const conflicts = conflictDayKeys(exam, allTasks)
  const load = foreignSessionLoad(exam, allTasks)
  const todayMs = startOfTodayMs()

  const out: Date[] = []
  const cur = new Date(Math.max(start.getTime(), todayMs))
  cur.setHours(0, 0, 0, 0)
  while (cur.getTime() < examDay.getTime() && out.length < 60) {
    const k = dayKey(cur)
    if (wd.has(isoWeekday(cur)) && !conflicts.has(k) && (load.get(k) ?? 0) < DAY_LOAD_CAP) {
      out.push(new Date(cur))
    }
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

// n Elemente gleichmäßig aus arr wählen (chronologisch, ~70 % Puffer durch Lücken).
function pickSpread<T>(arr: T[], n: number): T[] {
  if (n <= 0) return []
  if (n >= arr.length) return arr.slice()
  if (n === 1) return [arr[arr.length - 1]]
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

function withTimeOfDay(day: Date, min: number): Date {
  const d = new Date(day)
  d.setHours(Math.floor(min / 60), min % 60, 0, 0)
  return d
}

const ENDSPURT_LABEL = 'Endspurt-Wiederholung'
// Mehr Intensität = mehr VERTEILTE Sessions (Kerninhalte werden für Spacing
// wiederholt), nicht längere Blöcke.
const MAX_SESSIONS: Record<Intensity, number> = { locker: 5, normal: 8, endspurt: 12 }

/** n Session-Labels: jeder Kerninhalt mind. einmal; Extra-Slots (= spätere,
 *  klausurnähere Sessions) bevorzugt mit als „schwer" markierten Themen. */
function buildLabels(items: ContentItem[], n: number): string[] {
  if (n <= 1) return [ENDSPURT_LABEL]
  const core = items.filter((i) => i.label !== ENDSPURT_LABEL)
  const slots = n - 1
  const out: string[] = []
  if (core.length === 0) {
    for (let i = 0; i < slots; i++) out.push('Wiederholung & Selbsttest')
  } else if (slots < core.length) {
    for (const g of chunkInto(core.map((i) => i.label), slots)) out.push(g.join(' · '))
  } else {
    // jeder Inhalt einmal (chronologisch), dann Wiederholungen mit Schwerpunkt
    // auf schweren Themen – diese landen in den späteren Sessions vor der Klausur.
    out.push(...core.map((i) => i.label))
    const extra = slots - core.length
    const weakLabels = core.filter((i) => i.weak).map((i) => i.label)
    const pool = weakLabels.length ? weakLabels : core.map((i) => i.label)
    for (let i = 0; i < extra; i++) out.push(pool[i % pool.length])
  }
  out.push(ENDSPURT_LABEL)
  return out
}

/**
 * Smarter, ganzheitlicher Lernplan: Inhalte aus dem Kursmaterial, gleichmäßig
 * (Spacing) auf freie Lern-Tage verteilt, in freie Stundenplan-Lücken gelegt,
 * Termine anderer Klausuren ausgespart, Tageslast über mehrere Klausuren gedeckelt.
 */
export function planSessionsConfig(
  exam: Task,
  allTasks: Task[],
  courses: Course[],
  cfg: LernplanConfig,
): PlannedSession[] {
  const items = buildContent(exam, allTasks, cfg)
  const days = availableDays(exam, allTasks, cfg)
  if (items.length === 0 || days.length === 0) return []
  const n = Math.min(days.length, MAX_SESSIONS[cfg.intensity])
  const used = pickSpread(days, n)
  const labels = buildLabels(items, n)
  const preferred = toMin(cfg.time)
  return used.map((day, i) => {
    const min = pickSessionTime(courses, day, preferred, cfg.duration)
    return { date: withTimeOfDay(day, min), label: labels[i] }
  })
}

/** Standard-Plan (für „kann man planen?"-Prüfung & Schnellweg). */
export function planSessions(exam: Task, allTasks: Task[], courses: Course[]): PlannedSession[] {
  return planSessionsConfig(exam, allTasks, courses, DEFAULT_LERNPLAN)
}

/**
 * Auslastung je Wochentag (1=Mo…7=So) im Lern-Zeitraum: bereits belegte Termine
 * (andere Klausuren, fremde Lern-Sessions, offene Abgaben). Eigene Sessions/
 * Erledigtes zählen nicht.
 */
export function loadByWeekday(
  exam: Task,
  allTasks: Task[],
  cfg: LernplanConfig,
): Record<number, number> {
  const res: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
  if (!exam.dueDate) return res
  const examDay = new Date(exam.dueDate)
  if (isNaN(examDay.getTime())) return res
  examDay.setHours(0, 0, 0, 0)
  const start = new Date(examDay)
  start.setDate(start.getDate() - Math.max(1, cfg.startWeeksBefore) * 7)
  const from = Math.max(start.getTime(), startOfTodayMs())
  for (const t of allTasks) {
    if (!t.dueDate || t.status === 'erledigt') continue
    if (t.id === exam.id || t.examId === exam.id) continue
    const d = new Date(t.dueDate)
    const day = new Date(d)
    day.setHours(0, 0, 0, 0)
    if (day.getTime() >= from && day.getTime() < examDay.getTime()) res[isoWeekday(d)]++
  }
  return res
}

/** Sessions zu einer Klausur (gesamt & erledigt) – für den Fortschritt. */
export function studyPlanProgress(tasks: Task[], examId: string): { total: number; done: number } {
  let total = 0
  let done = 0
  for (const t of tasks) {
    if (t.examId !== examId) continue
    total++
    if (t.status === 'erledigt') done++
  }
  return { total, done }
}

export function studyPlanCount(tasks: Task[], examId: string): number {
  return tasks.filter((t) => t.examId === examId).length
}

/** Überfällige, noch offene Lern-Sessions einer Klausur. */
export function overdueSessions(tasks: Task[], examId: string): Task[] {
  const todayMs = startOfTodayMs()
  return tasks.filter(
    (t) =>
      t.examId === examId &&
      t.status !== 'erledigt' &&
      !!t.dueDate &&
      new Date(t.dueDate).getTime() < todayMs,
  )
}

/** Lern-Sessions als Aufgaben anlegen (ersetzt einen vorhandenen Plan). */
export async function createStudyPlan(
  exam: Task,
  allTasks: Task[],
  courses: Course[],
  cfg: LernplanConfig,
): Promise<number> {
  if (!exam.dueDate) return 0
  await removeStudyPlan(allTasks, exam.id)
  const sessions = planSessionsConfig(exam, allTasks, courses, cfg)
  for (const s of sessions) {
    await createTask({
      semesterId: exam.semesterId,
      title: `Lernen – ${s.label}`,
      type: 'sonstiges',
      courseId: exam.courseId,
      dueDate: s.date.toISOString(),
      notes: `Aktiv abrufen (Selbsttest/Altklausuren) statt nur lesen. · Vorbereitung auf ${exam.title}`,
      examId: exam.id,
    })
  }
  return sessions.length
}

/**
 * „Aufholen": überfällige, offene Sessions in die nächsten freien Lern-Tage
 * verschieben (verteidigen & sanft umlegen – keine globale Neuberechnung).
 */
export async function rescheduleOverdue(
  exam: Task,
  allTasks: Task[],
  courses: Course[],
): Promise<number> {
  const overdue = overdueSessions(allTasks, exam.id).sort(
    (a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
  )
  if (!overdue.length) return 0
  const days = availableDays(exam, allTasks, DEFAULT_LERNPLAN)
  const preferred = toMin(DEFAULT_LERNPLAN.time)
  let moved = 0
  for (let i = 0; i < overdue.length && i < days.length; i++) {
    const min = pickSessionTime(courses, days[i], preferred, DEFAULT_LERNPLAN.duration)
    await updateTask(overdue[i].id, { dueDate: withTimeOfDay(days[i], min).toISOString() })
    moved++
  }
  return moved
}

/** Alle Lern-Sessions zu einer Klausur entfernen. */
export async function removeStudyPlan(tasks: Task[], examId: string): Promise<void> {
  const ids = tasks.filter((t) => t.examId === examId).map((t) => t.id)
  if (ids.length) await db.tasks.bulkDelete(ids)
}
