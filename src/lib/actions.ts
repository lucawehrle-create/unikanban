import { db, uid } from '@/db/db'
import type {
  Course,
  Phase,
  Program,
  ProgramType,
  Semester,
  Task,
  TaskStatus,
  TaskTypeId,
} from '@/db/types'
import { makePhases } from './taskTypes'
import { generateRecurringTasks } from './recurring'

// ---------- Studiengänge ----------

export async function createProgram(input: {
  name: string
  type: ProgramType
  targetEcts: number
  priorEcts?: number
  priorGradeAvg?: number
  priorGradedEcts?: number
}): Promise<string> {
  const id = uid()
  const order = await db.programs.count()
  const program: Program = {
    id,
    name: input.name || 'Studiengang',
    type: input.type,
    targetEcts: input.targetEcts,
    priorEcts: input.priorEcts,
    priorGradeAvg: input.priorGradeAvg,
    priorGradedEcts: input.priorGradedEcts ?? input.priorEcts,
    active: true,
    order,
    createdAt: new Date().toISOString(),
  }
  await db.transaction('rw', db.programs, async () => {
    await db.programs.toCollection().modify((p) => {
      p.active = false
    })
    await db.programs.add(program)
  })
  return id
}

export async function saveProgram(program: Program): Promise<void> {
  await db.programs.put(program)
}

export async function deleteProgram(id: string): Promise<void> {
  await db.transaction('rw', db.programs, db.semesters, db.courses, db.tasks, async () => {
    const wasActive = (await db.programs.get(id))?.active ?? false
    const sems = await db.semesters.where('programId').equals(id).toArray()
    for (const s of sems) {
      await db.courses.where('semesterId').equals(s.id).delete()
      await db.tasks.where('semesterId').equals(s.id).delete()
    }
    await db.semesters.where('programId').equals(id).delete()
    await db.programs.delete(id)

    // War der gelöschte Studiengang aktiv, einen anderen aktivieren.
    if (wasActive) {
      const next = await db.programs.orderBy('order').first()
      if (next) {
        await db.programs.update(next.id, { active: true })
        const nextSem = await db.semesters.where('programId').equals(next.id).first()
        if (nextSem) {
          await db.semesters.toCollection().modify((s) => {
            s.active = s.id === nextSem.id
          })
        }
      }
    }
  })
}

// ---------- Semester & Kontextwechsel ----------

export async function createSemester(input: {
  programId: string
  name: string
  startDate: string
  weeks: number
}): Promise<string> {
  const id = uid()
  const semester: Semester = {
    id,
    programId: input.programId,
    name: input.name || 'Neues Semester',
    startDate: input.startDate,
    weeks: input.weeks,
    examPhases: [],
    active: true,
  }
  await db.transaction('rw', db.programs, db.semesters, async () => {
    await db.semesters.toCollection().modify((s) => {
      s.active = false
    })
    await db.programs.toCollection().modify((p) => {
      p.active = p.id === input.programId
    })
    await db.semesters.add(semester)
  })
  return id
}

export async function saveSemester(semester: Semester): Promise<void> {
  await db.semesters.put(semester)
}

/** Löscht ein Semester samt seinen Kursen & Aufgaben. Aktiviert ggf. ein anderes. */
export async function deleteSemester(id: string): Promise<void> {
  await db.transaction('rw', db.semesters, db.courses, db.tasks, async () => {
    const sem = await db.semesters.get(id)
    await db.courses.where('semesterId').equals(id).delete()
    await db.tasks.where('semesterId').equals(id).delete()
    await db.semesters.delete(id)
    if (sem?.active) {
      const next = await db.semesters.toCollection().first()
      if (next) await db.semesters.update(next.id, { active: true })
    }
  })
}

/** Wechselt das aktive Semester (und aktiviert dessen Studiengang). */
export async function switchSemester(id: string): Promise<void> {
  await db.transaction('rw', db.programs, db.semesters, async () => {
    const sem = await db.semesters.get(id)
    if (!sem) return
    await db.semesters.toCollection().modify((s) => {
      s.active = s.id === id
    })
    await db.programs.toCollection().modify((p) => {
      p.active = p.id === sem.programId
    })
  })
}

export async function createTask(input: {
  semesterId: string
  title: string
  type: TaskTypeId
  courseId?: string
  dueDate?: string
}): Promise<string> {
  const id = uid()
  const task: Task = {
    id,
    semesterId: input.semesterId,
    courseId: input.courseId,
    type: input.type,
    title: input.title || 'Neue Aufgabe',
    status: 'offen',
    dueDate: input.dueDate,
    phases: makePhases(input.type),
    order: Date.now(),
    createdAt: new Date().toISOString(),
  }
  await db.tasks.add(task)
  return id
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  await db.tasks.update(id, patch)
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  await db.tasks.update(id, {
    status,
    completedAt: status === 'erledigt' ? new Date().toISOString() : undefined,
  })
}

/** Wechselt den Typ und ersetzt die Phasen-Checkliste durch den neuen Lebenszyklus. */
export async function changeTaskType(id: string, type: TaskTypeId): Promise<void> {
  await db.tasks.update(id, { type, phases: makePhases(type) })
}

export function togglePhase(phases: Phase[], index: number): Phase[] {
  return phases.map((p, i) => (i === index ? { ...p, done: !p.done } : p))
}

export async function saveCourse(course: Course): Promise<void> {
  await db.courses.put(course)
}

export async function deleteCourse(id: string): Promise<void> {
  await db.transaction('rw', db.courses, db.tasks, async () => {
    await db.courses.delete(id)
    // verwaiste Auto-Aufgaben entfernen, manuelle Aufgaben behalten (Kurs lösen)
    const orphans = await db.tasks.where('courseId').equals(id).toArray()
    for (const t of orphans) {
      if (t.autoGenerated) await db.tasks.delete(t.id)
      else await db.tasks.update(t.id, { courseId: undefined })
    }
  })
}

/**
 * Erzeugt die Wochen-Aufgaben eines Kurses neu. Bereits erledigte/bewertete
 * Auto-Aufgaben bleiben erhalten, offene werden ersetzt.
 */
export async function regenerateRecurring(course: Course, semester: Semester): Promise<number> {
  const fresh = generateRecurringTasks(course, semester)
  return db.transaction('rw', db.tasks, async () => {
    const existing = await db.tasks.where('courseId').equals(course.id).toArray()
    const keep = existing.filter((t) => t.autoGenerated && t.status !== 'offen')
    const keptTitles = new Set(keep.map((t) => t.title))
    const toDelete = existing.filter((t) => t.autoGenerated && t.status === 'offen')
    await db.tasks.bulkDelete(toDelete.map((t) => t.id))
    const toAdd = fresh.filter((t) => !keptTitles.has(t.title))
    await db.tasks.bulkAdd(toAdd)
    return toAdd.length
  })
}
