import { useRef, useState } from 'react'
import { Download, Upload, Link2, Check, FileDown } from 'lucide-react'
import type { Course, Semester, Task } from '@/db/types'
import { db } from '@/db/db'
import { buildICS, downloadICS, eventsToCourses, parseICS, type IcsOptions } from '@/lib/ics'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { cn } from '@/lib/cn'

interface Props {
  semester: Semester
  courses: Course[]
  tasks: Task[]
}

type Tab = 'export' | 'import'

export function CalendarModal({ semester, courses, tasks }: Props) {
  const close = () => useUI.getState().setShowCalendar(false)
  const [tab, setTab] = useState<Tab>('export')

  // Export
  const [opts, setOpts] = useState<IcsOptions>({ schedule: true, deadlines: true })

  // Import
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<Course[] | null>(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  function doDownload() {
    const ics = buildICS(semester, courses, tasks, opts)
    downloadICS(`semban-${semester.name.replace(/\s+/g, '-')}.ics`, ics)
  }

  function ingest(text: string) {
    setError('')
    const events = parseICS(text)
    if (events.length === 0) {
      setError('Keine Termine in der Datei gefunden.')
      setPreview(null)
      return
    }
    setPreview(eventsToCourses(events, semester.id))
  }

  async function loadFromUrl() {
    setError('')
    setPreview(null)
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

  async function commitImport() {
    if (!preview) return
    await db.courses.bulkAdd(preview)
    const n = preview.length
    setPreview(null)
    setUrl('')
    setFlash(`${n} Kurs${n === 1 ? '' : 'e'} importiert.`)
    setTimeout(() => setFlash(''), 2500)
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
            Bekommst du von der Uni einen Kalender-Link oder eine <strong>.ics</strong>-Datei?
            Importiere sie hier – die Termine werden als Kurse mit Stundenplan angelegt.
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

          {/* Per Datei */}
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
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 py-3 text-sm font-medium text-stone-500 hover:border-brand-400 hover:text-brand-600"
            >
              <Upload size={16} /> .ics-Datei auswählen
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</div>
          )}

          {/* Vorschau */}
          {preview && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-stone-500">
                Erkannt: {preview.length} Kurs(e), {preview.reduce((s, c) => s + c.slots.length, 0)}{' '}
                Termine
              </div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {preview.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5">
                    <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 truncate text-sm text-stone-700">{c.name}</span>
                    <span className="text-xs text-stone-400">{c.slots.length} Termine</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => void commitImport()}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-400 px-4 py-2.5 text-sm font-semibold text-stone-900 hover:bg-brand-500"
              >
                <Download size={16} /> {preview.length} Kurse importieren
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
