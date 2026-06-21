import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Plus, Minus, GraduationCap, Trash2, X, TrendingUp } from 'lucide-react'
import type { Course, CourseStatus, ExamPhase, Program, ProgramType, Semester } from '@/db/types'
import { db, uid } from '@/db/db'
import {
  createProgram,
  createSemester,
  deleteProgram,
  deleteSemester,
  saveProgram,
  saveSemester,
  switchSemester,
} from '@/lib/actions'
import { usePrograms, useProgramCourses, useSemesters } from '@/hooks/data'
import { isSyncConfigured } from '@/lib/supabase'
import {
  computeProgramStats,
  feasibility,
  fmtGrade,
  forecastRange,
  getForecast,
  neededForTarget,
  projectedFinal,
  PROGRAM_TYPE_LABEL,
  type ProgramStats,
} from '@/lib/study'
import { Modal } from './Modal'
import { ExamPhasePanel } from './ExamPhasePanel'
import { DataSection } from './DataSection'
import { DatePicker } from './DatePicker'
import { Select } from './ui/Select'
import { cn } from '@/lib/cn'

const STATUS_OPTS: { id: CourseStatus; label: string }[] = [
  { id: 'laufend', label: 'läuft' },
  { id: 'bestanden', label: 'bestanden' },
  { id: 'nicht_bestanden', label: 'nicht best.' },
]

export function StudyView({ activeProgram }: { activeProgram: Program }) {
  const programs = usePrograms()
  const [selId, setSelId] = useState(activeProgram.id)
  const sel = programs.find((p) => p.id === selId) ?? activeProgram

  const semesters = useSemesters(sel.id)
  const courses = useProgramCourses(sel.id)
  const stats = useMemo(() => computeProgramStats(sel, courses), [sel, courses])

  const [editProgram, setEditProgram] = useState<Program | null>(null)
  const [newProgram, setNewProgram] = useState(false)
  const [semForm, setSemForm] = useState<Semester | null>(null)

  const coursesBySem = useMemo(() => {
    const m = new Map<string, Course[]>()
    for (const c of courses) {
      if (!m.has(c.semesterId)) m.set(c.semesterId, [])
      m.get(c.semesterId)!.push(c)
    }
    return m
  }, [courses])

  const sortedSems = [...semesters].sort((a, b) => a.startDate.localeCompare(b.startDate))

  return (
    <div className="h-full overflow-y-auto px-5 pb-8">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Studiengang-Auswahl */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {programs.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelId(p.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                p.id === sel.id
                  ? 'bg-stone-900 text-white'
                  : 'bg-white/70 text-stone-600 ring-1 ring-stone-200/70 hover:bg-white',
              )}
            >
              <GraduationCap size={14} /> {p.name}
            </button>
          ))}
          <button
            onClick={() => setEditProgram(structuredClone(sel))}
            className="flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-sm font-medium text-stone-500 ring-1 ring-stone-200/70 hover:bg-white hover:text-stone-700"
          >
            <Pencil size={13} /> Bearbeiten
          </button>
          <button
            onClick={() => setNewProgram(true)}
            className="rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-500 hover:border-brand-400 hover:text-brand-600"
          >
            <Plus size={14} className="-mt-0.5 mr-0.5 inline" /> Studiengang
          </button>
        </div>

        {/* Statistik */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70 sm:col-span-2">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-stone-700">ECTS-Fortschritt</span>
              <button
                onClick={() => setEditProgram(structuredClone(sel))}
                className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600"
              >
                <Pencil size={12} /> {PROGRAM_TYPE_LABEL[sel.type]} bearbeiten
              </button>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-stone-800">{stats.doneEcts}</span>
              <span className="text-stone-400">/ {stats.targetEcts} ECTS</span>
              {stats.runningEcts > 0 && (
                <span className="ml-auto text-xs text-stone-400">
                  +{stats.runningEcts} laufend
                </span>
              )}
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-brand-400 transition-all"
                style={{ width: `${stats.progress * 100}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-stone-400">
              {Math.round(stats.progress * 100)} % geschafft
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
            <span className="text-sm font-semibold text-stone-700">Notenschnitt</span>
            <div className="mt-1 text-3xl font-bold text-stone-800">{fmtGrade(stats.gradeAvg)}</div>
            <div className="mt-1 text-xs text-stone-400">
              {stats.gradedCourses} benotete Kurse
              {sel.priorGradedEcts ? ' (inkl. Startbilanz)' : ''}
            </div>
          </div>
        </div>

        {/* Notenprognose */}
        {stats.targetEcts > 0 && <Forecast key={sel.id} stats={stats} />}

        {/* Klausurphase-Überblick (aktives Semester) */}
        <ExamPhasePanel />

        {/* Semester / Transcript */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700">Semester</h2>
          <button
            onClick={() =>
              setSemForm({
                id: uid(),
                programId: sel.id,
                name: '',
                startDate: new Date().toISOString().slice(0, 10),
                weeks: 14,
                examPhases: [],
                active: false,
              })
            }
            className="flex items-center gap-1 rounded-full bg-brand-400 px-3 py-1.5 text-xs font-semibold text-stone-900 hover:bg-brand-500"
          >
            <Plus size={14} /> Neues Semester
          </button>
        </div>

        {sortedSems.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-200 py-8 text-center text-sm text-stone-400">
            Noch kein Semester in diesem Studiengang.
          </div>
        )}

        <div className="space-y-3">
          {sortedSems.map((s) => {
            const cs = coursesBySem.get(s.id) ?? []
            return (
              <section key={s.id} className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-stone-200/70">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className="text-sm font-semibold text-stone-800">{s.name}</span>
                  {s.active && (
                    <span className="rounded-full bg-brand-300 px-2 text-[10px] font-semibold text-stone-900">
                      aktiv
                    </span>
                  )}
                  <button
                    onClick={() => void switchSemester(s.id)}
                    className="text-xs text-stone-400 hover:text-brand-600"
                  >
                    öffnen
                  </button>
                  <button
                    onClick={() => setSemForm(structuredClone(s))}
                    className="ml-auto rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                  >
                    <Pencil size={14} />
                  </button>
                </div>

                {cs.length === 0 ? (
                  <div className="px-1 pb-1 text-xs text-stone-300">keine Kurse</div>
                ) : (
                  <div className="space-y-1">
                    {cs.map((c) => (
                      <CourseRow key={c.id} course={c} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {/* Backup/Reset: im Konto-Modus unter „Einstellungen", sonst hier. */}
        {!isSyncConfigured && <DataSection />}
      </div>

      {editProgram && (
        <ProgramForm
          program={editProgram}
          onClose={() => setEditProgram(null)}
          isNew={false}
          canDelete={programs.length > 1}
        />
      )}
      {newProgram && <ProgramForm onClose={() => setNewProgram(false)} isNew canDelete={false} />}
      {semForm && (
        <SemesterForm
          semester={semForm}
          isNew={!semesters.some((s) => s.id === semForm.id)}
          onClose={() => setSemForm(null)}
        />
      )}
    </div>
  )
}

function clampGrade(n: number): number {
  if (isNaN(n)) return 2.0
  return Math.min(4, Math.max(1, Number(n.toFixed(1))))
}

/** Ampelfarbe nach Notenwert (1,0 sehr gut … 4,0 ausreichend). */
function gradeColor(g: number): string {
  return g <= 2 ? 'text-emerald-600' : g <= 3 ? 'text-amber-500' : 'text-red-500'
}

/** Nummeriertes Schritt-Badge (1, 2 …) für klare Reihenfolge. */
function StepNum({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-800 text-[11px] font-bold text-white">
      {n}
    </span>
  )
}

/** Kleiner −/+ Stepper für die Zielnote. */
function GradeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 disabled:opacity-30'
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-stone-200 bg-white p-1">
      <button
        type="button"
        aria-label="Ziel verbessern"
        disabled={value <= 1}
        onClick={() => onChange(clampGrade(value - 0.1))}
        className={btn}
      >
        <Minus size={15} />
      </button>
      <span className="w-9 text-center text-base font-bold tabular-nums text-stone-800">
        {fmtGrade(value)}
      </span>
      <button
        type="button"
        aria-label="Ziel lockern"
        disabled={value >= 4}
        onClick={() => onChange(clampGrade(value + 0.1))}
        className={btn}
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

/** Notenprognose: „Was brauche ich noch?" + Endschnitt-Szenario. */
function Forecast({ stats }: { stats: ProgramStats }) {
  const f = getForecast(stats)
  const [target, setTarget] = useState(() =>
    clampGrade(stats.gradeAvg ? Math.min(stats.gradeAvg, 2.0) : 2.0),
  )
  const [assumed, setAssumed] = useState(() => clampGrade(stats.gradeAvg ?? 2.0))

  const head = (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
          <TrendingUp size={15} />
        </span>
        <span className="text-sm font-semibold text-stone-800">Notenprognose</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-stone-500">
        Zum Ausprobieren: Stell dein Ziel ein und schätze, wie der Rest läuft – deine echten Noten
        bleiben unverändert.
      </p>
    </div>
  )

  // Nichts mehr offen → Schnitt steht fest.
  if (f.remainingEcts <= 0) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        {head}
        <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
          <span className="text-sm text-stone-500">Alle ECTS benotet – dein Schnitt steht</span>
          <span className={cn('text-3xl font-bold', gradeColor(stats.gradeAvg ?? 4))}>
            {fmtGrade(stats.gradeAvg)}
          </span>
        </div>
      </div>
    )
  }

  const { needed, status } = neededForTarget(stats, target)
  const projected = projectedFinal(stats, assumed)
  const { best, worst } = forecastRange(stats)
  const feas = feasibility(needed, stats.gradeAvg)
  const feasBadge =
    feas === 'relaxed'
      ? { text: 'locker', cls: 'bg-emerald-100 text-emerald-700' }
      : feas === 'ambitious'
        ? { text: 'ambitioniert', cls: 'bg-amber-100 text-amber-700' }
        : { text: 'machbar', cls: 'bg-stone-200 text-stone-600' }

  // Position des Szenarios im Best–Worst-Korridor (0 % = best, 100 % = worst).
  const span = worst - best
  const pct = span > 0 ? Math.min(100, Math.max(0, ((projected - best) / span) * 100)) : 50

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
      {head}

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Block 1: Ziel einstellen → benötigte Restnote */}
        <div className="rounded-xl bg-stone-50 p-4">
          <div className="flex items-center gap-2">
            <StepNum n={1} />
            <span className="text-sm font-semibold text-stone-700">Welchen Schnitt willst du?</span>
          </div>

          {/* Eingabe */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm text-stone-500">Ziel-Schnitt</span>
            <GradeStepper value={target} onChange={setTarget} />
          </div>

          {/* Ergebnis */}
          <div className="mt-3 border-t border-dashed border-stone-200 pt-3">
            {status === 'ok' && (
              <>
                <span className="text-xs text-stone-500">Dann brauchst du im Rest noch einen Ø von</span>
                <div className="mt-1 flex items-end gap-2">
                  <span className={cn('text-4xl font-bold leading-none', gradeColor(needed))}>
                    {fmtGrade(needed)}
                  </span>
                  <span
                    className={cn(
                      'mb-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                      feasBadge.cls,
                    )}
                  >
                    {feasBadge.text}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-stone-400">über die restlichen {f.remainingEcts} ECTS</p>
              </>
            )}
            {status === 'secured' && (
              <div className="rounded-lg bg-emerald-50 px-3 py-2.5">
                <div className="text-sm font-semibold text-emerald-700">Ziel schon gesichert ✓</div>
                <p className="mt-0.5 text-xs text-emerald-600/90">
                  Selbst mit 4,0 im Rest erreichst du {fmtGrade(target)}.
                </p>
              </div>
            )}
            {status === 'impossible' && (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5">
                <div className="text-sm font-semibold text-amber-700">Nicht mehr erreichbar</div>
                <p className="mt-0.5 text-xs text-amber-600/90">
                  Dafür müsstest du im Rest besser als 1,0 sein.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Block 2: Rest-Einschätzung → Endschnitt */}
        <div className="rounded-xl bg-stone-50 p-4">
          <div className="flex items-center gap-2">
            <StepNum n={2} />
            <span className="text-sm font-semibold text-stone-700">Wie läuft der Rest?</span>
          </div>

          {/* Eingabe: Schieberegler */}
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm text-stone-500">Angenommener Ø im Rest</span>
              <span className="rounded-full bg-brand-200 px-2.5 py-0.5 text-sm font-bold tabular-nums text-stone-800">
                {fmtGrade(assumed)}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="4"
              step="0.1"
              value={assumed}
              onChange={(e) => setAssumed(Number(e.target.value))}
              className="slider-grade"
              aria-label="Angenommener Schnitt im Rest"
            />
            <div className="mt-1 flex justify-between text-[10px] text-stone-400">
              <span>1,0 · sehr gut</span>
              <span>4,0 · ausreichend</span>
            </div>
          </div>

          {/* Ergebnis: Endschnitt + Korridor */}
          <div className="mt-3 border-t border-dashed border-stone-200 pt-3">
            <span className="text-xs text-stone-500">Dann liegt dein Endschnitt bei</span>
            <div className="mt-1">
              <span className={cn('text-4xl font-bold leading-none', gradeColor(projected))}>
                {fmtGrade(projected)}
              </span>
            </div>
            <div className="mt-3">
              <div
                className="relative h-2 rounded-full"
                style={{ background: 'linear-gradient(90deg,#34d399,#fbbf24,#f87171)' }}
              >
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-stone-700 transition-all"
                  style={{ left: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-stone-400">
                <span>
                  läuft's top: <strong className="text-stone-500">{fmtGrade(best)}</strong>
                </span>
                <span>
                  läuft's mies: <strong className="text-stone-500">{fmtGrade(worst)}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
        Bezogen auf rund {f.finalEcts} benotete ECTS. Annahme: die restlichen ECTS werden benotet –
        unbenotete Module (bestanden/nicht&nbsp;bestanden) zählen nicht in den Schnitt.
      </p>
    </div>
  )
}

/** Eine Kurszeile mit Inline-Bearbeitung von ECTS, Note & Status. */
function CourseRow({ course }: { course: Course }) {
  const upd = (patch: Partial<Course>) => void db.courses.update(course.id, patch)
  const status = course.status ?? 'laufend'
  return (
    <div className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-stone-50">
      <span className="h-5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
      <span className="min-w-0 flex-1 truncate text-sm text-stone-700">
        <span className="font-medium">{course.short}</span> · {course.name}
      </span>
      <input
        type="number"
        defaultValue={course.ects ?? ''}
        placeholder="ECTS"
        onBlur={(e) => upd({ ects: e.target.value ? Number(e.target.value) : undefined })}
        className="w-14 rounded-md border border-stone-200 px-1.5 py-1 text-center text-xs"
      />
      <input
        type="number"
        step="0.1"
        min="1"
        max="5"
        defaultValue={course.grade ?? ''}
        placeholder="Note"
        onBlur={(e) => upd({ grade: e.target.value ? Number(e.target.value) : undefined })}
        className="w-14 rounded-md border border-stone-200 px-1.5 py-1 text-center text-xs"
      />
      <Select
        value={status}
        options={STATUS_OPTS.map((o) => ({ value: o.id, label: o.label }))}
        onChange={(v) => upd({ status: v as CourseStatus })}
        className="w-28"
      />
    </div>
  )
}

const TYPE_OPTS: { id: ProgramType; label: string }[] = [
  { id: 'bachelor', label: 'Bachelor' },
  { id: 'master', label: 'Master' },
  { id: 'other', label: 'Sonstiges' },
]

function field(label: string, el: ReactNode) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-500">{label}</span>
      {el}
    </label>
  )
}
const inputCls = 'w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm'

/** Studiengang anlegen/bearbeiten. Beim Anlegen wird ein erstes Semester erzeugt. */
function ProgramForm({
  program,
  isNew,
  onClose,
  canDelete,
}: {
  program?: Program
  isNew: boolean
  onClose: () => void
  canDelete: boolean
}) {
  const [name, setName] = useState(program?.name ?? '')
  const [type, setType] = useState<ProgramType>(program?.type ?? 'bachelor')
  const [target, setTarget] = useState(program?.targetEcts ?? 180)
  const [priorEcts, setPriorEcts] = useState(program?.priorEcts ?? 0)
  const [priorAvg, setPriorAvg] = useState(program?.priorGradeAvg ?? 0)
  const [semName, setSemName] = useState('')

  async function submit() {
    if (isNew) {
      const pid = await createProgram({
        name,
        type,
        targetEcts: target,
        priorEcts: priorEcts || undefined,
        priorGradeAvg: priorAvg || undefined,
        priorGradedEcts: priorEcts || undefined,
      })
      await createSemester({
        programId: pid,
        name: semName || 'Semester 1',
        startDate: new Date().toISOString().slice(0, 10),
        weeks: 14,
      })
    } else if (program) {
      await saveProgram({
        ...program,
        name,
        type,
        targetEcts: target,
        priorEcts: priorEcts || undefined,
        priorGradeAvg: priorAvg || undefined,
        priorGradedEcts: priorEcts || undefined,
      })
    }
    onClose()
  }

  return (
    <Modal title={isNew ? 'Neuer Studiengang' : 'Studiengang bearbeiten'} onClose={onClose}>
      <div className="space-y-3">
        {field(
          'Name',
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. B.Sc. Informatik"
            className={inputCls}
          />,
        )}
        <div className="grid grid-cols-2 gap-3">
          {field(
            'Art',
            <Select
              value={type}
              options={TYPE_OPTS.map((o) => ({ value: o.id, label: o.label }))}
              onChange={(v) => setType(v as ProgramType)}
            />,
          )}
          {field(
            'Ziel-ECTS',
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className={inputCls}
            />,
          )}
        </div>

        <div className="rounded-xl bg-stone-50 p-3">
          <div className="mb-2 text-xs font-medium text-stone-600">
            Startbilanz (falls du mitten im Studium einsteigst)
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field(
              'bisherige ECTS',
              <input
                type="number"
                value={priorEcts || ''}
                onChange={(e) => setPriorEcts(Number(e.target.value))}
                placeholder="0"
                className={inputCls}
              />,
            )}
            {field(
              'bisheriger Schnitt',
              <input
                type="number"
                step="0.1"
                value={priorAvg || ''}
                onChange={(e) => setPriorAvg(Number(e.target.value))}
                placeholder="z.B. 2,1"
                className={inputCls}
              />,
            )}
          </div>
        </div>

        {isNew &&
          field(
            'Erstes Semester',
            <input
              value={semName}
              onChange={(e) => setSemName(e.target.value)}
              placeholder="z.B. WiSe 2026/27"
              className={inputCls}
            />,
          )}

        <div className="flex items-center justify-between pt-1">
          {!isNew && program && canDelete && (
            <button
              onClick={() => {
                if (
                  confirm(
                    `„${program.name}" mit allen Semestern, Kursen & Aufgaben unwiderruflich löschen?`,
                  )
                ) {
                  void deleteProgram(program.id)
                  onClose()
                }
              }}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:underline"
            >
              <Trash2 size={14} /> Studiengang löschen
            </button>
          )}
          {!isNew && program && !canDelete && (
            <span className="text-xs text-stone-400">
              Der letzte Studiengang kann nicht gelöscht werden.
            </span>
          )}
          <button
            onClick={() => void submit()}
            className="ml-auto rounded-full bg-brand-400 px-5 py-1.5 text-sm font-semibold text-stone-900 hover:bg-brand-500"
          >
            Speichern
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Semester anlegen/bearbeiten inkl. Klausurenphasen. */
function SemesterForm({
  semester,
  isNew,
  onClose,
}: {
  semester: Semester
  isNew: boolean
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Semester>(semester)
  const set = <K extends keyof Semester>(k: K, v: Semester[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const addExam = () =>
    set('examPhases', [
      ...draft.examPhases,
      {
        id: uid(),
        label: `${draft.examPhases.length + 1}. Klausurenphase`,
        start: draft.startDate,
        end: draft.startDate,
      },
    ])
  const updExam = (id: string, patch: Partial<ExamPhase>) =>
    set('examPhases', draft.examPhases.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const rmExam = (id: string) => set('examPhases', draft.examPhases.filter((e) => e.id !== id))

  async function submit() {
    if (isNew) {
      const id = await createSemester({
        programId: draft.programId,
        name: draft.name || 'Neues Semester',
        startDate: draft.startDate,
        weeks: draft.weeks,
      })
      await saveSemester({ ...draft, id, active: true })
    } else {
      await saveSemester(draft)
    }
    onClose()
  }

  return (
    <Modal title={isNew ? 'Neues Semester' : 'Semester bearbeiten'} onClose={onClose}>
      <div className="space-y-3">
        {field(
          'Name',
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="z.B. WiSe 2026/27"
            className={inputCls}
          />,
        )}
        <div className="grid grid-cols-2 gap-3">
          {field(
            'Vorlesungsbeginn',
            <DatePicker dateOnly value={draft.startDate} onChange={(v) => set('startDate', v ?? draft.startDate)} />,
          )}
          {field(
            'Vorlesungswochen',
            <input
              type="number"
              value={draft.weeks}
              onChange={(e) => set('weeks', Number(e.target.value))}
              className={inputCls}
            />,
          )}
        </div>
        {field(
          'Semesterende (optional)',
          <DatePicker dateOnly value={draft.endDate} onChange={(v) => set('endDate', v)} />,
        )}

        <div className="rounded-xl bg-stone-50 p-3">
          <div className="mb-2 text-xs font-medium text-stone-600">Klausurenphasen</div>
          <div className="space-y-2">
            {draft.examPhases.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                <input
                  value={e.label}
                  onChange={(ev) => updExam(e.id, { label: ev.target.value })}
                  className="w-32 rounded-lg border border-stone-200 px-2 py-1.5"
                />
                <div className="w-36">
                  <DatePicker dateOnly value={e.start} onChange={(v) => updExam(e.id, { start: v ?? e.start })} />
                </div>
                <span className="text-stone-400">–</span>
                <div className="w-36">
                  <DatePicker dateOnly value={e.end} onChange={(v) => updExam(e.id, { end: v ?? e.end })} />
                </div>
                <button
                  onClick={() => rmExam(e.id)}
                  className="rounded-lg p-1 text-stone-400 hover:bg-red-50 hover:text-red-500"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              onClick={addExam}
              className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-brand-600"
            >
              <Plus size={13} /> Klausurenphase hinzufügen
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          {!isNew && (
            <button
              onClick={() => {
                if (confirm(`„${draft.name}" mit allen Kursen & Aufgaben löschen?`)) {
                  void deleteSemester(draft.id)
                  onClose()
                }
              }}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:underline"
            >
              <Trash2 size={14} /> Löschen
            </button>
          )}
          <button
            onClick={() => void submit()}
            className="ml-auto rounded-full bg-brand-400 px-5 py-1.5 text-sm font-semibold text-stone-900 hover:bg-brand-500"
          >
            Speichern
          </button>
        </div>
      </div>
    </Modal>
  )
}
