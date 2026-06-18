import { Trash2 } from 'lucide-react'
import type { Course, Task, TaskStatus } from '@/db/types'
import { TASK_TYPE_LIST, TASK_TYPES } from '@/lib/taskTypes'
import { changeTaskType, deleteTask, togglePhase, updateTask } from '@/lib/actions'
import { useTask } from '@/hooks/data'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { cn } from '@/lib/cn'

const STATUS: { id: TaskStatus; label: string }[] = [
  { id: 'offen', label: 'Offen' },
  { id: 'dran', label: 'Dran' },
  { id: 'erledigt', label: 'Erledigt' },
]

function toLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

export function TaskEditor({ courses }: { courses: Course[] }) {
  const id = useUI((s) => s.editingTaskId)
  const close = () => useUI.getState().editTask(null)
  const task = useTask(id)

  if (!id || !task) return null

  const patch = (p: Partial<Task>) => void updateTask(id, p)

  return (
    <Modal
      title={`${TASK_TYPES[task.type].emoji} Aufgabe bearbeiten`}
      onClose={close}
      footer={
        <>
          <button
            onClick={() => {
              void deleteTask(id)
              close()
            }}
            className="mr-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 size={15} /> Löschen
          </button>
          <button
            onClick={close}
            className="rounded-full bg-stone-900 px-5 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
          >
            Fertig
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <input
          defaultValue={task.title}
          onBlur={(e) => patch({ title: e.target.value })}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium outline-none focus:border-brand-400"
        />

        {/* Status */}
        <div className="flex rounded-lg bg-stone-100 p-0.5">
          {STATUS.map((s) => (
            <button
              key={s.id}
              onClick={() =>
                patch({
                  status: s.id,
                  completedAt: s.id === 'erledigt' ? new Date().toISOString() : undefined,
                })
              }
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                task.status === s.id
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Kurs</span>
            <select
              value={task.courseId ?? ''}
              onChange={(e) => patch({ courseId: e.target.value || undefined })}
              className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
            >
              <option value="">– kein Kurs –</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short} · {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Typ</span>
            <select
              value={task.type}
              onChange={(e) => void changeTaskType(id, e.target.value as Task['type'])}
              className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
            >
              {TASK_TYPE_LIST.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Fällig</span>
          <input
            type="datetime-local"
            defaultValue={toLocalInput(task.dueDate)}
            onChange={(e) =>
              patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })
            }
            className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
          />
        </label>

        {/* Punkte (v.a. Übungsblätter) */}
        {(task.type === 'uebung' || task.points) && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-500">Punkte</span>
            <input
              type="number"
              defaultValue={task.points?.earned ?? ''}
              placeholder="erreicht"
              onBlur={(e) =>
                patch({
                  points: {
                    ...task.points,
                    earned: e.target.value === '' ? undefined : Number(e.target.value),
                  },
                })
              }
              className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-sm"
            />
            <span className="text-stone-400">/</span>
            <input
              type="number"
              defaultValue={task.points?.max ?? ''}
              placeholder="max"
              onBlur={(e) =>
                patch({
                  points: {
                    ...task.points,
                    max: e.target.value === '' ? undefined : Number(e.target.value),
                  },
                })
              }
              className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-sm"
            />
          </div>
        )}

        {/* Phasen / Lebenszyklus */}
        {task.phases.length > 0 && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-stone-500">Schritte</span>
            <div className="space-y-1">
              {task.phases.map((p, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50"
                >
                  <input
                    type="checkbox"
                    checked={p.done}
                    onChange={() => patch({ phases: togglePhase(task.phases, i) })}
                    className="h-4 w-4 rounded accent-brand-500"
                  />
                  <span className={cn(p.done && 'text-stone-400 line-through')}>{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Notizen</span>
          <textarea
            defaultValue={task.notes ?? ''}
            onBlur={(e) => patch({ notes: e.target.value || undefined })}
            rows={2}
            className="w-full resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
        </label>
      </div>
    </Modal>
  )
}
