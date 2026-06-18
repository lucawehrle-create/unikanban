import { GraduationCap, LayoutGrid, CalendarDays, Settings2 } from 'lucide-react'
import type { Semester } from '@/db/types'
import { clampWeek, currentSemesterWeek } from '@/lib/semester'
import { useUI, type ViewId } from '@/store/ui'
import { cn } from '@/lib/cn'

const VIEWS: { id: ViewId; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'week', label: 'Diese Woche', icon: CalendarDays },
]

export function Header({ semester }: { semester: Semester }) {
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const setShowCourseManager = useUI((s) => s.setShowCourseManager)

  const rawWeek = currentSemesterWeek(semester)
  const week = clampWeek(semester, rawWeek)
  const inSemester = rawWeek >= 1 && rawWeek <= semester.weeks

  return (
    <header className="flex flex-wrap items-center gap-3 px-5 py-4">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-stone-900 text-brand-300 shadow-sm">
          <GraduationCap size={19} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-stone-800">UniKanban</div>
          <div className="text-[11px] text-stone-400">{semester.name}</div>
        </div>
      </div>

      {/* Zentrierte Pill-Navigation */}
      <nav className="mx-auto flex items-center gap-1 rounded-full bg-white/70 p-1 shadow-sm ring-1 ring-stone-200/70 backdrop-blur">
        {VIEWS.map((v) => {
          const Icon = v.icon
          const active = view === v.id
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition',
                active
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'text-stone-500 hover:text-stone-800',
              )}
            >
              <Icon size={15} />
              {v.label}
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* Semesterwoche */}
        <div className="hidden items-center gap-2 rounded-full bg-white/70 px-3.5 py-2 shadow-sm ring-1 ring-stone-200/70 backdrop-blur sm:flex">
          <span className="text-xs font-medium text-stone-500">
            {inSemester ? `Woche ${week}` : rawWeek < 1 ? 'vor Start' : 'VL-Ende'}
            <span className="text-stone-400"> / {semester.weeks}</span>
          </span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-brand-400 transition-all"
              style={{ width: `${(week / semester.weeks) * 100}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => setShowCourseManager(true)}
          className="flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-2 text-xs font-medium text-stone-600 shadow-sm ring-1 ring-stone-200/70 backdrop-blur transition hover:bg-white"
        >
          <Settings2 size={15} />
          <span className="hidden sm:inline">Kurse</span>
        </button>
      </div>
    </header>
  )
}
