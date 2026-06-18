import type { Course, Task, TaskTypeId } from '@/db/types'

export interface FilterState {
  search: string
  filterCourseIds: string[]
  filterTypes: TaskTypeId[]
  showDone: boolean
}

export function courseMap(courses: Course[]): Map<string, Course> {
  return new Map(courses.map((c) => [c.id, c]))
}

export function filterTasks(tasks: Task[], courses: Course[], f: FilterState): Task[] {
  const byId = courseMap(courses)
  const needle = f.search.trim().toLowerCase()

  return tasks.filter((t) => {
    if (!f.showDone && t.status === 'erledigt') return false
    if (f.filterCourseIds.length && (!t.courseId || !f.filterCourseIds.includes(t.courseId)))
      return false
    if (f.filterTypes.length && !f.filterTypes.includes(t.type)) return false
    if (needle) {
      const course = t.courseId ? byId.get(t.courseId) : undefined
      const hay = `${t.title} ${course?.name ?? ''} ${course?.short ?? ''} ${t.notes ?? ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}
