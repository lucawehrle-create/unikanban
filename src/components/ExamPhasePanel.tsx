import { useState } from 'react'
import { GraduationCap, BookOpen, ArrowRight, RotateCcw } from 'lucide-react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useActiveSemester, useCourses, useTasks } from '@/hooks/data'
import { useExamStatus, examBadge } from '@/lib/examPhase'
import { planProgress, rescheduleOverduePlan } from '@/lib/studyPlans'
import { courseMap } from '@/lib/filter'
import { useUI } from '@/store/ui'
import { cn } from '@/lib/cn'

function examChip(dueISO: string): { label: string; cls: string } {
  const d = differenceInCalendarDays(parseISO(dueISO), new Date())
  const label = d <= 0 ? 'heute' : d === 1 ? 'morgen' : `in ${d} Tagen`
  const cls =
    d <= 0
      ? 'bg-red-100 text-red-700'
      : d <= 2
        ? 'bg-orange-100 text-orange-700'
        : d <= 7
          ? 'bg-amber-100 text-amber-700'
          : 'bg-stone-200 text-stone-600'
  return { label, cls }
}

function fmtExamWhen(dueISO: string): string {
  const d = parseISO(dueISO)
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0)
  return format(d, hasTime ? "EEE d. MMM · HH:mm 'Uhr'" : 'EEE d. MMM', { locale: de })
}

/** Übersicht zur Klausurphase: Countdown/Status + anstehende Klausuren.
 *  - voller Überblick (Studium-Ansicht): immer, wenn etwas ansteht.
 *  - onlyImminent (Diese-Woche-Ansicht): nur bei Nähe (laufend oder ≤14 Tage),
 *    damit „Diese Woche" nicht von weit entfernten Terminen dominiert wird. */
export function ExamPhasePanel({ onlyImminent = false }: { onlyImminent?: boolean }) {
  const status = useExamStatus()
  const semester = useActiveSemester()
  const courses = useCourses(semester?.id)
  const allTasks = useTasks(semester?.id)
  const editTask = useUI((s) => s.editTask)
  const openPlans = useUI((s) => s.openPlans)
  const globalMax = useUI((s) => s.studyDailyMaxMin)
  const [busy, setBusy] = useState<string | null>(null)
  if (!status) return null
  if (onlyImminent && !examBadge(status)) return null

  const byId = courseMap(courses)
  const { phase, active, daysUntilStart, dayNum, totalDays, daysLeft, exams } = status
  const pct = active && totalDays > 0 ? Math.min(100, Math.max(0, (dayNum / totalDays) * 100)) : 0

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          <GraduationCap size={15} />
        </span>
        <span className="text-sm font-semibold text-stone-800">Klausurphase</span>
      </div>

      {phase && (
        <div className="rounded-xl bg-stone-50 p-3.5">
          {active ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-stone-700">{phase.label} läuft</span>
                <span className="text-xs text-stone-400">
                  Tag {dayNum} von {totalDays}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 text-xs text-stone-500">
                {daysLeft === 0 ? 'letzter Tag' : `noch ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tage'}`}{' '}
                · bis {format(parseISO(phase.end), 'd. MMM', { locale: de })}
              </div>
            </>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs text-stone-400">{phase.label} startet in</div>
                <div className="mt-0.5 leading-none">
                  <span className="text-3xl font-bold text-indigo-600">{daysUntilStart}</span>
                  <span className="ml-1 text-base font-semibold text-stone-500">
                    {daysUntilStart === 1 ? 'Tag' : 'Tagen'}
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-stone-400">
                {format(parseISO(phase.start), 'd. MMM', { locale: de })} –{' '}
                {format(parseISO(phase.end), 'd. MMM', { locale: de })}
              </div>
            </div>
          )}
        </div>
      )}

      {exams.length > 0 && (
        <div className={cn(phase && 'mt-3')}>
          <div className="mb-1.5 px-0.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Anstehende Klausuren
          </div>
          <div className="space-y-1.5">
            {exams.slice(0, 6).map((t) => {
              const course = t.courseId ? byId.get(t.courseId) : undefined
              const chip = examChip(t.dueDate!)
              const progress = course
                ? planProgress(allTasks, course.id)
                : { total: 0, done: 0, open: 0, overdue: 0, pct: 0 }
              const planned = progress.total
              const loading = busy === t.id
              const catchUp = async () => {
                if (!course?.studyPlan) return
                setBusy(t.id)
                await rescheduleOverduePlan(course, course.studyPlan, courses, allTasks, globalMax)
                setBusy(null)
              }
              return (
                <div key={t.id} className="rounded-lg bg-stone-50 px-3 py-2">
                  <button
                    onClick={() => editTask(t.id)}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <span
                      className="h-7 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: course?.color ?? '#a8a29e' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-stone-800">
                        {t.title}
                      </span>
                      <span className="block truncate text-xs text-stone-400">
                        {[course?.name, fmtExamWhen(t.dueDate!)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                        chip.cls,
                      )}
                    >
                      {chip.label}
                    </span>
                  </button>

                  {/* Lernplan-Aktion (führt in die Lernpläne-Ansicht) */}
                  {course && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-3.5">
                      {planned > 0 ? (
                        <>
                          <span className="flex items-center gap-1 text-xs font-medium text-indigo-600">
                            <BookOpen size={12} /> {progress.done}/{planned} Lern-Sessions
                          </span>
                          {progress.overdue > 0 && (
                            <button
                              onClick={() => void catchUp()}
                              disabled={loading}
                              className="flex items-center gap-1 text-xs font-semibold text-amber-600 transition hover:text-amber-700 disabled:opacity-40"
                            >
                              <RotateCcw size={12} /> {progress.overdue} aufholen
                            </button>
                          )}
                          <button
                            onClick={() => openPlans(course.id)}
                            className="flex items-center gap-1 text-xs font-medium text-stone-500 transition hover:text-stone-800"
                          >
                            Plan öffnen <ArrowRight size={12} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => openPlans(course.id)}
                          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 transition hover:text-indigo-700"
                        >
                          <BookOpen size={12} /> Lernplan erstellen <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {exams.length > 6 && (
            <div className="mt-1.5 px-1 text-xs text-stone-400">+{exams.length - 6} weitere</div>
          )}
        </div>
      )}

    </section>
  )
}
