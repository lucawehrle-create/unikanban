import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { filterTasks } from '@/lib/filter'
import { useActiveProgram, useActiveSemester, useCourses, useTasks } from '@/hooks/data'
import { useUI } from '@/store/ui'
import { Header } from '@/components/Header'
import { Onboarding } from '@/components/Onboarding'
import { QuickAdd } from '@/components/QuickAdd'
import { FilterBar } from '@/components/FilterBar'
import { Board } from '@/components/Board'
import { WeekView } from '@/components/WeekView'
import { Schedule } from '@/components/Schedule'
import { StudyView } from '@/components/StudyView'
import { TaskEditor } from '@/components/TaskEditor'
import { CourseManager } from '@/components/CourseManager'
import { CalendarModal } from '@/components/CalendarModal'
import { Tour } from '@/components/Tour'

export default function App() {
  const programCount = useLiveQuery(() => db.programs.count(), [])
  const program = useActiveProgram()
  const semester = useActiveSemester()
  const courses = useCourses(semester?.id)
  const tasks = useTasks(semester?.id)

  const view = useUI((s) => s.view)
  const ui = useUI()
  const showCourseManager = useUI((s) => s.showCourseManager)
  const showCalendar = useUI((s) => s.showCalendar)
  const setTour = useUI((s) => s.setTour)

  // Produkt-Tour einmalig für neue Nutzer automatisch starten
  useEffect(() => {
    if (programCount && programCount > 0 && !localStorage.getItem('uk:tourSeen')) {
      setTour(true)
    }
  }, [programCount, setTour])

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

  if (programCount === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-400">Lädt…</div>
    )
  }
  if (programCount === 0) return <Onboarding />
  if (!program) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-400">Lädt…</div>
    )
  }

  // Hat der aktive Studiengang (noch) kein Semester, erzwingen wir die Studium-
  // Ansicht (dort kann man ein Semester anlegen) statt in "Lädt…" zu hängen.
  const effectiveView = semester ? view : 'study'
  const isStudy = effectiveView === 'study'

  return (
    <div className="flex h-full flex-col text-stone-900">
      <Header semester={semester} program={program} />
      {!isStudy && semester && (
        <>
          <QuickAdd semesterId={semester.id} courses={courses} />
          <FilterBar courses={courses} />
        </>
      )}

      <main className="min-h-0 flex-1 pt-1">
        {semester && effectiveView === 'board' && <Board tasks={visible} courses={courses} />}
        {semester && effectiveView === 'week' && <WeekView tasks={visible} courses={courses} />}
        {semester && effectiveView === 'schedule' && (
          <Schedule tasks={visible} courses={courses} semesterId={semester.id} />
        )}
        {effectiveView === 'study' && <StudyView activeProgram={program} />}
      </main>

      <TaskEditor courses={courses} />
      {showCourseManager && semester && <CourseManager courses={courses} semester={semester} />}
      {showCalendar && semester && <CalendarModal semester={semester} courses={courses} tasks={tasks} />}
      <Tour />
    </div>
  )
}
