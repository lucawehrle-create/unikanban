import { type ReactNode } from 'react'
import {
  BookOpen,
  CalendarCheck,
  Check,
  Filter,
  GraduationCap,
  Group,
  Layers,
  Search,
  Tag,
  X,
} from 'lucide-react'
import type { Course } from '@/db/types'
import { SELECTABLE_TASK_TYPES, TASK_TYPES } from '@/lib/taskTypes'
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

/** Sektions-Überschrift im Menü (einheitlich, mit Icon). */
function SectionHead({ icon: Icon, children }: { icon: typeof Tag; children: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
      <Icon size={12} /> {children}
    </div>
  )
}

/** Entfernbarer Chip für einen aktiven Filter – direkt in der Leiste sichtbar. */
function FilterChip({
  label,
  color,
  onRemove,
}: {
  label: string
  color?: string
  onRemove: () => void
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-medium',
        color ? '' : 'bg-white/70 text-stone-600 shadow-sm ring-1 ring-stone-200/70',
      )}
      style={color ? { backgroundColor: color + '22', color } : undefined}
    >
      {label}
      <button
        onClick={onRemove}
        aria-label="Filter entfernen"
        className="rounded-full p-0.5 transition hover:bg-black/10"
      >
        <X size={11} />
      </button>
    </span>
  )
}

export function FilterBar({ courses }: { courses: Course[] }) {
  const ui = useUI()
  const activeFilters =
    ui.filterCourseIds.length +
    ui.filterTypes.length +
    (ui.showDone ? 0 : 1) +
    (ui.examPrep !== 'all' ? 1 : 0) +
    (ui.dueToday ? 1 : 0)

  const groupLabel = GROUP_OPTIONS.find((g) => g.id === ui.groupBy)?.label ?? 'Ansicht'
  const examPrepLabel = EXAM_PREP_OPTIONS.find((o) => o.id === ui.examPrep)?.label

  // „Alles zurücksetzen" inkl. Erledigte-Sichtbarkeit (clearFilters lässt die aus).
  const resetAll = () => {
    ui.clearFilters()
    ui.setShowDone(true)
  }

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

      {/* Tagesfokus: nur heute fällige & überfällige Aufgaben (nur im Board) */}
      {ui.view === 'board' && (
        <button
          onClick={() => ui.setDueToday(!ui.dueToday)}
          aria-pressed={ui.dueToday}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium shadow-sm ring-1 transition',
            ui.dueToday
              ? 'bg-brand-400 text-stone-900 ring-brand-400'
              : 'bg-white/70 text-stone-600 ring-stone-200/70 backdrop-blur hover:bg-white',
          )}
        >
          <CalendarCheck size={14} className={ui.dueToday ? 'text-stone-900' : 'text-stone-400'} />
          Heute
        </button>
      )}

      {/* Aktive Filter als entfernbare Chips – sofort sichtbar */}
      {ui.filterCourseIds.map((id) => {
        const c = courses.find((x) => x.id === id)
        if (!c) return null
        return (
          <FilterChip
            key={`c-${id}`}
            label={c.short}
            color={c.color}
            onRemove={() => ui.toggleCourseFilter(id)}
          />
        )
      })}
      {ui.filterTypes.map((t) => (
        <FilterChip
          key={`t-${t}`}
          label={`${TASK_TYPES[t].emoji} ${TASK_TYPES[t].label}`}
          onRemove={() => ui.toggleTypeFilter(t)}
        />
      ))}
      {ui.examPrep !== 'all' && examPrepLabel && (
        <FilterChip label={examPrepLabel} onRemove={() => ui.setExamPrep('all')} />
      )}
      {!ui.showDone && <FilterChip label="Erledigte aus" onRemove={() => ui.setShowDone(true)} />}
      {activeFilters > 0 && (
        <button
          onClick={resetAll}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
        >
          <X size={12} /> Alle löschen
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* Filter-Menü */}
        <Popover label="Filter" icon={<Filter size={13} />} badge={activeFilters} width={280}>
          <div className="space-y-3">
            <div>
              <SectionHead icon={BookOpen}>Kurse</SectionHead>
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
              <SectionHead icon={Tag}>Typen</SectionHead>
              <div className="flex flex-wrap gap-1.5">
                {SELECTABLE_TASK_TYPES.filter((t) => t.id !== 'sonstiges').map((t) => {
                  const active = ui.filterTypes.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => ui.toggleTypeFilter(t.id)}
                      className={cn(
                        'rounded-full px-2 py-1 text-xs font-medium transition',
                        active
                          ? 'bg-brand-300 text-stone-900'
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
              <SectionHead icon={GraduationCap}>Klausurvorbereitung</SectionHead>
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
                onClick={resetAll}
                className="flex w-full items-center justify-center gap-1 rounded-lg bg-stone-100 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-200"
              >
                <X size={12} /> Filter zurücksetzen
              </button>
            )}
          </div>
        </Popover>

        {/* Ansicht-Menü (nur Board) – Trigger zeigt die aktuelle Gruppierung */}
        {ui.view === 'board' && (
          <Popover label={groupLabel} icon={<Group size={13} />} width={220}>
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
