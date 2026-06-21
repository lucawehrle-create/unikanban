import { useMemo, useState } from 'react'
import { BookOpen, CalendarClock } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { Task } from '@/db/types'
import {
  DEFAULT_LERNPLAN,
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

/** Individueller Lernplan-Konfigurator mit Live-Vorschau. */
export function LernplanModal({
  exam,
  existing,
  onClose,
}: {
  exam: Task
  existing: Task[]
  onClose: () => void
}) {
  const [cfg, setCfg] = useState<LernplanConfig>(DEFAULT_LERNPLAN)
  const [topicsText, setTopicsText] = useState('')
  const [busy, setBusy] = useState(false)

  const effective: LernplanConfig = useMemo(
    () => ({
      ...cfg,
      topics: topicsText
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean),
    }),
    [cfg, topicsText],
  )

  const sessions = useMemo(
    () => (exam.dueDate ? planSessionsConfig(exam.dueDate, effective) : []),
    [exam.dueDate, effective],
  )

  const toggleDay = (id: number) =>
    setCfg((c) => ({
      ...c,
      weekdays: c.weekdays.includes(id)
        ? c.weekdays.filter((d) => d !== id)
        : [...c.weekdays, id].sort((a, b) => a - b),
    }))

  const save = async () => {
    setBusy(true)
    await createStudyPlan(exam, effective, existing)
    setBusy(false)
    onClose()
  }

  return (
    <Modal title="Lernplan erstellen" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-stone-500">
          Für <strong className="text-stone-700">{exam.title}</strong>. SemBan legt verteilte
          Lern-Sessions als Aufgaben an – passe sie an deinen Rhythmus an.
        </p>

        {/* Vorlauf */}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Lernbeginn</span>
          <Select
            value={String(cfg.startWeeksBefore)}
            options={WEEKS_OPTS}
            onChange={(v) => setCfg((c) => ({ ...c, startWeeksBefore: Number(v) }))}
          />
        </label>

        {/* Wochentage */}
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
                    on
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-500 hover:bg-stone-200',
                  )}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Uhrzeit */}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Uhrzeit</span>
          <input
            type="time"
            value={cfg.time}
            onChange={(e) => setCfg((c) => ({ ...c, time: e.target.value || '18:00' }))}
            className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
          />
        </label>

        {/* Themen */}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">
            Themen (optional, eines pro Zeile)
          </span>
          <textarea
            value={topicsText}
            onChange={(e) => setTopicsText(e.target.value)}
            rows={3}
            placeholder={'z. B.\nKapitel 1–3\nÜbungsblätter\nAltklausuren'}
            className="w-full resize-none rounded-lg border border-stone-200 px-2 py-1.5 text-sm placeholder:text-stone-300"
          />
        </label>

        {/* Vorschau */}
        <div className="rounded-xl bg-stone-50 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <CalendarClock size={13} /> Vorschau · {sessions.length}{' '}
            {sessions.length === 1 ? 'Session' : 'Sessions'}
          </div>
          {sessions.length === 0 ? (
            <p className="px-0.5 py-1 text-xs text-stone-400">
              Mit diesen Einstellungen ergeben sich keine Termine vor der Klausur. Wähle mehr Tage
              oder einen früheren Beginn.
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
