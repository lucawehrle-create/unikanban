import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { filterTasks } from '@/lib/filter'
import { useActiveProgram, useActiveSemester, useCourses, useTasks } from '@/hooks/data'
import { useUI } from '@/store/ui'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { DemoBanner } from '@/components/DemoBanner'
import { Onboarding } from '@/components/Onboarding'
import { QuickAdd } from '@/components/QuickAdd'
import { FilterBar } from '@/components/FilterBar'
import { Board } from '@/components/Board'
import { WeekView } from '@/components/WeekView'
import { Schedule } from '@/components/Schedule'
import { StudyView } from '@/components/StudyView'
import { StudyPlansView } from '@/components/StudyPlansView'
import { TaskEditor } from '@/components/TaskEditor'
import { CourseManager } from '@/components/CourseManager'
import { CalendarModal } from '@/components/CalendarModal'
import { AccountModal } from '@/components/AccountModal'
import { AuthGate } from '@/components/AuthGate'
import { SyncLoading } from '@/components/SyncLoading'
import { Tour } from '@/components/Tour'
import { initSync, useSync } from '@/lib/sync'
import { isSyncConfigured } from '@/lib/supabase'
import { hasSeenTour } from '@/lib/tour'
import { useLocalReminderNotifications } from '@/lib/reminders'

const Landing = lazy(() => import('@/components/landing/Landing'))

export default function App() {
  const programCount = useLiveQuery(() => db.programs.count(), [])
  const program = useActiveProgram()
  const semester = useActiveSemester()
  const courses = useCourses(semester?.id)
  const tasks = useTasks(semester?.id)

  // Lokale Fristen-Benachrichtigungen (App offen / Rückkehr zur App).
  useLocalReminderNotifications(tasks, courses)

  const view = useUI((s) => s.view)
  const ui = useUI()
  const showCourseManager = useUI((s) => s.showCourseManager)
  const showCalendar = useUI((s) => s.showCalendar)
  const showAccount = useUI((s) => s.showAccount)
  const isDemo = useUI((s) => s.isDemo)
  const setTour = useUI((s) => s.setTour)

  const user = useSync((s) => s.user)
  const syncStatus = useSync((s) => s.status)
  const conflict = useSync((s) => s.conflict)
  // Landing zeigen, bis der Besucher auf „Anmelden/Loslegen" tippt.
  const [showAuth, setShowAuth] = useState(false)

  // Cloud-Sync (no-op, falls nicht konfiguriert) einmalig initialisieren.
  useEffect(() => {
    initSync()
  }, [])

  // Produkt-Tour einmalig pro Konto automatisch starten – sobald Inhalte da
  // sind (Beispieldaten ODER eigenes Studium) und für dieses Konto noch nicht
  // gesehen. Hängt an `user`, damit es direkt nach dem Login neu greift.
  useEffect(() => {
    if (!programCount) return
    if (isSyncConfigured && !user) return // erst nach Login
    if (!hasSeenTour()) setTour(true)
  }, [programCount, user, setTour])

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
  // Konto-basiert: Ist Sync konfiguriert, sehen Ausgeloggte die Landing Page,
  // von dort geht's per Klick zur Anmeldung.
  if (isSyncConfigured && !user) {
    if (!showAuth) {
      return (
        <Suspense fallback={<div className="h-full bg-cream-50" />}>
          <Landing onStart={() => setShowAuth(true)} />
        </Suspense>
      )
    }
    return <AuthGate onBack={() => setShowAuth(false)} />
  }
  // Eingeloggt, aber lokal noch keine Daten: erst warten, bis der Sync wirklich
  // bestätigt hat, dass es nichts gibt ('synced'). Bei langsamer/fehlender
  // Verbindung zeigt der Ladescreen Optionen statt fälschlich das Onboarding
  // (sonst sähe es aus, als wären die Daten weg).
  if (isSyncConfigured && user && programCount === 0 && syncStatus !== 'synced') {
    return <SyncLoading />
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
  // „Studium" und „Lernpläne" sind eigenständige Vollansichten (ohne QuickAdd/Filter).
  const isFullView = effectiveView === 'study' || effectiveView === 'plans'

  // Im Aufgaben-Board nur aktuell anstehende Lern-Sessions zeigen – zukünftige
  // Plan-Sessions (examId gesetzt, Fälligkeit nach heute) würden es überfüllen.
  const startOfTomorrow = new Date()
  startOfTomorrow.setHours(0, 0, 0, 0)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const boardTasks = visible.filter(
    (t) => !(t.examId && t.dueDate && new Date(t.dueDate).getTime() >= startOfTomorrow.getTime()),
  )

  return (
    <div className="flex h-full flex-col text-stone-900">
      <Header semester={semester} program={program} />
      {isDemo && <DemoBanner />}
      {!isFullView && semester && (
        <>
          <QuickAdd semesterId={semester.id} courses={courses} />
          <FilterBar courses={courses} />
        </>
      )}

      <main className="min-h-0 flex-1 pt-1">
        {semester && effectiveView === 'board' && (
          <Board tasks={boardTasks} courses={courses} hasTasks={tasks.length > 0} />
        )}
        {semester && effectiveView === 'week' && <WeekView tasks={visible} courses={courses} />}
        {semester && effectiveView === 'schedule' && (
          <Schedule tasks={visible} courses={courses} semesterId={semester.id} />
        )}
        {semester && effectiveView === 'plans' && <StudyPlansView />}
        {effectiveView === 'study' && <StudyView activeProgram={program} />}
      </main>

      <BottomNav />

      <TaskEditor courses={courses} />
      {showCourseManager && semester && <CourseManager courses={courses} semester={semester} />}
      {showCalendar && semester && <CalendarModal semester={semester} courses={courses} tasks={tasks} />}
      {(showAccount || conflict) && <AccountModal />}
      <Tour />
    </div>
  )
}
