import {
  GraduationCap,
  LayoutGrid,
  CalendarDays,
  Clock,
  CalendarPlus,
  Gauge,
  HelpCircle,
  Settings2,
} from 'lucide-react'
import type { Program, Semester } from '@/db/types'
import { useUI, type ViewId } from '@/store/ui'
import { SemesterSwitcher } from './SemesterSwitcher'
import { cn } from '@/lib/cn'

const VIEWS: { id: ViewId; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'week', label: 'Diese Woche', icon: CalendarDays },
  { id: 'schedule', label: 'Stundenplan', icon: Clock },
  { id: 'study', label: 'Studium', icon: Gauge },
]

export function Header({ semester, program }: { semester: Semester; program?: Program }) {
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const setShowCourseManager = useUI((s) => s.setShowCourseManager)
  const setShowCalendar = useUI((s) => s.setShowCalendar)
  const setTour = useUI((s) => s.setTour)

  return (
    <header className="flex flex-wrap items-center gap-3 px-5 py-4">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-stone-900 text-brand-300 shadow-sm">
          <GraduationCap size={19} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-stone-800">UniKanban</div>
          <div className="text-[11px] text-stone-400">{program?.name ?? 'Studium'}</div>
        </div>
      </div>

      {/* Zentrierte Pill-Navigation */}
      <nav
        data-tour="nav"
        className="mx-auto flex items-center gap-1 rounded-full bg-white/70 p-1 shadow-sm ring-1 ring-stone-200/70 backdrop-blur"
      >
        {VIEWS.map((v) => {
          const Icon = v.icon
          const active = view === v.id
          return (
            <button
              key={v.id}
              data-tour={v.id === 'study' ? 'tab-study' : undefined}
              onClick={() => setView(v.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition',
                active ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:text-stone-800',
              )}
            >
              <Icon size={15} />
              {v.label}
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <SemesterSwitcher semester={semester} />

        <button
          onClick={() => setShowCalendar(true)}
          className="flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-2 text-xs font-medium text-stone-600 shadow-sm ring-1 ring-stone-200/70 backdrop-blur transition hover:bg-white"
        >
          <CalendarPlus size={15} />
          <span className="hidden sm:inline">Kalender</span>
        </button>

        <button
          data-tour="courses"
          onClick={() => setShowCourseManager(true)}
          className="flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-2 text-xs font-medium text-stone-600 shadow-sm ring-1 ring-stone-200/70 backdrop-blur transition hover:bg-white"
        >
          <Settings2 size={15} />
          <span className="hidden sm:inline">Kurse</span>
        </button>

        <button
          onClick={() => setTour(true)}
          aria-label="Tour starten"
          title="Tour starten"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-stone-500 shadow-sm ring-1 ring-stone-200/70 backdrop-blur transition hover:bg-white hover:text-stone-700"
        >
          <HelpCircle size={16} />
        </button>
      </div>
    </header>
  )
}
