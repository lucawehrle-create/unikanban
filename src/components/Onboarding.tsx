import { useState } from 'react'
import { startOfWeek, format } from 'date-fns'
import { GraduationCap, Plus, Sparkles, Trash2, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import type { ProgramType } from '@/db/types'
import { db, uid } from '@/db/db'
import { createProgram, createSemester } from '@/lib/actions'
import { seedIfEmpty } from '@/lib/seed'
import { DatePicker } from './DatePicker'
import { Select } from './ui/Select'
import { cn } from '@/lib/cn'

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
]
const TARGET_BY_TYPE: Record<ProgramType, number> = { bachelor: 180, master: 120, other: 180 }
const TYPE_OPTS = [
  { value: 'bachelor', label: 'Bachelor' },
  { value: 'master', label: 'Master' },
  { value: 'other', label: 'Sonstiges' },
]
const inputCls = 'w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-brand-400'

function suggestSemester(d = new Date()): string {
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  if (m >= 4 && m <= 9) return `SoSe ${y}`
  if (m >= 10) return `WiSe ${y}/${String(y + 1).slice(2)}`
  return `WiSe ${y - 1}/${String(y).slice(2)}`
}

interface CourseDraft {
  name: string
  short: string
  color: string
}

type Step = 'welcome' | 'program' | 'semester' | 'courses'

export function Onboarding() {
  const [step, setStep] = useState<Step>('welcome')
  const [busy, setBusy] = useState(false)

  // Studiengang
  const [name, setName] = useState('')
  const [type, setType] = useState<ProgramType>('bachelor')
  const [target, setTarget] = useState(180)
  const [priorEcts, setPriorEcts] = useState(0)
  const [priorAvg, setPriorAvg] = useState(0)

  // Semester
  const [semName, setSemName] = useState(suggestSemester())
  const [semStart, setSemStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [semWeeks, setSemWeeks] = useState(14)

  // Kurse
  const [courses, setCourses] = useState<CourseDraft[]>([{ name: '', short: '', color: PALETTE[0] }])

  function setKind(t: ProgramType) {
    setType(t)
    setTarget(TARGET_BY_TYPE[t])
  }

  async function loadDemo() {
    if (busy) return
    setBusy(true)
    try {
      await seedIfEmpty()
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    if (busy) return
    setBusy(true)
    try {
      await doFinish()
    } finally {
      setBusy(false)
    }
  }

  async function doFinish() {
    const pid = await createProgram({
      name: name.trim() || 'Mein Studium',
      type,
      targetEcts: target,
      priorEcts: priorEcts || undefined,
      priorGradeAvg: priorAvg || undefined,
      priorGradedEcts: priorEcts || undefined,
    })
    const sid = await createSemester({
      programId: pid,
      name: semName.trim() || 'Semester 1',
      startDate: semStart,
      weeks: semWeeks,
    })
    const toAdd = courses
      .filter((c) => c.name.trim())
      .map((c) => ({
        id: uid(),
        semesterId: sid,
        name: c.name.trim(),
        short: (c.short.trim() || c.name.slice(0, 4)).toUpperCase(),
        color: c.color,
        slots: [],
      }))
    if (toAdd.length) await db.courses.bulkAdd(toAdd)
    // App rendert nach Anlegen automatisch um (programCount > 0)
  }

  const steps: Step[] = ['program', 'semester', 'courses']
  const stepIndex = steps.indexOf(step)

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-cream-50 p-6 shadow-xl ring-1 ring-stone-200 sm:p-8">
        {step === 'welcome' ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 text-brand-300">
              <GraduationCap size={28} />
            </div>
            <h1 className="text-xl font-bold text-stone-800">Willkommen bei UniKanban</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-stone-500">
              Dein Semesterbegleiter. Richte in 30 Sekunden dein Studium ein – oder schau dich
              erst mit Beispieldaten um.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => setStep('program')}
                className="flex items-center justify-center gap-2 rounded-full bg-brand-400 px-5 py-2.5 text-sm font-semibold text-stone-900 hover:bg-brand-500"
              >
                Studium einrichten <ArrowRight size={16} />
              </button>
              <button
                onClick={() => void loadDemo()}
                disabled={busy}
                className="rounded-full px-5 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-100 disabled:opacity-50"
              >
                Erst mal mit Beispieldaten erkunden
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Fortschritt */}
            <div className="mb-5 flex items-center gap-2">
              {steps.map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition',
                    i <= stepIndex ? 'bg-brand-400' : 'bg-stone-200',
                  )}
                />
              ))}
            </div>

            {step === 'program' && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-stone-800">Dein Studiengang</h2>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-stone-500">Name</span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="z.B. B.Sc. Informatik"
                    className={inputCls}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-stone-500">Art</span>
                    <Select value={type} options={TYPE_OPTS} onChange={(v) => setKind(v as ProgramType)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-stone-500">Ziel-ECTS</span>
                    <input
                      type="number"
                      value={target}
                      onChange={(e) => setTarget(Number(e.target.value))}
                      className={inputCls}
                    />
                  </label>
                </div>
                <div className="rounded-xl bg-stone-50 p-3">
                  <div className="mb-2 text-xs font-medium text-stone-600">
                    Schon mitten im Studium? Trag deinen bisherigen Stand ein (optional).
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs text-stone-500">bisherige ECTS</span>
                      <input
                        type="number"
                        value={priorEcts || ''}
                        onChange={(e) => setPriorEcts(Number(e.target.value))}
                        placeholder="0"
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-stone-500">bisheriger Schnitt</span>
                      <input
                        type="number"
                        step="0.1"
                        value={priorAvg || ''}
                        onChange={(e) => setPriorAvg(Number(e.target.value))}
                        placeholder="z.B. 2,1"
                        className={inputCls}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {step === 'semester' && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-stone-800">Aktuelles Semester</h2>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-stone-500">Name</span>
                  <input
                    autoFocus
                    value={semName}
                    onChange={(e) => setSemName(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-stone-500">Vorlesungsbeginn</span>
                    <DatePicker dateOnly value={semStart} onChange={(v) => setSemStart(v ?? semStart)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-stone-500">Vorlesungswochen</span>
                    <input
                      type="number"
                      value={semWeeks}
                      onChange={(e) => setSemWeeks(Number(e.target.value))}
                      className={inputCls}
                    />
                  </label>
                </div>
                <p className="text-xs text-stone-400">
                  Klausurenphasen kannst du später unter „Studium" ergänzen.
                </p>
              </div>
            )}

            {step === 'courses' && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-stone-800">Deine Kurse</h2>
                <p className="text-sm text-stone-500">
                  Leg ein paar Kurse an (Stundenplan & wöchentliche Übungsblätter später pro Kurs).
                </p>
                <div className="space-y-2">
                  {courses.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setCourses((cs) =>
                            cs.map((x, j) =>
                              j === i
                                ? { ...x, color: PALETTE[(PALETTE.indexOf(x.color) + 1) % PALETTE.length] }
                                : x,
                            ),
                          )
                        }
                        className="h-7 w-7 shrink-0 rounded-full ring-2 ring-stone-200"
                        style={{ backgroundColor: c.color }}
                        title="Farbe wechseln"
                      />
                      <input
                        value={c.name}
                        onChange={(e) =>
                          setCourses((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                        }
                        placeholder="Kursname, z.B. Analysis II"
                        className={cn(inputCls, 'flex-1')}
                      />
                      <input
                        value={c.short}
                        onChange={(e) =>
                          setCourses((cs) =>
                            cs.map((x, j) => (j === i ? { ...x, short: e.target.value.toUpperCase() } : x)),
                          )
                        }
                        placeholder="Kürzel"
                        className="w-24 rounded-lg border border-stone-200 px-2 py-2 text-sm uppercase outline-none focus:border-brand-400"
                      />
                      {courses.length > 1 && (
                        <button
                          onClick={() => setCourses((cs) => cs.filter((_, j) => j !== i))}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() =>
                    setCourses((cs) => [...cs, { name: '', short: '', color: PALETTE[cs.length % PALETTE.length] }])
                  }
                  className="flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-brand-600"
                >
                  <Plus size={15} /> Kurs hinzufügen
                </button>
              </div>
            )}

            {/* Navigation */}
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setStep(stepIndex === 0 ? 'welcome' : steps[stepIndex - 1])}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-stone-500 hover:bg-stone-100"
              >
                <ArrowLeft size={15} /> Zurück
              </button>
              {step === 'courses' ? (
                <button
                  onClick={() => void finish()}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-full bg-brand-400 px-5 py-2 text-sm font-semibold text-stone-900 hover:bg-brand-500 disabled:opacity-50"
                >
                  <Check size={16} /> Los geht's
                </button>
              ) : (
                <button
                  onClick={() => setStep(steps[stepIndex + 1])}
                  className="flex items-center gap-1.5 rounded-full bg-brand-400 px-5 py-2 text-sm font-semibold text-stone-900 hover:bg-brand-500"
                >
                  Weiter <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'welcome' && (
          <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
            <Sparkles size={12} /> Alles bleibt lokal auf deinem Gerät
          </div>
        )}
      </div>
    </div>
  )
}
