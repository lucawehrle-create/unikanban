import { AlertTriangle, Clock, Flag, GraduationCap } from 'lucide-react'
import type { Course, Task } from '@/db/types'
import { TASK_TYPES } from '@/lib/taskTypes'
import { classifyDue, DUE_META, formatDue, formatUrgency } from '@/lib/deadline'
import { difficultyMeta } from '@/lib/reflection'
import { cn } from '@/lib/cn'

interface TaskCardProps {
  task: Task
  course?: Course
  onClick?: () => void
  dragging?: boolean
  /** true in den Deadline-Spalten „Überfällig“/„Heute“ – der Spaltenkopf trägt
   *  das Dringlichkeitssignal dann schon, die Karte soll es nicht doppeln. */
  suppressUrgency?: boolean
}

// Visuelle Hierarchie (aus der Design-Recherche):
//   1. Blick: Dringlichkeit (overdue/today) – linker Rot/Orange-Rand + eigene
//      Klartext-Zeile. Nur echte Dringlichkeit darf „schreien“.
//   2. Blick: Kurs-Identität – Farbbalken + Kürzel-Pill (konstant über alle
//      Gruppierungen).
//   3. Blick: Fortschritt/Priorität/Detail – zurückgenommen, kontextuell.
// Regel: Rot bedeutet pro Karte genau EINE Sache (Dringlichkeit). Priorität ist
// Form/Gewicht (gefüllte Flagge nur bei „hoch“), kein weiterer Rotton.
export function TaskCard({ task, course, onClick, dragging, suppressUrgency }: TaskCardProps) {
  const type = TASK_TYPES[task.type]
  const done = task.status === 'erledigt'
  const due = classifyDue(task.dueDate, done)
  const dueMeta = DUE_META[due]
  const phasesDone = task.phases.filter((p) => p.done).length
  const phasesTotal = task.phases.length

  const isUrgent = (due === 'overdue' || due === 'today') && !suppressUrgency
  const inProgress = task.status === 'dran'
  const isHigh = task.priority === 'hoch'

  // Der linke Rand trägt entweder Kurs- ODER Dringlichkeitsidentität – nie beides.
  const barColor =
    isUrgent && due === 'overdue'
      ? '#ef4444' // red-500
      : isUrgent && due === 'today'
        ? '#f97316' // orange-500
        : (course?.color ?? '#cbd5e1')

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl bg-white p-3 text-left ring-1 ring-stone-200/70 transition',
        'hover:-translate-y-0.5 hover:shadow-md hover:ring-stone-300',
        dragging && 'opacity-50',
        done && 'opacity-60',
      )}
    >
      {/* Akzent-Rand links: Kurs (Default) oder Dringlichkeit (overdue/today) */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: barColor }} />

      {/* Priorität nur bei „hoch“ – als Form/Gewicht, nicht als weiterer Rotton */}
      {isHigh && !done && (
        <Flag
          size={13}
          className="absolute right-3 top-3 text-stone-900"
          fill="currentColor"
          aria-label="Hohe Priorität"
        />
      )}

      <div className="flex items-start gap-2 pl-1.5">
        <span className="mt-0.5 text-sm leading-none" title={type.label}>
          {type.emoji}
        </span>
        <div className="min-w-0 flex-1">
          {/* Titel – größtes Element, max. 2 Zeilen */}
          <div
            className={cn(
              'text-sm font-medium leading-snug text-stone-800 [letter-spacing:-0.006em] line-clamp-2',
              isHigh && !done && 'pr-5',
              done && 'line-through',
            )}
          >
            {task.title}
          </div>

          {/* 1. Blick: Dringlichkeit – das lauteste Sekundärsignal */}
          {isUrgent && (
            <div className={cn('mt-2 flex items-center gap-1 text-xs font-medium', dueMeta.text)}>
              {due === 'overdue' ? <AlertTriangle size={12} /> : <Clock size={12} />}
              {formatUrgency(task.dueDate)}
            </div>
          )}

          {/* 2./3. Blick: Meta – max. 3 Signale im Default */}
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]',
              isUrgent ? 'mt-1' : 'mt-2',
            )}
          >
            {task.examId && !done && (
              <span
                className="inline-flex"
                title="Aus deinem Lernplan – dient der Klausurvorbereitung"
              >
                <GraduationCap size={12} className="text-indigo-500" />
              </span>
            )}

            {course && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs font-semibold',
                  done && 'bg-stone-100 text-stone-500',
                )}
                style={
                  done ? undefined : { backgroundColor: course.color + '22', color: course.color }
                }
              >
                {course.short}
              </span>
            )}

            {/* Fälligkeit nur dezent für soon/week/later – overdue/today stehen oben */}
            {(due === 'soon' || due === 'week' || due === 'later') && (
              <span className={cn('inline-flex items-center gap-1 font-medium', dueMeta.text)}>
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dueMeta.dot)} />
                {formatDue(task.dueDate)}
              </span>
            )}

            {/* Punkte: nur erledigt oder bereits bewertet */}
            {task.points?.max != null && (done || task.points.earned != null) && (
              <span className="tabular-nums text-stone-500">
                {task.points.earned != null ? `${task.points.earned}/` : ''}
                {task.points.max} P
              </span>
            )}

            {/* Lernzeit: nur während „In Arbeit“ relevant */}
            {inProgress && task.duration != null && (
              <span
                className="inline-flex items-center gap-1 tabular-nums text-stone-500"
                title="eingeplante Lernzeit"
              >
                <Clock size={11} /> {task.duration} Min
              </span>
            )}

            {/* Reflexion: nur auf erledigten Karten, entsättigt */}
            {task.reflection && done && (
              <span className="inline-flex items-center gap-1 text-stone-500">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: difficultyMeta(task.reflection.difficulty).color }}
                />
                {difficultyMeta(task.reflection.difficulty).label}
              </span>
            )}
          </div>

          {/* Fortschritt: ein Signal, nur wenn schon mind. ein Schritt erledigt */}
          {phasesDone > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(phasesDone / phasesTotal) * 100}%`,
                  backgroundColor: (course?.color ?? '#94a3b8') + 'cc',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
