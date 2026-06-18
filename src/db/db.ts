import Dexie, { type Table } from 'dexie'
import type { Course, Semester, Task } from './types'

// Lokal-first über IndexedDB. Die saubere Tabellen-Trennung erlaubt es,
// später Dexie Cloud als Drop-in-Sync zu ergänzen, ohne das Modell umzubauen.
export class UniKanbanDB extends Dexie {
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
  }
}

export const db = new UniKanbanDB()

export function uid(): string {
  return crypto.randomUUID()
}
