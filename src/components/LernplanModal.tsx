import { useMemo, useState } from 'react'
import { BookOpen, CalendarClock, Info } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { Task } from '@/db/types'
import {
  DEFAULT_LERNPLAN,
  courseMaterial,
  createStudyPlan,
  planSessionsConfig,
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

function CheckRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
        disabled ? 'opacity-40' : 'hover:bg-stone-100',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-brand-500"
      />
      <span className="text-stone-700">{label}</span>
    </label>
  )
}

/** Ganzheitlicher Lernplan-Konfigurator mit Inhalten & Live-Vorschau. */
export function LernplanModal({
  exam,
  allTasks,
  onClose,
}: {
  exam: Task
  allTasks: Task[]
  onClose: () => void
}) {
  const [cfg, setCfg] = useState<LernplanConfig>(DEFAULT_LERNPLAN)
  const [topicsText, setTopicsText] = useState('')
  const [busy, setBusy] = useState(false)

  const mat = useMemo(() => courseMaterial(allTasks, exam.courseId), [allTasks, exam.courseId])
  const customTopics = topicsText
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
  const usingTopics = customTopics.length > 0

  const effective: LernplanConfig = useMemo(
    () => ({ ...cfg, topics: customTopics }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg, topicsText],
  )

  const sessions = useMemo(
    () => planSessionsConfig(exam, allTasks, effective),
    [exam, allTasks, effective],
  )

  const toggleDay = (id: number) =>
    setCfg((c) => ({
      ...c,
      weekdays: c.weekdays.includes(id)
        ? c.weekdays.filter((d) => d !== id)
        : [...c.weekdays, id].sort((a, b) => a - b),
    }))
  const set = <K extends keyof LernplanConfig>(k: K, v: LernplanConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }))

  const save = async () => {
    setBusy(true)
    await createStudyPlan(exam, allTasks, effective)
    setBusy(false)
    onClose()
  }

  return (
    <Modal title="Lernplan erstellen" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-stone-500">
          Für <strong className="text-stone-700">{exam.title}</strong>. SemBan verteilt die Inhalte
          auf freie Lern-Tage – passe alles an deinen Rhythmus an.
        </p>

        {/* Inhalte aus dem Kursmaterial */}
        <div>
          <span className="mb-1 block text-xs font-medium text-stone-500">Inhalte</span>
          <div className={cn('rounded-xl bg-stone-50 p-1', usingTopics && 'opacity-60')}>
            <CheckRow
              label="Zusammenfassung erstellen"
              checked={cfg.includeSummary}
              disabled={usingTopics}
              onChange={(v) => set('includeSummary', v)}
            />
            {mat.uebung > 0 && (
              <CheckRow
                label={`Übungsblätter wiederholen (${mat.uebung})`}
                checked={cfg.includeUebung}
                disabled={usingTopics}
                onChange={(v) => set('includeUebung', v)}
              />
            )}
            {mat.tut > 0 && (
              <CheckRow
                label={`Tutoriumsblätter wiederholen (${mat.tut})`}
                checked={cfg.includeTut}
                disabled={usingTopics}
                onChange={(v) => set('includeTut', v)}
              />
            )}
            <CheckRow
              label="Altklausuren rechnen"
              checked={cfg.includeAltklausuren}
              disabled={usingTopics}
              onChange={(v) => set('includeAltklausuren', v)}
            />
          </div>
        </div>

        {/* Eigene Themen (Override) */}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">
            Eigene Themen (optional – ersetzen die Inhalte oben)
          </span>
          <textarea
            value={topicsText}
            onChange={(e) => setTopicsText(e.target.value)}
            rows={2}
            placeholder={'z. B.\nKapitel 1–3\nBeweise üben'}
            className="w-full resize-none rounded-lg border border-stone-200 px-2 py-1.5 text-sm placeholder:text-stone-300"
          />
        </label>

        {/* Zeitliche Einstellungen */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Lernbeginn</span>
            <Select
              value={String(cfg.startWeeksBefore)}
              options={WEEKS_OPTS}
              onChange={(v) => set('startWeeksBefore', Number(v))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Uhrzeit</span>
            <input
              type="time"
              value={cfg.time}
              onChange={(e) => set('time', e.target.value || '18:00')}
              className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-stone-500">Lern-Tage</span>
          <div className="flex flex-wrap gap-1.5">
            {WD.map((d) => {
              const on = cfg.weekdays.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDay(d.id)}
                  className={cn(
                    'h-9 w-10 rounded-lg text-sm font-semibold transition',
                    on ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200',
                  )}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-start gap-1.5 text-xs text-stone-400">
          <Info size={13} className="mt-0.5 shrink-0" />
          Termine anderer Klausuren und deren Lern-Sessions werden automatisch ausgespart.
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
                  <span className="w-28 shrink-0 capitalize text-stone-500">
                    {format(s.date, 'EEE d. MMM', { locale: de })}
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
