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
  { id: 'dran', title: 'Dran', accent: '#0ea5e9' },
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
          description="Trag deine Kurse mit Vorlesungen, Übungen und wöchentlichen Blättern ein – SemBan erzeugt daraus automatisch deine Aufgaben fürs ganze Semester."
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
          description="Erfasse oben deine erste Aufgabe – z. B. „Blatt 3 #ana @übung !fr“ – oder lass dir aus deinen Kursen wöchentliche Blätter erzeugen."
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
    if (task && task.status !== target) void setTaskStatus(task.id, target)
  }

  const grid = (
    <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-5 sm:gap-4 sm:px-5">
      {columns.map((col) => {
        const items = sortTasks(groups.get(col.id) ?? [], sortBy)
        return (
          <Droppable
            key={col.id}
            id={col.id}
            enabled={dndEnabled}
            className="flex max-h-full min-w-[82vw] flex-1 snap-start flex-col rounded-3xl bg-white/40 p-2.5 ring-1 ring-stone-200/60 backdrop-blur sm:min-w-[280px]"
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="flex items-center gap-2">
                {col.accent && (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: col.accent }}
                  />
                )}
                <span className="text-sm font-semibold text-stone-700">{col.title}</span>
              </div>
              <span className="rounded-full bg-stone-100 px-2 text-xs font-medium text-stone-500">
                {items.length}
              </span>
            </div>

            <div className="grid flex-1 content-start gap-2.5 overflow-y-auto p-1 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
              {items.map((t) => (
                <Draggable key={t.id} task={t} enabled={dndEnabled}>
                  <TaskCard
                    task={t}
                    course={t.courseId ? byId.get(t.courseId) : undefined}
                    onClick={() => editTask(t.id)}
                    dragging={activeId === t.id}
                  />
                </Draggable>
              ))}
              {items.length === 0 && (
                <div className="col-span-full px-2 py-6 text-center text-xs text-stone-400">leer</div>
              )}
            </div>
          </Droppable>
        )
      })}
    </div>
  )

  if (!dndEnabled) return grid

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {grid}
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
  )
}
