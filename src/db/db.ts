import Dexie, { type Table } from 'dexie'
import type { Attendance, Course, Program, Semester, Task } from './types'

export function uid(): string {
  return crypto.randomUUID()
}

// Lokal-first über IndexedDB. Die saubere Tabellen-Trennung erlaubt es,
// später Dexie Cloud als Drop-in-Sync zu ergänzen, ohne das Modell umzubauen.
export class UniKanbanDB extends Dexie {
  programs!: Table<Program, string>
  semesters!: Table<Semester, string>
  courses!: Table<Course, string>
  tasks!: Table<Task, string>
  attendance!: Table<Attendance, string>

  constructor() {
    super('unikanban')

    this.version(1).stores({
      semesters: 'id, active',
      courses: 'id, semesterId',
      tasks: 'id, semesterId, courseId, status, type, dueDate',
    })

    // v2: Studiengänge + Semester-Phasen. Bestehende Semester werden in einen
    // Default-Studiengang übernommen, damit nichts verloren geht.
    this.version(2)
      .stores({
        programs: 'id, active, order',
        semesters: 'id, programId, active',
        courses: 'id, semesterId',
        tasks: 'id, semesterId, courseId, status, type, dueDate',
      })
      .upgrade(async (tx) => {
        const program: Program = {
          id: uid(),
          name: 'Mein Studium',
          type: 'bachelor',
          targetEcts: 180,
          active: true,
          order: 0,
          createdAt: new Date().toISOString(),
        }
        await tx.table('programs').add(program)
        await tx
          .table('semesters')
          .toCollection()
          .modify((s: Semester) => {
            s.programId = program.id
            if (!Array.isArray(s.examPhases)) s.examPhases = []
          })
      })

    // v3: Anwesenheit pro Termin-Sitzung + Trennung Tutorium(stermin) vs.
    // Tutoriumsblatt(-aufgabe). Alt-Aufgaben vom Typ 'tutorium' → 'tutoriumsblatt'.
    this.version(3)
      .stores({
        programs: 'id, active, order',
        semesters: 'id, programId, active',
        courses: 'id, semesterId',
        tasks: 'id, semesterId, courseId, status, type, dueDate',
        attendance: 'id, semesterId, slotId',
      })
      .upgrade(async (tx) => {
        await tx
          .table('tasks')
          .toCollection()
          .modify((t: Task) => {
            if ((t.type as string) === 'tutorium') t.type = 'tutoriumsblatt'
          })
        await tx
          .table('courses')
          .toCollection()
          .modify((c: Course) => {
            if (c.recurring && (c.recurring.type as string) === 'tutorium')
              c.recurring.type = 'tutoriumsblatt'
          })
      })
  }
}

export const db = new UniKanbanDB()
