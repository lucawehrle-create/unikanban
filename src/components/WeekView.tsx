import { useMemo, useState } from 'react'
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  parseISO,
  startOfDay,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronDown, ChevronRight } from 'lucide-react'
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

const cardGrid = 'grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]'

export function WeekView({ tasks, courses }: WeekViewProps) {
  const editTask = useUI((s) => s.editTask)
  const byId = useMemo(() => courseMap(courses), [courses])
  const [showOverdue, setShowOverdue] = useState(true)

  // Nur heute … Sonntag (vergangene Wochentage sind reiner Ballast)
  const days = useMemo(() => {
    const now = new Date()
    return eachDayOfInterval({
      start: startOfDay(now),
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

  const upcomingCount = days.reduce(
    (n, day) => n + dated.filter((t) => isSameDay(parseISO(t.dueDate!), day)).length,
    0,
  )

  return (
    <div className="h-full overflow-y-auto px-5 pb-6">
      <div className="mx-auto max-w-6xl space-y-2.5">
        {/* Überfällig – einklappbarer Aufhol-Stapel */}
        {overdue.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-red-50/60 p-3">
            <button
              onClick={() => setShowOverdue((s) => !s)}
              className="flex w-full items-center gap-1.5 px-1 text-sm font-semibold text-red-600"
            >
              {showOverdue ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              ⚠️ Überfällig ({overdue.length})
              {!showOverdue && (
                <span className="ml-1 text-xs font-normal text-red-400">– zum Aufholen</span>
              )}
            </button>
            {showOverdue && <div className={cn(cardGrid, 'mt-2')}>{overdue.map(renderCard)}</div>}
          </section>
        )}

        {/* Heute … Sonntag */}
        {days.map((day) => {
          const items = dated
            .filter((t) => isSameDay(parseISO(t.dueDate!), day))
            .sort((a, b) => dueSortKey(a.dueDate) - dueSortKey(b.dueDate))
          const empty = items.length === 0

          if (empty) {
            // kompakte, dezente Zeile für freie Tage
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex items-center gap-2 px-1 py-1 text-xs',
                  isToday(day) ? 'text-stone-900' : 'text-stone-400',
                )}
              >
                <span className="font-medium capitalize">{format(day, 'EEEE', { locale: de })}</span>
                <span className="text-stone-300">{format(day, 'd. MMM', { locale: de })}</span>
                {isToday(day) && (
                  <span className="rounded-full bg-brand-300 px-2 text-[11px] font-semibold text-stone-900">
                    heute
                  </span>
                )}
                <span className="flex-1 border-t border-dashed border-stone-200" />
                <span className="text-stone-300">frei</span>
              </div>
            )
          }

          return (
            <section
              key={day.toISOString()}
              className={cn(
                'rounded-2xl p-2.5',
                isToday(day) && 'bg-brand-100/50 ring-1 ring-brand-200',
              )}
            >
              <h3
                className={cn(
                  'mb-2 flex items-baseline gap-2 px-1 text-sm font-semibold',
                  isToday(day) ? 'text-stone-900' : 'text-stone-600',
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
                <span className="ml-auto text-xs font-normal text-stone-400">
                  {items.length} {items.length === 1 ? 'Aufgabe' : 'Aufgaben'}
                </span>
              </h3>
              <div className={cardGrid}>{items.map(renderCard)}</div>
            </section>
          )
        })}

        {upcomingCount === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-200 py-10 text-center text-sm text-stone-400">
            🎉 Nichts mehr fällig diese Woche.
          </div>
        )}
      </div>
    </div>
  )
}
