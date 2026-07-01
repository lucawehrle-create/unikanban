import type { Course, Task, TaskTypeId } from '@/db/types'

export type ExamPrepFilter = 'all' | 'only' | 'hide'

export interface FilterState {
  search: string
  filterCourseIds: string[]
  filterTypes: TaskTypeId[]
  examPrep: ExamPrepFilter
  showDone: boolean
  /** true = nur heute fällige & überfällige Aufgaben (Tagesfokus). */
  dueToday: boolean
}

export function courseMap(courses: Course[]): Map<string, Course> {
  return new Map(courses.map((c) => [c.id, c]))
}

/** Diakritika-/Umlaut-tolerante Normalisierung (wie beim Kurs-Abgleich in ics.ts):
 *  „ubung" findet „Übung", „loesung" findet „Lösung". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
}

export function filterTasks(tasks: Task[], courses: Course[], f: FilterState): Task[] {
  const byId = courseMap(courses)
  const needle = fold(f.search.trim())
  // Ende des heutigen Tages – „heute fällig" schließt Überfälliges mit ein.
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  return tasks.filter((t) => {
    if (!f.showDone && t.status === 'erledigt') return false
    if (f.dueToday) {
      if (t.status === 'erledigt') return false
      if (!t.dueDate || new Date(t.dueDate).getTime() > endOfToday.getTime()) return false
    }
    if (f.examPrep === 'only' && !t.examId) return false
    if (f.examPrep === 'hide' && t.examId) return false
    if (f.filterCourseIds.length && (!t.courseId || !f.filterCourseIds.includes(t.courseId)))
      return false
    if (f.filterTypes.length && !f.filterTypes.includes(t.type)) return false
    if (needle) {
      const course = t.courseId ? byId.get(t.courseId) : undefined
      const hay = fold(`${t.title} ${course?.name ?? ''} ${course?.short ?? ''} ${t.notes ?? ''}`)
      if (!hay.includes(needle)) return false
    }
    return true
  })
}
