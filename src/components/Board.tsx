import { useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { BookOpen, FilterX, ListPlus, Plus } from 'lucide-react'
import type { Course, Task, TaskStatus } from '@/db/types'
import { TASK_TYPE_LIST } from '@/lib/taskTypes'
import { classifyDue, dueSortKey } from '@/lib/deadline'
import { priorityRank } from '@/lib/priority'
import { courseMap } from '@/lib/filter'
import { staggerSeries } from '@/lib/series'
import { setTaskStatus } from '@/lib/actions'
import { useUI, type GroupBy, type SortBy } from '@/store/ui'
import { TaskCard } from './TaskCard'
import { EmptyState } from './EmptyState'
import { cn } from '@/lib/cn'

interface BoardProps {
  tasks: Task[]
  courses: Course[]
  /** Gibt es im Semester überhaupt Aufgaben (vor Filterung)? */
  hasTasks: boolean
}

interface ColumnDef {
  id: string
  title: string
  accent?: string
}

const STATUS_COLUMNS: ColumnDef[] = [
  { id: 'offen', title: 'Offen' },
  { id: 'dran', title: 'In Arbeit', accent: '#0ea5e9' },
  { id: 'erledigt', title: 'Erledigt', accent: '#10b981' },
]

const DEADLINE_COLUMNS: ColumnDef[] = [
  { id: 'overdue', title: 'Überfällig', accent: '#ef4444' },
  { id: 'today', title: 'Heute', accent: '#f97316' },
  { id: 'week', title: 'Diese Woche', accent: '#eab308' },
  { id: 'later', title: 'Später', accent: '#94a3b8' },
  { id: 'done', title: 'Erledigt', accent: '#10b981' },
]

function sortTasks(tasks: Task[], sortBy: SortBy): Task[] {
  const arr = [...tasks]
  switch (sortBy) {
    case 'priority':
      return arr.sort(
        (a, b) =>
          priorityRank(b.priority) - priorityRank(a.priority) ||
          dueSortKey(a.dueDate) - dueSortKey(b.dueDate),
      )
    case 'title':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'de'))
    case 'created':
      return arr.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    case 'deadline':
    default:
      return arr.sort(
        (a, b) =>
          dueSortKey(a.dueDate) - dueSortKey(b.dueDate) ||
          priorityRank(b.priority) - priorityRank(a.priority) ||
          a.order - b.order,
      )
  }
}

const PRIORITY_COLUMNS: ColumnDef[] = [
  { id: 'hoch', title: 'Hoch', accent: '#ef4444' },
  { id: 'mittel', title: 'Mittel', accent: '#f59e0b' },
  { id: 'niedrig', title: 'Niedrig', accent: '#64748b' },
  { id: '__none', title: 'Ohne Priorität' },
]

function buildColumns(tasks: Task[], courses: Course[], groupBy: GroupBy) {
  const groups = new Map<string, Task[]>()
  let columns: ColumnDef[] = []

  const push = (key: string, t: Task) => {
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  if (groupBy === 'status') {
    columns = STATUS_COLUMNS
    for (const t of tasks) push(t.status, t)
  } else if (groupBy === 'deadline') {
    columns = DEADLINE_COLUMNS
    for (const t of tasks) {
      if (t.status === 'erledigt') {
        push('done', t)
        continue
      }
      const c = classifyDue(t.dueDate)
      if (c === 'overdue') push('overdue', t)
      else if (c === 'today') push('today', t)
      else if (c === 'soon' || c === 'week') push('week', t)
      else push('later', t)
    }
  } else if (groupBy === 'priority') {
    columns = PRIORITY_COLUMNS
    for (const t of tasks) push(t.priority ?? '__none', t)
  } else if (groupBy === 'course') {
    columns = courses.map((c) => ({ id: c.id, title: `${c.short} · ${c.name}`, accent: c.color }))
    columns.push({ id: '__none', title: 'Ohne Kurs' })
    const known = new Set(courses.map((c) => c.id))
    for (const t of tasks) push(t.courseId && known.has(t.courseId) ? t.courseId : '__none', t)
  } else {
    const present = new Set(tasks.map((t) => t.type))
    columns = TASK_TYPE_LIST.filter((d) => present.has(d.id)).map((d) => ({
      id: d.id,
      title: `${d.emoji} ${d.label}`,
    }))
    for (const t of tasks) push(t.type, t)
  }

  return { columns, groups }
}

/** Kontextueller Hinweis für eine leere Spalte statt eines generischen „leer“. */
function emptyColumnHint(colId: string, groupBy: GroupBy): string {
  if (groupBy === 'status') {
    if (colId === 'dran') return 'Zieh eine Aufgabe hierher, wenn du loslegst'
    if (colId === 'erledigt') return 'Hier sammeln sich erledigte Aufgaben'
  }
  if (colId === 'done') return 'Hier sammeln sich erledigte Aufgaben'
  return 'Nichts hier'
}

function Droppable({
  id,
  enabled,
  children,
  className,
}: {
  id: string
  enabled: boolean
  children: ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && 'ring-2 ring-brand-400/70')}>
      {children}
    </div>
  )
}

function Draggable({
  task,
  enabled,
  children,
}: {
  task: Task
  enabled: boolean
  children: ReactNode
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.id,
    disabled: !enabled,
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(enabled && 'cursor-grab active:cursor-grabbing', isDragging && 'opacity-40')}
    >
      {children}
    </div>
  )
}

export function Board({ tasks, courses, hasTasks }: BoardProps) {
  const groupBy = useUI((s) => s.groupBy)
  const sortBy = useUI((s) => s.sortBy)
  const showAllSeries = useUI((s) => s.showAllSeries)
  const editTask = useUI((s) => s.editTask)
  const setShowCourseManager = useUI((s) => s.setShowCourseManager)
  const clearFilters = useUI((s) => s.clearFilters)
  const setShowDone = useUI((s) => s.setShowDone)
  const byId = useMemo(() => courseMap(courses), [courses])
  const [activeId, setActiveId] = useState<string | null>(null)
  // Auf dem Handy ist immer genau eine Spalte sichtbar (per Tab gewählt).
  const [mobileCol, setMobileCol] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const dndEnabled = groupBy === 'status'

  const shown = useMemo(
    () => (showAllSeries ? tasks : staggerSeries(tasks, 2)),
    [tasks, showAllSeries],
  )

  const { columns, groups } = useMemo(
    () => buildColumns(shown, courses, groupBy),
    [shown, courses, groupBy],
  )

  // Leerer Bildschirm – je nach Grund mit passender nächster Aktion.
  // Hinweis: muss NACH allen Hooks stehen (sonst React-Hook-Order-Fehler).
  if (tasks.length === 0) {
    if (courses.length === 0) {
      return (
        <EmptyState
          icon={<BookOpen size={26} />}
          title="Leg deine Kurse an"
          description="Trag deine Kurse ein – mit Vorlesungszeiten und optional wöchentlichen Aufgaben (z. B. Übungsblättern). Daraus baut SemBan automatisch deinen Plan fürs ganze Semester."
          primary={{
            label: 'Kurse anlegen',
            icon: <Plus size={16} />,
            onClick: () => setShowCourseManager(true),
          }}
        />
      )
    }
    if (!hasTasks) {
      return (
        <EmptyState
          icon={<ListPlus size={26} />}
          title="Noch keine Aufgaben"
          description="Erfasse oben deine erste Aufgabe – tipp einfach den Titel. Oder lass dir aus deinen Kursen automatisch wöchentliche Aufgaben erstellen."
          primary={{
            label: 'Aufgabe erfassen',
            icon: <Plus size={16} />,
            onClick: () => document.getElementById('quickadd')?.focus(),
          }}
          secondary={{
            label: 'Kurse verwalten',
            onClick: () => setShowCourseManager(true),
          }}
        />
      )
    }
    return (
      <EmptyState
        icon={<FilterX size={26} />}
        title="Nichts gefunden"
        description="Zu deiner Suche bzw. den aktiven Filtern passt gerade keine Aufgabe."
        primary={{
          label: 'Filter zurücksetzen',
          icon: <FilterX size={16} />,
          onClick: () => {
            clearFilters()
            setShowDone(true)
          },
        }}
      />
    )
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : undefined

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    if (!e.over) return
    const target = String(e.over.id) as TaskStatus
    const task = tasks.find((t) => t.id === String(e.active.id))
    if (task && task.status !== target) {
      void setTaskStatus(task.id, target)
      if (target === 'erledigt') useUI.getState().maybeReflect(task)
    }
  }

  // ---- Desktop: Spalten nebeneinander, Drag & Drop ----
  const desktopGrid = (
    <div className="flex h-full gap-4 overflow-x-auto px-5 pb-5">
      {columns.map((col) => {
        const items = sortTasks(groups.get(col.id) ?? [], sortBy)
        // Deadline-Gruppierung: dringliche Spaltenköpfe einfärben – dann tragen
        // sie das Signal und die Karten unterdrücken ihre Dringlichkeitszeile.
        const overdueCol = groupBy === 'deadline' && col.id === 'overdue'
        const todayCol = groupBy === 'deadline' && col.id === 'today'
        const headTint = overdueCol ? 'bg-red-50' : todayCol ? 'bg-orange-50' : ''
        const badgeCls = overdueCol
          ? 'bg-red-100 text-red-700'
          : todayCol
            ? 'bg-orange-100 text-orange-700'
            : 'bg-stone-100 text-stone-500'
        return (
          <Droppable
            key={col.id}
            id={col.id}
            enabled={dndEnabled}
            className="flex max-h-full min-w-[280px] flex-1 flex-col rounded-3xl bg-white/40 p-2.5 ring-1 ring-stone-200/60 backdrop-blur"
          >
            <div
              className={cn(
                'flex items-center justify-between rounded-xl px-2 py-1.5',
                headTint,
              )}
            >
              <div className="flex items-center gap-2">
                {col.accent && (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.accent }} />
                )}
                <span className="text-sm font-semibold text-stone-700">{col.title}</span>
              </div>
              <span
                className={cn('rounded-full px-2 text-xs font-semibold tabular-nums', badgeCls)}
              >
                {items.length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-1">
              {items.map((t) => (
                <Draggable key={t.id} task={t} enabled={dndEnabled}>
                  <TaskCard
                    task={t}
                    course={t.courseId ? byId.get(t.courseId) : undefined}
                    onClick={() => editTask(t.id)}
                    dragging={activeId === t.id}
                    suppressUrgency={overdueCol || todayCol}
                  />
                </Draggable>
              ))}
              {items.length === 0 && (
                <div className="px-2 py-6 text-center text-xs text-stone-500">
                  {emptyColumnHint(col.id, groupBy)}
                </div>
              )}
            </div>
          </Droppable>
        )
      })}
    </div>
  )

  // ---- Mobil: Spalten-Tabs + eine Spalte als vertikale Liste ----
  // Bei Deadline-Gruppierung standardmäßig auf die erste nicht-leere dringliche
  // Spalte (Überfällig → Heute) starten, sonst auf die erste Spalte.
  const fallbackCol =
    groupBy === 'deadline'
      ? (['overdue', 'today'].find((id) => (groups.get(id) ?? []).length) ?? columns[0]?.id)
      : columns[0]?.id
  const activeColId =
    mobileCol && columns.some((c) => c.id === mobileCol) ? mobileCol : fallbackCol
  const activeItems = activeColId ? sortTasks(groups.get(activeColId) ?? [], sortBy) : []
  const activeSuppressUrgency =
    groupBy === 'deadline' && (activeColId === 'overdue' || activeColId === 'today')

  const mobileView = (
    <div className="flex h-full flex-col sm:hidden">
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
        {columns.map((col) => {
          const count = (groups.get(col.id) ?? []).length
          const active = col.id === activeColId
          return (
            <button
              key={col.id}
              onClick={() => setMobileCol(col.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition',
                active ? 'bg-stone-900 text-white' : 'bg-white/70 text-stone-500 ring-1 ring-stone-200/70',
              )}
            >
              {col.accent && (
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.accent }} />
              )}
              {col.title}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  active ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 pb-5">
        {activeItems.map((t) => (
          <div key={t.id} className="space-y-1">
            <TaskCard
              task={t}
              course={t.courseId ? byId.get(t.courseId) : undefined}
              onClick={() => editTask(t.id)}
              suppressUrgency={activeSuppressUrgency}
            />
            {dndEnabled && <MobileMove task={t} />}
          </div>
        ))}
        {activeItems.length === 0 && (
          <div className="py-12 text-center text-sm text-stone-500">
            {activeColId ? emptyColumnHint(activeColId, groupBy) : 'Nichts in dieser Spalte.'}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {mobileView}
      <div className="hidden h-full sm:block">
        {dndEnabled ? (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {desktopGrid}
            <DragOverlay>
              {activeTask && (
                <div className="w-72">
                  <TaskCard
                    task={activeTask}
                    course={activeTask.courseId ? byId.get(activeTask.courseId) : undefined}
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          desktopGrid
        )}
      </div>
    </>
  )
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  offen: 'Offen',
  dran: 'In Arbeit',
  erledigt: 'Erledigt',
}

/** Schnelles Verschieben einer Aufgabe per Tipp (mobil, statt Drag&Drop). */
function MobileMove({ task }: { task: Task }) {
  const others = (['offen', 'dran', 'erledigt'] as TaskStatus[]).filter((s) => s !== task.status)
  return (
    <div className="flex gap-1.5 pl-1">
      {others.map((s) => (
        <button
          key={s}
          onClick={() => {
            void setTaskStatus(task.id, s)
            if (s === 'erledigt') useUI.getState().maybeReflect(task)
          }}
          className="rounded-full bg-white/60 px-2.5 py-1 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200/70 transition active:bg-stone-100"
        >
          → {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  )
}
