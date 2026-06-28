import { useUI } from '@/store/ui'
import { useExamStatus, examBadge } from '@/lib/examPhase'
import { VIEWS } from './Header'
import { cn } from '@/lib/cn'

/** Native-anmutende Tab-Leiste am unteren Rand – nur auf kleinen Screens. */
export function BottomNav() {
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const examChip = examBadge(useExamStatus())

  return (
    <nav data-tour="nav" className="shrink-0 border-t border-stone-200/70 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="flex items-stretch">
        {VIEWS.map((v) => {
          const Icon = v.icon
          const active = view === v.id
          return (
            <button
              key={v.id}
              data-tour={v.id === 'study' ? 'tab-study' : undefined}
              onClick={() => setView(v.id)}
              aria-label={v.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition',
                active ? 'text-stone-900' : 'text-stone-400',
              )}
            >
              <span
                className={cn(
                  'relative flex h-7 w-12 items-center justify-center rounded-full transition',
                  active && 'bg-brand-300/70',
                )}
              >
                <Icon size={18} />
                {v.id === 'week' && examChip && (
                  <span className="absolute -right-0.5 -top-0.5 rounded-full bg-indigo-500 px-1 text-[9px] font-bold leading-tight text-white ring-2 ring-white">
                    {examChip}
                  </span>
                )}
              </span>
              {v.shortLabel}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
