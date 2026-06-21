import { useState } from 'react'
import { Clock, GraduationCap, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import type { Course, CourseSlot, RecurringConfig, Semester, Task } from '@/db/types'
import { uid } from '@/db/db'
import { SELECTABLE_TASK_TYPES } from '@/lib/taskTypes'
import {
  createTask,
  deleteCourse,
  deleteTask,
  regenerateRecurring,
  saveCourse,
  updateTask,
} from '@/lib/actions'
import { SLOT_KINDS } from '@/lib/slotKinds'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { DatePicker } from './DatePicker'
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
    recurring: [],
  }
}

function newSeries(): RecurringConfig {
  return {
    id: uid(),
    type: 'uebung',
    labelPrefix: 'Übungsblatt',
    weekday: 5,
    time: '12:00',
    count: 12,
    startWeek: 1,
    intervalWeeks: 1,
    maxPoints: undefined,
  }
}

const INTERVAL_OPTS = [
  { value: '1', label: 'jede Woche' },
  { value: '2', label: 'alle 2 Wochen' },
  { value: '3', label: 'alle 3 Wochen' },
  { value: '4', label: 'alle 4 Wochen' },
]

/** Frühester Klausur-Termin eines Kurses (primäre Klausur). */
function primaryExam(tasks: Task[], courseId: string): Task | undefined {
  return tasks
    .filter((t) => t.courseId === courseId && t.type === 'klausur' && t.dueDate)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0]
}

export function CourseManager({
  courses,
  semester,
  tasks,
}: {
  courses: Course[]
  semester: Semester
  tasks: Task[]
}) {
  const close = () => useUI.getState().setShowCourseManager(false)
  const [draft, setDraft] = useState<Course | null>(null)
  const [examDate, setExamDate] = useState<string | undefined>(undefined)
  const [flash, setFlash] = useState('')

  // Kurs zum Bearbeiten öffnen und den vorhandenen Klausurtermin laden.
  const openDraft = (c: Course) => {
    setDraft(c)
    setExamDate(primaryExam(tasks, c.id)?.dueDate)
  }

  const set = <K extends keyof Course>(k: K, v: Course[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d))

  const addSeries = () =>
    setDraft((d) => (d ? { ...d, recurring: [...(d.recurring ?? []), newSeries()] } : d))
  const updateSeries = (sid: string, patch: Partial<RecurringConfig>) =>
    setDraft((d) =>
      d ? { ...d, recurring: (d.recurring ?? []).map((r) => (r.id === sid ? { ...r, ...patch } : r)) } : d,
    )
  const removeSeries = (sid: string) =>
    setDraft((d) => (d ? { ...d, recurring: (d.recurring ?? []).filter((r) => r.id !== sid) } : d))

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
    if (draft.recurring?.length) {
      const n = await regenerateRecurring(draft, semester)
      if (n > 0) msg = `Kurs gespeichert · ${n} wöchentliche Aufgaben erstellt.`
    }

    // Klausur-Termin als Aufgabe pflegen (erscheint in Stundenplan/Kalender,
    // Basis für den Lernplan).
    const existing = primaryExam(tasks, draft.id)
    if (examDate) {
      if (existing)
        await updateTask(existing.id, { dueDate: examDate, duration: draft.examDurationMin })
      else
        await createTask({
          semesterId: semester.id,
          courseId: draft.id,
          type: 'klausur',
          title: `Klausur ${draft.name || draft.short}`,
          dueDate: examDate,
          duration: draft.examDurationMin,
        })
    } else if (existing) {
      await deleteTask(existing.id)
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
                  {c.recurring?.length
                    ? ` · ${c.recurring.map((r) => r.labelPrefix).join(', ')}`
                    : ''}
                </div>
              </div>
              <button
                onClick={() => openDraft(structuredClone(c))}
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
            onClick={() => openDraft(emptyCourse(semester.id))}
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

          {/* Klausurtermin */}
          <div className="rounded-xl bg-stone-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <GraduationCap size={15} className="text-indigo-500" />
              Klausurtermin
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Erscheint im Stundenplan &amp; Kalender und ist die Basis für den Lernplan.
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <DatePicker value={examDate} onChange={setExamDate} />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Dauer (Min)</span>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={draft.examDurationMin ?? ''}
                  placeholder="120"
                  onChange={(e) =>
                    set('examDurationMin', e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="w-24 rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          </div>

          {/* Serien (mehrere möglich: z.B. Übungsblatt UND Tutoriumsblatt; auch
              mehrmals pro Woche durch mehrere Serien an verschiedenen Tagen) */}
          <div className="rounded-xl bg-stone-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <Sparkles size={15} className="text-brand-500" />
              Regelmäßige Aufgaben
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Richte z. B. Übungsblätter einmal ein – SemBan erstellt daraus automatisch die Aufgaben
              fürs ganze Semester. Der Rhythmus ist frei wählbar (für mehrmals pro Woche einfach eine
              zweite Serie anlegen).
            </p>

            <div className="mt-2 space-y-2">
              {(draft.recurring ?? []).map((r) => (
                <div key={r.id} className="rounded-lg bg-white p-2.5 ring-1 ring-stone-200">
                  <div className="mb-2">
                    <span className="mb-1 block text-xs text-stone-500">Titel</span>
                    <div className="flex items-center gap-2">
                      <input
                        value={r.labelPrefix}
                        onChange={(e) => updateSeries(r.id, { labelPrefix: e.target.value })}
                        placeholder="z.B. Übungsblatt"
                        className="flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-sm font-medium"
                      />
                      <button
                        onClick={() => removeSeries(r.id)}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500"
                        title="Wöchentliche Aufgabe entfernen"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label className="block">
                      <span className="mb-1 block text-xs text-stone-500">Typ</span>
                      <Select
                        value={r.type}
                        options={TYPE_OPTS_REC(SELECTABLE_TASK_TYPES)}
                        onChange={(v) => updateSeries(r.id, { type: v as RecurringConfig['type'] })}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-stone-500">Abgabetag</span>
                      <Select
                        value={String(r.weekday)}
                        options={WEEKDAY_OPTS}
                        onChange={(v) => updateSeries(r.id, { weekday: Number(v) })}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-stone-500">Rhythmus</span>
                      <Select
                        value={String(r.intervalWeeks ?? 1)}
                        options={INTERVAL_OPTS}
                        onChange={(v) => updateSeries(r.id, { intervalWeeks: Number(v) })}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-stone-500">Uhrzeit</span>
                      <TimeField value={r.time ?? '12:00'} onChange={(v) => updateSeries(r.id, { time: v })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-stone-500">Anzahl</span>
                      <input
                        type="number"
                        value={r.count}
                        onChange={(e) => updateSeries(r.id, { count: Number(e.target.value) })}
                        className="w-full rounded-lg border border-stone-200 px-2 py-1.5"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-stone-500">Punkte/Blatt</span>
                      <input
                        type="number"
                        value={r.maxPoints ?? ''}
                        onChange={(e) =>
                          updateSeries(r.id, {
                            maxPoints: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="w-full rounded-lg border border-stone-200 px-2 py-1.5"
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button
                onClick={addSeries}
                className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-stone-500 hover:text-brand-600"
              >
                <Plus size={13} /> Wöchentliche Aufgabe hinzufügen
              </button>
            </div>
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
