import { useState } from 'react'
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  parseISO,
  startOfDay,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { Check, ChevronDown, ChevronRight, Clock, Flag } from 'lucide-react'
import type { Course, SlotKind, Task } from '@/db/types'
import { classifyDue, dueSortKey } from '@/lib/deadline'
import { courseMap } from '@/lib/filter'
import { slotKindLabel } from '@/lib/slotKinds'
import { TASK_TYPES } from '@/lib/taskTypes'
import { staggerSeries } from '@/lib/series'
import { setTaskStatus } from '@/lib/actions'
import { useUI } from '@/store/ui'
import { ExamPhasePanel } from './ExamPhasePanel'
import { cn } from '@/lib/cn'

interface WeekViewProps {
  tasks: Task[]
  courses: Course[]
}

const WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
function fmtT(m: number): string {
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
/** 1=Mo … 7=So */
function isoWd(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

interface ClassItem {
  id: string
  course: Course
  kind: SlotKind
  start: number
  end: number
  room?: string
}

/** Eine Vorlesung/Übung als kompakte Info-Zeile (nicht abhakbar). */
function ClassRow({ c }: { c: ClassItem }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
      <Clock size={15} className="shrink-0 text-stone-300" />
      <span className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: c.course.color }} />
      <span className="shrink-0 text-sm font-semibold" style={{ color: c.course.color }}>
        {c.course.short}
      </span>
      <span className="truncate text-[13px] text-stone-500">
        {slotKindLabel(c.kind)}
        {c.room ? ` · ${c.room}` : ''}
      </span>
      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-stone-400">
        {fmtT(c.start)}–{fmtT(c.end)}
      </span>
    </div>
  )
}

/** Eine Aufgabe als kompakte, abhakbare Zeile. */
function TaskRow({
  t,
  course,
  onOpen,
  onToggle,
  overdue,
}: {
  t: Task
  course?: Course
  onOpen: () => void
  onToggle: () => void
  overdue?: boolean
}) {
  const done = t.status === 'erledigt'
  const days = overdue && t.dueDate ? Math.abs(differenceInCalendarDays(parseISO(t.dueDate), new Date())) : 0
  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/70">
      <button
        onClick={onToggle}
        aria-label={done ? 'Als offen markieren' : 'Als erledigt markieren'}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition',
          done
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-stone-300 hover:border-emerald-400',
        )}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </button>
      <span
        className="h-4 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: course?.color ?? '#cbd5e1' }}
      />
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn('text-sm', done ? 'text-stone-400 line-through' : 'text-stone-800')}>
          <span className="mr-1">{TASK_TYPES[t.type].emoji}</span>
          {t.title}
        </span>
      </button>
      {t.priority === 'hoch' && !done && (
        <Flag size={12} className="shrink-0 text-stone-900" fill="currentColor" />
      )}
      {overdue && (
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-red-600">
          {days === 0 ? 'heute' : `${days} T`}
        </span>
      )}
      {course && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: course.color + '22', color: course.color }}
        >
          {course.short}
        </span>
      )}
    </div>
  )
}

export function WeekView({ tasks, courses }: WeekViewProps) {
  const editTask = useUI((s) => s.editTask)
  const showAllSeries = useUI((s) => s.showAllSeries)
  const byId = courseMap(courses)
  const [showOverdue, setShowOverdue] = useState(true)

  // Heute … Sonntag (vergangene Wochentage sind reiner Ballast).
  const now = new Date()
  const days = eachDayOfInterval({
    start: startOfDay(now),
    end: endOfWeek(now, { weekStartsOn: 1 }),
  })

  const dated = tasks.filter((t) => t.dueDate)
  const overdueAll = dated
    .filter((t) => t.status !== 'erledigt' && classifyDue(t.dueDate) === 'overdue')
    .sort((a, b) => dueSortKey(a.dueDate) - dueSortKey(b.dueDate))
  const overdue = showAllSeries ? overdueAll : staggerSeries(overdueAll, 2)
  const overdueHidden = overdueAll.length - overdue.length

  const classesForDay = (day: Date): ClassItem[] => {
    const wd = isoWd(day)
    return courses
      .flatMap((c) =>
        c.slots
          .filter((s) => s.weekday === wd)
          .map((s) => ({
            id: s.id,
            course: c,
            kind: s.kind,
            start: toMin(s.start),
            end: toMin(s.end),
            room: s.room,
          })),
      )
      .sort((a, b) => a.start - b.start)
  }
  const tasksForDay = (day: Date): Task[] =>
    dated
      .filter((t) => isSameDay(parseISO(t.dueDate!), day))
      .sort((a, b) => dueSortKey(a.dueDate) - dueSortKey(b.dueDate))

  const toggleDone = (t: Task) => {
    const next = t.status === 'erledigt' ? 'offen' : 'erledigt'
    void setTaskStatus(t.id, next)
    if (next === 'erledigt') useUI.getState().maybeReflect(t)
  }

  // Wochenüberblick-Kennzahlen
  const openDeadlines = days.reduce(
    (n, d) => n + tasksForDay(d).filter((t) => t.status !== 'erledigt').length,
    0,
  )
  const classHours = days.reduce(
    (n, d) => n + classesForDay(d).reduce((s, c) => s + (c.end - c.start) / 60, 0),
    0,
  )

  const scrollToDay = (iso: string) =>
    document.getElementById(`week-day-${iso}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const renderDay = (day: Date) => {
    const iso = format(day, 'yyyy-MM-dd')
    const today = isToday(day)
    const classes = classesForDay(day)
    const items = tasksForDay(day)
    const empty = classes.length === 0 && items.length === 0
    const openCount = items.filter((t) => t.status !== 'erledigt').length

    if (empty) {
      return (
        <div
          key={iso}
          id={`week-day-${iso}`}
          className={cn(
            'flex items-center gap-2 px-1 py-1 text-xs',
            today ? 'text-stone-900' : 'text-stone-400',
          )}
        >
          <span className="font-medium capitalize">{format(day, 'EEEE', { locale: de })}</span>
          <span className="text-stone-300">{format(day, 'd. MMM', { locale: de })}</span>
          {today && (
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
        key={iso}
        id={`week-day-${iso}`}
        className={cn(
          'scroll-mt-2 rounded-2xl p-2.5',
          today ? 'bg-brand-100/50 ring-1 ring-brand-200' : 'bg-white/40 ring-1 ring-stone-200/50',
        )}
      >
        <h3
          className={cn(
            'mb-1.5 flex items-baseline gap-2 px-1 text-sm font-semibold',
            today ? 'text-stone-900' : 'text-stone-700',
          )}
        >
          <span className="capitalize">{format(day, 'EEEE', { locale: de })}</span>
          <span className="text-xs font-normal text-stone-400">
            {format(day, 'd. MMM', { locale: de })}
          </span>
          {today && (
            <span className="rounded-full bg-brand-300 px-2 text-[11px] font-semibold text-stone-900">
              heute
            </span>
          )}
          <span className="ml-auto text-xs font-normal text-stone-400">
            {[
              classes.length > 0 &&
                `${classes.length} ${classes.length === 1 ? 'Termin' : 'Termine'}`,
              openCount > 0 && `${openCount} ${openCount === 1 ? 'Abgabe' : 'Abgaben'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </h3>
        <div className="space-y-0.5">
          {classes.map((c) => (
            <ClassRow key={c.id} c={c} />
          ))}
          {items.map((t) => (
            <TaskRow
              key={t.id}
              t={t}
              course={t.courseId ? byId.get(t.courseId) : undefined}
              onOpen={() => editTask(t.id)}
              onToggle={() => toggleDone(t)}
            />
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-5 pb-6">
      <div className="mx-auto max-w-4xl space-y-2.5">
        {/* Klausurphase nur, wenn akut (laufend oder ≤14 Tage) */}
        <ExamPhasePanel onlyImminent />

        {/* Wochenüberblick: Kennzahlen + Tag-Navigator */}
        <div className="rounded-2xl bg-white/50 p-3 ring-1 ring-stone-200/60">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm">
            <span className="font-semibold text-stone-700">Diese Woche</span>
            <span className="text-stone-500">
              <span className="font-semibold text-stone-700 tabular-nums">{openDeadlines}</span>{' '}
              {openDeadlines === 1 ? 'offene Abgabe' : 'offene Abgaben'}
            </span>
            <span className="text-stone-300">·</span>
            <span className="text-stone-500">
              <span className="font-semibold text-stone-700 tabular-nums">
                {Math.round(classHours)}
              </span>{' '}
              h Präsenz
            </span>
            {overdueAll.length > 0 && (
              <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                {overdueAll.length} überfällig
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            {days.map((day) => {
              const iso = format(day, 'yyyy-MM-dd')
              const today = isToday(day)
              const dl = tasksForDay(day).filter((t) => t.status !== 'erledigt').length
              const hasClass = classesForDay(day).length > 0
              return (
                <button
                  key={iso}
                  onClick={() => scrollToDay(iso)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition',
                    today ? 'bg-brand-300/60 text-stone-900' : 'text-stone-500 hover:bg-white',
                  )}
                >
                  <span className="text-[11px] font-semibold">{WD_SHORT[isoWd(day) - 1]}</span>
                  <span className={cn('text-[10px] tabular-nums', today ? 'text-stone-700' : 'text-stone-400')}>
                    {format(day, 'd.M.')}
                  </span>
                  <span className="flex h-4 items-center gap-1">
                    {dl > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-400 px-1 text-[10px] font-bold text-stone-900 tabular-nums">
                        {dl}
                      </span>
                    )}
                    {hasClass && dl === 0 && <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Überfällig – einklappbarer Aufhol-Stapel */}
        {overdueAll.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-red-50/60 p-2.5">
            <button
              onClick={() => setShowOverdue((s) => !s)}
              className="flex w-full items-center gap-1.5 px-1 text-sm font-semibold text-red-600"
            >
              {showOverdue ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              ⚠️ Überfällig ({overdueAll.length})
              {!showOverdue && (
                <span className="ml-1 text-xs font-normal text-red-400">– zum Aufholen</span>
              )}
            </button>
            {showOverdue && (
              <div className="mt-1.5 space-y-0.5">
                {overdue.map((t) => (
                  <TaskRow
                    key={t.id}
                    t={t}
                    course={t.courseId ? byId.get(t.courseId) : undefined}
                    onOpen={() => editTask(t.id)}
                    onToggle={() => toggleDone(t)}
                    overdue
                  />
                ))}
                {overdueHidden > 0 && (
                  <button
                    onClick={() => useUI.getState().setShowAllSeries(true)}
                    className="px-2 pt-1 text-xs font-medium text-red-500 underline-offset-2 hover:underline"
                  >
                    + {overdueHidden} weitere überfällige Serien-Aufgaben anzeigen
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* Heute … Sonntag (Tag 1 = Heute, hervorgehoben) */}
        {days.map(renderDay)}
      </div>
    </div>
  )
}
