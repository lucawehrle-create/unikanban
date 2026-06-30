import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { filterTasks } from '@/lib/filter'
import { useActiveProgram, useActiveSemester, useCourses, useTasks } from '@/hooks/data'
import { useUI } from '@/store/ui'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { DemoBanner } from '@/components/DemoBanner'
import { QuickAdd } from '@/components/QuickAdd'
import { FilterBar } from '@/components/FilterBar'
import { Board } from '@/components/Board'
import { TaskEditor } from '@/components/TaskEditor'
import { ReflectionModal } from '@/components/ReflectionModal'
import { AuthGate } from '@/components/AuthGate'
import { SyncLoading } from '@/components/SyncLoading'
import { Tour } from '@/components/Tour'
import { initSync, useSync } from '@/lib/sync'
import { isSyncConfigured } from '@/lib/supabase'
import { hasSeenTour } from '@/lib/tour'
import { useLocalReminderNotifications } from '@/lib/reminders'

// Lazy: Onboarding (nur Neu-Nutzer), Neben-Views & Modals erst bei Bedarf laden
// → kleineres Initial-Bundle, schnellerer Start.
const Landing = lazy(() => import('@/components/landing/Landing'))
const OnboardingChat = lazy(() => import('@/components/OnboardingChat').then((m) => ({ default: m.OnboardingChat })))
const WeekView = lazy(() => import('@/components/WeekView').then((m) => ({ default: m.WeekView })))
const Schedule = lazy(() => import('@/components/Schedule').then((m) => ({ default: m.Schedule })))
const StudyView = lazy(() => import('@/components/StudyView').then((m) => ({ default: m.StudyView })))
const StudyPlansView = lazy(() => import('@/components/StudyPlansView').then((m) => ({ default: m.StudyPlansView })))
const CourseManager = lazy(() => import('@/components/CourseManager').then((m) => ({ default: m.CourseManager })))
const CalendarModal = lazy(() => import('@/components/CalendarModal').then((m) => ({ default: m.CalendarModal })))
const AccountModal = lazy(() => import('@/components/AccountModal').then((m) => ({ default: m.AccountModal })))
const FeedbackModal = lazy(() => import('@/components/FeedbackModal').then((m) => ({ default: m.FeedbackModal })))

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
  const showFeedback = useUI((s) => s.showFeedback)
  const isDemo = useUI((s) => s.isDemo)
  const setTour = useUI((s) => s.setTour)

  const user = useSync((s) => s.user)
  const syncStatus = useSync((s) => s.status)
  const conflict = useSync((s) => s.conflict)
  // Landing zeigen, bis der Besucher auf „Anmelden/Loslegen" tippt.
  const [showAuth, setShowAuth] = useState(false)
  // Mit welchem Modus die Anmeldung öffnet: „Kostenlos starten" → Registrieren,
  // „Anmelden" → Login.
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')

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

  // „Heute" (dueToday) gilt NUR fürs Board (Tagesfokus) – Woche/Stundenplan
  // haben eigene Datums-Logik und würden sonst leer wirken. Daher hier ohne.
  const visible = useMemo(
    () =>
      filterTasks(tasks, courses, {
        search: ui.search,
        filterCourseIds: ui.filterCourseIds,
        filterTypes: ui.filterTypes,
        examPrep: ui.examPrep,
        showDone: ui.showDone,
        dueToday: false,
      }),
    [
      tasks,
      courses,
      ui.search,
      ui.filterCourseIds,
      ui.filterTypes,
      ui.examPrep,
      ui.showDone,
    ],
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
          <Landing
            onStart={() => {
              setAuthMode('signup')
              setShowAuth(true)
            }}
            onSignIn={() => {
              setAuthMode('signin')
              setShowAuth(true)
            }}
          />
        </Suspense>
      )
    }
    return <AuthGate initialMode={authMode} onBack={() => setShowAuth(false)} />
  }
  // Eingeloggt, aber lokal noch keine Daten: erst warten, bis der Sync wirklich
  // bestätigt hat, dass es nichts gibt ('synced'). Bei langsamer/fehlender
  // Verbindung zeigt der Ladescreen Optionen statt fälschlich das Onboarding
  // (sonst sähe es aus, als wären die Daten weg).
  if (isSyncConfigured && user && programCount === 0 && syncStatus !== 'synced') {
    return <SyncLoading />
  }
  if (programCount === 0)
    return (
      <Suspense fallback={<div className="h-full bg-cream-50" />}>
        <OnboardingChat />
      </Suspense>
    )
  if (!program) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-400">Lädt…</div>
    )
  }

  // Hat der aktive Studiengang (noch) kein Semester, erzwingen wir die Studium-
  // Ansicht (dort kann man ein Semester anlegen) statt in "Lädt…" zu hängen.
  const effectiveView = semester ? view : 'study'
  // „Studium", „Lernpläne" und „Stundenplan" sind eigenständige Vollansichten
  // (ohne die task-zentrierte QuickAdd-/Filter-Leiste – die gehört zum Board).
  const isFullView =
    effectiveView === 'study' || effectiveView === 'plans' || effectiveView === 'schedule'

  // Im Aufgaben-Board nur die unmittelbar anstehenden Lern-Sessions zeigen –
  // ein kurzes Fenster (heute + nächste 2 Tage + überfällige), damit ein frisch
  // angelegter Plan sichtbar ist (auch an Ruhetagen), das Board aber nicht von
  // wochenweit verteilten Plan-Sessions überflutet wird. Die ganze Woche steht
  // in „Diese Woche“; Klausuren sind Termine und erscheinen nur dort, im Kalender
  // und in der Klausurphase – nicht im Board.
  const boardHorizon = new Date()
  boardHorizon.setHours(0, 0, 0, 0)
  boardHorizon.setDate(boardHorizon.getDate() + 3)
  // „Heute"-Tagesfokus: nur heute fällige & überfällige (offene) Aufgaben.
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const boardTasks = visible.filter((t) => {
    if (t.type === 'klausur') return false
    if (t.examId && t.dueDate && new Date(t.dueDate).getTime() >= boardHorizon.getTime()) return false
    // Tagesfokus „Heute": nur offene/in-Arbeit, heute fällige & überfällige –
    // Erledigte gehören nicht in den Fokus (konsistent zu filter.ts).
    if (
      ui.dueToday &&
      (t.status === 'erledigt' || !t.dueDate || new Date(t.dueDate).getTime() > endOfToday.getTime())
    )
      return false
    return true
  })

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
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-stone-400">Lädt…</div>}>
          {semester && effectiveView === 'board' && (
            <Board tasks={boardTasks} courses={courses} hasTasks={tasks.length > 0} />
          )}
          {semester && effectiveView === 'week' && <WeekView tasks={visible} courses={courses} />}
          {semester && effectiveView === 'schedule' && (
            <Schedule tasks={visible} courses={courses} semesterId={semester.id} />
          )}
          {semester && effectiveView === 'plans' && <StudyPlansView />}
          {effectiveView === 'study' && <StudyView activeProgram={program} />}
        </Suspense>
      </main>

      <BottomNav />

      <TaskEditor courses={courses} />
      <Suspense fallback={null}>
        {showCourseManager && semester && <CourseManager courses={courses} semester={semester} tasks={tasks} />}
        {showCalendar && semester && <CalendarModal semester={semester} courses={courses} tasks={tasks} />}
        {(showAccount || conflict) && <AccountModal />}
        {showFeedback && <FeedbackModal />}
      </Suspense>
      <ReflectionModal />
      <Tour />
    </div>
  )
}
