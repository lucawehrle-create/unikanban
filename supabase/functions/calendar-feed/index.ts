// SemBan – Kalender-Abo (webcal). Liefert pro Geheim-Token einen stets
// aktuellen iCalendar-Feed des aktiven Semesters (Stundenplan + Deadlines).
//
// Aufruf:  GET /functions/v1/calendar-feed?token=<token>
// Ablauf:  Token → user_id (Service-Role) → user_data.data → ICS bauen.
//
// WICHTIG: Diese Function muss OHNE JWT-Prüfung deployt werden, da Kalender-
// Apps keinen Authorization-Header senden:
//   supabase functions deploy calendar-feed --no-verify-jwt
// (oder [functions.calendar-feed] verify_jwt = false in supabase/config.toml).

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// --- Datentypen (nur benötigte Felder, vgl. src/db/types.ts) ---------------
interface CourseSlot {
  id: string
  kind: string
  weekday: number // 1 = Mo … 7 = So
  start: string // "10:00"
  end: string // "12:00"
  room?: string
}
interface Course {
  id: string
  semesterId: string
  name: string
  short: string
  slots: CourseSlot[]
}
interface Task {
  id: string
  semesterId: string
  courseId?: string
  type: string
  title: string
  dueDate?: string
  notes?: string
}
interface ExamPhase {
  id: string
  label: string
  start: string // "YYYY-MM-DD"
  end: string // "YYYY-MM-DD"
}
interface Semester {
  id: string
  name: string
  startDate: string // "YYYY-MM-DD"
  weeks: number
  examPhases?: ExamPhase[]
  active?: boolean
}
interface UserData {
  semesters?: Semester[]
  courses?: Course[]
  tasks?: Task[]
}

const SLOT_LABELS: Record<string, string> = {
  vorlesung: 'Vorlesung',
  uebung: 'Übung',
  tutorium: 'Tutorium',
  seminar: 'Seminar',
  praktikum: 'Praktikum',
  repetitorium: 'Repetitorium',
  kolloquium: 'Kolloquium',
  klausur: 'Klausur',
}
const TASK_EMOJI: Record<string, string> = {
  uebung: '📄',
  tutoriumsblatt: '📑',
  hausarbeit: '📝',
  referat: '🎤',
  lektuere: '📖',
  klausur: '🎓',
  sonstiges: '•',
}

// --- iCalendar-Helfer (server-TZ-unabhängig: konsequent UTC-Komponenten) ----
const pad = (n: number) => String(n).padStart(2, '0')

function fmtUTC(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}
// Wandzeit (ohne Z) für TZID-gebundene Termine – aus UTC-Komponenten gelesen,
// damit das Ergebnis nicht von der Server-Zeitzone abhängt.
function fmtLocal(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  )
}

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

// RFC 5545: max. 75 Oktette pro Zeile, sonst falten (Folgezeile mit Leerzeichen).
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
      limit = 74
    } else {
      cur += ch
      curBytes += b
    }
  }
  return out + (out ? '\r\n ' : '') + cur
}
const serialize = (lines: string[]) => lines.map(foldLine).join('\r\n')

// Datum für (Woche 1, Wochentag) aus startDate – reine UTC-Arithmetik.
function dateForWeekday(startDate: string, weekday: number): Date {
  const [y, m, d] = startDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + (weekday - 1) * 86400000)
}
function withTime(date: Date, time: string): Date {
  const [h, mi] = time.split(':').map(Number)
  const d = new Date(date)
  d.setUTCHours(h || 0, mi || 0, 0, 0)
  return d
}

// Kalenderdatum + Uhrzeit eines Instants in Europe/Berlin (für Ganztags-Logik).
function berlinYmdHm(iso: string): { ymd: string; hour: number; min: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  let hour = parseInt(g('hour'), 10)
  if (hour === 24) hour = 0
  return { ymd: `${g('year')}${g('month')}${g('day')}`, hour, min: parseInt(g('minute'), 10) }
}

// 'YYYY-MM-DD' (ggf. mit Zeitanteil) → 'YYYYMMDD'.
const toYmd = (s: string) => s.slice(0, 10).replace(/-/g, '')

// Folgetag von 'YYYYMMDD' (DTEND ist bei Ganztags-Terminen exklusiv).
function nextDayYmd(ymd: string): string {
  const dt = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) + 86400000)
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`
}

function buildICS(semester: Semester, courses: Course[], tasks: Task[]): string {
  const now = fmtUTC(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SemBan//Semester-Kanban//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:SemBan – ${esc(semester.name)}`,
    `NAME:SemBan – ${esc(semester.name)}`,
    'X-WR-CALDESC:Stundenplan, Abgaben & Klausurphasen aus SemBan',
    'X-WR-TIMEZONE:Europe/Berlin',
    // Brand-Farbe für abonnierende Apple-Kalender.
    'X-APPLE-CALENDAR-COLOR:#F7C948',
    // Aktualisierungs-Intervall für abonnierende Kalender (Hinweis).
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    ...VTIMEZONE_BERLIN,
  ]

  // Stundenplan: wöchentlich wiederkehrend (lokale Zeit, DST-sicher).
  for (const course of courses) {
    for (const slot of course.slots) {
      const start = withTime(dateForWeekday(semester.startDate, slot.weekday), slot.start)
      const end = withTime(dateForWeekday(semester.startDate, slot.weekday), slot.end)
      const label = SLOT_LABELS[slot.kind] ?? slot.kind
      lines.push(
        'BEGIN:VEVENT',
        `UID:${course.id}-${slot.id}@semban.de`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=Europe/Berlin:${fmtLocal(start)}`,
        `DTEND;TZID=Europe/Berlin:${fmtLocal(end)}`,
        `RRULE:FREQ=WEEKLY;COUNT=${semester.weeks}`,
        // Voller Kursname + Art = im Kalender sofort erkennbar.
        `SUMMARY:${esc(`${course.name} · ${label}`)}`,
        ...(slot.room ? [`LOCATION:${esc(slot.room)}`] : []),
        'CATEGORIES:SemBan,Stundenplan',
        'STATUS:CONFIRMED',
        'END:VEVENT',
      )
    }
  }

  // Deadlines: „bis Ende des Tages" → saubere Ganztags-Banner; Abgaben mit
  // konkreter Uhrzeit bleiben terminiert (kurzer Block + Erinnerung am Vortag).
  const byId = new Map(courses.map((c) => [c.id, c]))
  for (const t of tasks) {
    if (!t.dueDate) continue
    const inst = new Date(t.dueDate)
    if (isNaN(inst.getTime())) continue
    const course = t.courseId ? byId.get(t.courseId) : undefined
    const emoji = TASK_EMOJI[t.type] ?? '•'
    const summary = `${emoji} ${t.title}${course ? ` (${course.short})` : ''}`
    const { ymd, hour, min } = berlinYmdHm(t.dueDate)
    const endOfDay = (hour === 23 && min >= 58) || (hour === 0 && min === 0)
    const common = [
      `SUMMARY:${esc(summary)}`,
      ...(t.notes ? [`DESCRIPTION:${esc(t.notes)}`] : []),
      'TRANSP:TRANSPARENT',
      'CATEGORIES:SemBan,Abgabe',
      'STATUS:CONFIRMED',
    ]
    if (endOfDay) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${t.id}@semban.de`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${ymd}`,
        `DTEND;VALUE=DATE:${nextDayYmd(ymd)}`,
        ...common,
        // Erinnerung am Vortag (15:00).
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Erinnerung',
        'TRIGGER:-PT9H',
        'END:VALARM',
        'END:VEVENT',
      )
    } else {
      const end = new Date(inst.getTime() + 30 * 60000)
      lines.push(
        'BEGIN:VEVENT',
        `UID:${t.id}@semban.de`,
        `DTSTAMP:${now}`,
        `DTSTART:${fmtUTC(inst)}`,
        `DTEND:${fmtUTC(end)}`,
        ...common,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Erinnerung',
        'TRIGGER:-P1D',
        'END:VALARM',
        'END:VEVENT',
      )
    }
  }

  // Klausurphasen: mehrtägige Ganztags-Banner – gibt der Prüfungszeit im
  // Kalender sofort Kontur.
  for (const ph of semester.examPhases ?? []) {
    if (!ph.start || !ph.end) continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:exam-${ph.id}@semban.de`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${toYmd(ph.start)}`,
      `DTEND;VALUE=DATE:${nextDayYmd(toYmd(ph.end))}`,
      `SUMMARY:${esc(`🎓 ${ph.label}`)}`,
      'TRANSP:TRANSPARENT',
      'CATEGORIES:SemBan,Klausurphase',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return serialize(lines)
}

// Aktives Semester wählen: explizit aktiv, sonst das mit dem spätesten Start.
function pickSemester(semesters: Semester[]): Semester | undefined {
  if (semesters.length === 0) return undefined
  return (
    semesters.find((s) => s.active) ??
    [...semesters].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0]
  )
}

const calHeaders = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Content-Disposition': 'inline; filename="semban.ics"',
  'Cache-Control': 'public, max-age=3600',
  'Access-Control-Allow-Origin': '*',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }
  const token = new URL(req.url).searchParams.get('token')?.trim()
  if (!token) return new Response('Missing token', { status: 400 })

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const { data: tok } = await supabase
      .from('calendar_tokens')
      .select('user_id')
      .eq('token', token)
      .maybeSingle()
    if (!tok) return new Response('Unknown token', { status: 404 })

    const { data: udRow } = await supabase
      .from('user_data')
      .select('data')
      .eq('user_id', tok.user_id)
      .maybeSingle()
    const data = (udRow?.data ?? {}) as UserData

    const semester = pickSemester(data.semesters ?? [])
    if (!semester) {
      // Leerer, aber gültiger Kalender, damit das Abo nicht „kaputt" wirkt.
      const empty = serialize([
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SemBan//Semester-Kanban//DE',
        'X-WR-CALNAME:SemBan',
        'END:VCALENDAR',
      ])
      return new Response(empty, { headers: calHeaders })
    }

    const courses = (data.courses ?? []).filter((c) => c.semesterId === semester.id)
    const tasks = (data.tasks ?? []).filter((t) => t.semesterId === semester.id)
    const ics = buildICS(semester, courses, tasks)
    return new Response(ics, { headers: calHeaders })
  } catch (err) {
    console.error('calendar-feed failed', err)
    return new Response('Internal error', { status: 500 })
  }
})
