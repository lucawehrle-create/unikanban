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
import { Check, ChevronDown, ChevronRight, Flag } from 'lucide-react'
import type { Course, SlotKind, Task } from '@/db/types'
import { classifyDue, dueSortKey } from '@/lib/deadline'
import { courseMap } from '@/lib/filter'
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
/** Kompakte Stunde: "10" oder "10:30". */
function hourFmt(m: number): string {
  return m % 60 === 0 ? String(m / 60) : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
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
}

/** Schlanke Termin-Kontextzeile: welche Kurse, wie viele, welcher Zeitrahmen.
 *  Bewusst OHNE Raum/Detail – das steht im Stundenplan. Abgaben bleiben Fokus. */
function DayClasses({ classes }: { classes: ClassItem[] }) {
  if (!classes.length) return null
  const courses = [...new Map(classes.map((c) => [c.course.id, c.course])).values()]
  const start = Math.min(...classes.map((c) => c.start))
  const end = Math.max(...classes.map((c) => c.end))
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
      <span className="flex">
        {courses.slice(0, 5).map((c) => (
          <span
            key={c.id}
            className="-ml-0.5 h-2 w-2 rounded-full ring-1 ring-white first:ml-0"
            style={{ backgroundColor: c.color }}
          />
        ))}
      </span>
      <span className="tabular-nums">
        {classes.length} {classes.length === 1 ? 'Termin' : 'Termine'} · {hourFmt(start)}–
        {hourFmt(end)} Uhr
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
  const days =
    overdue && t.dueDate ? Math.abs(differenceInCalendarDays(parseISO(t.dueDate), new Date())) : 0
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
          .map((s) => ({ id: s.id, course: c, kind: s.kind, start: toMin(s.start), end: toMin(s.end) })),
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

  const dayHeader = (day: Date, today: boolean, right?: React.ReactNode) => (
    <div className="flex items-baseline gap-2">
      <span
        className={cn(
          'text-[15px] font-semibold capitalize',
          today ? 'text-stone-900' : 'text-stone-700',
        )}
      >
        {format(day, 'EEEE', { locale: de })}
      </span>
      <span className="text-xs font-normal tabular-nums text-stone-400">
        {format(day, 'd. MMM', { locale: de })}
      </span>
      {today && (
        <span className="rounded-full bg-brand-300 px-2 py-0.5 text-[11px] font-bold text-stone-900">
          heute
        </span>
      )}
      {right}
    </div>
  )

  const renderDay = (day: Date) => {
    const iso = format(day, 'yyyy-MM-dd')
    const today = isToday(day)
    const classes = classesForDay(day)
    const items = tasksForDay(day)
    const openCount = items.filter((t) => t.status !== 'erledigt').length

    // Tag ohne Abgaben (und nicht heute) → schlanke Zeile, ggf. mit Termin-Kontext.
    if (!today && items.length === 0) {
      return (
        <div
          key={iso}
          id={`week-day-${iso}`}
          className="flex items-center gap-2 px-1 py-1 text-xs text-stone-400"
        >
          <span className="font-medium capitalize">{format(day, 'EEEE', { locale: de })}</span>
          <span className="text-stone-300">{format(day, 'd. MMM', { locale: de })}</span>
          <span className="min-w-3 flex-1 border-t border-dashed border-stone-200" />
          {classes.length > 0 ? <DayClasses classes={classes} /> : <span className="text-stone-300">frei</span>}
        </div>
      )
    }

    return (
      <section
        key={iso}
        id={`week-day-${iso}`}
        className={cn(
          'scroll-mt-2 rounded-2xl p-3',
          today ? 'bg-brand-100/50 ring-1 ring-brand-200' : 'bg-white/40 ring-1 ring-stone-200/50',
        )}
      >
        <div className="mb-1 flex items-center justify-between px-1">
          {dayHeader(day, today)}
          {openCount > 0 && (
            <span className="text-xs font-medium tabular-nums text-stone-400">
              {openCount} {openCount === 1 ? 'Abgabe' : 'Abgaben'}
            </span>
          )}
        </div>
        {classes.length > 0 && (
          <div className="mb-1.5 px-1">
            <DayClasses classes={classes} />
          </div>
        )}
        {items.length > 0 ? (
          <div className="space-y-0.5">
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
        ) : (
          <p className="px-1 text-xs text-stone-400">Keine Abgaben heute 🎉</p>
        )}
      </section>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-5 pb-6">
      <div className="mx-auto max-w-3xl space-y-2.5">
        {/* Klausurphase nur, wenn akut (laufend oder ≤14 Tage) */}
        <ExamPhasePanel onlyImminent />

        {/* Wochenüberblick: Workload-Hero + Tag-Navigator */}
        <div className="rounded-2xl bg-white/50 p-3 ring-1 ring-stone-200/60">
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums text-stone-800">
                  {openDeadlines}
                </span>
                <span className="text-sm font-medium text-stone-500">
                  {openDeadlines === 1 ? 'offene Abgabe' : 'offene Abgaben'}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-stone-400">
                {Math.round(classHours)} h Präsenz diese Woche
              </div>
            </div>
            {overdueAll.length > 0 && (
              <button
                onClick={() => scrollToDay('overdue')}
                className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200"
              >
                {overdueAll.length} überfällig
              </button>
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
                    'flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition',
                    today ? 'bg-brand-300 text-stone-900 shadow-sm' : 'hover:bg-white',
                  )}
                >
                  <span
                    className={cn('text-[11px] font-semibold', today ? 'text-stone-900' : 'text-stone-500')}
                  >
                    {WD_SHORT[isoWd(day) - 1]}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] tabular-nums',
                      today ? 'text-stone-700' : 'text-stone-400',
                    )}
                  >
                    {format(day, 'd.M.')}
                  </span>
                  <span className="flex h-5 items-center">
                    {dl > 0 ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-400 px-1 text-xs font-bold tabular-nums text-stone-900 ring-1 ring-brand-500/30">
                        {dl}
                      </span>
                    ) : hasClass ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
                    ) : (
                      <span className="text-[10px] text-stone-300">–</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Überfällig – einklappbarer Aufhol-Stapel */}
        {overdueAll.length > 0 && (
          <section
            id="week-day-overdue"
            className="scroll-mt-2 rounded-2xl border border-red-200 bg-red-50/60 p-2.5"
          >
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
