import type { Course, CourseSlot, SlotKind, Semester, Task, TaskTypeId } from '@/db/types'
import { uid } from '@/db/db'
import { dateForWeekday, withTime } from './semester'
import { toMin } from './schedule'
import { slotKindLabel } from './slotKinds'
import { TASK_TYPES } from './taskTypes'

export const COURSE_COLORS = [
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
  // \r\n | \r | \n allesamt zu literalem \n – ein roher CR mitten in einer
  // Content-Zeile ist laut RFC 5545 ungültig (strenge Parser brechen ab).
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
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
      const course = t.courseId ? byId.get(t.courseId) : undefined
      const summary = `${TASK_TYPES[t.type].emoji} ${t.title}${course ? ` (${course.short})` : ''}`
      const bp = berlinParts(start)
      // Datum-Fristen werden als Tagesende (23:59 lokal) gespeichert → als
      // Ganztags-Banner ausgeben (wie im Kalender-Abo), nicht als 23:59-Termin.
      const allDay = bp.hour === 23 && bp.min >= 58
      const common = [
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
      ]
      if (allDay) {
        lines.push(
          'BEGIN:VEVENT',
          `UID:${t.id}@semban.de`,
          `DTSTAMP:${now}`,
          `DTSTART;VALUE=DATE:${icsDate(bp)}`,
          `DTEND;VALUE=DATE:${icsNextDay(bp)}`,
          ...common,
        )
      } else {
        const end = new Date(start.getTime() + 30 * 60000)
        lines.push(
          'BEGIN:VEVENT',
          `UID:${t.id}@semban.de`,
          `DTSTAMP:${now}`,
          `DTSTART:${fmtUTC(start)}`,
          `DTEND:${fmtUTC(end)}`,
          ...common,
        )
      }
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
// Für UTC-Zeiten (Z-Suffix) die Wandzeit in Europe/Berlin bestimmen – sonst
// landet ein importierter Termin auf der MASCHINEN-Zeitzone (falsche Uhrzeit
// außerhalb DE). Floating-Zeiten (ohne Z) bleiben unverändert literal.
const BERLIN_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Berlin-Wandzeit-Bestandteile eines Instants (für die Ganztags-Erkennung von
 *  Deadlines – konsistent mit dem Kalender-Abo, das 23:59-Fristen als Ganztags-
 *  Banner ausgibt statt als 23:59-Termin). */
function berlinParts(d: Date): { y: number; m: number; d: number; hour: number; min: number } {
  const p = Object.fromEntries(BERLIN_PARTS.formatToParts(d).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour % 24, min: +p.minute }
}
/** YYYYMMDD (iCalendar DATE) aus Berlin-Bestandteilen. */
function icsDate(bp: { y: number; m: number; d: number }): string {
  return `${bp.y}${pad(bp.m)}${pad(bp.d)}`
}
/** Folgetag als YYYYMMDD (exklusives DTEND für Ganztags-Events). */
function icsNextDay(bp: { y: number; m: number; d: number }): string {
  const dt = new Date(Date.UTC(bp.y, bp.m - 1, bp.d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`
}

function parseDt(value: string): Date | null {
  const m = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?/)
  if (!m) return null
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m
  if (z) {
    const inst = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    const p = Object.fromEntries(BERLIN_PARTS.formatToParts(inst).map((x) => [x.type, x.value]))
    // Maschinen-lokale Date mit den Berlin-Wandzeit-Komponenten – getHours()/
    // getDay() liefern dann die Berlin-Werte (wie die App sie erwartet).
    return new Date(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  }
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
  /** Bereinigter Anzeigename (ohne Veranstaltungsnummer/Zusätze). */
  name: string
  /** Kürzel-Vorschlag (vom Nutzer überschreibbar). */
  suggestedShort: string
  slots: CourseSlot[]
  /** Bester automatischer Treffer unter den bestehenden Kursen (Kurs-ID). */
  autoMatchId?: string
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

/** Schlüssel „Titel|Kalendertag" – identifiziert eine Deadline über Importe
 *  hinweg (auch für die „schon gesehen"-Liste abonnierter Feeds). */
export const deadlineKey = (title: string, iso: string) =>
  `${norm(title)}|${new Date(iso).toDateString()}`

/** Fälligkeit eines Einzel-/Ganztags-Termins (Ganztag = Tagesende 23:59,
 *  App-Konvention – identisch zur Deadline-Ableitung in planImport). */
const dueOf = (e: ParsedEvent): Date => (e.allDay ? withTime(e.start, '23:59') : e.start)

/** Schlüssel ALLER Einzel-/Ganztags-Termine eines Kalenders – für abonnierte
 *  Feeds: einmal Gesehenes wird nie erneut importiert, selbst wenn der Nutzer
 *  die daraus entstandene Aufgabe gelöscht hat. */
export function deadlineKeysOf(events: ParsedEvent[]): string[] {
  return events.filter((e) => !e.weekly || e.allDay).map((e) => deadlineKey(e.summary, dueOf(e).toISOString()))
}

const ROMAN: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
}

/**
 * Bereinigter Anzeigename: führende Veranstaltungsnummer und Klammer-/Gruppen-/
 * Art-Zusätze entfernen (z.B. "040120 Analysis II (Vorlesung) - Gr. 3" → "Analysis II").
 */
function cleanCourseName(raw: string): string {
  let s = raw.replace(/^\s*[\dA-Z]{0,3}\d{3,}[\s.:–-]*/, '') // führende Nummer (auch "INF1234")
  s = s.replace(/\([^)]*\)/g, ' ') // Klammer-Zusätze
  s = s.split(/\s[-–|]\s/)[0] // alles ab " - " / " | " (Gruppe/Art)
  s = s.replace(/\s+/g, ' ').trim()
  return s || raw.replace(/\s+/g, ' ').trim()
}

/** Normalisierter Schlüssel für den Abgleich: Diakritika, Umlaute, römische Ziffern. */
function matchKey(name: string): string {
  return cleanCourseName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Diakritika (auch ä→a, ü→u, ö→o)
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .map((tok) => ROMAN[tok] ?? tok)
    .join('')
}

function makeShort(name: string): string {
  const short = cleanCourseName(name)
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
  // Ganztägige Termine sind Deadlines – auch wenn sie als wöchentlich markiert
  // sind (sonst fielen sie durch beide Filter und gingen verloren).
  const oneoff = events.filter((e) => !e.weekly || e.allDay)

  // Bestehende Kurse nach Match-Schlüssel + Kürzel indexieren (für Auto-Treffer).
  const byKey = new Map<string, Course>()
  const byShort = new Map<string, Course>()
  for (const c of existingCourses) {
    byKey.set(matchKey(c.name), c)
    if (c.short) byShort.set(norm(c.short), c)
  }

  // --- Kurse aus wöchentlichen Terminen ---
  // Gruppierung über den normalisierten Schlüssel: Mo- und Do-Termin desselben
  // Kurses landen zusammen, auch bei leicht abweichenden Titel-Zusätzen.
  const groups = new Map<string, { display: string; evs: ParsedEvent[] }>()
  for (const e of recurring) {
    const k = matchKey(e.summary) || norm(e.summary)
    if (!groups.has(k)) groups.set(k, { display: cleanCourseName(e.summary), evs: [] })
    groups.get(k)!.evs.push(e)
  }

  const courses: PlannedCourse[] = []
  let ci = 0
  for (const [k, { display, evs }] of groups) {
    // Slots aus allen Events der Gruppe (RRULE BYDAY → mehrere Wochentage).
    const rawSlots: CourseSlot[] = []
    for (const e of evs) {
      const start = hhmm(e.start)
      // Ohne DTEND 90 Min annehmen, aber nicht über Mitternacht (sonst end<start).
      let end = e.end ? hhmm(e.end) : hhmm(new Date(e.start.getTime() + 90 * 60000))
      if (toMin(end) <= toMin(start)) end = '23:59'
      for (const wd of e.weekdays) {
        rawSlots.push({ id: uid(), kind: classifyKind(e.summary), weekday: wd, start, end, room: e.location })
      }
    }
    // Innerhalb des Imports doppelte Slots zusammenfassen.
    const seen = new Set<string>()
    const slots = rawSlots.filter((s) => {
      const sig = `${slotSig(s)}|${s.kind}`
      if (seen.has(sig)) return false
      seen.add(sig)
      return true
    })

    // Auto-Treffer: gleicher Match-Schlüssel ODER gleiches Kürzel.
    const match = byKey.get(k) ?? byShort.get(norm(makeShort(display)))

    // Re-Import-Idempotenz: matcht ein bestehender Kurs und alle Slots sind
    // schon vorhanden → nichts zu tun, gar nicht erst anzeigen.
    if (match) {
      const have = new Set(match.slots.map(slotSig))
      if (slots.every((s) => have.has(slotSig(s)))) continue
    }

    courses.push({
      key: `c-${ci++}`,
      name: display,
      suggestedShort: match?.short || makeShort(display),
      slots,
      autoMatchId: match?.id,
    })
  }

  // --- Deadlines aus Einzel-/Ganztags-Terminen ---
  const existingTaskKeys = new Set(
    existingTasks.filter((t) => t.dueDate).map((t) => deadlineKey(t.title, t.dueDate!)),
  )

  const deadlines: PlannedDeadline[] = []
  let di = 0
  for (const e of oneoff) {
    const iso = dueOf(e).toISOString()
    if (existingTaskKeys.has(deadlineKey(e.summary, iso))) continue
    // Kurs zuordnen, wenn der (volle) Name vorkommt oder das Kürzel als
    // eigenes Wort auftaucht – kurze Kürzel wie „E"/„MA" sollen nicht jeden
    // Titel matchen.
    const words = new Set(norm(e.summary).split(/[^a-z0-9äöüß]+/i).filter(Boolean))
    const course = existingCourses.find((c) => {
      const s = norm(e.summary)
      const short = norm(c.short)
      const byName = c.name.length >= 4 && s.includes(norm(c.name))
      const byShort = short.length >= 2 && words.has(short)
      return byName || byShort
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
