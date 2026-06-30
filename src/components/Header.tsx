import { type ReactNode } from 'react'
import {
  LayoutGrid,
  CalendarDays,
  Clock,
  CalendarPlus,
  BookOpen,
  Gauge,
  HelpCircle,
  MessageSquarePlus,
  Settings2,
  Settings,
  MoreHorizontal,
  Cloud,
  CloudOff,
  Loader2,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import type { Program, Semester } from '@/db/types'
import { isSyncConfigured } from '@/lib/supabase'
import { useSync } from '@/lib/sync'
import { useExamStatus, examBadge } from '@/lib/examPhase'
import { signOut } from '@/lib/auth'
import { useUI, type ViewId } from '@/store/ui'
import { Logo } from './Logo'
import { SemesterSwitcher } from './SemesterSwitcher'
import { NotificationCenter } from './NotificationCenter'
import { Popover } from './ui/Popover'
import { cn } from '@/lib/cn'

export const VIEWS: { id: ViewId; label: string; shortLabel: string; icon: LucideIcon }[] = [
  { id: 'board', label: 'Aufgaben', shortLabel: 'Aufgaben', icon: LayoutGrid },
  { id: 'week', label: 'Diese Woche', shortLabel: 'Woche', icon: CalendarDays },
  { id: 'schedule', label: 'Stundenplan', shortLabel: 'Plan', icon: Clock },
  { id: 'plans', label: 'Lernpläne', shortLabel: 'Lernen', icon: BookOpen },
  { id: 'study', label: 'Studium', shortLabel: 'Studium', icon: Gauge },
]

export function Header({ semester, program }: { semester?: Semester; program?: Program }) {
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const setShowCourseManager = useUI((s) => s.setShowCourseManager)
  const setShowCalendar = useUI((s) => s.setShowCalendar)
  const setShowAccount = useUI((s) => s.setShowAccount)
  const setShowFeedback = useUI((s) => s.setShowFeedback)
  const setTour = useUI((s) => s.setTour)
  const account = useSync((s) => s.user)
  const syncStatus = useSync((s) => s.status)
  const lastSyncAt = useSync((s) => s.lastSyncAt)
  const examChip = examBadge(useExamStatus())

  const initial = account?.email?.[0]?.toUpperCase()

  return (
    <header className="flex items-center gap-3 border-b border-stone-200/60 bg-cream-50/80 px-4 py-3 sm:px-5 sm:py-4">
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
                active
                  ? 'bg-brand-300 text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-800',
              )}
            >
              <Icon size={15} />
              {v.label}
              {v.id === 'week' && examChip && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                    active ? 'bg-stone-900/10 text-stone-900' : 'bg-indigo-100 text-indigo-700',
                  )}
                >
                  {examChip}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {semester && <SemesterSwitcher semester={semester} />}

        <NotificationCenter />

        <span data-tour="courses">
          <Popover
            label="Menü"
            round
            width={240}
            icon={
              initial ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-stone-700">
                  {initial}
                </span>
              ) : (
                <MoreHorizontal size={16} />
              )
            }
          >
            {(close) => (
              <div className="space-y-0.5">
                {isSyncConfigured && account && (
                  <>
                    <SectionLabel>Konto</SectionLabel>
                    <div className="px-2.5 pb-1.5 pt-0.5">
                      <div className="truncate text-sm font-medium text-stone-700">
                        {account.email}
                      </div>
                      <SyncStatusLine status={syncStatus} lastSyncAt={lastSyncAt} />
                    </div>
                    <MenuItem
                      icon={Settings}
                      label="Einstellungen"
                      onClick={() => {
                        setShowAccount(true)
                        close()
                      }}
                    />
                    <MenuItem
                      icon={LogOut}
                      label="Abmelden"
                      onClick={() => {
                        void signOut()
                        close()
                      }}
                    />
                    <div className="my-1 border-t border-stone-100" />
                  </>
                )}
                <SectionLabel>App</SectionLabel>
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
                  label="Kalender & Export"
                  onClick={() => {
                    setShowCalendar(true)
                    close()
                  }}
                />
                <MenuItem
                  icon={MessageSquarePlus}
                  label="Feedback"
                  onClick={() => {
                    setShowFeedback(true)
                    close()
                  }}
                />
                <div className="my-1 border-t border-stone-100" />
                <SectionLabel>Hilfe</SectionLabel>
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
      {children}
    </div>
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
      className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-sm text-stone-600 transition hover:bg-stone-100"
    >
      <Icon size={16} className="shrink-0 text-stone-400" />
      {label}
    </button>
  )
}

/** Kompakte Sync-Zeile unter der E-Mail im „Mehr"-Menü. */
function SyncStatusLine({ status, lastSyncAt }: { status: string; lastSyncAt: string | null }) {
  if (status === 'syncing')
    return (
      <span className="flex items-center gap-1 text-[11px] text-stone-400">
        <Loader2 size={11} className="animate-spin" /> Synchronisiere…
      </span>
    )
  if (status === 'error')
    return (
      <span className="flex items-center gap-1 text-[11px] text-red-500">
        <CloudOff size={11} /> Nicht synchron
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-[11px] text-emerald-600">
      <Cloud size={11} />
      {lastSyncAt
        ? `Synchron · vor ${formatDistanceToNow(parseISO(lastSyncAt), { locale: de })}`
        : 'Synchron'}
    </span>
  )
}
