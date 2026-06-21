import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Upload,
  Link2,
  Check,
  FileDown,
  CalendarClock,
  GraduationCap,
  CalendarPlus,
  Copy,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import type { Course, Semester, Task } from '@/db/types'
import { db, uid } from '@/db/db'
import {
  buildICS,
  downloadICS,
  parseICS,
  planImport,
  COURSE_COLORS,
  type IcsOptions,
  type ImportPlan,
  type PlannedCourse,
} from '@/lib/ics'
import {
  isFeedConfigured,
  getFeedToken,
  ensureFeedToken,
  regenerateFeedToken,
  disableFeed,
  feedUrl,
  webcalUrl,
} from '@/lib/calendarFeed'
import { useSync } from '@/lib/sync'
import { createTask } from '@/lib/actions'
import { TASK_TYPES } from '@/lib/taskTypes'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { Select } from './ui/Select'
import { cn } from '@/lib/cn'

const slotSig = (s: { weekday: number; start: string; end: string }) =>
  `${s.weekday}|${s.start}|${s.end}`

interface Props {
  semester: Semester
  courses: Course[]
  tasks: Task[]
}

type Tab = 'subscribe' | 'export' | 'import'

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
  const [tab, setTab] = useState<Tab>('subscribe')

  // Export
  const [opts, setOpts] = useState<IcsOptions>({ schedule: true, deadlines: true })

  // Import
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  // Pro Kurs: Ziel ('new' | bestehende Kurs-ID) und (für neue Kurse) Kürzel.
  const [target, setTarget] = useState<Record<string, string>>({})
  const [shorts, setShorts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [dragging, setDragging] = useState(false)

  // Wie viele Slots eines Imports wären beim gewählten Ziel WIRKLICH neu?
  const newSlotsFor = (pc: PlannedCourse, tgt: string) => {
    if (tgt === 'new') return pc.slots
    const ex = courses.find((c) => c.id === tgt)
    if (!ex) return pc.slots
    const have = new Set(ex.slots.map(slotSig))
    return pc.slots.filter((s) => !have.has(slotSig(s)))
  }

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
    const tgt: Record<string, string> = {}
    const sh: Record<string, string> = {}
    for (const c of p.courses) {
      sel[c.key] = true
      tgt[c.key] = c.autoMatchId ?? 'new'
      sh[c.key] = c.suggestedShort
    }
    for (const d of p.deadlines) sel[d.key] = true
    setSelected(sel)
    setTarget(tgt)
    setShorts(sh)
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
  const setShort = (key: string, value: string) => setShorts((s) => ({ ...s, [key]: value }))
  const setCourseTarget = (key: string, value: string) =>
    setTarget((t) => ({ ...t, [key]: value }))

  // Eine Kurs-Zeile „macht etwas", wenn neuer Kurs ODER mind. 1 neuer Slot.
  const courseActs = (pc: PlannedCourse) =>
    target[pc.key] === 'new' || newSlotsFor(pc, target[pc.key]).length > 0

  const counts = useMemo(() => {
    if (!plan) return { c: 0, d: 0 }
    return {
      c: plan.courses.filter((x) => selected[x.key] && courseActs(x)).length,
      d: plan.deadlines.filter((x) => selected[x.key]).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, selected, target, courses])

  async function commitImport() {
    if (!plan) return
    const selCourses = plan.courses.filter((c) => selected[c.key] && courseActs(c))
    const selDeadlines = plan.deadlines.filter((d) => selected[d.key])

    // Farben für neue Kurse: bereits vergebene meiden.
    const usedColors = new Set(courses.map((c) => c.color))
    const pickColor = () => {
      const free = COURSE_COLORS.find((c) => !usedColors.has(c)) ?? COURSE_COLORS[usedColors.size % COURSE_COLORS.length]
      usedColors.add(free)
      return free
    }

    let created = 0
    let merged = 0
    for (const pc of selCourses) {
      const tgt = target[pc.key]
      if (tgt === 'new') {
        const course: Course = {
          id: uid(),
          semesterId: semester.id,
          name: pc.name,
          short: (shorts[pc.key] ?? '').trim() || pc.name.slice(0, 4).toUpperCase(),
          color: pickColor(),
          slots: pc.slots,
        }
        await db.courses.add(course)
        created++
      } else {
        const ex = await db.courses.get(tgt)
        const add = newSlotsFor(pc, tgt)
        if (ex && add.length) {
          await db.courses.put({ ...ex, slots: [...ex.slots, ...add] })
          merged++
        }
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
    if (created) parts.push(`${created} neuer Kurs${created === 1 ? '' : 'e'}`)
    if (merged) parts.push(`${merged} Kurs${merged === 1 ? '' : 'e'} ergänzt`)
    if (selDeadlines.length) parts.push(`${selDeadlines.length} Termin${selDeadlines.length === 1 ? '' : 'e'}`)
    setPlan(null)
    setUrl('')
    setFlash(parts.length ? `${parts.join(' · ')} importiert.` : 'Nichts zu importieren.')
    setTimeout(() => setFlash(''), 3000)
  }

  return (
    <Modal title="Kalender" onClose={close}>
      {/* Tabs */}
      <div className="mb-4 flex rounded-full bg-stone-100 p-1">
        {(
          [
            ['subscribe', 'Abonnieren', CalendarPlus],
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

      {tab === 'subscribe' ? (
        <SubscribeTab />
      ) : tab === 'export' ? (
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
            Abgaben) zu Aufgaben. Bestehende Kurse werden automatisch erkannt – die Zuordnung kannst
            du pro Kurs anpassen, damit nichts doppelt angelegt wird.
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
                    <CourseRow
                      key={c.key}
                      course={c}
                      checked={!!selected[c.key]}
                      onToggle={() => toggle(c.key)}
                      existingCourses={courses}
                      target={target[c.key] ?? 'new'}
                      onTarget={(v) => setCourseTarget(c.key, v)}
                      short={shorts[c.key] ?? ''}
                      onShort={(v) => setShort(c.key, v)}
                      newSlotCount={newSlotsFor(c, target[c.key] ?? 'new').length}
                    />
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

function SubscribeTab() {
  const user = useSync((s) => s.user)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    if (!isFeedConfigured || !user) {
      setLoading(false)
      return
    }
    void getFeedToken().then((t) => {
      if (alive) {
        setToken(t)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [user])

  // Ohne Konto/Cloud kein Abo möglich (Daten müssen serverseitig liegen).
  if (!isFeedConfigured || !user) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-stone-500">
          Mit einem Kalender-Abo erscheint dein Stundenplan automatisch – und immer aktuell – in
          Apple Kalender, Google Kalender oder Outlook. Kein erneuter Export nötig.
        </p>
        <div className="rounded-xl bg-stone-50 px-3 py-3 text-sm text-stone-600">
          Dafür brauchst du ein <strong>kostenloses Konto</strong>, damit dein Plan in der Cloud
          liegt. Melde dich an – danach kannst du das Abo hier in Sekunden erstellen.
        </div>
        <p className="text-xs text-stone-400">
          Lieber ohne Konto? Im Tab <strong>Exportieren</strong> bekommst du eine .ics-Datei.
        </p>
      </div>
    )
  }

  const create = async () => {
    setBusy(true)
    setToken(await ensureFeedToken())
    setBusy(false)
  }
  const regen = async () => {
    if (!window.confirm('Neuen Link erzeugen? Der bisherige Abo-Link funktioniert danach nicht mehr.'))
      return
    setBusy(true)
    setToken(await regenerateFeedToken())
    setBusy(false)
  }
  const remove = async () => {
    if (!window.confirm('Kalender-Abo deaktivieren? Der Link liefert dann keine Termine mehr.')) return
    setBusy(true)
    await disableFeed()
    setToken(null)
    setBusy(false)
  }
  const copy = async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(feedUrl(token))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard nicht verfügbar – Nutzer kann den Link manuell markieren. */
    }
  }

  if (loading) return <p className="py-4 text-center text-sm text-stone-400">Lädt …</p>

  if (!token) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-500">
          Erstelle einen persönlichen Abo-Link. Dein Kalender holt sich darüber automatisch deinen
          aktuellen Stundenplan und alle Abgaben – auch spätere Änderungen.
        </p>
        <button
          onClick={() => void create()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-400 px-4 py-2.5 text-sm font-semibold text-stone-900 transition hover:bg-brand-500 disabled:opacity-40"
        >
          <CalendarPlus size={17} /> Kalender-Abo erstellen
        </button>
      </div>
    )
  }

  const url = feedUrl(token)
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Dein persönlicher Abo-Link – einmal im Kalender hinzufügen, danach bleibt er von selbst
        aktuell.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-600 outline-none"
          aria-label="Abo-Link"
        />
        <button
          onClick={() => void copy()}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          {copied ? (
            <>
              <Check size={15} /> Kopiert
            </>
          ) : (
            <>
              <Copy size={15} /> Kopieren
            </>
          )}
        </button>
      </div>
      <a
        href={webcalUrl(token)}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-400 px-4 py-2.5 text-sm font-semibold text-stone-900 transition hover:bg-brand-500"
      >
        <CalendarPlus size={17} /> Im Kalender abonnieren
      </a>

      <details className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">
        <summary className="cursor-pointer font-medium text-stone-700">So abonnierst du den Link</summary>
        <ul className="mt-2 space-y-1.5 text-[13px] text-stone-500">
          <li>
            <strong>iPhone/Mac:</strong> „Im Kalender abonnieren" tippen – Apple Kalender öffnet den
            Dialog automatisch.
          </li>
          <li>
            <strong>Google Kalender:</strong> Andere Kalender → „Per URL hinzufügen" → Link einfügen.{' '}
            <a
              href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 underline"
            >
              Öffnen
            </a>
          </li>
          <li>
            <strong>Outlook:</strong> Kalender hinzufügen → „Aus dem Internet abonnieren" → Link
            einfügen.
          </li>
        </ul>
        <p className="mt-2 text-[12px] text-stone-400">
          Hinweis: Kalender aktualisieren Abos je nach App nur alle paar Stunden – Änderungen
          erscheinen also nicht sofort.
        </p>
      </details>

      <div className="flex items-center justify-between border-t border-stone-100 pt-3">
        <button
          onClick={() => void regen()}
          disabled={busy}
          className="flex items-center gap-1.5 text-xs font-medium text-stone-500 transition hover:text-stone-800 disabled:opacity-40"
        >
          <RefreshCw size={13} /> Neuen Link erzeugen
        </button>
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="flex items-center gap-1.5 text-xs font-medium text-red-500 transition hover:text-red-700 disabled:opacity-40"
        >
          <Trash2 size={13} /> Abo deaktivieren
        </button>
      </div>
    </div>
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

function CourseRow({
  course,
  checked,
  onToggle,
  existingCourses,
  target,
  onTarget,
  short,
  onShort,
  newSlotCount,
}: {
  course: PlannedCourse
  checked: boolean
  onToggle: () => void
  existingCourses: Course[]
  target: string
  onTarget: (value: string) => void
  short: string
  onShort: (value: string) => void
  newSlotCount: number
}) {
  const c = course
  const isNew = target === 'new'
  const matched = isNew ? undefined : existingCourses.find((x) => x.id === target)
  const options = [
    { value: 'new', label: '＋ Neuer Kurs' },
    ...existingCourses.map((x) => ({ value: x.id, label: `→ ${x.name}${x.short ? ` (${x.short})` : ''}` })),
  ]
  // Hinweis-Text rechts: was passiert beim Import?
  const note = isNew
    ? 'neu'
    : newSlotCount > 0
      ? `+${newSlotCount} Termin${newSlotCount === 1 ? '' : 'e'}`
      : 'schon vorhanden'

  return (
    <div className="space-y-2 rounded-lg bg-stone-50 px-2.5 py-2.5">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 rounded accent-brand-500"
        />
        <span
          className="h-7 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: matched?.color ?? '#d6d3d1' }}
        />
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm text-stone-700">{c.name}</span>
          <span className="block truncate text-xs text-stone-400">
            {c.slots.map((s) => `${WD[s.weekday]} ${s.start}`).join(' · ')}
          </span>
        </button>
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            isNew
              ? 'bg-emerald-100 text-emerald-700'
              : newSlotCount > 0
                ? 'bg-sky-100 text-sky-700'
                : 'bg-stone-200 text-stone-500',
          )}
        >
          {note}
        </span>
      </div>

      <div className="flex items-center gap-2 pl-6">
        <Select
          className="min-w-0 flex-1"
          ariaLabel={`Ziel für ${c.name}`}
          value={target}
          options={options}
          onChange={onTarget}
        />
        {isNew ? (
          <input
            value={short}
            onChange={(e) => onShort(e.target.value.toUpperCase().slice(0, 8))}
            placeholder="Kürzel"
            aria-label={`Kürzel für ${c.name}`}
            className="w-20 shrink-0 rounded-lg border border-stone-200 bg-white px-1.5 py-1.5 text-center text-xs font-semibold uppercase text-stone-700 outline-none placeholder:font-normal placeholder:text-stone-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30"
          />
        ) : (
          <span className="w-20 shrink-0 truncate rounded-lg bg-stone-200 px-1.5 py-1.5 text-center text-xs font-semibold text-stone-500">
            {matched?.short ?? '—'}
          </span>
        )}
      </div>
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
