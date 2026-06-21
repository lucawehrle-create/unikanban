import { Pencil, Sparkles, Trash2 } from 'lucide-react'
import type { Course, Priority, Task, TaskStatus } from '@/db/types'
import { SELECTABLE_TASK_TYPES, TASK_TYPES } from '@/lib/taskTypes'
import { changeTaskType, deleteTask, togglePhase, updateTask } from '@/lib/actions'
import { useTask } from '@/hooks/data'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { DatePicker } from './DatePicker'
import { Select } from './ui/Select'
import { cn } from '@/lib/cn'
import { difficultyMeta, isReflectableType } from '@/lib/reflection'

const STATUS: { id: TaskStatus; label: string }[] = [
  { id: 'offen', label: 'Offen' },
  { id: 'dran', label: 'In Arbeit' },
  { id: 'erledigt', label: 'Erledigt' },
]

const PRIO_SEG: { id: Priority | 'keine'; label: string; color?: string }[] = [
  { id: 'keine', label: 'Keine' },
  { id: 'niedrig', label: 'Niedrig', color: '#64748b' },
  { id: 'mittel', label: 'Mittel', color: '#f59e0b' },
  { id: 'hoch', label: 'Hoch', color: '#ef4444' },
]

/** Robustes Parsen eines Zahlen-Feldwerts (leer/ungültig → undefined). */
function parseNum(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function TaskEditor({ courses }: { courses: Course[] }) {
  const id = useUI((s) => s.editingTaskId)
  // Schließen: vorher das aktive Feld blurren, damit ungespeicherte (onBlur-)
  // Eingaben in Titel/Notizen sicher persistiert werden.
  const close = () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    useUI.getState().editTask(null)
  }
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
      <div className="space-y-4" key={task.id}>
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
              onClick={() => {
                patch({
                  status: s.id,
                  completedAt: s.id === 'erledigt' ? new Date().toISOString() : undefined,
                })
                if (s.id === 'erledigt') useUI.getState().maybeReflect(task)
              }}
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

        {/* Priorität */}
        <div>
          <span className="mb-1 block text-xs font-medium text-stone-500">Priorität</span>
          <div className="flex rounded-lg bg-stone-100 p-0.5">
            {PRIO_SEG.map((o) => {
              const current = (task.priority ?? 'keine') === o.id
              return (
                <button
                  key={o.id}
                  onClick={() => patch({ priority: o.id === 'keine' ? undefined : (o.id as Priority) })}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition',
                    current ? 'bg-white shadow-sm' : 'text-stone-500',
                  )}
                  style={current && o.color ? { color: o.color } : undefined}
                >
                  {o.color && (
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: o.color }} />
                  )}
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Kurs</span>
            <Select
              value={task.courseId ?? ''}
              placeholder="– kein Kurs –"
              options={[
                { value: '', label: '– kein Kurs –' },
                ...courses.map((c) => ({ value: c.id, label: `${c.short} · ${c.name}` })),
              ]}
              onChange={(v) => patch({ courseId: v || undefined })}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Typ</span>
            <Select
              value={task.type}
              options={(task.type === 'klausur'
                ? [TASK_TYPES.klausur, ...SELECTABLE_TASK_TYPES]
                : SELECTABLE_TASK_TYPES
              ).map((t) => ({ value: t.id, label: `${t.emoji} ${t.label}` }))}
              onChange={(v) => void changeTaskType(id, v as Task['type'])}
            />
          </label>
        </div>

        <div className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Fällig</span>
          <DatePicker value={task.dueDate} onChange={(iso) => patch({ dueDate: iso })} />
        </div>

        {/* Eingeplante Lernzeit (v.a. Lernplan-Sessions) */}
        {(task.examId || task.duration != null) && (
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-500">Eingeplante Zeit</span>
            <input
              type="number"
              min={5}
              step={5}
              defaultValue={task.duration ?? ''}
              onBlur={(e) => patch({ duration: parseNum(e.target.value) })}
              className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-sm"
            />
            <span className="text-xs text-stone-400">Min</span>
          </label>
        )}

        {/* Punkte (v.a. Übungsblätter) */}
        {(task.type === 'uebung' || task.points) && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-500">Punkte</span>
            <input
              type="number"
              defaultValue={task.points?.earned ?? ''}
              placeholder="erreicht"
              onBlur={(e) =>
                patch({ points: { ...task.points, earned: parseNum(e.target.value) } })
              }
              className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-sm"
            />
            <span className="text-stone-400">/</span>
            <input
              type="number"
              defaultValue={task.points?.max ?? ''}
              placeholder="max"
              onBlur={(e) => patch({ points: { ...task.points, max: parseNum(e.target.value) } })}
              className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-sm"
            />
          </div>
        )}

        {/* Phasen / Lebenszyklus */}
        {task.phases.length > 0 && (
          <div>
            <span className="block text-xs font-medium text-stone-500">Schritte</span>
            <p className="mb-1.5 text-[11px] text-stone-400">Hak ab, was du schon erledigt hast.</p>
            <div className="space-y-1">
              {task.phases.map((p, i) => (
                <label
                  key={p.label}
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

        {/* Reflexion (Übungs-/Tutoriumsblätter) */}
        {isReflectableType(task.type) && <ReflectionField task={task} />}

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

/** Anzeige/Bearbeitung der Reflexion innerhalb des Task-Editors. */
function ReflectionField({ task }: { task: Task }) {
  const openReflection = useUI((s) => s.openReflection)
  const r = task.reflection

  if (!r)
    return (
      <button
        onClick={() => openReflection(task.id)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm font-medium text-stone-500 hover:border-brand-400 hover:text-stone-700"
      >
        <Sparkles size={14} /> Reflexion hinzufügen
      </button>
    )

  const dm = difficultyMeta(r.difficulty)
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-stone-500">Reflexion</span>
        <button
          onClick={() => openReflection(task.id)}
          className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          <Pencil size={12} /> Bearbeiten
        </button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: dm.color }}
        >
          {dm.label}
        </span>
      </div>
      {r.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white px-2 py-0.5 text-[11px] text-stone-600 ring-1 ring-stone-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {r.hardParts && <p className="mt-2 text-xs italic text-stone-500">„{r.hardParts}"</p>}
    </div>
  )
}
