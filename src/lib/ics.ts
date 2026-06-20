import type { Course, CourseSlot, SlotKind, Semester, Task, TaskTypeId } from '@/db/types'
import { uid } from '@/db/db'
import { dateForWeekday, withTime } from './semester'
import { slotKindLabel } from './slotKinds'
import { TASK_TYPES } from './taskTypes'

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Date → UTC im iCalendar-Basisformat (YYYYMMDDTHHMMSSZ). */
function fmtUTC(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/** Date → lokale Wandzeit (ohne Z) für TZID-gebundene Termine. */
function fmtLocal(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

// VTIMEZONE für Europe/Berlin – damit wöchentliche Termine über die Sommer-/
// Winterzeit-Grenze die korrekte Wanduhrzeit behalten (RRULE in lokaler Zeit).
const VTIMEZONE_BERLIN = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// RFC 5545: Content-Zeilen dürfen max. 75 Oktette lang sein; längere werden
// gefaltet (Folgezeile mit führendem Leerzeichen). Wichtig für lange deutsche
// Kursnamen/Beschreibungen, sonst lehnen strenge Parser die Datei ab.
function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  let out = ''
  let cur = ''
  let curBytes = 0
  let limit = 75
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (curBytes + b > limit) {
      out += (out ? '\r\n ' : '') + cur
      cur = ch
      curBytes = b
      limit = 74 // Folgezeilen beginnen mit einem Leerzeichen (1 Oktett)
    } else {
      cur += ch
      curBytes += b
    }
  }
  return out + (out ? '\r\n ' : '') + cur
}

function serialize(lines: string[]): string {
  return lines.map(foldLine).join('\r\n')
}

export interface IcsOptions {
  schedule: boolean
  deadlines: boolean
}

/** Baut einen kompletten iCalendar-String aus Stundenplan + Deadlines. */
export function buildICS(
  semester: Semester,
  courses: Course[],
  tasks: Task[],
  opts: IcsOptions,
): string {
  const now = fmtUTC(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SemBan//Semester-Kanban//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:SemBan – ${esc(semester.name)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
  ]

  if (opts.schedule) lines.push(...VTIMEZONE_BERLIN)

  // Stundenplan: wöchentlich wiederkehrende Termine (lokale Zeit, DST-sicher)
  if (opts.schedule) {
    for (const course of courses) {
      for (const slot of course.slots) {
        const start = withTime(dateForWeekday(semester, 1, slot.weekday), slot.start)
        const end = withTime(dateForWeekday(semester, 1, slot.weekday), slot.end)
        lines.push(
          'BEGIN:VEVENT',
          `UID:${course.id}-${slot.id}@semban.de`,
          `DTSTAMP:${now}`,
          `DTSTART;TZID=Europe/Berlin:${fmtLocal(start)}`,
          `DTEND;TZID=Europe/Berlin:${fmtLocal(end)}`,
          `RRULE:FREQ=WEEKLY;COUNT=${semester.weeks}`,
          `SUMMARY:${esc(`${course.short} – ${slotKindLabel(slot.kind)}`)}`,
          ...(slot.room ? [`LOCATION:${esc(slot.room)}`] : []),
          `DESCRIPTION:${esc(course.name)}`,
          'END:VEVENT',
        )
      }
    }
  }

  // Deadlines: Abgaben/Aufgaben mit Datum
  if (opts.deadlines) {
    const byId = new Map(courses.map((c) => [c.id, c]))
    for (const t of tasks) {
      if (!t.dueDate) continue
      const start = new Date(t.dueDate)
      const end = new Date(start.getTime() + 30 * 60000)
      const course = t.courseId ? byId.get(t.courseId) : undefined
      const summary = `${TASK_TYPES[t.type].emoji} ${t.title}${course ? ` (${course.short})` : ''}`
      lines.push(
        'BEGIN:VEVENT',
        `UID:${t.id}@semban.de`,
        `DTSTAMP:${now}`,
        `DTSTART:${fmtUTC(start)}`,
        `DTEND:${fmtUTC(end)}`,
        `SUMMARY:${esc(summary)}`,
        ...(t.notes ? [`DESCRIPTION:${esc(t.notes)}`] : []),
        // Deadlines blockieren den Kalender nicht als „belegt".
        'TRANSP:TRANSPARENT',
        'CATEGORIES:SemBan,Abgabe',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Erinnerung',
        'TRIGGER:-P1D',
        'END:VALARM',
        'END:VEVENT',
      )
    }
  }

  lines.push('END:VCALENDAR')
  return serialize(lines)
}

/** Löst einen Datei-Download des iCalendar-Strings aus. */
export function downloadICS(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------- Import ----------

export interface ParsedEvent {
  summary: string
  description?: string
  location?: string
  start: Date
  end: Date | null
  /** Ganztags-Termin (DATE ohne Uhrzeit). */
  allDay: boolean
  /** Wöchentlich wiederkehrend (RRULE FREQ=WEEKLY). */
  weekly: boolean
  /** Wochentage (1=Mo … 7=So) – bei RRULE BYDAY ggf. mehrere. */
  weekdays: number[]
}

function jsToWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

const DAY_CODES: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 }

/** Wochentage aus RRULE BYDAY (z.B. "MO,WE,FR"); Fallback = Wochentag des Starts. */
function rruleWeekdays(rrule: string, fallback: number): number[] {
  const m = rrule.match(/BYDAY=([^;]+)/i)
  if (!m) return [fallback]
  const days = m[1]
    .split(',')
    .map((s) => s.replace(/^[+-]?\d+/, '').trim().toUpperCase()) // "1MO" → "MO"
    .map((code) => DAY_CODES[code])
    .filter((n): n is number => !!n)
  return days.length ? Array.from(new Set(days)) : [fallback]
}

/** Veranstaltungsart (Stundenplan) aus dem Titel ableiten. */
function classifyKind(summary: string): SlotKind {
  const t = summary.toLowerCase()
  if (/tutor/.test(t)) return 'tutorium'
  if (/übung|uebung|ubung|exercise/.test(t)) return 'uebung'
  if (/seminar/.test(t)) return 'seminar'
  if (/praktik|practical|\blab\b/.test(t)) return 'praktikum'
  if (/repetitor/.test(t)) return 'repetitorium'
  if (/kolloqu/.test(t)) return 'kolloquium'
  if (/klausur|prüfung|pruefung|\bexam\b/.test(t)) return 'klausur'
  return 'vorlesung'
}

/** Aufgabentyp (Deadline) aus dem Titel ableiten. */
function classifyTaskType(summary: string): TaskTypeId {
  const t = summary.toLowerCase()
  if (/klausur|prüfung|pruefung|\bexam\b|\btest\b/.test(t)) return 'klausur'
  if (/referat|vortrag|präsentation|presentation/.test(t)) return 'referat'
  if (/hausarbeit|seminararbeit|essay|\bpaper\b|term ?paper/.test(t)) return 'hausarbeit'
  if (/abgabe|übung|uebung|blatt|sheet|assignment|hausaufgabe|deadline|fällig/.test(t)) return 'uebung'
  return 'sonstiges'
}

/** Parst "20260413T100000" / "...Z" / mit TZID in ein lokales Date. */
function parseDt(value: string): Date | null {
  const m = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?/)
  if (!m) return null
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  return new Date(+y, +mo - 1, +d, +h, +mi, +s)
}

function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

/** Entfaltet (RFC 5545 line folding) und parst VEVENTs eines iCalendar-Texts. */
export function parseICS(text: string): ParsedEvent[] {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  const events: ParsedEvent[] = []
  let cur: Record<string, string> | null = null

  for (const line of unfolded.split('\n')) {
    if (line.startsWith('BEGIN:VEVENT')) cur = {}
    else if (line.startsWith('END:VEVENT')) {
      if (cur) {
        const dtStart = cur['DTSTART']
        const start = dtStart ? parseDt(dtStart) : null
        if (start) {
          const end = cur['DTEND'] ? parseDt(cur['DTEND']) : null
          const allDay = !/T\d{2}/.test(dtStart)
          const rrule = cur['RRULE'] ?? ''
          const weekly = /FREQ=WEEKLY/i.test(rrule)
          events.push({
            summary: unescapeText(cur['SUMMARY'] ?? 'Termin').trim() || 'Termin',
            description: cur['DESCRIPTION'] ? unescapeText(cur['DESCRIPTION']) : undefined,
            location: cur['LOCATION'] ? unescapeText(cur['LOCATION']) : undefined,
            start,
            end,
            allDay,
            weekly,
            weekdays: weekly ? rruleWeekdays(rrule, jsToWeekday(start)) : [jsToWeekday(start)],
          })
        }
      }
      cur = null
    } else if (cur) {
      const idx = line.indexOf(':')
      if (idx > 0) {
        const key = line.slice(0, idx).split(';')[0] // Parameter ignorieren
        cur[key] = line.slice(idx + 1)
      }
    }
  }
  return events
}

// ---------- Import-Plan (Kurse + Deadlines, mit Zusammenführung) ----------

export interface PlannedCourse {
  key: string
  name: string
  short: string
  color: string
  slots: CourseSlot[]
  /** Gesetzt, wenn die Slots einem bestehenden Kurs hinzugefügt werden. */
  existingId?: string
}

export interface PlannedDeadline {
  key: string
  title: string
  type: TaskTypeId
  dueDate: string // ISO
  courseId?: string
  allDay: boolean
}

export interface ImportPlan {
  courses: PlannedCourse[]
  deadlines: PlannedDeadline[]
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

function makeShort(name: string): string {
  const short = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 5)
    .toUpperCase()
  return short || name.slice(0, 4).toUpperCase()
}

const slotSig = (s: { weekday: number; start: string; end: string }) =>
  `${s.weekday}|${s.start}|${s.end}`

/**
 * Macht aus geparsten Events einen Import-Plan:
 *  - wöchentliche Termine → Kurse mit Stundenplan-Slots (bestehende Kurse werden
 *    ergänzt statt dupliziert; identische Slots werden ausgelassen),
 *  - Einzeltermine & Ganztags-Termine → Deadlines/Aufgaben (Klausuren, Abgaben …).
 */
export function planImport(
  events: ParsedEvent[],
  _semester: Semester,
  existingCourses: Course[],
  existingTasks: Task[] = [],
): ImportPlan {
  const recurring = events.filter((e) => e.weekly && !e.allDay)
  const oneoff = events.filter((e) => !e.weekly)

  // Farben, die schon vergeben sind, möglichst meiden.
  const usedColors = new Set(existingCourses.map((c) => c.color))
  const freeColors = PALETTE.filter((c) => !usedColors.has(c))
  const colorAt = (i: number) =>
    (freeColors.length ? freeColors : PALETTE)[i % (freeColors.length || PALETTE.length)]

  // --- Kurse aus wöchentlichen Terminen ---
  const groups = new Map<string, ParsedEvent[]>()
  for (const e of recurring) {
    const base = e.summary.split(/[-–(|]/)[0].trim() || e.summary.trim()
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push(e)
  }

  const courses: PlannedCourse[] = []
  let ci = 0
  for (const [name, evs] of groups) {
    // Slots aus allen Events der Gruppe (RRULE BYDAY → mehrere Wochentage).
    const rawSlots: CourseSlot[] = []
    for (const e of evs) {
      const start = hhmm(e.start)
      const end = e.end ? hhmm(e.end) : hhmm(new Date(e.start.getTime() + 90 * 60000))
      for (const wd of e.weekdays) {
        rawSlots.push({
          id: uid(),
          kind: classifyKind(e.summary),
          weekday: wd,
          start,
          end,
          room: e.location,
        })
      }
    }
    // Innerhalb des Imports doppelte Slots zusammenfassen.
    const seen = new Set<string>()
    let slots = rawSlots.filter((s) => {
      const sig = `${slotSig(s)}|${s.kind}`
      if (seen.has(sig)) return false
      seen.add(sig)
      return true
    })

    // Bestehenden Kurs erkennen (Name oder Kürzel) → ergänzen statt duplizieren.
    const match = existingCourses.find(
      (c) => norm(c.name) === norm(name) || norm(c.short) === norm(makeShort(name)),
    )
    if (match) {
      const have = new Set(match.slots.map(slotSig))
      slots = slots.filter((s) => !have.has(slotSig(s)))
      if (slots.length === 0) continue // nichts Neues hinzuzufügen
      courses.push({
        key: `c-${ci++}`,
        name: match.name,
        short: match.short,
        color: match.color,
        slots,
        existingId: match.id,
      })
    } else {
      courses.push({
        key: `c-${ci++}`,
        name,
        short: makeShort(name),
        color: colorAt(ci),
        slots,
      })
    }
  }

  // --- Deadlines aus Einzel-/Ganztags-Terminen ---
  const taskDayKey = (title: string, iso: string) =>
    `${norm(title)}|${new Date(iso).toDateString()}`
  const existingTaskKeys = new Set(
    existingTasks.filter((t) => t.dueDate).map((t) => taskDayKey(t.title, t.dueDate!)),
  )

  const deadlines: PlannedDeadline[] = []
  let di = 0
  for (const e of oneoff) {
    const due = e.allDay ? withTime(e.start, '23:59') : e.start
    const iso = due.toISOString()
    if (existingTaskKeys.has(taskDayKey(e.summary, iso))) continue
    // Kurs zuordnen, wenn ein Kürzel/Name im Titel vorkommt.
    const course = existingCourses.find((c) => {
      const s = norm(e.summary)
      return s.includes(norm(c.short)) || s.includes(norm(c.name))
    })
    deadlines.push({
      key: `d-${di++}`,
      title: e.summary,
      type: classifyTaskType(e.summary),
      dueDate: iso,
      courseId: course?.id,
      allDay: e.allDay,
    })
  }

  return { courses, deadlines }
}
