import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { addDays, format, isSameDay, isToday, parseISO, startOfWeek } from 'date-fns'
import type { Course, SlotKind, Task } from '@/db/types'
import { courseMap } from '@/lib/filter'
import { slotKindShort } from '@/lib/slotKinds'
import { TASK_TYPES } from '@/lib/taskTypes'
import { useUI } from '@/store/ui'
import { cn } from '@/lib/cn'

interface ScheduleProps {
  courses: Course[]
  tasks: Task[]
}

const WEEKDAY_LABEL = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const PX_PER_HOUR = 56

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

interface SlotView {
  courseId: string
  short: string
  color: string
  kind: SlotKind
  weekday: number
  start: number
  end: number
  room?: string
}

export function Schedule({ courses, tasks }: ScheduleProps) {
  const editTask = useUI((s) => s.editTask)
  const byId = useMemo(() => courseMap(courses), [courses])

  const slots = useMemo<SlotView[]>(
    () =>
      courses.flatMap((c) =>
        c.slots.map((s) => ({
          courseId: c.id,
          short: c.short,
          color: c.color,
          kind: s.kind,
          weekday: s.weekday,
          start: toMin(s.start),
          end: toMin(s.end),
          room: s.room,
        })),
      ),
    [courses],
  )

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])

  // Aufgaben dieser Woche nach Wochentag
  const tasksByDay = useMemo(() => {
    const map = new Map<number, Task[]>()
    for (const t of tasks) {
      if (!t.dueDate) continue
      const d = parseISO(t.dueDate)
      for (let wd = 1; wd <= 7; wd++) {
        if (isSameDay(d, addDays(weekStart, wd - 1))) {
          if (!map.has(wd)) map.set(wd, [])
          map.get(wd)!.push(t)
        }
      }
    }
    return map
  }, [tasks, weekStart])

  // angezeigte Tage + Zeitfenster dynamisch aus den Daten
  const maxWeekday = Math.max(5, ...slots.map((s) => s.weekday), ...[...tasksByDay.keys()])
  const days = Array.from({ length: maxWeekday }, (_, i) => i + 1)

  const startHour = slots.length
    ? Math.max(6, Math.floor(Math.min(...slots.map((s) => s.start)) / 60) - 1)
    : 8
  const endHour = slots.length
    ? Math.min(22, Math.ceil(Math.max(...slots.map((s) => s.end)) / 60) + 1)
    : 18
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const gridHeight = (endHour - startHour) * PX_PER_HOUR

  if (slots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-stone-400">
        <Clock />
        <p>Noch keine Termine. Füge im Kurs-Manager Vorlesungen & Tutorien hinzu.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto px-5 pb-6">
      <div className="mx-auto min-w-[640px] max-w-5xl">
        {/* Kopfzeile: Tage + fällige Aufgaben */}
        <div className="sticky top-0 z-10 flex pb-2">
          <div className="w-12 shrink-0" />
          {days.map((wd) => {
            const date = addDays(weekStart, wd - 1)
            const dayTasks = tasksByDay.get(wd) ?? []
            return (
              <div key={wd} className="flex-1 px-1">
                <div
                  className={cn(
                    'mb-1 flex items-baseline gap-1.5 rounded-xl px-2 py-1',
                    isToday(date) ? 'bg-brand-300/60' : '',
                  )}
                >
                  <span className="text-sm font-semibold text-stone-700">{WEEKDAY_LABEL[wd - 1]}</span>
                  <span className="text-[11px] text-stone-400">{format(date, 'd.M.')}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {dayTasks.map((t) => {
                    const c = t.courseId ? byId.get(t.courseId) : undefined
                    return (
                      <button
                        key={t.id}
                        onClick={() => editTask(t.id)}
                        title={t.title}
                        className="flex max-w-full items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-600 shadow-sm ring-1 ring-stone-200/80 hover:ring-stone-300"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: c?.color ?? '#a8a29e' }}
                        />
                        <span className="truncate">
                          {TASK_TYPES[t.type].emoji} {t.title}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Raster */}
        <div className="flex">
          {/* Zeitachse */}
          <div className="w-12 shrink-0" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div key={h} className="relative" style={{ height: PX_PER_HOUR }}>
                <span className="absolute -top-2 right-1 text-[10px] text-stone-400">{h}:00</span>
              </div>
            ))}
          </div>

          {/* Tagespalten */}
          {days.map((wd) => {
            const date = addDays(weekStart, wd - 1)
            const daySlots = slots.filter((s) => s.weekday === wd)
            return (
              <div
                key={wd}
                className={cn(
                  'relative flex-1 rounded-xl border-l border-stone-200/70',
                  isToday(date) && 'bg-brand-50/50',
                )}
                style={{ height: gridHeight }}
              >
                {/* Stundenlinien */}
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-stone-200/50"
                    style={{ top: i * PX_PER_HOUR }}
                  />
                ))}

                {/* Slots */}
                {daySlots.map((s, i) => {
                  const top = ((s.start - startHour * 60) / 60) * PX_PER_HOUR
                  const height = ((s.end - s.start) / 60) * PX_PER_HOUR
                  return (
                    <div
                      key={i}
                      className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-[11px] leading-tight shadow-sm"
                      style={{
                        top,
                        height: Math.max(height - 2, 18),
                        backgroundColor: s.color + '22',
                        borderLeft: `3px solid ${s.color}`,
                      }}
                    >
                      <div className="font-semibold" style={{ color: s.color }}>
                        {s.short}
                      </div>
                      <div className="text-stone-500">
                        {slotKindShort(s.kind)}
                        {s.room ? ` · ${s.room}` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
