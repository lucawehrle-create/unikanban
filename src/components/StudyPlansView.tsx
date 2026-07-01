import { useEffect, useMemo, useState } from 'react'
import {
  GraduationCap,
  BookOpen,
  Trash2,
  Check,
  CalendarClock,
  ChevronRight,
  RotateCcw,
  Scale,
  Sparkles,
} from 'lucide-react'
import { addDays, parseISO, format, differenceInCalendarDays } from 'date-fns'
import { de } from 'date-fns/locale'
import type { Course, StudyPlanConfig, StudyStrategy, Task } from '@/db/types'
import { useActiveSemester, useCourses, useTasks } from '@/hooks/data'
import { CoachTeaser } from './CoachTeaser'
import { useUI, getStudySettings } from '@/store/ui'
import {
  KIND_META,
  STRATEGY_META,
  previewCoursePlan,
  cardMinutesPerDay,
  defaultPlanConfig,
  deletePlan,
  planProgress,
  planSessionCount,
  rebalanceAllPlans,
  rescheduleOverduePlan,
  reviewReps,
  savePlan,
  summarize,
  timeline,
  type DayBar,
  type ItemKind,
  type StudySettings,
} from '@/lib/studyPlans'
import { DatePicker } from './DatePicker'
import { Select } from './ui/Select'
import { cn } from '@/lib/cn'
import { HARD_THRESHOLD, difficultyMeta } from '@/lib/reflection'

/**
 * Standard-Auswahl der zu wiederholenden Blätter: Hat der Nutzer reflektiert,
 * werden die als schwer markierten (+ noch nicht reflektierten) vorausgewählt –
 * die explizit als leicht markierten fallen raus. Ohne Reflexionen: alle.
 */
function defaultReviewIds(tasks: Task[]): string[] {
  const anyReflected = tasks.some((t) => t.reflection)
  if (!anyReflected) return tasks.map((t) => t.id)
  return tasks
    .filter((t) => !t.reflection || t.reflection.difficulty >= HARD_THRESHOLD)
    .map((t) => t.id)
}

/** Optionales Tageslimit nur für diesen Kurs ('' = kein eigenes Limit). */
const COURSE_LIMIT_OPTS = [
  { value: '', label: 'kein eigenes Limit' },
  { value: '60', label: '1 h' },
  { value: '90', label: '1,5 h' },
  { value: '120', label: '2 h' },
  { value: '180', label: '3 h' },
]

const KIND_ORDER: ItemKind[] = ['altklausur', 'kapitel', 'uebung', 'tut', 'karten']

function Timeline({ bars, height = 96 }: { bars: DayBar[]; height?: number }) {
  if (bars.length === 0) return null
  const maxMin = Math.max(60, ...bars.map((b) => b.total))
  return (
    <div className="flex items-end gap-px overflow-x-auto pb-1" style={{ height }}>
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex w-2 shrink-0 flex-col-reverse rounded-sm bg-stone-100"
          style={{ height: '100%' }}
          title={`${format(b.date, 'EEE d. MMM', { locale: de })} · ${b.total} Min`}
        >
          {KIND_ORDER.map((k) =>
            b.byKind[k] > 0 ? (
              <div
                key={k}
                style={{
                  height: `${(b.byKind[k] / maxMin) * 100}%`,
                  backgroundColor: KIND_META[k].color,
                }}
              />
            ) : null,
          )}
        </div>
      ))}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {KIND_ORDER.map((k) => (
        <span key={k} className="flex items-center gap-1 text-[11px] text-stone-500">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: KIND_META[k].color }} />
          {KIND_META[k].label}
        </span>
      ))}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm'

/**
 * Zahlen-Eingabe mit lokalem Text-Puffer: erlaubt Leeren & Zwischenstände beim
 * Tippen und klemmt erst beim Verlassen (Blur/Enter) auf [min, max]. Verhindert,
 * dass z.B. eine „30"-Mindestgrenze sich nicht überschreiben lässt.
 */
function NumField({
  value, min, max, fallback, onCommit, className,
}: {
  value: number
  min: number
  max?: number
  fallback: number
  onCommit: (v: number) => void
  className?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = () => {
    const raw = text.trim() === '' ? fallback : Number(text)
    const n = Number.isFinite(raw) ? raw : fallback
    const clamped = Math.min(max ?? Infinity, Math.max(min, n))
    setText(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={className}
    />
  )
}

function PlanEditor({
  course,
  courses,
  allTasks,
}: {
  course: Course
  courses: Course[]
  allTasks: Task[]
}) {
  const uebungTasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.courseId === course.id && t.type === 'uebung')
        .sort((a, b) => a.order - b.order),
    [allTasks, course.id],
  )
  const tutTasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.courseId === course.id && t.type === 'tutoriumsblatt')
        .sort((a, b) => a.order - b.order),
    [allTasks, course.id],
  )
  const examTask = useMemo(
    () =>
      allTasks
        .filter((t) => t.courseId === course.id && t.type === 'klausur' && t.dueDate)
        .sort((a, b) => parseISO(a.dueDate!).getTime() - parseISO(b.dueDate!).getTime())[0],
    [allTasks, course.id],
  )
  const initialDate =
    course.studyPlan?.examDate ??
    // Lokales Datum (parseISO+format) statt UTC-slice – sonst in westlichen
    // Zeitzonen einen Tag zu spät (23:59-Frist rollt in der UTC-ISO auf morgen).
    (examTask?.dueDate ? format(parseISO(examTask.dueDate), 'yyyy-MM-dd') : undefined) ??
    format(addDays(new Date(), 30), 'yyyy-MM-dd')

  const [cfg, setCfg] = useState<StudyPlanConfig>(() => {
    if (course.studyPlan) return course.studyPlan
    const base = defaultPlanConfig(
      initialDate,
      defaultReviewIds(uebungTasks),
      defaultReviewIds(tutTasks),
    )
    return course.examDurationMin ? { ...base, examDurationMin: course.examDurationMin } : base
  })
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const dailyMaxMin = useUI((s) => s.studyDailyMaxMin)
  const setStudyDailyMaxMin = useUI((s) => s.setStudyDailyMaxMin)
  const weeklyMaxMin = useUI((s) => s.studyWeeklyMaxMin)
  const studyDays = useUI((s) => s.studyDays)
  const maxCoursesPerDay = useUI((s) => s.studyMaxCoursesPerDay)
  const prepWindowWeeks = useUI((s) => s.studyPrepWindowWeeks)
  const settings: StudySettings = useMemo(
    () => ({ dailyMaxMin, weeklyMaxMin, studyDays, maxCoursesPerDay, prepWindowWeeks }),
    [dailyMaxMin, weeklyMaxMin, studyDays, maxCoursesPerDay, prepWindowWeeks],
  )

  const set = <K extends keyof StudyPlanConfig>(k: K, v: StudyPlanConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }))

  const variants = useMemo(
    () =>
      (['now', 'breaks', 'later'] as StudyStrategy[]).map((strategy) => {
        const r = previewCoursePlan(course, { ...cfg, strategy }, courses, allTasks, settings)
        return {
          strategy,
          sessions: r.sessions,
          unplaced: r.dropped.length,
          summary: summarize(r.sessions),
        }
      }),
    [cfg, course, courses, allTasks, settings],
  )
  const active = variants.find((v) => v.strategy === cfg.strategy) ?? variants[0]
  const bars = useMemo(() => timeline(cfg, active.sessions), [cfg, active.sessions])

  const planned = planSessionCount(allTasks, course.id)
  const progress = planProgress(allTasks, course.id)
  const examDays = differenceInCalendarDays(parseISO(cfg.examDate), new Date())

  const catchUp = async () => {
    setBusy(true)
    const n = await rescheduleOverduePlan(course, cfg, courses, allTasks, getStudySettings())
    setBusy(false)
    setFlash(n > 0 ? `${n} überfällige Sessions verschoben` : 'Nichts aufzuholen')
    setTimeout(() => setFlash(''), 3000)
  }

  const save = async () => {
    setBusy(true)
    const n = await savePlan(course, cfg, courses, allTasks, getStudySettings())
    setBusy(false)
    setFlash(`${n} Lern-Sessions angelegt`)
    setTimeout(() => setFlash(''), 3000)
  }
  const remove = async () => {
    if (!window.confirm('Lernplan & alle zugehörigen Sessions löschen?')) return
    setBusy(true)
    await deletePlan(course.id, allTasks)
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      {/* Einstieg, solange noch kein Plan existiert */}
      {planned === 0 && (
        <div className="rounded-xl bg-brand-50 p-3.5 ring-1 ring-brand-200/70">
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
            <Sparkles size={15} className="text-brand-500" /> In 3 Schritten zum Lernplan
          </div>
          <ol className="space-y-0.5 text-xs text-stone-600">
            <li><strong className="text-stone-700">1.</strong> Datum &amp; Material – Klausur, Kapitel, Altklausuren, Karteikarten.</li>
            <li><strong className="text-stone-700">2.</strong> Strategie wählen – sofort starten, mit Pausen oder später.</li>
            <li><strong className="text-stone-700">3.</strong> „Lernplan anlegen" – ich verteile alles bis zur Klausur.</li>
          </ol>
          <p className="mt-1.5 text-[11px] text-stone-500">Deine Übungsblätter sind automatisch zur Wiederholung dabei.</p>
        </div>
      )}
      {/* Fortschritt (nur bei aktivem Plan) */}
      {planned > 0 && (
        <div className="rounded-xl bg-stone-50 p-3">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-medium text-stone-600">Dein Fortschritt</span>
            <span className="text-stone-500">
              <strong className="text-stone-700">{progress.done}</strong>/{progress.total} Sessions ·{' '}
              {progress.pct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          {progress.overdue > 0 ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-amber-700">
                {progress.overdue} überfällig – du hängst etwas hinterher
              </span>
              <button
                onClick={() => void catchUp()}
                disabled={busy}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-700 disabled:opacity-40"
              >
                <RotateCcw size={13} /> Aufholen
              </button>
            </div>
          ) : (
            progress.open > 0 && (
              <div className="mt-2 text-xs font-medium text-emerald-600">Du bist im Plan 🎉</div>
            )
          )}
        </div>
      )}

      {/* Eckdaten */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Klausurdatum</span>
          <DatePicker dateOnly value={cfg.examDate} onChange={(v) => set('examDate', v ?? cfg.examDate)} />
          <span className="mt-1 block text-[11px] text-stone-400">
            {examDays < 0
              ? 'liegt in der Vergangenheit'
              : examDays === 0
                ? 'heute'
                : examDays === 1
                  ? 'in 1 Tag'
                  : `in ${examDays} Tagen`}
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Klausurdauer (Min)</span>
          <NumField
            min={30}
            max={360}
            fallback={120}
            value={cfg.examDurationMin}
            onCommit={(v) => set('examDurationMin', v)}
            className={inputCls}
          />
          <span className="mt-1 block text-[11px] text-stone-400">
            pro Altklausur werden {cfg.examDurationMin * 2} Min eingeplant (inkl. Nacharbeit)
          </span>
        </label>
      </div>

      {/* Karteikarten-Slider */}
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-xs font-medium text-stone-500">Karteikarten pro Tag</span>
          <span className="text-xs text-stone-400">
            <strong className="text-stone-700">{cfg.cardsPerDay}</strong> Karten · ≈{' '}
            {cardMinutesPerDay(cfg)} Min/Tag
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={60}
          step={5}
          value={cfg.cardsPerDay}
          onChange={(e) => set('cardsPerDay', Number(e.target.value))}
          className="slider-grade"
        />
        <p className="mt-1 text-[11px] text-stone-400">
          Plant täglich Zeit für deine eigenen Karteikarten ein (SemBan verwaltet keine Karten).
        </p>
      </div>

      {/* Optionales Tageslimit nur für diesen Kurs */}
      <label className="block sm:max-w-xs">
        <span className="mb-1 block text-xs font-medium text-stone-500">
          Max. Lernzeit für diesen Kurs pro Tag
        </span>
        <Select
          value={cfg.dailyMaxMin != null ? String(cfg.dailyMaxMin) : ''}
          options={COURSE_LIMIT_OPTS}
          onChange={(v) => set('dailyMaxMin', v ? Number(v) : undefined)}
        />
        <span className="mt-1 block text-[11px] text-stone-400">
          Der gesamte Tagesdeckel über alle Kurse ({Math.round(dailyMaxMin / 60)} h) &amp; das
          Wochenlimit ({Math.round(weeklyMaxMin / 60)} h) liegen in den Einstellungen.
        </span>
      </label>

      {/* Vorbereitungsfenster (pro Kurs) */}
      <label className="block sm:max-w-xs">
        <span className="mb-1 block text-xs font-medium text-stone-500">Vorbereitungsfenster</span>
        <Select
          value={cfg.prepWindowWeeks != null ? String(cfg.prepWindowWeeks) : ''}
          options={[
            { value: '', label: `Standard (${prepWindowWeeks} Wochen)` },
            { value: '2', label: '2 Wochen' },
            { value: '3', label: '3 Wochen' },
            { value: '4', label: '4 Wochen' },
            { value: '6', label: '6 Wochen' },
            { value: '8', label: '8 Wochen' },
          ]}
          onChange={(v) => set('prepWindowWeeks', v ? Number(v) : undefined)}
        />
        <span className="mt-1 block text-[11px] text-stone-400">
          So lange vor der Klausur startet das intensive Lernen. Davor nur leichter Kontakt.
        </span>
      </label>

      {/* Mengen */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Altklausuren</span>
          <input
            type="number"
            min={0}
            max={20}
            value={cfg.altklausuren || ''}
            placeholder="0"
            onChange={(e) => set('altklausuren', Math.max(0, Number(e.target.value) || 0))}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Kapitel (Skript/VL)</span>
          <input
            type="number"
            min={0}
            max={50}
            value={cfg.chapters || ''}
            placeholder="0"
            onChange={(e) => set('chapters', Math.max(0, Number(e.target.value) || 0))}
            className={inputCls}
          />
        </label>
      </div>

      {/* Übungen/Tutorien bestätigen */}
      <div className="rounded-xl bg-stone-50 p-3">
        <div className="mb-2 text-xs font-medium text-stone-600">
          Aus deinen Aufgaben – welche nochmal wiederholen?
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-stone-400">
          Als <span className="font-medium text-orange-600">schwer</span> reflektierte Blätter bekommen
          automatisch mehr Zeit und mehrere Wiederholungen mit wachsenden Abständen (Spaced
          Repetition).
        </p>
        <div className="space-y-2">
          <ReviewSection
            label="Übungsblätter"
            tasks={uebungTasks}
            selectedIds={cfg.uebungReviewIds}
            onChange={(ids) => set('uebungReviewIds', ids)}
          />
          <ReviewSection
            label="Tutoriumsblätter"
            tasks={tutTasks}
            selectedIds={cfg.tutReviewIds}
            onChange={(ids) => set('tutReviewIds', ids)}
          />
        </div>
      </div>

      {/* 3 Strategie-Varianten */}
      <div>
        <span className="mb-1.5 block text-xs font-medium text-stone-500">Welcher Plan passt?</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {variants.map((v) => {
            const on = cfg.strategy === v.strategy
            const meta = STRATEGY_META[v.strategy]
            return (
              <button
                key={v.strategy}
                onClick={() => set('strategy', v.strategy)}
                className={cn(
                  'rounded-xl border p-3 text-left transition',
                  on ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white hover:border-stone-300',
                )}
              >
                <div className="text-sm font-semibold">{meta.title}</div>
                <div className={cn('mb-2 text-[11px]', on ? 'text-white/70' : 'text-stone-400')}>
                  {meta.desc} · {meta.reps}
                </div>
                <Timeline bars={timeline(cfg, v.sessions)} height={44} />
                <div className={cn('mt-1 text-[11px]', on ? 'text-white/80' : 'text-stone-500')}>
                  {v.summary.sessions} Sessions · ø {v.summary.perDayMin} Min/Tag
                </div>
                {v.unplaced > 0 && (
                  <div className={cn('text-[11px] font-medium', on ? 'text-amber-200' : 'text-amber-600')}>
                    {v.unplaced} passen nicht
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Große Timeline */}
      <div className="rounded-xl bg-stone-50 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
          <CalendarClock size={13} /> Materialverteilung bis zur Klausur · {active.summary.sessions}{' '}
          Sessions
        </div>
        <Timeline bars={bars} height={110} />
        <div className="mt-2">
          <Legend />
        </div>
        {active.unplaced > 0 && (
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <div className="font-medium">
              ⚠ {active.unplaced} Einheit{active.unplaced === 1 ? '' : 'en'} passen nicht ins Budget – so bekommst du sie unter:
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cfg.strategy !== 'now' && (
                <button
                  onClick={() => set('strategy', 'now')}
                  className="rounded-full bg-white px-2.5 py-1 font-medium text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
                >
                  Sofort starten
                </button>
              )}
              <button
                onClick={() => setStudyDailyMaxMin(Math.min(600, dailyMaxMin + 30))}
                className="rounded-full bg-white px-2.5 py-1 font-medium text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
              >
                +30 Min/Tag (jetzt {dailyMaxMin})
              </button>
            </div>
            <div className="mt-1 text-[11px] text-amber-700">…oder oben das Material etwas reduzieren.</div>
          </div>
        )}
      </div>

      {/* Aktionen */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={busy || active.summary.sessions === 0}
          className="flex items-center justify-center gap-2 rounded-full bg-brand-400 px-5 py-2.5 text-sm font-semibold text-stone-900 transition hover:bg-brand-500 disabled:opacity-40"
        >
          <Check size={16} /> {planned > 0 ? 'Plan aktualisieren' : 'Lernplan anlegen'}
        </button>
        {planned > 0 && (
          <button
            onClick={() => void remove()}
            disabled={busy}
            className="flex items-center gap-1.5 text-sm text-red-500 transition hover:text-red-700 disabled:opacity-40"
          >
            <Trash2 size={14} /> entfernen
          </button>
        )}
        {flash && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check size={15} /> {flash}
          </span>
        )}
      </div>
      {active.summary.sessions === 0 && (
        <p className="text-[11px] font-medium text-amber-700">
          Gib mindestens 1 Kapitel, eine Altklausur oder ein Blatt zum Wiederholen an — dann lege ich den Plan an.
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-stone-400">
        Die Sessions werden echte Aufgaben (erscheinen in „Diese Woche", im Kalender &amp; in
        Erinnerungen). Im Aufgaben-Board siehst du nur die aktuell anstehenden – nicht die ganze
        Zukunft. Beim Aktualisieren bleiben bereits erledigte Sessions erhalten.
      </p>
    </div>
  )
}

/**
 * Aufklappbare Liste der konkreten Übungs-/Tutoriumsblätter mit Checkboxen –
 * der Nutzer hakt genau die an, die er wiederholen möchte.
 */
function ReviewSection({
  label,
  tasks,
  selectedIds,
  onChange,
}: {
  label: string
  tasks: Task[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  if (tasks.length === 0)
    return <div className="text-xs text-stone-400">{label}: keine vorhanden</div>

  const sel = new Set(selectedIds)
  const chosen = tasks.filter((t) => sel.has(t.id)).length
  const allOn = chosen === tasks.length
  const hardTasks = tasks.filter((t) => t.reflection && t.reflection.difficulty >= HARD_THRESHOLD)

  const toggle = (id: string) => {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(tasks.filter((t) => next.has(t.id)).map((t) => t.id))
  }
  const toggleAll = () =>
    onChange(allOn ? [] : tasks.map((t) => t.id))
  const selectHard = () => onChange(hardTasks.map((t) => t.id))

  return (
    <div className="rounded-lg bg-white ring-1 ring-stone-200/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-sm"
      >
        <span className="flex items-center gap-1.5 text-stone-700">
          <ChevronRight
            size={14}
            className={cn('text-stone-400 transition-transform', open && 'rotate-90')}
          />
          {label}
          <span className="text-stone-400">· {tasks.length} vorhanden</span>
          {hardTasks.length > 0 && (
            <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
              {hardTasks.length} schwer
            </span>
          )}
        </span>
        <span className="text-xs font-medium text-stone-500">{chosen} ausgewählt</span>
      </button>
      {open && (
        <div className="border-t border-stone-100 px-2.5 py-2">
          <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={toggleAll}
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
            >
              {allOn ? 'Keine auswählen' : 'Alle auswählen'}
            </button>
            {hardTasks.length > 0 && (
              <button
                type="button"
                onClick={selectHard}
                className="text-[11px] font-medium text-orange-600 hover:text-orange-700"
              >
                Nur schwer markierte ({hardTasks.length})
              </button>
            )}
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {tasks.map((t) => {
              const on = sel.has(t.id)
              const r = t.reflection
              const dm = r ? difficultyMeta(r.difficulty) : null
              return (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-stone-50"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                      on ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white',
                    )}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(t.id)}
                    className="sr-only"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {dm && (
                        <span
                          title={`als ${dm.label} markiert`}
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                          style={{ backgroundColor: dm.color }}
                        >
                          {r!.difficulty}
                        </span>
                      )}
                      <span className="truncate text-stone-700">{t.title}</span>
                      {r && reviewReps(r.difficulty) > 1 && (
                        <span className="shrink-0 text-[10px] font-semibold text-orange-600">
                          {reviewReps(r.difficulty)}×
                        </span>
                      )}
                    </span>
                    {r && r.tags.length > 0 && (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {r.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function StudyPlansView() {
  const semester = useActiveSemester()
  const courses = useCourses(semester?.id)
  const allTasks = useTasks(semester?.id)
  const plansCourseId = useUI((s) => s.plansCourseId)
  const [selId, setSelId] = useState<string | null>(plansCourseId ?? courses[0]?.id ?? null)
  const [rebalancing, setRebalancing] = useState(false)
  const [rebalanceFlash, setRebalanceFlash] = useState('')

  // Deep-Link aus der Klausurphasen-Box: vorausgewählten Kurs übernehmen.
  useEffect(() => {
    if (plansCourseId) setSelId(plansCourseId)
  }, [plansCourseId])

  const sel = courses.find((c) => c.id === selId) ?? courses[0]
  const plansCount = courses.filter((c) => c.studyPlan).length

  const doRebalance = async () => {
    setRebalancing(true)
    const { plans } = await rebalanceAllPlans(courses, allTasks, getStudySettings())
    setRebalancing(false)
    setRebalanceFlash(`${plans} Lernpläne neu ausbalanciert`)
    setTimeout(() => setRebalanceFlash(''), 3000)
  }

  if (courses.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-400">
        Lege zuerst Kurse an, dann kannst du hier pro Kurs einen Lernplan erstellen.
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-5 pb-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-2 pt-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <BookOpen size={15} />
          </span>
          <h1 className="text-base font-semibold text-stone-800">Lernpläne</h1>
          {plansCount >= 2 && (
            <div className="ml-auto flex items-center gap-2">
              {rebalanceFlash && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <Check size={13} /> {rebalanceFlash}
                </span>
              )}
              <button
                onClick={() => void doRebalance()}
                disabled={rebalancing}
                title="Verteilt alle Kurs-Lernpläne gemeinsam neu, damit der Tagesdeckel über alle Kurse eingehalten wird."
                className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-40"
              >
                <Scale size={13} /> Alle neu ausbalancieren
              </button>
            </div>
          )}
        </div>

        <CoachTeaser />

        {/* Kursauswahl */}
        <div className="flex flex-wrap gap-2">
          {courses.map((c) => {
            const has = planSessionCount(allTasks, c.id) > 0
            return (
              <button
                key={c.id}
                onClick={() => setSelId(c.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                  c.id === sel?.id
                    ? 'bg-stone-900 text-white'
                    : 'bg-white/70 text-stone-600 ring-1 ring-stone-200/70 hover:bg-white',
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                {c.short || c.name}
                {has && <GraduationCap size={13} className="opacity-70" />}
              </button>
            )
          })}
        </div>

        {sel && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
            <div className="mb-3 text-sm font-semibold text-stone-800">{sel.name}</div>
            <PlanEditor key={sel.id} course={sel} courses={courses} allTasks={allTasks} />
          </div>
        )}
      </div>
    </div>
  )
}
