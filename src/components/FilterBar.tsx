import { Search, X } from 'lucide-react'
import type { Course } from '@/db/types'
import { TASK_TYPE_LIST } from '@/lib/taskTypes'
import { useUI, type GroupBy } from '@/store/ui'
import { cn } from '@/lib/cn'

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'course', label: 'Kurs' },
  { id: 'type', label: 'Typ' },
]

export function FilterBar({ courses }: { courses: Course[] }) {
  const ui = useUI()
  const hasFilters =
    ui.search.trim() !== '' || ui.filterCourseIds.length > 0 || ui.filterTypes.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2">
      {/* Suche */}
      <div className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-sky-400 dark:bg-slate-800 dark:ring-slate-700">
        <Search size={14} className="text-slate-400" />
        <input
          id="search"
          value={ui.search}
          onChange={(e) => ui.setSearch(e.target.value)}
          placeholder="Suchen…"
          className="w-32 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
      </div>

      <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

      {/* Kurs-Filter */}
      {courses.map((c) => {
        const active = ui.filterCourseIds.includes(c.id)
        return (
          <button
            key={c.id}
            onClick={() => ui.toggleCourseFilter(c.id)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold transition',
              active ? 'text-white' : 'text-slate-600 dark:text-slate-300',
            )}
            style={{
              backgroundColor: active ? c.color : c.color + '22',
              color: active ? '#fff' : c.color,
            }}
          >
            {c.short}
          </button>
        )
      })}

      <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

      {/* Typ-Filter */}
      {TASK_TYPE_LIST.filter((t) => t.id !== 'sonstiges').map((t) => {
        const active = ui.filterTypes.includes(t.id)
        return (
          <button
            key={t.id}
            onClick={() => ui.toggleTypeFilter(t.id)}
            title={t.label}
            className={cn(
              'rounded-full px-2 py-1 text-xs transition',
              active
                ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            {t.emoji}
          </button>
        )
      })}

      {hasFilters && (
        <button
          onClick={ui.clearFilters}
          className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:bg-slate-800"
        >
          <X size={12} /> Filter
        </button>
      )}

      {/* Gruppierung (nur Board) */}
      {ui.view === 'board' && (
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-slate-400">Gruppieren:</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {GROUP_OPTIONS.map((g) => (
              <button
                key={g.id}
                onClick={() => ui.setGroupBy(g.id)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium transition',
                  ui.groupBy === g.id
                    ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
