import {
  LayoutGrid,
  CalendarDays,
  Clock,
  CalendarPlus,
  Gauge,
  HelpCircle,
  Settings2,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'
import type { Program, Semester } from '@/db/types'
import { useUI, type ViewId } from '@/store/ui'
import { Logo } from './Logo'
import { SemesterSwitcher } from './SemesterSwitcher'
import { Popover } from './ui/Popover'
import { cn } from '@/lib/cn'

export const VIEWS: { id: ViewId; label: string; shortLabel: string; icon: LucideIcon }[] = [
  { id: 'board', label: 'Board', shortLabel: 'Board', icon: LayoutGrid },
  { id: 'week', label: 'Diese Woche', shortLabel: 'Woche', icon: CalendarDays },
  { id: 'schedule', label: 'Stundenplan', shortLabel: 'Plan', icon: Clock },
  { id: 'study', label: 'Studium', shortLabel: 'Studium', icon: Gauge },
]

export function Header({ semester, program }: { semester?: Semester; program?: Program }) {
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const setShowCourseManager = useUI((s) => s.setShowCourseManager)
  const setShowCalendar = useUI((s) => s.setShowCalendar)
  const setTour = useUI((s) => s.setTour)

  return (
    <header className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
      {/* Logo */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo size={36} className="shrink-0" />
        <div className="min-w-0 leading-tight">
          <div className="text-[15px] font-bold tracking-tight" style={{ color: '#2a2a6e' }}>
            SemBan
          </div>
          <div className="truncate text-[11px] text-stone-400">{program?.name ?? 'Studium'}</div>
        </div>
      </div>

      {/* Zentrierte Pill-Navigation – nur Desktop; mobil via BottomNav */}
      <nav
        data-tour="nav"
        className="mx-auto hidden items-center gap-1 rounded-full bg-white/70 p-1 shadow-sm ring-1 ring-stone-200/70 backdrop-blur sm:flex"
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
        {semester && <SemesterSwitcher semester={semester} />}

        <span data-tour="courses">
          <Popover label="Mehr" icon={<MoreHorizontal size={15} />} width={208}>
            {(close) => (
              <div className="space-y-0.5">
                <MenuItem
                  icon={Settings2}
                  label="Kurse verwalten"
                  onClick={() => {
                    setShowCourseManager(true)
                    close()
                  }}
                />
                <MenuItem
                  icon={CalendarPlus}
                  label="Kalender importieren"
                  onClick={() => {
                    setShowCalendar(true)
                    close()
                  }}
                />
                <div className="my-1 border-t border-stone-100" />
                <MenuItem
                  icon={HelpCircle}
                  label="Tour starten"
                  onClick={() => {
                    setTour(true)
                    close()
                  }}
                />
              </div>
            )}
          </Popover>
        </span>
      </div>
    </header>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-stone-600 transition hover:bg-stone-100"
    >
      <Icon size={16} className="text-stone-400" />
      {label}
    </button>
  )
}
