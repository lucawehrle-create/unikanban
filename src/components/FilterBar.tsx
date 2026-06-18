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
    <div className="flex flex-wrap items-center gap-2 px-5 py-2">
      {/* Suche */}
      <div className="flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 shadow-sm ring-1 ring-stone-200/70 backdrop-blur focus-within:ring-2 focus-within:ring-brand-400">
        <Search size={14} className="text-stone-400" />
        <input
          id="search"
          value={ui.search}
          onChange={(e) => ui.setSearch(e.target.value)}
          placeholder="Suchen…"
          className="w-32 bg-transparent text-sm outline-none placeholder:text-stone-400"
        />
      </div>

      <div className="h-5 w-px bg-stone-200" />

      {/* Kurs-Filter */}
      {courses.map((c) => {
        const active = ui.filterCourseIds.includes(c.id)
        return (
          <button
            key={c.id}
            onClick={() => ui.toggleCourseFilter(c.id)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold transition',
              active ? 'text-white' : 'text-stone-600',
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

      <div className="h-5 w-px bg-stone-200" />

      {/* Typ-Filter */}
      {TASK_TYPE_LIST.filter((t) => t.id !== 'sonstiges').map((t) => {
        const active = ui.filterTypes.includes(t.id)
        return (
          <button
            key={t.id}
            onClick={() => ui.toggleTypeFilter(t.id)}
            title={t.label}
            className={cn(
              'rounded-full px-2 py-1 text-xs shadow-sm ring-1 transition',
              active
                ? 'bg-stone-900 text-white ring-stone-900'
                : 'bg-white/70 text-stone-500 ring-stone-200/70 hover:bg-white',
            )}
          >
            {t.emoji}
          </button>
        )
      })}

      {hasFilters && (
        <button
          onClick={ui.clearFilters}
          className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-xs text-stone-500 shadow-sm ring-1 ring-stone-200/70 hover:bg-white"
        >
          <X size={12} /> Filter
        </button>
      )}

      {/* Gruppierung (nur Board) */}
      {ui.view === 'board' && (
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-stone-400">Gruppieren:</span>
          <div className="flex rounded-full bg-white/70 p-1 shadow-sm ring-1 ring-stone-200/70 backdrop-blur">
            {GROUP_OPTIONS.map((g) => (
              <button
                key={g.id}
                onClick={() => ui.setGroupBy(g.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition',
                  ui.groupBy === g.id
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-800',
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
