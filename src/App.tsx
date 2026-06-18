import { useEffect, useMemo, useState } from 'react'
import { seedIfEmpty } from '@/lib/seed'
import { filterTasks } from '@/lib/filter'
import { useActiveSemester, useCourses, useTasks } from '@/hooks/data'
import { useUI } from '@/store/ui'
import { Header } from '@/components/Header'
import { QuickAdd } from '@/components/QuickAdd'
import { FilterBar } from '@/components/FilterBar'
import { Board } from '@/components/Board'
import { WeekView } from '@/components/WeekView'
import { Schedule } from '@/components/Schedule'
import { TaskEditor } from '@/components/TaskEditor'
import { CourseManager } from '@/components/CourseManager'

export default function App() {
  const [ready, setReady] = useState(false)
  const semester = useActiveSemester()
  const courses = useCourses(semester?.id)
  const tasks = useTasks(semester?.id)

  const view = useUI((s) => s.view)
  const ui = useUI()
  const showCourseManager = useUI((s) => s.showCourseManager)

  useEffect(() => {
    void seedIfEmpty().finally(() => setReady(true))
  }, [])

  // Tastatur-Kürzel: n = erfassen, / = suchen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      if (typing) return
      if (e.key === 'n') {
        e.preventDefault()
        document.getElementById('quickadd')?.focus()
      } else if (e.key === '/') {
        e.preventDefault()
        document.getElementById('search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const visible = useMemo(
    () =>
      filterTasks(tasks, courses, {
        search: ui.search,
        filterCourseIds: ui.filterCourseIds,
        filterTypes: ui.filterTypes,
        showDone: ui.showDone,
      }),
    [tasks, courses, ui.search, ui.filterCourseIds, ui.filterTypes, ui.showDone],
  )

  if (!ready || !semester) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-400">
        Lädt…
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col text-stone-900">
      <Header semester={semester} />
      <QuickAdd semesterId={semester.id} courses={courses} />
      <FilterBar courses={courses} />

      <main className="min-h-0 flex-1 pt-1">
        {view === 'board' && <Board tasks={visible} courses={courses} />}
        {view === 'week' && <WeekView tasks={visible} courses={courses} />}
        {view === 'schedule' && <Schedule tasks={visible} courses={courses} />}
      </main>

      <TaskEditor courses={courses} />
      {showCourseManager && <CourseManager courses={courses} semester={semester} />}
    </div>
  )
}
