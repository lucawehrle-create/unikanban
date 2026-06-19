import { db, uid } from '@/db/db'
import type { Course, Program, Semester, Task } from '@/db/types'
import { makePhases } from './taskTypes'
import { generateRecurringTasks } from './recurring'
import { dateForWeekday, withTime } from './semester'

// Dedupe gegen StrictMode-Doppelaufruf / parallele Aufrufe in derselben Session.
let seedPromise: Promise<void> | null = null

/** Legt einmalig ein Demo-Studium an, falls die DB leer ist. */
export function seedIfEmpty(): Promise<void> {
  return (seedPromise ??= doSeed())
}

async function doSeed(): Promise<void> {
  if ((await db.programs.count()) > 0) return

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
    name: 'SoSe 2026',
    startDate: '2026-04-13', // Montag, Woche 1
    weeks: 14,
    examPhases: [
      { id: uid(), label: '1. Klausurenphase', start: '2026-07-20', end: '2026-08-01' },
      { id: uid(), label: '2. Klausurenphase', start: '2026-09-21', end: '2026-09-26' },
    ],
    endDate: '2026-09-30',
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
      // Zwei Serien: Übungsblatt UND Tutoriumsblatt
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
  const ethik = courses[2]
  const ana = courses[0]

  const oneOff: Task[] = [
    {
      id: uid(),
      semesterId: semester.id,
      courseId: ethik.id,
      type: 'hausarbeit',
      title: 'Hausarbeit: Verantwortungsethik',
      status: 'offen',
      priority: 'hoch',
      dueDate: withTime(dateForWeekday(semester, 14, 5), '23:59').toISOString(),
      phases: makePhases('hausarbeit'),
      notes: '15 Seiten, Thema mit Dozent abstimmen.',
      order: 1,
      createdAt: now,
    },
    {
      id: uid(),
      semesterId: semester.id,
      courseId: ethik.id,
      type: 'referat',
      title: 'Referat: Kant vs. Mill',
      status: 'dran',
      priority: 'mittel',
      dueDate: withTime(dateForWeekday(semester, 11, 4), '16:00').toISOString(),
      phases: makePhases('referat'),
      order: 1,
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
      dueDate: withTime(dateForWeekday(semester, 14, 2), '09:00').toISOString(),
      phases: makePhases('klausur'),
      order: 2,
      createdAt: now,
    },
  ]

  const recurring = courses.flatMap((c) => generateRecurringTasks(c, semester))

  await db.transaction('rw', db.programs, db.semesters, db.courses, db.tasks, async () => {
    // atomare Doppel-Seed-Sicherung innerhalb der Transaktion
    if ((await db.programs.count()) > 0) return
    await db.programs.add(program)
    await db.semesters.add(semester)
    await db.courses.bulkAdd(courses)
    await db.tasks.bulkAdd([...recurring, ...oneOff])
  })
}
