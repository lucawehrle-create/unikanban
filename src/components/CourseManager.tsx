import { useState } from 'react'
import { Clock, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import type { Course, CourseSlot, RecurringConfig, Semester } from '@/db/types'
import { uid } from '@/db/db'
import { TASK_TYPE_LIST } from '@/lib/taskTypes'
import { deleteCourse, regenerateRecurring, saveCourse } from '@/lib/actions'
import { SLOT_KINDS } from '@/lib/slotKinds'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { Select } from './ui/Select'
import { TimeField } from './ui/TimeField'
import { cn } from '@/lib/cn'

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
]
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WEEKDAY_OPTS = WEEKDAYS.map((w, i) => ({ value: String(i + 1), label: w }))
const KIND_OPTS = SLOT_KINDS.map((k) => ({ value: k.id, label: k.label }))
const TYPE_OPTS_REC = (list: { id: string; emoji: string; label: string }[]) =>
  list.map((t) => ({ value: t.id, label: `${t.emoji} ${t.label}` }))

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

  const addSlot = () =>
    setDraft((d) =>
      d
        ? {
            ...d,
            slots: [
              ...d.slots,
              { id: uid(), kind: 'vorlesung', weekday: 1, start: '10:00', end: '12:00', room: '' },
            ],
          }
        : d,
    )
  const updateSlot = (sid: string, patch: Partial<CourseSlot>) =>
    setDraft((d) =>
      d ? { ...d, slots: d.slots.map((s) => (s.id === sid ? { ...s, ...patch } : s)) } : d,
    )
  const removeSlot = (sid: string) =>
    setDraft((d) => (d ? { ...d, slots: d.slots.filter((s) => s.id !== sid) } : d))

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
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {flash}
            </div>
          )}
          {courses.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-stone-200"
            >
              <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-stone-800">
                  {c.name || '(ohne Namen)'}
                </div>
                <div className="text-xs text-stone-400">
                  {c.short}
                  {c.ects ? ` · ${c.ects} ECTS` : ''}
                  {c.recurring?.enabled
                    ? ` · ${c.recurring.count}× ${c.recurring.labelPrefix}`
                    : ''}
                </div>
              </div>
              <button
                onClick={() => setDraft(structuredClone(c))}
                className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => void deleteCourse(c.id)}
                className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setDraft(emptyCourse(semester.id))}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 py-2.5 text-sm font-medium text-stone-500 hover:border-brand-400 hover:text-brand-600"
          >
            <Plus size={16} /> Neuer Kurs
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Name</span>
              <input
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="z.B. Analysis II"
                className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Kürzel</span>
              <input
                value={draft.short}
                onChange={(e) => set('short', e.target.value.toUpperCase())}
                placeholder="ANA2"
                className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-stone-500">Farbe</span>
              <div className="flex gap-1.5">
                {PALETTE.map((col) => (
                  <button
                    key={col}
                    onClick={() => set('color', col)}
                    className={cn(
                      'h-6 w-6 rounded-full ring-offset-2 transition',
                      draft.color === col && 'ring-2 ring-stone-400',
                    )}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">ECTS</span>
              <input
                type="number"
                value={draft.ects ?? ''}
                onChange={(e) => set('ects', e.target.value ? Number(e.target.value) : undefined)}
                className="w-16 rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {/* Wochenrhythmus */}
          <div className="rounded-xl bg-stone-50 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-700">
              <input
                type="checkbox"
                checked={draft.recurring?.enabled ?? false}
                onChange={(e) => setRec('enabled', e.target.checked)}
                className="h-4 w-4 rounded accent-brand-500"
              />
              <Sparkles size={15} className="text-brand-500" />
              Wöchentliche Aufgaben automatisch erzeugen
            </label>

            {draft.recurring?.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs text-stone-500">Bezeichnung</span>
                  <input
                    value={draft.recurring.labelPrefix}
                    onChange={(e) => setRec('labelPrefix', e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-stone-500">Typ</span>
                  <Select
                    value={draft.recurring.type}
                    options={TYPE_OPTS_REC(TASK_TYPE_LIST)}
                    onChange={(v) => setRec('type', v as RecurringConfig['type'])}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-stone-500">Abgabetag</span>
                  <Select
                    value={String(draft.recurring.weekday)}
                    options={WEEKDAY_OPTS}
                    onChange={(v) => setRec('weekday', Number(v))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-stone-500">Uhrzeit</span>
                  <TimeField
                    value={draft.recurring.time ?? '12:00'}
                    onChange={(v) => setRec('time', v)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-stone-500">Anzahl</span>
                  <input
                    type="number"
                    value={draft.recurring.count}
                    onChange={(e) => setRec('count', Number(e.target.value))}
                    className="w-full rounded-lg border border-stone-200 px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-stone-500">Punkte/Blatt</span>
                  <input
                    type="number"
                    value={draft.recurring.maxPoints ?? ''}
                    onChange={(e) =>
                      setRec('maxPoints', e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="w-full rounded-lg border border-stone-200 px-2 py-1.5"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Termine (Stundenplan) */}
          <div className="rounded-xl bg-stone-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <Clock size={15} className="text-stone-500" />
              Termine (Stundenplan)
            </div>
            <div className="mt-2 space-y-2">
              {draft.slots.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Select
                    value={s.kind}
                    options={KIND_OPTS}
                    onChange={(v) => updateSlot(s.id, { kind: v as CourseSlot['kind'] })}
                    className="w-28"
                  />
                  <Select
                    value={String(s.weekday)}
                    options={WEEKDAY_OPTS}
                    onChange={(v) => updateSlot(s.id, { weekday: Number(v) })}
                    className="w-16"
                  />
                  <TimeField
                    value={s.start}
                    onChange={(v) => updateSlot(s.id, { start: v })}
                    className="w-20"
                  />
                  <span className="text-stone-400">–</span>
                  <TimeField
                    value={s.end}
                    onChange={(v) => updateSlot(s.id, { end: v })}
                    className="w-20"
                  />
                  <input
                    value={s.room ?? ''}
                    onChange={(e) => updateSlot(s.id, { room: e.target.value })}
                    placeholder="Raum"
                    className="w-16 rounded-lg border border-stone-200 px-2 py-1.5"
                  />
                  <button
                    onClick={() => removeSlot(s.id)}
                    className="rounded-lg p-1 text-stone-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addSlot}
                className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-stone-500 hover:text-brand-600"
              >
                <Plus size={13} /> Termin hinzufügen
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg px-4 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
            >
              Abbrechen
            </button>
            <button
              onClick={() => void save()}
              className="rounded-full bg-brand-400 px-5 py-1.5 text-sm font-semibold text-stone-900 hover:bg-brand-500"
            >
              Speichern
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
