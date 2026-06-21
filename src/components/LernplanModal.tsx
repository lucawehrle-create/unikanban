import { useMemo, useState } from 'react'
import { BookOpen, CalendarClock, Info, X } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { Course, Task } from '@/db/types'
import {
  DEFAULT_LERNPLAN,
  applyPreset,
  courseMaterial,
  createStudyPlan,
  loadByWeekday,
  planSessionsConfig,
  type Intensity,
  type LernplanConfig,
} from '@/lib/lernplan'
import { Modal } from './Modal'
import { Select } from './ui/Select'
import { cn } from '@/lib/cn'

const WD = [
  { id: 1, label: 'Mo' },
  { id: 2, label: 'Di' },
  { id: 3, label: 'Mi' },
  { id: 4, label: 'Do' },
  { id: 5, label: 'Fr' },
  { id: 6, label: 'Sa' },
  { id: 7, label: 'So' },
]
const WEEKS_OPTS = [1, 2, 3, 4, 5, 6, 8].map((w) => ({
  value: String(w),
  label: `${w} Woche${w === 1 ? '' : 'n'} vorher`,
}))
const DURATION_OPTS = [45, 60, 90].map((d) => ({ value: String(d), label: `${d} Min` }))
const PRESET_LABELS: { id: Intensity; label: string; hint: string }[] = [
  { id: 'locker', label: 'Locker', hint: 'wenige, früh verteilt' },
  { id: 'normal', label: 'Normal', hint: 'ausgewogen' },
  { id: 'endspurt', label: 'Endspurt', hint: 'dicht, viele Tage' },
]

function CheckRow({
  label,
  checked,
  disabled,
  onChange,
  weak,
  onWeak,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  weak?: boolean
  onWeak?: (v: boolean) => void
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm',
        disabled ? 'opacity-40' : 'hover:bg-stone-100',
      )}
    >
      <label className="flex flex-1 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded accent-brand-500"
        />
        <span className="text-stone-700">{label}</span>
      </label>
      {checked && !disabled && onWeak && (
        <button
          type="button"
          onClick={() => onWeak(!weak)}
          title="Als schwer markieren – bekommt mehr Wiederholungen"
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold transition',
            weak ? 'bg-amber-100 text-amber-700' : 'text-stone-400 hover:bg-stone-200',
          )}
        >
          🔥 schwer
        </button>
      )}
    </div>
  )
}

function loadColor(n: number): string {
  return n === 0 ? 'text-stone-300' : n <= 2 ? 'text-amber-500' : 'text-red-500'
}

/** Smarter, individueller Lernplan-Konfigurator mit Live-Vorschau. */
export function LernplanModal({
  exam,
  allTasks,
  courses,
  onClose,
}: {
  exam: Task
  allTasks: Task[]
  courses: Course[]
  onClose: () => void
}) {
  const [cfg, setCfg] = useState<LernplanConfig>(DEFAULT_LERNPLAN)
  const [topics, setTopics] = useState<string[]>([])
  const [weakTopics, setWeakTopics] = useState<string[]>([])
  const [topicInput, setTopicInput] = useState('')
  const [busy, setBusy] = useState(false)

  const mat = useMemo(() => courseMaterial(allTasks, exam.courseId), [allTasks, exam.courseId])
  const load = useMemo(
    () => loadByWeekday(exam, allTasks, cfg),
    [exam, allTasks, cfg.startWeeksBefore],
  )

  const pending = topicInput.trim()
  const allTopics = pending ? [...topics, pending] : topics
  const usingTopics = allTopics.length > 0

  const effective: LernplanConfig = useMemo(
    () => ({ ...cfg, topics: allTopics, weakTopics }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg, topics, topicInput, weakTopics],
  )
  const sessions = useMemo(
    () => planSessionsConfig(exam, allTasks, courses, effective),
    [exam, allTasks, courses, effective],
  )

  const set = <K extends keyof LernplanConfig>(k: K, v: LernplanConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }))
  const toggleDay = (id: number) =>
    setCfg((c) => ({
      ...c,
      weekdays: c.weekdays.includes(id)
        ? c.weekdays.filter((d) => d !== id)
        : [...c.weekdays, id].sort((a, b) => a - b),
    }))
  const addTopic = () => {
    const v = topicInput.trim()
    if (v) setTopics((prev) => (prev.includes(v) ? prev : [...prev, v]))
    setTopicInput('')
  }
  const onTopicKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTopic()
    } else if (e.key === 'Backspace' && !topicInput && topics.length) {
      setTopics((prev) => prev.slice(0, -1))
    }
  }
  const save = async () => {
    setBusy(true)
    await createStudyPlan(exam, allTasks, courses, effective)
    setBusy(false)
    onClose()
  }

  return (
    <Modal title="Lernplan erstellen" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-stone-500">
          Für <strong className="text-stone-700">{exam.title}</strong>. SemBan verteilt die Inhalte
          auf freie Lern-Tage und legt sie in Stundenplan-Lücken.
        </p>

        {/* Intensität-Presets */}
        <div>
          <span className="mb-1 block text-xs font-medium text-stone-500">Intensität</span>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_LABELS.map((p) => {
              const on = cfg.intensity === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCfg((c) => applyPreset(c, p.id))}
                  className={cn(
                    'rounded-xl px-2 py-2 text-center transition',
                    on ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
                  )}
                >
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className={cn('text-[10px]', on ? 'text-white/70' : 'text-stone-400')}>
                    {p.hint}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Inhalte */}
        <div>
          <span className="mb-1 block text-xs font-medium text-stone-500">Inhalte</span>
          <div className={cn('rounded-xl bg-stone-50 p-1', usingTopics && 'opacity-60')}>
            <CheckRow
              label="Zusammenfassung erstellen"
              checked={cfg.includeSummary}
              disabled={usingTopics}
              onChange={(v) => set('includeSummary', v)}
              weak={cfg.weak.summary}
              onWeak={(v) => set('weak', { ...cfg.weak, summary: v })}
            />
            {mat.uebung > 0 && (
              <CheckRow
                label={`Übungsblätter wiederholen (${mat.uebung})`}
                checked={cfg.includeUebung}
                disabled={usingTopics}
                onChange={(v) => set('includeUebung', v)}
                weak={cfg.weak.uebung}
                onWeak={(v) => set('weak', { ...cfg.weak, uebung: v })}
              />
            )}
            {mat.tut > 0 && (
              <CheckRow
                label={`Tutoriumsblätter wiederholen (${mat.tut})`}
                checked={cfg.includeTut}
                disabled={usingTopics}
                onChange={(v) => set('includeTut', v)}
                weak={cfg.weak.tut}
                onWeak={(v) => set('weak', { ...cfg.weak, tut: v })}
              />
            )}
            <CheckRow
              label="Altklausuren rechnen"
              checked={cfg.includeAltklausuren}
              disabled={usingTopics}
              onChange={(v) => set('includeAltklausuren', v)}
              weak={cfg.weak.altklausuren}
              onWeak={(v) => set('weak', { ...cfg.weak, altklausuren: v })}
            />
          </div>
          <p className="mt-1 px-0.5 text-[11px] text-stone-400">
            🔥 markiert schwere Themen – sie bekommen mehr Wiederholungen kurz vor der Klausur.
          </p>
        </div>

        {/* Eigene Themen (Chips) */}
        <div>
          <span className="mb-1 block text-xs font-medium text-stone-500">
            Eigene Themen (optional – ersetzen die Inhalte oben)
          </span>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-1.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/30">
            {topics.map((t, i) => {
              const w = weakTopics.includes(t)
              return (
                <span
                  key={i}
                  className={cn(
                    'flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium text-white',
                    w ? 'bg-amber-500' : 'bg-stone-900',
                  )}
                >
                  {t}
                  <button
                    type="button"
                    title="Als schwer markieren – mehr Wiederholungen"
                    onClick={() =>
                      setWeakTopics((prev) => (w ? prev.filter((x) => x !== t) : [...prev, t]))
                    }
                    className="rounded-full px-0.5 text-[11px] leading-none hover:bg-white/20"
                  >
                    🔥
                  </button>
                  <button
                    type="button"
                    aria-label={`${t} entfernen`}
                    onClick={() => {
                      setTopics((prev) => prev.filter((_, j) => j !== i))
                      setWeakTopics((prev) => prev.filter((x) => x !== t))
                    }}
                    className="rounded-full p-0.5 hover:bg-white/20"
                  >
                    <X size={11} />
                  </button>
                </span>
              )
            })}
            <input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={onTopicKey}
              onBlur={addTopic}
              placeholder={topics.length ? 'weiteres Thema…' : 'Thema eingeben & Enter'}
              className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-stone-300"
            />
          </div>
        </div>

        {/* Zeitliche Feineinstellung */}
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Beginn</span>
            <Select
              value={String(cfg.startWeeksBefore)}
              options={WEEKS_OPTS}
              onChange={(v) => set('startWeeksBefore', Number(v))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">ab Uhrzeit</span>
            <input
              type="time"
              value={cfg.time}
              onChange={(e) => set('time', e.target.value || '18:00')}
              className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Dauer</span>
            <Select
              value={String(cfg.duration)}
              options={DURATION_OPTS}
              onChange={(v) => set('duration', Number(v))}
            />
          </label>
        </div>

        {/* Lern-Tage mit Auslastung */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500">Lern-Tage</span>
            <span className="text-[10px] text-stone-400">Zahl = schon belegt im Zeitraum</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WD.map((d) => {
              const on = cfg.weekdays.includes(d.id)
              const n = load[d.id] ?? 0
              return (
                <div key={d.id} className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    className={cn(
                      'h-9 w-10 rounded-lg text-sm font-semibold transition',
                      on
                        ? 'bg-stone-900 text-white'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200',
                    )}
                  >
                    {d.label}
                  </button>
                  <span className={cn('text-[10px] font-semibold tabular-nums', loadColor(n))}>
                    {n === 0 ? 'frei' : n}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-start gap-1.5 text-xs text-stone-400">
          <Info size={13} className="mt-0.5 shrink-0" />
          Andere Klausuren &amp; Vorlesungszeiten werden automatisch ausgespart, die Last über mehrere
          Klausuren verteilt.
        </div>

        {/* Vorschau */}
        <div className="rounded-xl bg-stone-50 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <CalendarClock size={13} /> Vorschau · {sessions.length}{' '}
            {sessions.length === 1 ? 'Session' : 'Sessions'}
          </div>
          {sessions.length === 0 ? (
            <p className="px-0.5 py-1 text-xs text-stone-400">
              Keine Termine möglich – wähle mehr Lern-Tage, einen früheren Beginn oder mindestens
              einen Inhalt.
            </p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
              {sessions.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 capitalize text-stone-500">
                    {format(s.date, 'EEE d. MMM · HH:mm', { locale: de })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-stone-700">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => void save()}
          disabled={busy || sessions.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-400 px-4 py-2.5 text-sm font-semibold text-stone-900 transition hover:bg-brand-500 disabled:opacity-40"
        >
          <BookOpen size={16} /> Lernplan anlegen
          {sessions.length > 0 ? ` (${sessions.length})` : ''}
        </button>
      </div>
    </Modal>
  )
}
