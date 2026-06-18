import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Course, Semester, Task } from '@/db/types'

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
