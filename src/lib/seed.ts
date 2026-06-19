import { addDays, addWeeks, format, startOfWeek } from 'date-fns'
import { db, uid } from '@/db/db'
import type { Attendance, Course, Program, Semester, Task } from '@/db/types'
import { makePhases } from './taskTypes'
import { generateRecurringTasks } from './recurring'
import { attendanceKey } from './actions'
import { dateForWeekday, withTime } from './semester'

// Dedupe nur gegen StrictMode-Doppelaufruf / parallele Aufrufe – nach Abschluss
// wird der Merker gelöscht, damit nach einem Reset erneut geseedet werden kann.
let seedPromise: Promise<void> | null = null

/** Legt einmalig ein Demo-Studium an, falls die DB leer ist. */
export function seedIfEmpty(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = doSeed().finally(() => {
    seedPromise = null
  })
  return seedPromise
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

async function doSeed(): Promise<void> {
  if ((await db.programs.count()) > 0) return

  // Das Demo-Semester wird um HEUTE herum verankert, damit das Board beim
  // ersten Öffnen lebendig wirkt: Woche 1 liegt hinter uns (= erledigt),
  // diese Woche läuft, der Rest steht an.
  const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const start = addWeeks(thisMonday, -1) // heute landet in Woche 2
  const lectureWeeks = 14

  // Realistischen Semesternamen aus dem Startmonat ableiten (Apr–Sep = Sommer).
  const m = start.getMonth() // 0=Jan … 11=Dez
  const y = start.getFullYear()
  const semName =
    m >= 3 && m <= 8 ? `SoSe ${y}` : `WiSe ${m >= 9 ? y : y - 1}/${String((m >= 9 ? y + 1 : y) % 100).padStart(2, '0')}`

  // Quereinstieg-Szenario: schon 2 Semester (60 ECTS, Schnitt 2,1) absolviert.
  const program: Program = {
    id: uid(),
    name: 'B.Sc. Informatik',
    type: 'bachelor',
    targetEcts: 180,
    priorEcts: 60,
    priorGradeAvg: 2.1,
    priorGradedEcts: 60,
    active: true,
    order: 0,
    createdAt: new Date().toISOString(),
  }

  const semester: Semester = {
    id: uid(),
    programId: program.id,
    name: semName,
    startDate: iso(start),
    weeks: lectureWeeks,
    examPhases: [
      {
        id: uid(),
        label: '1. Klausurenphase',
        start: iso(addWeeks(start, lectureWeeks)),
        end: iso(addDays(addWeeks(start, lectureWeeks), 12)),
      },
      {
        id: uid(),
        label: '2. Klausurenphase',
        start: iso(addWeeks(start, lectureWeeks + 5)),
        end: iso(addDays(addWeeks(start, lectureWeeks + 5), 5)),
      },
    ],
    endDate: iso(addWeeks(start, lectureWeeks + 10)),
    active: true,
  }

  const courses: Course[] = [
    {
      id: uid(),
      semesterId: semester.id,
      name: 'Analysis II',
      short: 'ANA2',
      color: '#6366f1',
      ects: 9,
      slots: [
        { id: uid(), kind: 'vorlesung', weekday: 1, start: '10:00', end: '12:00', room: 'HS 1' },
        { id: uid(), kind: 'vorlesung', weekday: 3, start: '10:00', end: '12:00', room: 'HS 1' },
        { id: uid(), kind: 'uebung', weekday: 4, start: '14:00', end: '16:00', room: 'SR 7' },
      ],
      recurring: [
        {
          id: uid(),
          type: 'uebung',
          labelPrefix: 'Übungsblatt',
          weekday: 5, // Freitag
          time: '12:00',
          count: 12,
          startWeek: 1,
          maxPoints: 40,
        },
      ],
    },
    {
      id: uid(),
      semesterId: semester.id,
      name: 'Theoretische Informatik',
      short: 'THEO',
      color: '#0ea5e9',
      ects: 6,
      slots: [
        { id: uid(), kind: 'vorlesung', weekday: 2, start: '08:00', end: '10:00', room: 'HS 3' },
        { id: uid(), kind: 'uebung', weekday: 3, start: '14:00', end: '16:00', room: 'SR 4' },
        { id: uid(), kind: 'tutorium', weekday: 5, start: '10:00', end: '12:00', room: 'SR 2' },
      ],
      // Zwei Serien: Übungsblatt UND Tutoriumsblatt (zeigt Mehrfach-Serien)
      recurring: [
        {
          id: uid(),
          type: 'uebung',
          labelPrefix: 'Übungsblatt',
          weekday: 3, // Mittwoch
          time: '14:00',
          count: 12,
          startWeek: 1,
          maxPoints: 20,
        },
        {
          id: uid(),
          type: 'tutoriumsblatt',
          labelPrefix: 'Tutoriumsblatt',
          weekday: 5, // Freitag
          time: '10:00',
          count: 12,
          startWeek: 1,
          maxPoints: 10,
        },
      ],
    },
    {
      id: uid(),
      semesterId: semester.id,
      name: 'Proseminar Ethik',
      short: 'ETHIK',
      color: '#10b981',
      ects: 5,
      slots: [
        { id: uid(), kind: 'vorlesung', weekday: 4, start: '16:00', end: '18:00', room: 'SR 12' },
      ],
      recurring: [
        {
          id: uid(),
          type: 'lektuere',
          labelPrefix: 'Lektüre Woche',
          weekday: 4, // Donnerstag (zur Sitzung)
          time: '16:00',
          count: 12,
          startWeek: 1,
        },
      ],
    },
  ]

  const now = new Date().toISOString()
  const ana = courses[0]
  const theo = courses[1]
  const ethik = courses[2]
  const anaUbId = ana.recurring![0].id

  // --- Serien-Aufgaben erzeugen und einen sinnvollen Anfangszustand setzen ---
  // Woche 1 (letzte Woche) ist abgehakt, das aktuelle ANA2-Blatt liegt "in Arbeit".
  const recurring = courses.flatMap((c) => generateRecurringTasks(c, semester))
  for (const t of recurring) {
    if (t.order === 1) {
      // Erstes Blatt jeder Serie: erledigt → füllt die Spalte "Erledigt".
      t.status = 'erledigt'
      t.phases = t.phases.map((p) => ({ ...p, done: true }))
      t.completedAt = t.dueDate ?? now
      if (t.points?.max) t.points = { max: t.points.max, earned: Math.round(t.points.max * 0.85) }
    } else if (t.recurringId === anaUbId && t.order === 2) {
      // Aktuelles ANA2-Übungsblatt: angefangen → Spalte "Dran".
      t.status = 'dran'
      t.priority = 'hoch'
      if (t.phases[0]) t.phases[0].done = true
    }
  }

  // --- Einzelaufgaben (Hausarbeit, Referat, Klausur) ---
  const oneOff: Task[] = [
    {
      id: uid(),
      semesterId: semester.id,
      courseId: ethik.id,
      type: 'referat',
      title: 'Referat: Kant vs. Mill',
      status: 'dran',
      priority: 'mittel',
      dueDate: withTime(dateForWeekday(semester, 4, 4), '16:00').toISOString(),
      phases: makePhases('referat').map((p, i) => (i < 2 ? { ...p, done: true } : p)),
      notes: '20 Min. + Handout. Folien stehen, noch einmal durchgehen.',
      order: 1,
      createdAt: now,
    },
    {
      id: uid(),
      semesterId: semester.id,
      courseId: ethik.id,
      type: 'hausarbeit',
      title: 'Hausarbeit: Verantwortungsethik',
      status: 'offen',
      priority: 'hoch',
      dueDate: withTime(dateForWeekday(semester, lectureWeeks, 5), '23:59').toISOString(),
      phases: makePhases('hausarbeit'),
      notes: '15 Seiten, Thema mit Dozent abstimmen.',
      order: 2,
      createdAt: now,
    },
    {
      id: uid(),
      semesterId: semester.id,
      courseId: ana.id,
      type: 'klausur',
      title: 'Klausur Analysis II',
      status: 'offen',
      priority: 'hoch',
      dueDate: withTime(addWeeks(start, lectureWeeks), '09:00').toISOString(),
      phases: makePhases('klausur'),
      notes: 'Hilfsmittel: ein A4-Blatt. Altklausuren im Moodle.',
      order: 3,
      createdAt: now,
    },
  ]

  // --- Ein paar Anwesenheiten, damit der Stundenplan nicht leer wirkt ---
  // Sitzungen der vergangenen Woche 1 werden als besucht/vorbereitet markiert.
  const att: Attendance[] = []
  const mark = (slotId: string, week: number, weekday: number, markers: Attendance['markers']) => {
    const date = iso(dateForWeekday(semester, week, weekday))
    att.push({ id: attendanceKey(slotId, date), semesterId: semester.id, slotId, date, markers })
  }
  // Woche 1 (vergangen): als Historie.
  mark(ana.slots[0].id, 1, 1, ['vorbereitet', 'besucht', 'nachbereitet']) // Mo ANA2-VL
  mark(theo.slots[0].id, 1, 2, ['besucht']) // Di THEO-VL
  mark(ana.slots[2].id, 1, 4, ['besucht', 'nachbereitet']) // Do ANA2-Übung
  mark(ethik.slots[0].id, 1, 4, ['nicht_besucht']) // Do Ethik-Seminar verpasst
  // Woche 2 (aktuell): damit der Stundenplan schon beim Öffnen Markierungen zeigt.
  mark(ana.slots[0].id, 2, 1, ['vorbereitet', 'besucht']) // Mo ANA2-VL
  mark(theo.slots[0].id, 2, 2, ['besucht']) // Di THEO-VL

  await db.transaction(
    'rw',
    db.programs,
    db.semesters,
    db.courses,
    db.tasks,
    db.attendance,
    async () => {
      // atomare Doppel-Seed-Sicherung innerhalb der Transaktion
      if ((await db.programs.count()) > 0) return
      await db.programs.add(program)
      await db.semesters.add(semester)
      await db.courses.bulkAdd(courses)
      await db.tasks.bulkAdd([...recurring, ...oneOff])
      await db.attendance.bulkAdd(att)
    },
  )
}
