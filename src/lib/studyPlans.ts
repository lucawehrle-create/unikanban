import type { Course, StudyPlanConfig, StudyStrategy, Task, TaskTypeId } from '@/db/types'
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
  /** Übergeordnetes Lernziel der Session (für die Notizen). */
  focus: string
  /** Kurs, zu dem die Session gehört (im globalen Plan gesetzt). */
  courseId?: string
  /** Stabiler Schlüssel der Einheit (strategieunabhängig) für die
   *  Fortschritts-Erkennung – z. B. `kap:3:0`, `ueb:Blatt 2:0`, `alt:1`. */
  key?: string
}

/** Lernplan-Einstellungen für den globalen Scheduler. */
export interface StudySettings {
  /** Tagesdeckel über ALLE Kurse (Minuten). */
  dailyMaxMin: number
  /** Wochendeckel über ALLE Kurse (Minuten). */
  weeklyMaxMin: number
  /** Lerntage (ISO 1=Mo … 7=So). */
  studyDays: number[]
  /** Max. Kurse pro Tag (Fokus-Blöcke). */
  maxCoursesPerDay: number
  /** Standard-Vorbereitungsfenster vor der Klausur (Wochen). */
  prepWindowWeeks: number
}

// Übergeordnete Lernziele je Session-Art – erklären dem Nutzer den ZWECK
// (nicht den Inhalt), z.B. warum Kapitel 3 ein drittes Mal auftaucht.
const CARD_FOCUS =
  'Tägliches aktives Abrufen: kurz deine Karteikarten durchgehen (Spaced Repetition – kleine Dosis, dafür regelmäßig).'
const ALTKLAUSUR_FOCUS =
  'Wie in der echten Klausur: unter Zeitdruck & ohne Hilfsmittel rechnen, danach ehrlich kontrollieren und Fehler gezielt nacharbeiten.'

function chapterFocus(isLearn: boolean, waveIdx: number, waveCount: number): string {
  if (isLearn)
    return 'Erstes Durcharbeiten: Überblick verschaffen, die zentralen Konzepte verstehen und alles Unklare markieren.'
  if (waveCount <= 1)
    return 'Aktiv wiederholen: erst ohne Unterlagen aus dem Kopf abrufen, dann gezielt die markierten Lücken schließen.'
  if (waveIdx < waveCount - 1)
    return 'Aktiv wiederholen: aus dem Kopf abrufen und die zuvor markierten Lücken nacharbeiten.'
  return 'Festigen: nur noch die schwierigen Stellen & Zusammenhänge, kurze Selbstabfrage – fast wie in der Klausur.'
}

function sheetFocus(repIdx: number, repCount: number): string {
  if (repCount <= 1)
    return 'Fokus auf die Aufgaben, die dir schwergefallen sind (siehe deine Reflexion) – den Lösungsweg verstehen statt alles neu zu rechnen.'
  if (repIdx === 0) return 'Die schweren Aufgaben nochmal selbst lösen – wo genau hakt es?'
  if (repIdx < repCount - 1)
    return 'Kurzer Check der noch wackeligen Aufgaben – den Lösungsweg aus dem Kopf rekonstruieren.'
  return 'Letzter Durchgang: nur noch die kniffligen Aufgaben sicher beherrschen.'
}

// Anzahl Wiederholungs-„Wellen" für Kapitel (zusätzlich zum ersten Durchgang).
// Mehr Wellen = mehr verteilte Wiederholung (Spacing-Effekt).
const STRATEGY: Record<StudyStrategy, { startFrac: number; chapterReviews: number }> = {
  now: { startFrac: 0, chapterReviews: 2 }, // sofort & gründlich: 1× lernen + 2× wiederholen
  breaks: { startFrac: 0.1, chapterReviews: 1 }, // ausgewogen: 1× lernen + 1× wiederholen
  later: { startFrac: 0.55, chapterReviews: 0 }, // spät: einmal durch
}

export const STRATEGY_META: Record<StudyStrategy, { title: string; desc: string; reps: string }> = {
  now: { title: 'Sofort starten', desc: 'Jetzt lernen, früh & gründlich.', reps: 'Kapitel 3×' },
  breaks: { title: 'Ausgewogen', desc: 'Etwas später, mit Luft zum Atmen.', reps: 'Kapitel 2×' },
  later: { title: 'Später starten', desc: 'Näher an der Klausur, einmal durch.', reps: 'Kapitel 1×' },
}

// Zeitfenster (Anteil bis Klausur) je Wiederholungs-Welle – spätere Wellen mit
// größerem Abstand Richtung Klausur (expandierende Intervalle, Spaced Repetition).
const CHAPTER_REVIEW_WAVES: Record<number, [number, number][]> = {
  0: [],
  1: [[0.55, 0.82]],
  2: [
    [0.42, 0.65],
    [0.68, 0.9],
  ],
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
    dailyMaxMin: undefined,
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
  focus: string
  /** Stabiler, strategieunabhängiger Schlüssel (für Fortschritts-Erkennung). */
  key: string
}

/**
 * Material in pädagogischer Reihenfolge: erst Kapitel lernen, dann Übungen/
 * Tutorien wiederholen, Altklausuren ans Ende (Prüfungssimulation), optional
 * Kapitel-Wiederholung spät.
 */
interface SheetRef {
  id: string
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
  chapterReviews: number,
  uebungSheets: SheetRef[],
  tutSheets: SheetRef[],
): Unit[] {
  const u: Unit[] = []
  const span = (i: number, n: number, a: number, b: number) => lerp(a, b, n <= 1 ? 0.5 : i / (n - 1))

  // Kapitel: erst einmal durchgehen (früh), dann in mehreren Wellen mit
  // wachsenden Abständen wiederholen (verteiltes Lernen).
  const waves = CHAPTER_REVIEW_WAVES[chapterReviews] ?? []
  for (let i = 0; i < cfg.chapters; i++) {
    u.push({
      kind: 'kapitel',
      label: `Kapitel ${i + 1} durchgehen`,
      durationMin: CHAPTER_MIN,
      pos: span(i, cfg.chapters, 0.05, 0.4),
      focus: chapterFocus(true, 0, waves.length),
      key: `kap:${i + 1}:0`,
    })
    waves.forEach((win, w) =>
      u.push({
        kind: 'kapitel',
        label: waves.length > 1 ? `Kapitel ${i + 1} wiederholen (${w + 1}/${waves.length})` : `Kapitel ${i + 1} wiederholen`,
        durationMin: Math.round(CHAPTER_MIN * 0.55),
        pos: span(i, cfg.chapters, win[0], win[1]),
        focus: chapterFocus(false, w, waves.length),
        key: `kap:${i + 1}:r${w + 1}`,
      }),
    )
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
          focus: sheetFocus(r, reps),
          key: `${kind}:${sh.id}:${r}`,
        })
      })
    })
  }
  pushSheets(uebungSheets, 'uebung', 0.3, 0.78)
  pushSheets(tutSheets, 'tut', 0.35, 0.8)

  for (let i = 0; i < cfg.altklausuren; i++)
    u.push({
      kind: 'altklausur',
      label: `Altklausur ${i + 1} rechnen`,
      durationMin: cfg.examDurationMin * 2,
      pos: span(i, cfg.altklausuren, 0.6, 0.92),
      focus: ALTKLAUSUR_FOCUS,
      key: `alt:${i + 1}`,
    })

  return u.sort((a, b) => a.pos - b.pos)
}

/** Löst gewählte Blatt-IDs zu (sortierten) Sheets inkl. Schwierigkeit auf. */
function resolveSheets(ids: string[], allTasks: Task[]): SheetRef[] {
  const idSet = new Set(ids)
  return allTasks
    .filter((t) => idSet.has(t.id))
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ id: t.id, title: t.title, difficulty: t.reflection?.difficulty }))
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

/** Reservierte Zeit pro offenem Übungs-/Tutoriumsblatt-Termin (Tagesgeschäft). */
const RECURRING_RESERVE_MIN = 60
const WEEK_REF = new Date(2020, 0, 6).getTime() // ein Montag als Referenz

function sodMs(d: Date): number {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}
function weekKeyOf(d: Date): number {
  // Erst in ganze Kalendertage umrechnen (DST-sicher: eine Woche über die Zeit-
  // umstellung hat nicht exakt 604800000 ms – sonst verschöbe sich die Wochen-
  // grenze und Montage fielen ins Vorwochen-Budget), dann durch 7 teilen.
  const days = Math.round((sodMs(d) - WEEK_REF) / 86400000)
  return Math.floor(days / 7)
}
function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}
function ectsWeight(ects?: number): number {
  if (ects == null) return 2
  if (ects >= 8) return 3
  if (ects >= 5) return 2
  return 1
}
function importanceOf(u: Unit): number {
  if (u.kind === 'altklausur') return 1
  if ((u.kind === 'uebung' || u.kind === 'tut') && u.label.includes('(')) return 0.8
  if (u.kind === 'uebung' || u.kind === 'tut') return 0.6
  if (u.kind === 'kapitel') return u.label.includes('wiederholen') ? 0.6 : 0.5
  return 0.3
}

export interface DroppedUnit {
  courseId: string
  label: string
}

export interface GlobalPlan {
  sessionsByCourse: Map<string, PlanSession[]>
  /** Einheiten, die in keinem Vorbereitungsfenster/Budget Platz fanden. */
  dropped: DroppedUnit[]
}

interface GUnit {
  courseId: string
  kind: ItemKind
  label: string
  durationMin: number
  focus: string
  key: string
  examMs: number
  targetMs: number
  windowOpenMs: number
  priority: number
  perCourseDailyMax?: number
}

/**
 * Globaler Scheduler über ALLE Kurse zugleich:
 *  - intensives Lernen nur im Vorbereitungsfenster vor jeder Klausur,
 *  - Fokus-Blöcke: höchstens `maxCoursesPerDay` Kurse pro Tag (rotierend),
 *  - Tages- UND Wochendeckel, Lerntage/Ruhetage, Tagesgeschäft reserviert,
 *  - Priorisierung (Klausur-Nähe × Gewicht × Wichtigkeit); Unwichtiges fällt raus.
 */
export function buildGlobalPlan(
  courses: Course[],
  allTasks: Task[],
  settings: StudySettings,
  today: Date = startOfToday(),
): GlobalPlan {
  const dailyMax = Math.max(60, settings.dailyMaxMin)
  const weeklyMax = Math.max(dailyMax, settings.weeklyMaxMin)
  const studyDays = settings.studyDays.length ? settings.studyDays : [1, 2, 3, 4, 5, 6]
  const maxCourses = Math.max(1, settings.maxCoursesPerDay)
  const prepDefault = Math.max(1, settings.prepWindowWeeks)

  const sessionsByCourse = new Map<string, PlanSession[]>()
  const dropped: DroppedUnit[] = []
  const courseById = new Map(courses.map((c) => [c.id, c]))
  const planned = courses.filter(
    (c) => c.studyPlan && !isNaN(new Date(c.studyPlan.examDate + 'T00:00:00').getTime()),
  )
  if (!planned.length) return { sessionsByCourse, dropped }

  // Gesperrte Klausurtage (alle Kurse)
  const examBlocked = new Set<string>()
  for (const t of allTasks) if (t.type === 'klausur' && t.dueDate) examBlocked.add(dayKey(new Date(t.dueDate)))

  // Tagesgeschäft (Übungen/Tutorien) als reservierte Wochenlast
  const weeklyReserve = new Map<number, number>()
  for (const t of allTasks) {
    if ((t.type === 'uebung' || t.type === 'tutoriumsblatt') && t.status !== 'erledigt' && t.dueDate) {
      const d = new Date(t.dueDate)
      if (d.getTime() >= today.getTime())
        weeklyReserve.set(weekKeyOf(d), (weeklyReserve.get(weekKeyOf(d)) ?? 0) + RECURRING_RESERVE_MIN)
    }
  }

  // Einheiten über alle Kurse erzeugen (mit Fenster, Zieltag, Priorität)
  const units: GUnit[] = []
  for (const c of planned) {
    const cfg = c.studyPlan!
    const exam = new Date(cfg.examDate + 'T00:00:00')
    if (diffDays(today, exam) <= 0) continue
    // „Sofort starten" nutzt das gesamte Zeitfenster ab heute; sonst begrenztes
    // Vorbereitungsfenster vor der Klausur (Später = etwas kürzer).
    let windowOpen: Date
    if (cfg.strategy === 'now') {
      windowOpen = new Date(today)
    } else {
      let prepWeeks = cfg.prepWindowWeeks ?? prepDefault
      if (cfg.strategy === 'later') prepWeeks = Math.max(1, prepWeeks - 2)
      windowOpen = addDays(exam, -prepWeeks * 7)
      if (windowOpen.getTime() < today.getTime()) windowOpen = today
    }
    const winSpan = Math.max(1, diffDays(windowOpen, exam))
    const reviews = STRATEGY[cfg.strategy].chapterReviews
    const uebungSheets = resolveSheets(cfg.uebungReviewIds, allTasks)
    const tutSheets = resolveSheets(cfg.tutReviewIds, allTasks)
    const weight = cfg.weight ?? ectsWeight(c.ects)
    const prox = 1 / (1 + Math.max(0, diffDays(today, exam)) / 7)
    for (const u of buildUnits(cfg, reviews, uebungSheets, tutSheets)) {
      units.push({
        courseId: c.id,
        kind: u.kind,
        label: u.label,
        durationMin: u.durationMin,
        focus: u.focus,
        key: u.key,
        examMs: exam.getTime(),
        windowOpenMs: windowOpen.getTime(),
        targetMs: addDays(windowOpen, Math.round(u.pos * winSpan)).getTime(),
        priority: 0.5 * prox + 0.3 * (weight / 3) + 0.2 * importanceOf(u),
        perCourseDailyMax: cfg.dailyMaxMin,
      })
    }
  }
  // Wichtigstes zuerst (Gleichstand: frühere Klausur)
  units.sort((a, b) => b.priority - a.priority || a.examMs - b.examMs)

  // Tageskapazitäten
  const dailyUsed = new Map<string, number>()
  const weeklyUsed = new Map<number, number>()
  const dayCourses = new Map<string, Set<string>>()
  const courseDayUsed = new Map<string, number>()
  const dayDate = new Map<string, Date>()
  type Item = { courseId: string; kind: ItemKind; label: string; durationMin: number; focus: string; key?: string }
  const dayItems = new Map<string, Item[]>()
  const isStudyDay = (d: Date) => studyDays.includes(isoWeekday(d)) && !examBlocked.has(dayKey(d))

  // countCourse=false für Karteikarten: leichte Tagesgewohnheit, zählt NICHT
  // gegen das „max. Kurse pro Tag"-Limit (das gilt nur für Fokus-Material).
  const placeOn = (d: Date, it: Item, countCourse = true) => {
    const k = dayKey(d)
    const wk = weekKeyOf(d)
    dailyUsed.set(k, (dailyUsed.get(k) ?? 0) + it.durationMin)
    weeklyUsed.set(wk, (weeklyUsed.get(wk) ?? 0) + it.durationMin)
    if (countCourse) {
      const set = dayCourses.get(k)
      if (set) set.add(it.courseId)
      else dayCourses.set(k, new Set([it.courseId]))
    }
    courseDayUsed.set(`${k}|${it.courseId}`, (courseDayUsed.get(`${k}|${it.courseId}`) ?? 0) + it.durationMin)
    if (!dayItems.has(k)) dayItems.set(k, [])
    dayItems.get(k)!.push(it)
    dayDate.set(k, d)
  }

  // Nächster Lerntag zu `target` im Bereich [lo, hi) – ohne Budget-/Kursprüfung.
  const nearestStudyDay = (target: Date, lo: Date, hi: Date): Date | null => {
    const loMs = Math.max(lo.getTime(), today.getTime())
    const span = Math.max(1, diffDays(new Date(loMs), hi)) + 1
    for (let dist = 0; dist <= span; dist++) {
      for (const dir of dist === 0 ? [0] : [1, -1]) {
        const d = addDays(target, dir * dist)
        if (d.getTime() < loMs || d.getTime() >= hi.getTime()) continue
        if (isStudyDay(d)) return d
      }
    }
    return null
  }

  const fits = (d: Date, u: GUnit, ignoreDaily: boolean): boolean => {
    if (d.getTime() < u.windowOpenMs || d.getTime() < today.getTime() || d.getTime() >= u.examMs) return false
    if (!isStudyDay(d)) return false
    const k = dayKey(d)
    const set = dayCourses.get(k)
    if (set && !set.has(u.courseId) && set.size >= maxCourses) return false
    if (!ignoreDaily && (dailyUsed.get(k) ?? 0) + u.durationMin > dailyMax) return false
    const wk = weekKeyOf(d)
    if ((weeklyUsed.get(wk) ?? 0) + u.durationMin > weeklyMax - (weeklyReserve.get(wk) ?? 0)) return false
    if (u.perCourseDailyMax != null && (courseDayUsed.get(`${k}|${u.courseId}`) ?? 0) + u.durationMin > u.perCourseDailyMax)
      return false
    return true
  }

  const itemOf = (u: GUnit): Item => ({
    courseId: u.courseId,
    kind: u.kind,
    label: u.label,
    durationMin: u.durationMin,
    focus: u.focus,
    key: u.key,
  })

  for (const u of units) {
    const bigBlock = u.durationMin > dailyMax // z. B. Altklausur: eigener, schwerer Tag
    const maxDist = Math.max(1, diffDays(new Date(u.windowOpenMs), new Date(u.examMs))) + 1
    let placed = false
    let fallback: Date | null = null
    let fallbackUsed = Infinity
    for (let dist = 0; dist <= maxDist && !placed; dist++) {
      for (const dir of dist === 0 ? [0] : [1, -1]) {
        const d = addDays(new Date(u.targetMs), dir * dist)
        if (fits(d, u, bigBlock)) {
          if (bigBlock) {
            // nächstgelegenen, möglichst leeren Tag wählen
            const used = dailyUsed.get(dayKey(d)) ?? 0
            if (used < fallbackUsed) {
              fallback = d
              fallbackUsed = used
            }
            if (used === 0) {
              placeOn(d, itemOf(u))
              placed = true
              break
            }
          } else {
            placeOn(d, itemOf(u))
            placed = true
            break
          }
        }
      }
    }
    if (!placed && bigBlock && fallback) {
      placeOn(fallback, itemOf(u))
      placed = true
    }
    // Altklausuren sind Pflicht (das Wichtigste vor der Klausur): notfalls Limits
    // überschreiten und auf den nächsten Lerntag im Fenster legen.
    if (!placed && u.kind === 'altklausur') {
      const forced =
        nearestStudyDay(new Date(u.targetMs), new Date(u.windowOpenMs), new Date(u.examMs)) ??
        nearestStudyDay(new Date(u.targetMs), today, new Date(u.examMs))
      if (forced) {
        placeOn(forced, itemOf(u))
        placed = true
      }
    }
    if (!placed) dropped.push({ courseId: u.courseId, label: u.label })
  }

  // Karteikarten: tägliche Gewohnheit AB HEUTE (leichter Kontakt, auch vor dem
  // intensiven Fenster). Zählt nicht gegen das Kurse-pro-Tag-Limit; nur bei
  // freiem Tages-/Wochenbudget. Tag-für-Tag und mit pro Tag rotierter
  // Kursreihenfolge, damit an vollen Tagen nicht immer derselbe Kurs gewinnt.
  const cardCourses = planned.filter((c) => c.studyPlan!.cardsPerDay > 0 && cardMinutesPerDay(c.studyPlan!) > 0)
  if (cardCourses.length) {
    const maxExamMs = Math.max(...cardCourses.map((c) => new Date(c.studyPlan!.examDate + 'T00:00:00').getTime()))
    for (let d = new Date(today); d.getTime() < maxExamMs; d = addDays(d, 1)) {
      if (!isStudyDay(d)) continue
      const k = dayKey(d)
      const wk = weekKeyOf(d)
      const offset = Math.abs(diffDays(today, d)) % cardCourses.length
      const order = [...cardCourses.slice(offset), ...cardCourses.slice(0, offset)]
      for (const c of order) {
        const cfg = c.studyPlan!
        if (d.getTime() >= new Date(cfg.examDate + 'T00:00:00').getTime()) continue
        const cardMin = cardMinutesPerDay(cfg)
        if ((dailyUsed.get(k) ?? 0) + cardMin > dailyMax) continue
        if ((weeklyUsed.get(wk) ?? 0) + cardMin > weeklyMax - (weeklyReserve.get(wk) ?? 0)) continue
        if (cfg.dailyMaxMin != null && (courseDayUsed.get(`${k}|${c.id}`) ?? 0) + cardMin > cfg.dailyMaxMin) continue
        placeOn(d, { courseId: c.id, kind: 'karten', label: `Karteikarten (${cfg.cardsPerDay})`, durationMin: cardMin, focus: CARD_FOCUS }, false)
      }
    }
  }

  // Uhrzeiten je Tag vergeben (Karteikarten zuerst), nach Kurs gruppieren
  for (const [k, items] of dayItems) {
    const day = dayDate.get(k)!
    const ordered = [...items].sort((a, b) => (a.kind === 'karten' ? -1 : b.kind === 'karten' ? 1 : 0))
    const prefMin = Math.min(
      ...ordered.map((it) => toMin(courseById.get(it.courseId)?.studyPlan?.time ?? '18:00')),
    )
    // Jede Session in einen vorlesungsfreien Slot NACH der vorherigen legen –
    // nicht nur die erste positionieren (sonst stapeln spätere Blöcke blind und
    // könnten in eine Vorlesung oder über den Tagesrand laufen).
    let cursor = prefMin
    for (const it of ordered) {
      const start = pickSessionTime(courses, day, cursor, it.durationMin)
      const date = new Date(day)
      date.setHours(Math.floor(start / 60), start % 60, 0, 0)
      const arr = sessionsByCourse.get(it.courseId) ?? []
      arr.push({ date, durationMin: it.durationMin, label: it.label, kind: it.kind, focus: it.focus, courseId: it.courseId, key: it.key })
      sessionsByCourse.set(it.courseId, arr)
      cursor = start + it.durationMin
    }
  }
  for (const arr of sessionsByCourse.values()) arr.sort((a, b) => a.date.getTime() - b.date.getTime())
  return { sessionsByCourse, dropped }
}

/** Vorschau für EINEN Kurs im globalen Kontext (für die Editor-Varianten). */
export function previewCoursePlan(
  course: Course,
  cfg: StudyPlanConfig,
  courses: Course[],
  allTasks: Task[],
  settings: StudySettings,
): { sessions: PlanSession[]; dropped: DroppedUnit[] } {
  let found = false
  const temp = courses.map((c) => {
    if (c.id !== course.id) return c
    found = true
    return { ...c, studyPlan: cfg }
  })
  if (!found) temp.push({ ...course, studyPlan: cfg })
  const gp = buildGlobalPlan(temp, allTasks, settings)
  return {
    sessions: gp.sessionsByCourse.get(course.id) ?? [],
    dropped: gp.dropped.filter((d) => d.courseId === course.id),
  }
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

/** Lern-Session-Art → Aufgabentyp (sonst „sonstiges"). */
const KIND_TASK_TYPE: Partial<Record<ItemKind, TaskTypeId>> = {
  altklausur: 'altklausur',
  karten: 'karteikarten',
}

/**
 * Schreibt einen bereits berechneten globalen Plan in die Aufgaben.
 * Bereits **erledigte** Sessions bleiben als Verlauf erhalten (Fortschritt) –
 * nur offene werden ersetzt; erledigtes Material wird nicht erneut eingeplant.
 */
async function writeGlobalPlan(
  planned: Course[],
  allTasks: Task[],
  gp: GlobalPlan,
): Promise<{ plans: number; sessions: number; byCourse: Map<string, number> }> {
  // Erledigtes Material pro Kurs merken – vorrangig über den stabilen planKey
  // (strategieunabhängig), zusätzlich über das Label (Fallback für Alt-Tasks
  // ohne planKey), damit Erledigtes beim Neuberechnen nicht erneut auftaucht.
  const doneKeysByCourse = new Map<string, Set<string>>()
  const doneLabelsByCourse = new Map<string, Set<string>>()
  for (const c of planned) {
    const prefix = titlePrefix(c)
    const doneTasks = allTasks.filter((t) => t.examId === c.id && t.status === 'erledigt')
    doneKeysByCourse.set(c.id, new Set(doneTasks.filter((t) => t.planKey).map((t) => t.planKey!)))
    // Label-Fallback NUR für Alt-Tasks ohne planKey – sonst könnte ein gleich
    // benanntes neues Material fälschlich als „schon erledigt" unterdrückt werden.
    doneLabelsByCourse.set(
      c.id,
      new Set(
        doneTasks
          .filter((t) => !t.planKey)
          .map((t) => (t.title.startsWith(prefix) ? t.title.slice(prefix.length) : t.title)),
      ),
    )
  }
  // offene Plan-Sessions aller geplanten Kurse löschen
  const plannedIds = new Set(planned.map((c) => c.id))
  const openIds = allTasks
    .filter((t) => t.examId && plannedIds.has(t.examId) && t.status !== 'erledigt')
    .map((t) => t.id)
  if (openIds.length) await db.tasks.bulkDelete(openIds)

  const byCourse = new Map<string, number>()
  let total = 0
  for (const c of planned) {
    const prefix = titlePrefix(c)
    const doneKeys = doneKeysByCourse.get(c.id)!
    const doneLabels = doneLabelsByCourse.get(c.id)!
    let created = 0
    for (const s of gp.sessionsByCourse.get(c.id) ?? []) {
      // Karteikarten laufen täglich weiter; sonstiges Material nicht doppeln.
      const alreadyDone = (s.key && doneKeys.has(s.key)) || doneLabels.has(s.label)
      if (s.kind !== 'karten' && alreadyDone) continue
      await createTask({
        semesterId: c.semesterId,
        title: `${prefix}${s.label}`,
        type: KIND_TASK_TYPE[s.kind] ?? 'sonstiges',
        courseId: c.id,
        dueDate: s.date.toISOString(),
        duration: s.durationMin,
        notes: `🎯 ${s.focus}\n\n${s.durationMin} Min · Lernplan ${c.name}`,
        examId: c.id,
        planKey: s.key,
      })
      created++
    }
    byCourse.set(c.id, created)
    total += created
  }
  return { plans: planned.length, sessions: total, byCourse }
}

/**
 * Legt/aktualisiert den Plan EINES Kurses – und balanciert dabei alle anderen
 * Kurspläne gemeinsam neu (ein globaler Durchlauf). Gibt die Anzahl neu
 * angelegter Sessions für diesen Kurs zurück.
 */
export async function savePlan(
  course: Course,
  cfg: StudyPlanConfig,
  courses: Course[],
  allTasks: Task[],
  settings: StudySettings,
): Promise<number> {
  await db.courses.update(course.id, { studyPlan: cfg })
  const updated = courses.map((c) => (c.id === course.id ? { ...c, studyPlan: cfg } : c))
  if (!updated.some((c) => c.id === course.id)) updated.push({ ...course, studyPlan: cfg })
  const planned = updated.filter((c) => c.studyPlan)
  const gp = buildGlobalPlan(planned, allTasks, settings)
  const r = await writeGlobalPlan(planned, allTasks, gp)
  return r.byCourse.get(course.id) ?? 0
}

/**
 * Balanciert ALLE Kurs-Lernpläne gemeinsam neu (ein globaler Durchlauf).
 * Erledigte Sessions bleiben erhalten.
 */
export async function rebalanceAllPlans(
  courses: Course[],
  allTasks: Task[],
  settings: StudySettings,
): Promise<{ plans: number; sessions: number }> {
  const planned = courses.filter((c) => c.studyPlan)
  if (!planned.length) return { plans: 0, sessions: 0 }
  const gp = buildGlobalPlan(planned, allTasks, settings)
  const r = await writeGlobalPlan(planned, allTasks, gp)
  return { plans: r.plans, sessions: r.sessions }
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
  settings: StudySettings,
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

  const globalBudget = Math.max(60, settings.dailyMaxMin)
  const courseBudget = cfg.dailyMaxMin
  const studyDays = settings.studyDays.length ? settings.studyDays : [1, 2, 3, 4, 5, 6]
  const examKeys = examDayKeys(course.id, allTasks)
  const foreign = foreignLoadMin(course.id, allTasks)
  const days: Date[] = []
  for (let d = new Date(today); d.getTime() < exam.getTime(); d = addDays(d, 1)) {
    if (!examKeys.has(dayKey(d)) && studyDays.includes(isoWeekday(d))) days.push(new Date(d))
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
  const freeCap = (k: string) => {
    const u = used.get(k) ?? 0
    const globalFree = globalBudget - (foreign.get(k) ?? 0) - u
    const courseFree = courseBudget != null ? courseBudget - u : Infinity
    return Math.min(globalFree, courseFree)
  }
  const pref = toMin(cfg.time)

  // Am wenigsten belasteten Tag wählen (max. Restkapazität), damit Überfälliges
  // verteilt wird statt sich auf einem einzigen Tag zu stapeln.
  const leastLoadedDay = () =>
    days.reduce((best, d) => (freeCap(dayKey(d)) > freeCap(dayKey(best)) ? d : best), days[0])

  let moved = 0
  for (const t of overdue) {
    const dur = t.duration ?? FALLBACK_SESSION_MIN
    const target = days.find((d) => freeCap(dayKey(d)) >= dur) ?? leastLoadedDay()
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
