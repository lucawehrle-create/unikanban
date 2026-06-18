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
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500 text-white">
          <GraduationCap size={18} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">UniKanban</div>
          <div className="text-[11px] text-slate-400">{semester.name}</div>
        </div>
      </div>

      {/* Semesterwoche */}
      <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 sm:flex dark:bg-slate-800">
        <span className="text-xs font-medium text-slate-500">
          {inSemester ? `Woche ${week}` : rawWeek < 1 ? 'vor Start' : 'Vorlesungsende'}
          <span className="text-slate-400"> / {semester.weeks}</span>
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-sky-500 transition-all"
            style={{ width: `${(week / semester.weeks) * 100}%` }}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Ansichts-Wechsel */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
          {VIEWS.map((v) => {
            const Icon = v.icon
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                  view === v.id
                    ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setShowCourseManager(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
        >
          <Settings2 size={14} />
          <span className="hidden sm:inline">Kurse</span>
        </button>
      </div>
    </header>
  )
}
