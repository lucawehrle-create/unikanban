import type { Course, StudyPlanConfig, StudyStrategy, Task } from '@/db/types'
import { db } from '@/db/db'
import { createTask, updateTask } from './actions'
import { pickSessionTime, toMin } from './schedule'

// Zeitbudgets (Minuten)
const CHAPTER_MIN = 60
const SHEET_REVIEW_MIN = 30
const CARD_MIN = 0.3 // ~18 s pro Karte (Heuristik)
const FALLBACK_SESSION_MIN = 60 // für Fremd-Sessions ohne gespeicherte Dauer

export type ItemKind = 'altklausur' | 'kapitel' | 'uebung' | 'tut' | 'karten'

export const KIND_META: Record<ItemKind, { label: string; color: string }> = {
  kapitel: { label: 'Kapitel', color: '#6366f1' },
  uebung: { label: 'Übungsblätter', color: '#0ea5e9' },
  tut: { label: 'Tutoriumsblätter', color: '#14b8a6' },
  altklausur: { label: 'Altklausuren', color: '#e9633c' },
  karten: { label: 'Karteikarten', color: '#f5c645' },
}

export interface PlanSession {
  date: Date
  durationMin: number
  label: string
  kind: ItemKind
}

const STRATEGY: Record<StudyStrategy, { startFrac: number; chapterReps: number }> = {
  now: { startFrac: 0, chapterReps: 2 }, // sofort, Kapitel zusätzlich wiederholen
  breaks: { startFrac: 0.1, chapterReps: 2 }, // etwas später starten, mit Luft
  later: { startFrac: 0.55, chapterReps: 1 }, // spät, einmal durch
}

export const STRATEGY_META: Record<StudyStrategy, { title: string; desc: string; reps: string }> = {
  now: { title: 'Sofort starten', desc: 'Jetzt lernen, früh & gründlich.', reps: 'Kapitel 2×' },
  breaks: { title: 'Ausgewogen', desc: 'Etwas später, mit Luft zum Atmen.', reps: 'Kapitel 2×' },
  later: { title: 'Später starten', desc: 'Näher an der Klausur, einmal durch.', reps: 'Kapitel 1×' },
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
function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * (isFinite(f) ? f : 0.5)
}

export function defaultPlanConfig(
  examDate: string,
  uebungIds: string[],
  tutIds: string[],
): StudyPlanConfig {
  return {
    examDate,
    examDurationMin: 120,
    cardsPerDay: 15,
    altklausuren: 0,
    chapters: 0,
    uebungReviewIds: [...uebungIds],
    tutReviewIds: [...tutIds],
    strategy: 'breaks',
    dailyMaxMin: 180,
    time: '18:00',
  }
}

export function cardMinutesPerDay(cfg: StudyPlanConfig): number {
  return Math.round(cfg.cardsPerDay * CARD_MIN)
}

interface Unit {
  kind: ItemKind
  label: string
  durationMin: number
  pos: number // Ziel-Position 0..1 im Zeitfenster (Phase)
}

/**
 * Material in pädagogischer Reihenfolge: erst Kapitel lernen, dann Übungen/
 * Tutorien wiederholen, Altklausuren ans Ende (Prüfungssimulation), optional
 * Kapitel-Wiederholung spät.
 */
interface SheetRef {
  title: string
  /** Reflektierte Schwierigkeit 1–5 (undefined = nicht reflektiert). */
  difficulty?: number
}

/** Anzahl (spaced) Wiederholungen je nach Schwierigkeit. */
export function reviewReps(difficulty?: number): number {
  if (difficulty == null) return 1
  if (difficulty >= 5) return 3
  if (difficulty >= 4) return 2
  return 1
}

/** Minuten der ersten Wiederholung je nach Schwierigkeit. */
function reviewMinutes(difficulty?: number): number {
  const f = difficulty == null ? 1 : difficulty >= 4 ? 1.2 : difficulty <= 2 ? 0.8 : 1
  return Math.round(SHEET_REVIEW_MIN * f)
}

/**
 * Positionen der Wiederholungen mit *wachsenden* Abständen (Spaced Repetition):
 * erste Wiederholung an `base`, spätere rücken Richtung Klausur (`maxPos`).
 */
function repPositions(base: number, reps: number, maxPos: number): number[] {
  if (reps <= 1) return [Math.min(base, maxPos)]
  const span = Math.max(0, maxPos - base)
  const total = ((reps - 1) * reps) / 2 // Summe 1..reps-1
  const out: number[] = []
  let cum = 0
  for (let r = 0; r < reps; r++) {
    out.push(base + span * (cum / total))
    cum += r + 1 // Lücke wächst pro Wiederholung
  }
  return out
}

function buildUnits(
  cfg: StudyPlanConfig,
  chapterReps: number,
  uebungSheets: SheetRef[],
  tutSheets: SheetRef[],
): Unit[] {
  const u: Unit[] = []
  const span = (i: number, n: number, a: number, b: number) => lerp(a, b, n <= 1 ? 0.5 : i / (n - 1))

  for (let i = 0; i < cfg.chapters; i++) {
    u.push({ kind: 'kapitel', label: `Kapitel ${i + 1} durchgehen`, durationMin: CHAPTER_MIN, pos: span(i, cfg.chapters, 0.05, 0.45) })
    if (chapterReps >= 2)
      u.push({ kind: 'kapitel', label: `Kapitel ${i + 1} wiederholen`, durationMin: Math.round(CHAPTER_MIN * 0.6), pos: span(i, cfg.chapters, 0.6, 0.85) })
  }

  // Übungs-/Tutoriumsblätter: schwere bekommen mehr Zeit und mehrere
  // Wiederholungen mit wachsenden Abständen.
  const pushSheets = (sheets: SheetRef[], kind: ItemKind, winA: number, winB: number) => {
    sheets.forEach((sh, i) => {
      const reps = reviewReps(sh.difficulty)
      const minutes = reviewMinutes(sh.difficulty)
      const base = span(i, sheets.length, winA, winB)
      repPositions(base, reps, 0.92).forEach((pos, r) => {
        u.push({
          kind,
          label: reps > 1 ? `${sh.title} wiederholen (${r + 1}/${reps})` : `${sh.title} wiederholen`,
          durationMin: Math.max(15, Math.round(minutes * (r === 0 ? 1 : 0.8))),
          pos,
        })
      })
    })
  }
  pushSheets(uebungSheets, 'uebung', 0.3, 0.78)
  pushSheets(tutSheets, 'tut', 0.35, 0.8)

  for (let i = 0; i < cfg.altklausuren; i++)
    u.push({ kind: 'altklausur', label: `Altklausur ${i + 1} rechnen`, durationMin: cfg.examDurationMin * 2, pos: span(i, cfg.altklausuren, 0.6, 0.92) })

  return u.sort((a, b) => a.pos - b.pos)
}

/** Löst gewählte Blatt-IDs zu (sortierten) Sheets inkl. Schwierigkeit auf. */
function resolveSheets(ids: string[], allTasks: Task[]): SheetRef[] {
  const idSet = new Set(ids)
  return allTasks
    .filter((t) => idSet.has(t.id))
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ title: t.title, difficulty: t.reflection?.difficulty }))
}

/** Belegte Tage (andere Klausuren) – dort gar nicht planen. */
function examDayKeys(courseId: string, allTasks: Task[]): Set<string> {
  const s = new Set<string>()
  for (const t of allTasks) {
    if (t.type === 'klausur' && t.dueDate && t.courseId !== courseId) s.add(dayKey(new Date(t.dueDate)))
  }
  return s
}

/** Kursübergreifende Tageslast (Minuten) aus Lern-Sessions ANDERER Kurse. */
function foreignLoadMin(courseId: string, allTasks: Task[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of allTasks) {
    if (!t.dueDate || t.status === 'erledigt') continue
    if (t.examId && t.examId !== courseId) {
      const k = dayKey(new Date(t.dueDate))
      m.set(k, (m.get(k) ?? 0) + (t.duration ?? FALLBACK_SESSION_MIN))
    }
  }
  return m
}

export interface PlanResult {
  sessions: PlanSession[]
  /** Einheiten, die wegen Tagesbudget/Zeitfenster nicht untergebracht wurden. */
  unplaced: number
}

/**
 * Budget-basierter Scheduler: verteilt Material gemäß Phase, deckelt die
 * Lernzeit pro Tag (inkl. anderer Kurse) und legt Sessions in freie Slots.
 */
export function buildPlan(
  cfg: StudyPlanConfig,
  courseId: string,
  courses: Course[],
  allTasks: Task[],
): PlanResult {
  const exam = new Date(cfg.examDate + 'T00:00:00')
  if (isNaN(exam.getTime())) return { sessions: [], unplaced: 0 }
  const today = startOfToday()
  const total = diffDays(today, exam)
  if (total <= 0) return { sessions: [], unplaced: 0 }

  const s = STRATEGY[cfg.strategy]
  const start = addDays(today, Math.floor(s.startFrac * total))
  const examKeys = examDayKeys(courseId, allTasks)
  const foreign = foreignLoadMin(courseId, allTasks)
  const budget = Math.max(60, cfg.dailyMaxMin)

  // Plan-Tage (ohne fremde Klausurtage)
  const days: Date[] = []
  for (let d = new Date(start); d.getTime() < exam.getTime(); d = addDays(d, 1)) {
    if (!examKeys.has(dayKey(d))) days.push(new Date(d))
  }
  if (days.length === 0) return { sessions: [], unplaced: 0 }

  // belegte Minuten je Tag (eigene Planung), startet mit fremder Last
  const used = new Map<string, number>()
  const perDay = new Map<string, { kind: ItemKind; label: string; durationMin: number }[]>()
  const free = (k: string) => budget - (foreign.get(k) ?? 0) - (used.get(k) ?? 0)
  const add = (day: Date, it: { kind: ItemKind; label: string; durationMin: number }) => {
    const k = dayKey(day)
    used.set(k, (used.get(k) ?? 0) + it.durationMin)
    if (!perDay.has(k)) perDay.set(k, [])
    perDay.get(k)!.push(it)
  }

  // Karteikarten: tägliche Gewohnheit zuerst (kleiner Block, darf knapp übers Budget)
  const cardMin = cardMinutesPerDay(cfg)
  if (cfg.cardsPerDay > 0 && cardMin > 0) {
    for (const day of days) add(day, { kind: 'karten', label: `Karteikarten (${cfg.cardsPerDay})`, durationMin: cardMin })
  }

  // Material phasenweise platzieren, nächstgelegenen Tag mit Restbudget suchen
  const uebungSheets = resolveSheets(cfg.uebungReviewIds, allTasks)
  const tutSheets = resolveSheets(cfg.tutReviewIds, allTasks)
  let unplaced = 0
  for (const unit of buildUnits(cfg, s.chapterReps, uebungSheets, tutSheets)) {
    const targetIdx = Math.max(0, Math.min(days.length - 1, Math.round(unit.pos * (days.length - 1))))
    let placed = false
    for (let off = 0; off < days.length && !placed; off++) {
      for (const dir of off === 0 ? [0] : [1, -1]) {
        const idx = targetIdx + dir * off
        if (idx < 0 || idx >= days.length) continue
        if (free(dayKey(days[idx])) >= unit.durationMin) {
          add(days[idx], { kind: unit.kind, label: unit.label, durationMin: unit.durationMin })
          placed = true
          break
        }
      }
    }
    // Großer Block (z. B. Altklausur, Dauer > Tagesbudget): bekommt einen eigenen,
    // schwereren Tag – den mit dem meisten Restbudget nahe der Ziel-Phase.
    if (!placed && unit.durationMin > budget) {
      let bestIdx = -1
      let bestFree = -Infinity
      for (let i = 0; i < days.length; i++) {
        const f = free(dayKey(days[i])) - Math.abs(i - targetIdx) * 0.01 // leichte Nähe-Präferenz
        if (f > bestFree) {
          bestFree = f
          bestIdx = i
        }
      }
      if (bestIdx >= 0) {
        add(days[bestIdx], { kind: unit.kind, label: unit.label, durationMin: unit.durationMin })
        placed = true
      }
    }
    if (!placed) unplaced++
  }

  // Sessions je Tag sequentiell in freie Stundenplan-Lücken legen
  const pref = toMin(cfg.time)
  const sessions: PlanSession[] = []
  for (const day of days) {
    const items = perDay.get(dayKey(day))
    if (!items || items.length === 0) continue
    // Karteikarten zuerst, dann Material in Phasen-Reihenfolge (perDay-Reihenfolge passt grob)
    const ordered = [...items].sort((a, b) => (a.kind === 'karten' ? -1 : b.kind === 'karten' ? 1 : 0))
    let cursor = pickSessionTime(courses, day, pref, ordered[0].durationMin)
    for (const it of ordered) {
      const date = new Date(day)
      date.setHours(Math.floor(cursor / 60), cursor % 60, 0, 0)
      sessions.push({ date, durationMin: it.durationMin, label: it.label, kind: it.kind })
      cursor += it.durationMin
    }
  }
  sessions.sort((a, b) => a.date.getTime() - b.date.getTime())
  return { sessions, unplaced }
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
  byKind: Record<ItemKind, number>
  total: number
}

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

const titlePrefix = (course: Course) => `${course.short}: `

/**
 * Legt/aktualisiert den Plan. Bereits **erledigte** Sessions bleiben als
 * Verlauf erhalten (für den Fortschritt) – nur offene werden neu verteilt.
 * Schon erledigtes Material (außer Karteikarten) wird nicht erneut eingeplant.
 */
export async function savePlan(
  course: Course,
  cfg: StudyPlanConfig,
  courses: Course[],
  allTasks: Task[],
): Promise<number> {
  const prefix = titlePrefix(course)
  const doneLabels = new Set(
    allTasks
      .filter((t) => t.examId === course.id && t.status === 'erledigt')
      .map((t) => (t.title.startsWith(prefix) ? t.title.slice(prefix.length) : t.title)),
  )
  // nur offene Plan-Sessions löschen, erledigte behalten
  const openIds = allTasks
    .filter((t) => t.examId === course.id && t.status !== 'erledigt')
    .map((t) => t.id)
  if (openIds.length) await db.tasks.bulkDelete(openIds)

  const { sessions } = buildPlan(cfg, course.id, courses, allTasks)
  let created = 0
  for (const s of sessions) {
    // bereits erledigtes Material nicht doppeln (Karteikarten laufen täglich weiter)
    if (s.kind !== 'karten' && doneLabels.has(s.label)) continue
    await createTask({
      semesterId: course.semesterId,
      title: `${prefix}${s.label}`,
      type: 'sonstiges',
      courseId: course.id,
      dueDate: s.date.toISOString(),
      duration: s.durationMin,
      notes: `Lernplan ${course.name} · ${s.durationMin} Min`,
      examId: course.id,
    })
    created++
  }
  await db.courses.update(course.id, { studyPlan: cfg })
  return created
}

export interface PlanProgress {
  total: number
  done: number
  open: number
  overdue: number
  pct: number
}

/** Fortschritt eines Kurs-Plans (erledigt/offen/überfällig). */
export function planProgress(allTasks: Task[], courseId: string): PlanProgress {
  const todayMs = startOfToday().getTime()
  let total = 0
  let done = 0
  let overdue = 0
  for (const t of allTasks) {
    if (t.examId !== courseId) continue
    total++
    if (t.status === 'erledigt') done++
    else if (t.dueDate && new Date(t.dueDate).getTime() < todayMs) overdue++
  }
  const open = total - done
  return { total, done, open, overdue, pct: total ? Math.round((done / total) * 100) : 0 }
}

/**
 * „Aufholen": überfällige, offene Sessions in die nächsten Tage mit freier
 * Kapazität verschieben (Tagesbudget & andere Kurse berücksichtigt) – ohne
 * den ganzen Plan neu zu berechnen.
 */
export async function rescheduleOverduePlan(
  course: Course,
  cfg: StudyPlanConfig,
  courses: Course[],
  allTasks: Task[],
): Promise<number> {
  const today = startOfToday()
  const exam = new Date(cfg.examDate + 'T00:00:00')
  if (isNaN(exam.getTime()) || diffDays(today, exam) <= 0) return 0

  const overdue = allTasks
    .filter(
      (t) =>
        t.examId === course.id &&
        t.status !== 'erledigt' &&
        t.dueDate &&
        new Date(t.dueDate).getTime() < today.getTime(),
    )
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
  if (!overdue.length) return 0

  const budget = Math.max(60, cfg.dailyMaxMin)
  const examKeys = examDayKeys(course.id, allTasks)
  const foreign = foreignLoadMin(course.id, allTasks)
  const days: Date[] = []
  for (let d = new Date(today); d.getTime() < exam.getTime(); d = addDays(d, 1)) {
    if (!examKeys.has(dayKey(d))) days.push(new Date(d))
  }
  if (!days.length) return 0

  // belegte Minuten: eigene, noch offene Sessions ab heute (nicht die überfälligen selbst)
  const overdueIds = new Set(overdue.map((t) => t.id))
  const used = new Map<string, number>()
  for (const t of allTasks) {
    if (t.examId === course.id && t.status !== 'erledigt' && t.dueDate && !overdueIds.has(t.id)) {
      const dd = new Date(t.dueDate)
      if (dd.getTime() >= today.getTime()) {
        const k = dayKey(dd)
        used.set(k, (used.get(k) ?? 0) + (t.duration ?? FALLBACK_SESSION_MIN))
      }
    }
  }
  const freeCap = (k: string) => budget - (foreign.get(k) ?? 0) - (used.get(k) ?? 0)
  const pref = toMin(cfg.time)

  let moved = 0
  for (const t of overdue) {
    const dur = t.duration ?? FALLBACK_SESSION_MIN
    const target = days.find((d) => freeCap(dayKey(d)) >= dur) ?? days[0]
    const k = dayKey(target)
    used.set(k, (used.get(k) ?? 0) + dur)
    const min = pickSessionTime(courses, target, pref, dur)
    const date = new Date(target)
    date.setHours(Math.floor(min / 60), min % 60, 0, 0)
    await updateTask(t.id, { dueDate: date.toISOString() })
    moved++
  }
  return moved
}

export async function removePlanSessions(courseId: string, allTasks: Task[]): Promise<void> {
  const ids = allTasks.filter((t) => t.examId === courseId).map((t) => t.id)
  if (ids.length) await db.tasks.bulkDelete(ids)
}

export async function deletePlan(courseId: string, allTasks: Task[]): Promise<void> {
  await removePlanSessions(courseId, allTasks)
  await db.courses.update(courseId, { studyPlan: undefined })
}

export function planSessionCount(allTasks: Task[], courseId: string): number {
  return allTasks.filter((t) => t.examId === courseId).length
}
