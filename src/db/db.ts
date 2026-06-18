import Dexie, { type Table } from 'dexie'
import type { Course, Program, Semester, Task } from './types'

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
  }
}

export const db = new UniKanbanDB()
