import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, X } from 'lucide-react'
import { db } from '@/db/db'
import { updateTask } from '@/lib/actions'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { cn } from '@/lib/cn'
import { DIFFICULTY, PRESET_TAGS, difficultyMeta } from '@/lib/reflection'
import type { TaskReflection } from '@/db/types'

/**
 * Reflexions-Popup nach dem Erledigen eines Übungs-/Tutoriumsblatts.
 * Schwierigkeit (Slider), Tags (Presets + eigene) und ein Freitext fließen
 * später in die Lernplan-Auswahl ein.
 */
export function ReflectionModal() {
  const taskId = useUI((s) => s.reflectingTaskId)
  const close = useUI((s) => s.closeReflection)
  const setReflectionPrompts = useUI((s) => s.setReflectionPrompts)
  const task = useLiveQuery(() => (taskId ? db.tasks.get(taskId) : undefined), [taskId])

  if (!taskId) return null
  if (!task) return null
  return (
    <ReflectionForm
      key={task.id}
      title={task.title}
      initial={task.reflection}
      onClose={close}
      onNeverAgain={() => {
        setReflectionPrompts(false)
        close()
      }}
      onSave={async (r) => {
        await updateTask(task.id, { reflection: r })
        close()
      }}
    />
  )
}

function ReflectionForm({
  title,
  initial,
  onClose,
  onSave,
  onNeverAgain,
}: {
  title: string
  initial?: TaskReflection
  onClose: () => void
  onSave: (r: TaskReflection) => void | Promise<void>
  onNeverAgain: () => void
}) {
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 3)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [hardParts, setHardParts] = useState(initial?.hardParts ?? '')
  const [custom, setCustom] = useState('')

  const meta = difficultyMeta(difficulty)
  const customTags = useMemo(
    () => tags.filter((t) => !PRESET_TAGS.includes(t as (typeof PRESET_TAGS)[number])),
    [tags],
  )

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const addCustom = () => {
    const t = custom.trim()
    if (t && !tags.includes(t)) setTags((cur) => [...cur, t])
    setCustom('')
  }

  const save = () =>
    void onSave({
      difficulty,
      tags,
      hardParts: hardParts.trim() || undefined,
      reflectedAt: new Date().toISOString(),
    })

  return (
    <Modal
      title="Kurze Reflexion"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100"
          >
            Überspringen
          </button>
          <button
            onClick={save}
            className="rounded-full bg-brand-400 px-5 py-1.5 text-sm font-semibold text-stone-900 hover:bg-brand-500"
          >
            Speichern
          </button>
        </>
      }
    >
      <div className="space-y-7">
        <p className="text-[15px] leading-relaxed text-stone-500">
          <span className="font-semibold text-stone-800">„{title}"</span> erledigt – wie lief's?
          Das hilft dir später beim Lernplan.
        </p>

        {/* Schwierigkeit */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold tracking-tight text-stone-800">
              Wie schwer war es?
            </h3>
            <span
              className="flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: meta.color }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </span>
          </div>
          <div className="flex gap-2">
            {Object.keys(DIFFICULTY).map((k) => {
              const n = Number(k)
              const dm = DIFFICULTY[n]
              const on = n === difficulty
              return (
                <button
                  key={k}
                  onClick={() => setDifficulty(n)}
                  className={cn(
                    'flex-1 rounded-xl py-3 text-center text-base font-bold tabular-nums transition',
                    on ? 'text-white shadow-sm ring-2 ring-white/70' : 'hover:opacity-80',
                  )}
                  style={
                    on
                      ? { backgroundColor: dm.color, boxShadow: `0 4px 14px ${dm.color}40` }
                      : { backgroundColor: dm.color + '1f', color: dm.color }
                  }
                  aria-label={dm.label}
                  aria-pressed={on}
                >
                  {n}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between px-0.5 text-[11px] font-medium text-stone-400">
            <span>leicht</span>
            <span>schwer</span>
          </div>
        </section>

        {/* Tags */}
        <section>
          <h3 className="mb-3 text-[15px] font-semibold tracking-tight text-stone-800">
            Woran lag's?{' '}
            <span className="font-normal text-stone-400">· Mehrfachauswahl</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {PRESET_TAGS.map((t) => {
              const on = tags.includes(t)
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition',
                    on
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50',
                  )}
                >
                  {t}
                </button>
              )
            })}
            {customTags.map((t) => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className="flex items-center gap-1 rounded-full bg-indigo-600 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm"
              >
                {t} <X size={12} />
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustom()
                }
              }}
              placeholder="Eigener Tag …"
              className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
            <button
              onClick={addCustom}
              disabled={!custom.trim()}
              className="flex items-center gap-1 rounded-lg bg-stone-100 px-3.5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200 disabled:opacity-40"
            >
              <Plus size={14} /> Tag
            </button>
          </div>
        </section>

        {/* Freitext */}
        <section>
          <h3 className="mb-3 text-[15px] font-semibold tracking-tight text-stone-800">
            Was ist dir schwergefallen?{' '}
            <span className="font-normal text-stone-400">· optional</span>
          </h3>
          <textarea
            value={hardParts}
            onChange={(e) => setHardParts(e.target.value)}
            rows={3}
            placeholder="z.B. Aufgabe 3 (Induktionsbeweis), Konvergenzkriterien …"
            className="w-full resize-none rounded-lg border border-stone-200 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brand-400"
          />
        </section>

        <button
          onClick={onNeverAgain}
          className="text-[11px] text-stone-400 underline decoration-stone-300 underline-offset-2 hover:text-stone-600"
        >
          Reflexion künftig nicht mehr anzeigen
        </button>
      </div>
    </Modal>
  )
}
