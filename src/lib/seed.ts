import { db, uid } from '@/db/db'
import type { Course, Semester, Task } from '@/db/types'
import { makePhases } from './taskTypes'
import { generateRecurringTasks } from './recurring'
import { dateForWeekday, withTime } from './semester'

/** Legt einmalig ein Demo-Semester an, falls die DB leer ist. */
export async function seedIfEmpty(): Promise<void> {
  const count = await db.semesters.count()
  if (count > 0) return

  const semester: Semester = {
    id: uid(),
    name: 'SoSe 2026',
    startDate: '2026-04-13', // Montag, Woche 1
    weeks: 14,
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
        { id: uid(), kind: 'tutorium', weekday: 4, start: '14:00', end: '16:00', room: 'SR 7' },
      ],
      recurring: {
        enabled: true,
        type: 'uebung',
        labelPrefix: 'Übungsblatt',
        weekday: 5, // Freitag
        time: '12:00',
        count: 12,
        startWeek: 1,
        maxPoints: 40,
      },
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
        { id: uid(), kind: 'tutorium', weekday: 5, start: '10:00', end: '12:00', room: 'SR 2' },
      ],
      recurring: {
        enabled: true,
        type: 'uebung',
        labelPrefix: 'Übung',
        weekday: 3, // Mittwoch
        time: '23:59',
        count: 12,
        startWeek: 1,
        maxPoints: 20,
      },
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
      recurring: {
        enabled: true,
        type: 'lektuere',
        labelPrefix: 'Lektüre Woche',
        weekday: 4, // Donnerstag (zur Sitzung)
        time: '16:00',
        count: 12,
        startWeek: 1,
      },
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
      dueDate: withTime(dateForWeekday(semester, 14, 2), '09:00').toISOString(),
      phases: makePhases('klausur'),
      order: 2,
      createdAt: now,
    },
  ]

  const recurring = courses.flatMap((c) => generateRecurringTasks(c, semester))

  await db.transaction('rw', db.semesters, db.courses, db.tasks, async () => {
    await db.semesters.add(semester)
    await db.courses.bulkAdd(courses)
    await db.tasks.bulkAdd([...recurring, ...oneOff])
  })
}
