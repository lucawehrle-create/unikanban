import type { Course, Task } from '@/db/types'
import { TASK_TYPES } from '@/lib/taskTypes'
import { classifyDue, DUE_META, formatDue } from '@/lib/deadline'
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

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-slate-200 transition',
        'hover:shadow-md hover:ring-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:ring-slate-600',
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
          <div
            className={cn(
              'text-sm font-medium text-slate-800 dark:text-slate-100',
              done && 'line-through',
            )}
          >
            {task.title}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
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
              <span className="text-slate-400">
                {task.points.earned != null ? `${task.points.earned}/` : ''}
                {task.points.max} P
              </span>
            )}

            {phasesTotal > 0 && (
              <span className="text-slate-400">
                {phasesDone}/{phasesTotal} Schritte
              </span>
            )}
          </div>

          {phasesTotal > 0 && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
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
