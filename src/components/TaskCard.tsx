import { Flag, GraduationCap } from 'lucide-react'
import type { Course, Task } from '@/db/types'
import { TASK_TYPES } from '@/lib/taskTypes'
import { classifyDue, DUE_META, formatDue } from '@/lib/deadline'
import { priorityMeta } from '@/lib/priority'
import { difficultyMeta } from '@/lib/reflection'
import { cn } from '@/lib/cn'

interface TaskCardProps {
  task: Task
  course?: Course
  onClick?: () => void
  dragging?: boolean
}

export function TaskCard({ task, course, onClick, dragging }: TaskCardProps) {
  const type = TASK_TYPES[task.type]
  const due = classifyDue(task.dueDate, task.status === 'erledigt')
  const dueMeta = DUE_META[due]
  const phasesDone = task.phases.filter((p) => p.done).length
  const phasesTotal = task.phases.length
  const done = task.status === 'erledigt'
  const prio = priorityMeta(task.priority)

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl bg-white px-3.5 py-3 text-left shadow-sm ring-1 ring-stone-200/80 transition',
        'hover:-translate-y-0.5 hover:shadow-md hover:ring-stone-300',
        dragging && 'opacity-50',
        done && 'opacity-60',
      )}
    >
      {/* Farbiger Kursbalken links */}
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: course?.color ?? '#cbd5e1' }}
      />

      <div className="flex items-start gap-2 pl-1.5">
        <span className="mt-0.5 text-sm leading-none" title={type.label}>
          {type.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <div
              className={cn('flex-1 text-sm font-medium text-stone-800', done && 'line-through')}
            >
              {task.title}
            </div>
            {prio && !done && (
              <Flag
                size={13}
                className="mt-0.5 shrink-0"
                style={{ color: prio.color, fill: prio.color }}
                aria-label={`Priorität ${prio.label}`}
              />
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            {task.examId && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-indigo-600 ring-1 ring-indigo-200"
                title="Aus deinem Lernplan – dient der Klausurvorbereitung"
              >
                <GraduationCap size={11} /> Lernplan
              </span>
            )}

            {course && (
              <span
                className="rounded px-1.5 py-0.5 font-semibold"
                style={{ backgroundColor: course.color + '22', color: course.color }}
              >
                {course.short}
              </span>
            )}

            {due !== 'none' && (
              <span className={cn('inline-flex items-center gap-1 font-medium', dueMeta.text)}>
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dueMeta.dot)} />
                {formatDue(task.dueDate)}
              </span>
            )}

            {task.points?.max != null && (
              <span className="text-stone-400">
                {task.points.earned != null ? `${task.points.earned}/` : ''}
                {task.points.max} P
              </span>
            )}

            {phasesTotal > 0 && (
              <span className="text-stone-400">
                {phasesDone}/{phasesTotal} Schritte
              </span>
            )}

            {task.reflection && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-white"
                style={{ backgroundColor: difficultyMeta(task.reflection.difficulty).color }}
                title={`Reflexion: ${difficultyMeta(task.reflection.difficulty).label}`}
              >
                {difficultyMeta(task.reflection.difficulty).label}
              </span>
            )}
          </div>

          {phasesTotal > 0 && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(phasesDone / phasesTotal) * 100}%`,
                  backgroundColor: course?.color ?? '#94a3b8',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
