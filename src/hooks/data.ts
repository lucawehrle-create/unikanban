import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { AttendanceMarker, Course, Program, Semester, Task } from '@/db/types'

/** Marker je Termin-Sitzung als Map "slotId|date" → Marker[]. */
export function useAttendance(semesterId?: string): Record<string, AttendanceMarker[]> {
  return (
    useLiveQuery(async () => {
      if (!semesterId) return {}
      const rows = await db.attendance.where('semesterId').equals(semesterId).toArray()
      return Object.fromEntries(rows.map((r) => [r.id, r.markers]))
    }, [semesterId]) ?? {}
  )
}

export function usePrograms(): Program[] {
  return useLiveQuery(() => db.programs.orderBy('order').toArray(), []) ?? []
}

export function useActiveProgram(): Program | undefined {
  return useLiveQuery(async () => {
    const active = await db.programs.filter((p) => p.active).first()
    return active ?? (await db.programs.orderBy('order').first())
  }, [])
}

export function useSemesters(programId?: string): Semester[] {
  return (
    useLiveQuery(
      () => (programId ? db.semesters.where('programId').equals(programId).toArray() : []),
      [programId],
    ) ?? []
  )
}

export function useActiveSemester(): Semester | undefined {
  return useLiveQuery(async () => {
    const active = await db.semesters.filter((s) => s.active).first()
    return active ?? (await db.semesters.toCollection().first())
  }, [])
}

export function useCourses(semesterId?: string): Course[] {
  return (
    useLiveQuery(
      () => (semesterId ? db.courses.where('semesterId').equals(semesterId).toArray() : []),
      [semesterId],
    ) ?? []
  )
}

/** Alle Kurse eines Studiengangs über sämtliche Semester (für die Studienakte). */
export function useProgramCourses(programId?: string): Course[] {
  return (
    useLiveQuery(async () => {
      if (!programId) return []
      const sems = await db.semesters.where('programId').equals(programId).toArray()
      const ids = sems.map((s) => s.id)
      if (ids.length === 0) return []
      return db.courses.where('semesterId').anyOf(ids).toArray()
    }, [programId]) ?? []
  )
}

export function useTasks(semesterId?: string): Task[] {
  return (
    useLiveQuery(
      () => (semesterId ? db.tasks.where('semesterId').equals(semesterId).toArray() : []),
      [semesterId],
    ) ?? []
  )
}

export function useTask(id: string | null): Task | undefined {
  return useLiveQuery(() => (id ? db.tasks.get(id) : undefined), [id])
}
