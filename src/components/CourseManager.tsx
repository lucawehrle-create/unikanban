import { useState } from 'react'
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { Course, RecurringConfig, Semester } from '@/db/types'
import { uid } from '@/db/db'
import { TASK_TYPE_LIST } from '@/lib/taskTypes'
import { deleteCourse, regenerateRecurring, saveCourse } from '@/lib/actions'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { cn } from '@/lib/cn'

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
]
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function emptyCourse(semesterId: string): Course {
  return {
    id: uid(),
    semesterId,
    name: '',
    short: '',
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    ects: undefined,
    slots: [],
    recurring: {
      enabled: false,
      type: 'uebung',
      labelPrefix: 'Übungsblatt',
      weekday: 5,
      time: '12:00',
      count: 12,
      startWeek: 1,
      maxPoints: undefined,
    },
  }
}

export function CourseManager({ courses, semester }: { courses: Course[]; semester: Semester }) {
  const close = () => useUI.getState().setShowCourseManager(false)
  const [draft, setDraft] = useState<Course | null>(null)
  const [flash, setFlash] = useState('')

  const set = <K extends keyof Course>(k: K, v: Course[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d))
  const setRec = <K extends keyof RecurringConfig>(k: K, v: RecurringConfig[K]) =>
    setDraft((d) => (d && d.recurring ? { ...d, recurring: { ...d.recurring, [k]: v } } : d))

  async function save() {
    if (!draft) return
    if (!draft.short.trim()) draft.short = draft.name.slice(0, 5).toUpperCase()
    await saveCourse(draft)
    let msg = 'Kurs gespeichert.'
    if (draft.recurring?.enabled) {
      const n = await regenerateRecurring(draft, semester)
      if (n > 0) msg = `Kurs gespeichert · ${n} Aufgaben erzeugt.`
    }
    setDraft(null)
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  return (
    <Modal title={draft ? 'Kurs bearbeiten' : 'Kurse verwalten'} onClose={close}>
      {!draft ? (
        <div className="space-y-2">
          {flash && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              {flash}
            </div>
          )}
          {courses.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-slate-200 dark:ring-slate-700"
            >
              <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {c.name || '(ohne Namen)'}
                </div>
                <div className="text-xs text-slate-400">
                  {c.short}
                  {c.ects ? ` · ${c.ects} ECTS` : ''}
                  {c.recurring?.enabled
                    ? ` · ${c.recurring.count}× ${c.recurring.labelPrefix}`
                    : ''}
                </div>
              </div>
              <button
                onClick={() => setDraft(structuredClone(c))}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => void deleteCourse(c.id)}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setDraft(emptyCourse(semester.id))}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-500 hover:border-sky-400 hover:text-sky-600 dark:border-slate-600"
          >
            <Plus size={16} /> Neuer Kurs
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Name</span>
              <input
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="z.B. Analysis II"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Kürzel</span>
              <input
                value={draft.short}
                onChange={(e) => set('short', e.target.value.toUpperCase())}
                placeholder="ANA2"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500">Farbe</span>
              <div className="flex gap-1.5">
                {PALETTE.map((col) => (
                  <button
                    key={col}
                    onClick={() => set('color', col)}
                    className={cn(
                      'h-6 w-6 rounded-full ring-offset-2 transition dark:ring-offset-slate-900',
                      draft.color === col && 'ring-2 ring-slate-400',
                    )}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">ECTS</span>
              <input
                type="number"
                value={draft.ects ?? ''}
                onChange={(e) => set('ects', e.target.value ? Number(e.target.value) : undefined)}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          </div>

          {/* Wochenrhythmus */}
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={draft.recurring?.enabled ?? false}
                onChange={(e) => setRec('enabled', e.target.checked)}
                className="h-4 w-4 rounded accent-sky-500"
              />
              <Sparkles size={15} className="text-sky-500" />
              Wöchentliche Aufgaben automatisch erzeugen
            </label>

            {draft.recurring?.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Bezeichnung</span>
                  <input
                    value={draft.recurring.labelPrefix}
                    onChange={(e) => setRec('labelPrefix', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Typ</span>
                  <select
                    value={draft.recurring.type}
                    onChange={(e) => setRec('type', e.target.value as RecurringConfig['type'])}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  >
                    {TASK_TYPE_LIST.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.emoji} {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Abgabetag</span>
                  <select
                    value={draft.recurring.weekday}
                    onChange={(e) => setRec('weekday', Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  >
                    {WEEKDAYS.map((w, i) => (
                      <option key={w} value={i + 1}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Uhrzeit</span>
                  <input
                    type="time"
                    value={draft.recurring.time ?? ''}
                    onChange={(e) => setRec('time', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Anzahl</span>
                  <input
                    type="number"
                    value={draft.recurring.count}
                    onChange={(e) => setRec('count', Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Punkte/Blatt</span>
                  <input
                    type="number"
                    value={draft.recurring.maxPoints ?? ''}
                    onChange={(e) =>
                      setRec('maxPoints', e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Abbrechen
            </button>
            <button
              onClick={() => void save()}
              className="rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
            >
              Speichern
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
