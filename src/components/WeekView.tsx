import { useMemo } from 'react'
import {
  eachDayOfInterval,
  endOfWeek,
  isSameDay,
  isToday,
  parseISO,
  startOfWeek,
  format,
} from 'date-fns'
import { de } from 'date-fns/locale'
import type { Course, Task } from '@/db/types'
import { classifyDue, dueSortKey } from '@/lib/deadline'
import { courseMap } from '@/lib/filter'
import { useUI } from '@/store/ui'
import { TaskCard } from './TaskCard'
import { cn } from '@/lib/cn'

interface WeekViewProps {
  tasks: Task[]
  courses: Course[]
}

export function WeekView({ tasks, courses }: WeekViewProps) {
  const editTask = useUI((s) => s.editTask)
  const byId = useMemo(() => courseMap(courses), [courses])

  const days = useMemo(() => {
    const now = new Date()
    return eachDayOfInterval({
      start: startOfWeek(now, { weekStartsOn: 1 }),
      end: endOfWeek(now, { weekStartsOn: 1 }),
    })
  }, [])

  const dated = tasks.filter((t) => t.dueDate)
  const overdue = dated
    .filter((t) => t.status !== 'erledigt' && classifyDue(t.dueDate) === 'overdue')
    .sort((a, b) => dueSortKey(a.dueDate) - dueSortKey(b.dueDate))

  const renderCard = (t: Task) => (
    <TaskCard
      key={t.id}
      task={t}
      course={t.courseId ? byId.get(t.courseId) : undefined}
      onClick={() => editTask(t.id)}
    />
  )

  const cardGrid = 'grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]'

  return (
    <div className="h-full overflow-y-auto px-5 pb-6">
      <div className="mx-auto max-w-6xl space-y-3">
        {overdue.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-red-50/60 p-3">
            <h3 className="mb-2 px-1 text-sm font-semibold text-red-600">
              ⚠️ Überfällig ({overdue.length})
            </h3>
            <div className={cardGrid}>{overdue.map(renderCard)}</div>
          </section>
        )}

        {days.map((day) => {
          const items = dated
            .filter((t) => isSameDay(parseISO(t.dueDate!), day))
            .sort((a, b) => dueSortKey(a.dueDate) - dueSortKey(b.dueDate))
          return (
            <section key={day.toISOString()}>
              <h3
                className={cn(
                  'mb-2 flex items-baseline gap-2 px-1 text-sm font-semibold',
                  isToday(day) ? 'text-stone-900' : 'text-stone-500',
                )}
              >
                <span className="capitalize">{format(day, 'EEEE', { locale: de })}</span>
                <span className="text-xs font-normal text-stone-400">
                  {format(day, 'd. MMM', { locale: de })}
                </span>
                {isToday(day) && (
                  <span className="rounded-full bg-brand-300 px-2 text-[11px] font-semibold text-stone-900">
                    heute
                  </span>
                )}
              </h3>
              {items.length > 0 ? (
                <div className={cardGrid}>{items.map(renderCard)}</div>
              ) : (
                <div className="px-1 pb-1 text-xs text-stone-300">—</div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
