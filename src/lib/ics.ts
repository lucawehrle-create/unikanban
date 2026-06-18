import type { Course, Semester, Task } from '@/db/types'
import { uid } from '@/db/db'
import { dateForWeekday, withTime } from './semester'
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

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

const KIND_LABEL = { vorlesung: 'Vorlesung', tutorium: 'Tutorium' } as const

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
    'PRODID:-//UniKanban//Semesterbegleiter//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:UniKanban – ${esc(semester.name)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
  ]

  // Stundenplan: wöchentlich wiederkehrende Termine
  if (opts.schedule) {
    for (const course of courses) {
      for (const slot of course.slots) {
        const start = withTime(dateForWeekday(semester, 1, slot.weekday), slot.start)
        const end = withTime(dateForWeekday(semester, 1, slot.weekday), slot.end)
        lines.push(
          'BEGIN:VEVENT',
          `UID:${course.id}-${slot.id}@unikanban`,
          `DTSTAMP:${now}`,
          `DTSTART:${fmtUTC(start)}`,
          `DTEND:${fmtUTC(end)}`,
          `RRULE:FREQ=WEEKLY;COUNT=${semester.weeks}`,
          `SUMMARY:${esc(`${course.short} – ${KIND_LABEL[slot.kind]}`)}`,
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
        `UID:${t.id}@unikanban`,
        `DTSTAMP:${now}`,
        `DTSTART:${fmtUTC(start)}`,
        `DTEND:${fmtUTC(end)}`,
        `SUMMARY:${esc(summary)}`,
        ...(t.notes ? [`DESCRIPTION:${esc(t.notes)}`] : []),
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
  return lines.join('\r\n')
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

interface ParsedEvent {
  summary: string
  weekday: number // 1=Mo … 7=So
  start: string // "HH:mm"
  end: string
  room?: string
  weekly: boolean
}

function jsToWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
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
        const dtEnd = cur['DTEND']
        const start = dtStart ? parseDt(dtStart) : null
        const end = dtEnd ? parseDt(dtEnd) : null
        if (start) {
          events.push({
            summary: (cur['SUMMARY'] ?? 'Termin').replace(/\\,/g, ',').replace(/\\;/g, ';'),
            weekday: jsToWeekday(start),
            start: hhmm(start),
            end: end ? hhmm(end) : hhmm(new Date(start.getTime() + 90 * 60000)),
            room: cur['LOCATION']?.replace(/\\,/g, ','),
            weekly: (cur['RRULE'] ?? '').includes('FREQ=WEEKLY'),
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

/**
 * Wandelt geparste Events in Kurse mit Stundenplan-Slots um.
 * Gleicher SUMMARY-Stamm → ein Kurs (mehrere Termine → mehrere Slots).
 */
export function eventsToCourses(events: ParsedEvent[], semesterId: string): Course[] {
  const groups = new Map<string, ParsedEvent[]>()
  for (const e of events) {
    // Stamm = Titel ohne Klammerzusätze/Gruppen-Nummern
    const base = e.summary.split(/[-–(]/)[0].trim() || e.summary.trim()
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push(e)
  }

  let i = 0
  const courses: Course[] = []
  for (const [name, evs] of groups) {
    const short = name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 5)
      .toUpperCase()
    courses.push({
      id: uid(),
      semesterId,
      name,
      short: short || name.slice(0, 4).toUpperCase(),
      color: PALETTE[i % PALETTE.length],
      slots: evs.map((e) => ({
        id: uid(),
        kind: /tut|übung|ubung|practice/i.test(e.summary) ? 'tutorium' : 'vorlesung',
        weekday: e.weekday,
        start: e.start,
        end: e.end,
        room: e.room,
      })),
    })
    i++
  }
  return courses
}
