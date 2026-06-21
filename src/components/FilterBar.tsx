import { Check, Filter, GraduationCap, Layers, Search, SlidersHorizontal, X } from 'lucide-react'
import type { Course } from '@/db/types'
import { SELECTABLE_TASK_TYPES } from '@/lib/taskTypes'
import { useUI, type ExamPrepFilter, type GroupBy, type SortBy } from '@/store/ui'
import { Popover } from './ui/Popover'
import { cn } from '@/lib/cn'

const EXAM_PREP_OPTIONS: { id: ExamPrepFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'only', label: 'Nur Lernplan' },
  { id: 'hide', label: 'Ohne Lernplan' },
]

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'deadline', label: 'Frist' },
  { id: 'priority', label: 'Priorität' },
  { id: 'course', label: 'Kurs' },
  { id: 'type', label: 'Typ' },
]
const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: 'deadline', label: 'Fälligkeit' },
  { id: 'priority', label: 'Priorität' },
  { id: 'title', label: 'Titel (A–Z)' },
  { id: 'created', label: 'Zuletzt erstellt' },
]

/** Eine Zeile im Menü (Radio-Auswahl). */
function Option({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition',
        active ? 'bg-brand-100 font-medium text-stone-800' : 'text-stone-600 hover:bg-stone-100',
      )}
    >
      {label}
      {active && <Check size={14} className="text-brand-600" />}
    </button>
  )
}

export function FilterBar({ courses }: { courses: Course[] }) {
  const ui = useUI()
  const activeFilters =
    ui.filterCourseIds.length +
    ui.filterTypes.length +
    (ui.showDone ? 0 : 1) +
    (ui.examPrep !== 'all' ? 1 : 0)

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
          className="w-36 bg-transparent text-sm outline-none placeholder:text-stone-400"
        />
        {ui.search && (
          <button onClick={() => ui.setSearch('')} className="text-stone-300 hover:text-stone-500">
            <X size={13} />
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Filter-Menü */}
        <Popover label="Filter" icon={<Filter size={13} />} badge={activeFilters} width={280}>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Kurse
              </div>
              <div className="flex flex-wrap gap-1.5">
                {courses.map((c) => {
                  const active = ui.filterCourseIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => ui.toggleCourseFilter(c.id)}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold transition"
                      style={{
                        backgroundColor: active ? c.color : c.color + '22',
                        color: active ? '#fff' : c.color,
                      }}
                    >
                      {c.short}
                    </button>
                  )
                })}
                {courses.length === 0 && <span className="text-xs text-stone-400">keine Kurse</span>}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Typen
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SELECTABLE_TASK_TYPES.filter((t) => t.id !== 'sonstiges').map((t) => {
                  const active = ui.filterTypes.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => ui.toggleTypeFilter(t.id)}
                      className={cn(
                        'rounded-full px-2 py-1 text-xs transition',
                        active
                          ? 'bg-stone-900 text-white'
                          : 'bg-stone-100 text-stone-500 hover:bg-stone-200',
                      )}
                    >
                      {t.emoji} {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-stone-100 pt-2.5">
              <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                <GraduationCap size={12} /> Klausurvorbereitung
              </div>
              <div className="flex rounded-lg bg-stone-100 p-0.5">
                {EXAM_PREP_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => ui.setExamPrep(o.id)}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1 text-xs font-medium transition',
                      ui.examPrep === o.id ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => ui.setShowDone(!ui.showDone)}
              className="flex w-full items-center justify-between rounded-lg border-t border-stone-100 px-1 pt-2.5 text-sm text-stone-600"
            >
              Erledigte anzeigen
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded',
                  ui.showDone ? 'bg-brand-400 text-stone-900' : 'ring-1 ring-stone-300',
                )}
              >
                {ui.showDone && <Check size={12} strokeWidth={3} />}
              </span>
            </button>

            {activeFilters > 0 && (
              <button
                onClick={ui.clearFilters}
                className="flex w-full items-center justify-center gap-1 rounded-lg bg-stone-100 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-200"
              >
                <X size={12} /> Filter zurücksetzen
              </button>
            )}
          </div>
        </Popover>

        {/* Ansicht-Menü (nur Board) */}
        {ui.view === 'board' && (
          <Popover label="Ansicht" icon={<SlidersHorizontal size={13} />} width={220}>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  Gruppieren
                </div>
                {GROUP_OPTIONS.map((g) => (
                  <Option
                    key={g.id}
                    label={g.label}
                    active={ui.groupBy === g.id}
                    onClick={() => ui.setGroupBy(g.id)}
                  />
                ))}
              </div>
              <div className="border-t border-stone-100 pt-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  Sortieren
                </div>
                {SORT_OPTIONS.map((o) => (
                  <Option
                    key={o.id}
                    label={o.label}
                    active={ui.sortBy === o.id}
                    onClick={() => ui.setSortBy(o.id)}
                  />
                ))}
              </div>
              <div className="border-t border-stone-100 pt-2.5">
                <button
                  onClick={() => ui.setShowAllSeries(!ui.showAllSeries)}
                  className="flex w-full items-center justify-between rounded-lg px-1 text-sm text-stone-600"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers size={13} /> Nur kommende Wochen
                  </span>
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded',
                      !ui.showAllSeries ? 'bg-brand-400 text-stone-900' : 'ring-1 ring-stone-300',
                    )}
                  >
                    {!ui.showAllSeries && <Check size={12} strokeWidth={3} />}
                  </span>
                </button>
                <p className="mt-1 px-1 text-[11px] text-stone-400">
                  Zeigt von wöchentlichen Aufgaben nur die nächsten – statt aller auf einmal.
                </p>
              </div>
            </div>
          </Popover>
        )}
      </div>
    </div>
  )
}
