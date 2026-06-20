import { useMemo, useRef, useState } from 'react'
import { Download, Upload, Link2, Check, FileDown, CalendarClock, GraduationCap } from 'lucide-react'
import type { Course, Semester, Task } from '@/db/types'
import { db, uid } from '@/db/db'
import {
  buildICS,
  downloadICS,
  parseICS,
  planImport,
  type IcsOptions,
  type ImportPlan,
} from '@/lib/ics'
import { createTask } from '@/lib/actions'
import { TASK_TYPES } from '@/lib/taskTypes'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { cn } from '@/lib/cn'

interface Props {
  semester: Semester
  courses: Course[]
  tasks: Task[]
}

type Tab = 'export' | 'import'

const WD = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function fmtDate(iso: string, allDay: boolean): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  })
}

export function CalendarModal({ semester, courses, tasks }: Props) {
  const close = () => useUI.getState().setShowCalendar(false)
  const [tab, setTab] = useState<Tab>('export')

  // Export
  const [opts, setOpts] = useState<IcsOptions>({ schedule: true, deadlines: true })

  // Import
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [dragging, setDragging] = useState(false)

  function doDownload() {
    const ics = buildICS(semester, courses, tasks, opts)
    downloadICS(`semban-${semester.name.replace(/\s+/g, '-')}.ics`, ics)
  }

  function ingest(text: string) {
    setError('')
    setFlash('')
    const events = parseICS(text)
    if (events.length === 0) {
      setError('Keine Termine in der Datei gefunden.')
      setPlan(null)
      return
    }
    const p = planImport(events, semester, courses, tasks)
    if (p.courses.length === 0 && p.deadlines.length === 0) {
      setError('Nichts Neues zu importieren – alles ist schon vorhanden.')
      setPlan(null)
      return
    }
    const sel: Record<string, boolean> = {}
    for (const c of p.courses) sel[c.key] = true
    for (const d of p.deadlines) sel[d.key] = true
    setSelected(sel)
    setPlan(p)
  }

  async function loadFromUrl() {
    setError('')
    setPlan(null)
    const u = url.trim().replace(/^webcal:\/\//, 'https://')
    if (!u) return
    try {
      const res = await fetch(u)
      if (!res.ok) throw new Error(String(res.status))
      ingest(await res.text())
    } catch {
      setError(
        'Laden per Link hat nicht geklappt (oft blockiert der Browser fremde Server). ' +
          'Lade die .ics-Datei herunter und importiere sie unten als Datei.',
      )
    }
  }

  const toggle = (key: string) => setSelected((s) => ({ ...s, [key]: !s[key] }))
  const setAll = (keys: string[], value: boolean) =>
    setSelected((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, value])) }))

  const counts = useMemo(() => {
    if (!plan) return { c: 0, d: 0 }
    return {
      c: plan.courses.filter((x) => selected[x.key]).length,
      d: plan.deadlines.filter((x) => selected[x.key]).length,
    }
  }, [plan, selected])

  async function commitImport() {
    if (!plan) return
    const selCourses = plan.courses.filter((c) => selected[c.key])
    const selDeadlines = plan.deadlines.filter((d) => selected[d.key])

    for (const pc of selCourses) {
      if (pc.existingId) {
        const ex = await db.courses.get(pc.existingId)
        if (ex) await db.courses.put({ ...ex, slots: [...ex.slots, ...pc.slots] })
      } else {
        const course: Course = {
          id: uid(),
          semesterId: semester.id,
          name: pc.name,
          short: pc.short,
          color: pc.color,
          slots: pc.slots,
        }
        await db.courses.add(course)
      }
    }
    for (const d of selDeadlines) {
      await createTask({
        semesterId: semester.id,
        title: d.title,
        type: d.type,
        courseId: d.courseId,
        dueDate: d.dueDate,
      })
    }

    const parts: string[] = []
    if (counts.c) parts.push(`${counts.c} Kurs${counts.c === 1 ? '' : 'e'}`)
    if (counts.d) parts.push(`${counts.d} Termin${counts.d === 1 ? '' : 'e'}`)
    setPlan(null)
    setUrl('')
    setFlash(`${parts.join(' & ')} importiert.`)
    setTimeout(() => setFlash(''), 2800)
  }

  return (
    <Modal title="Kalender" onClose={close}>
      {/* Tabs */}
      <div className="mb-4 flex rounded-full bg-stone-100 p-1">
        {(
          [
            ['export', 'Exportieren', Download],
            ['import', 'Importieren', Upload],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition',
              tab === id ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500',
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'export' ? (
        <div className="space-y-4">
          <p className="text-sm text-stone-500">
            Lade deinen Stundenplan als <strong>.ics</strong>-Datei – sie funktioniert in Apple
            Kalender, Google Kalender, Outlook und allen anderen.
          </p>

          <div className="space-y-2">
            {(
              [
                ['schedule', 'Vorlesungen & Tutorien (wöchentlich)'],
                ['deadlines', 'Abgaben & Deadlines'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-stone-50 px-3 py-2.5 text-sm text-stone-700"
              >
                <input
                  type="checkbox"
                  checked={opts[key]}
                  onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded accent-brand-500"
                />
                {label}
              </label>
            ))}
          </div>

          <button
            onClick={doDownload}
            disabled={!opts.schedule && !opts.deadlines}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-400 px-4 py-2.5 text-sm font-semibold text-stone-900 transition hover:bg-brand-500 disabled:opacity-40"
          >
            <FileDown size={17} /> .ics-Datei herunterladen
          </button>

          <details className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">
            <summary className="cursor-pointer font-medium text-stone-700">
              So fügst du sie ein
            </summary>
            <ul className="mt-2 space-y-1.5 text-[13px] text-stone-500">
              <li>
                <strong>Apple Kalender:</strong> Datei doppelklicken → Kalender auswählen → fertig.
              </li>
              <li>
                <strong>Google Kalender:</strong> Einstellungen → „Importieren &amp; Exportieren" →
                Datei wählen.{' '}
                <a
                  href="https://calendar.google.com/calendar/u/0/r/settings/export"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 underline"
                >
                  Öffnen
                </a>
              </li>
              <li>
                <strong>Outlook:</strong> Kalender → „Kalender hinzufügen" → „Aus Datei".
              </li>
            </ul>
          </details>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-stone-500">
            Kalender-Link oder <strong>.ics</strong>-Datei von der Uni? Importiere sie hier –
            wöchentliche Termine werden zu Kursen mit Stundenplan, einzelne Termine (Klausuren,
            Abgaben) zu Aufgaben.
          </p>

          {/* Per Link */}
          <div>
            <span className="mb-1 block text-xs font-medium text-stone-500">Per Link (URL / webcal)</span>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5">
                <Link2 size={14} className="text-stone-400" />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…/stundenplan.ics"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-stone-400"
                />
              </div>
              <button
                onClick={() => void loadFromUrl()}
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
              >
                Laden
              </button>
            </div>
          </div>

          {/* Per Datei (inkl. Drag & Drop) */}
          <div>
            <span className="mb-1 block text-xs font-medium text-stone-500">Per Datei</span>
            <input
              ref={fileRef}
              type="file"
              accept=".ics,text/calendar"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) ingest(await f.text())
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={async (e) => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files?.[0]
                if (f) ingest(await f.text())
              }}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-medium transition',
                dragging
                  ? 'border-brand-400 bg-brand-50 text-brand-600'
                  : 'border-stone-300 text-stone-500 hover:border-brand-400 hover:text-brand-600',
              )}
            >
              <Upload size={16} /> .ics-Datei wählen oder hierher ziehen
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</div>
          )}

          {/* Vorschau */}
          {plan && (
            <div className="space-y-4">
              {plan.courses.length > 0 && (
                <PreviewSection
                  icon={<CalendarClock size={14} className="text-stone-400" />}
                  title="Stundenplan"
                  rows={plan.courses.map((c) => c.key)}
                  selected={selected}
                  onAll={setAll}
                >
                  {plan.courses.map((c) => (
                    <Row key={c.key} checked={!!selected[c.key]} onToggle={() => toggle(c.key)}>
                      <span className="h-5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm text-stone-700">{c.name}</span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                              c.existingId
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-emerald-100 text-emerald-700',
                            )}
                          >
                            {c.existingId ? 'ergänzt' : 'neu'}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-stone-400">
                          {c.slots.map((s) => `${WD[s.weekday]} ${s.start}`).join(' · ')}
                        </span>
                      </span>
                    </Row>
                  ))}
                </PreviewSection>
              )}

              {plan.deadlines.length > 0 && (
                <PreviewSection
                  icon={<GraduationCap size={14} className="text-stone-400" />}
                  title="Termine & Abgaben"
                  rows={plan.deadlines.map((d) => d.key)}
                  selected={selected}
                  onAll={setAll}
                >
                  {plan.deadlines.map((d) => (
                    <Row key={d.key} checked={!!selected[d.key]} onToggle={() => toggle(d.key)}>
                      <span className="text-base leading-none">{TASK_TYPES[d.type].emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-stone-700">{d.title}</span>
                        <span className="block truncate text-xs text-stone-400">
                          {fmtDate(d.dueDate, d.allDay)}
                        </span>
                      </span>
                    </Row>
                  ))}
                </PreviewSection>
              )}

              <button
                onClick={() => void commitImport()}
                disabled={counts.c + counts.d === 0}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-400 px-4 py-2.5 text-sm font-semibold text-stone-900 transition hover:bg-brand-500 disabled:opacity-40"
              >
                <Download size={16} /> Auswahl importieren
                {counts.c + counts.d > 0 ? ` (${counts.c + counts.d})` : ''}
              </button>
            </div>
          )}

          {flash && (
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <Check size={15} /> {flash}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function PreviewSection({
  icon,
  title,
  rows,
  selected,
  onAll,
  children,
}: {
  icon: React.ReactNode
  title: string
  rows: string[]
  selected: Record<string, boolean>
  onAll: (keys: string[], value: boolean) => void
  children: React.ReactNode
}) {
  const allOn = rows.every((k) => selected[k])
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
          {icon} {title} · {rows.length}
        </span>
        <button
          onClick={() => onAll(rows, !allOn)}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          {allOn ? 'Keine' : 'Alle'}
        </button>
      </div>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">{children}</div>
    </div>
  )
}

function Row({
  checked,
  onToggle,
  children,
}: {
  checked: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-2 hover:bg-stone-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 rounded accent-brand-500"
      />
      {children}
    </label>
  )
}
