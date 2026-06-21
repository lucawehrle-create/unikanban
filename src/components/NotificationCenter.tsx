import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellRing, Check, ChevronRight, Settings2, Share, Plus, Download } from 'lucide-react'
import { useActiveSemester, useCourses, useTasks } from '@/hooks/data'
import { useUI } from '@/store/ui'
import {
  buildReminders,
  getReminderSettings,
  setReminderSettings,
  BUCKET_META,
  type ReminderBucket,
  type ReminderItem,
  type ReminderSettings,
} from '@/lib/reminders'
import { formatDue } from '@/lib/deadline'
import {
  enableReminders,
  pushPermission,
  syncReminderSettingsToServer,
  type PushPermission,
} from '@/lib/push'
import { useInstall, type InstallState } from '@/lib/pwaInstall'
import { Select } from './ui/Select'
import { cn } from '@/lib/cn'

const LEAD_OPTIONS = [
  { value: '0', label: 'Am Fälligkeitstag' },
  { value: '1', label: '1 Tag vorher' },
  { value: '3', label: '3 Tage vorher' },
  { value: '7', label: '1 Woche vorher' },
]

export function NotificationCenter() {
  const semester = useActiveSemester()
  const tasks = useTasks(semester?.id)
  const courses = useCourses(semester?.id)
  const editTask = useUI((s) => s.editTask)

  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<ReminderSettings>(() => getReminderSettings())
  const [perm, setPerm] = useState(() => pushPermission())
  const install = useInstall()
  const ref = useRef<HTMLDivElement>(null)

  const items = useMemo(
    () => (settings.enabled ? buildReminders(tasks, settings.leadDays) : []),
    [tasks, settings.enabled, settings.leadDays],
  )

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const persist = (next: ReminderSettings) => {
    setSettings(next)
    setReminderSettings(next)
    void syncReminderSettingsToServer()
  }

  const onEnable = async () => {
    const res = await enableReminders()
    setPerm(pushPermission())
    if (res.ok) persist({ ...settings, enabled: true })
  }

  const openTask = (id: string) => {
    editTask(id)
    setOpen(false)
  }

  const count = items.length
  const Icon = count > 0 ? BellRing : Bell

  const grouped: { bucket: ReminderBucket; items: ReminderItem[] }[] = (
    ['overdue', 'today', 'soon'] as ReminderBucket[]
  )
    .map((bucket) => ({ bucket, items: items.filter((i) => i.bucket === bucket) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Erinnerungen"
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-full shadow-sm ring-1 transition',
          count > 0
            ? 'bg-white text-stone-700 ring-stone-200/70 hover:bg-stone-50'
            : 'bg-white/70 text-stone-500 ring-stone-200/70 hover:bg-white',
        )}
      >
        <Icon size={17} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-cream-50">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-stone-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <span className="text-sm font-semibold text-stone-800">Erinnerungen</span>
            <button
              onClick={() => setShowSettings((s) => !s)}
              aria-label="Einstellungen"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-stone-100',
                showSettings ? 'text-stone-800' : 'text-stone-400',
              )}
            >
              <Settings2 size={15} />
            </button>
          </div>

          {/* Berechtigung/Settings */}
          {(showSettings || perm !== 'granted') && (
            <div className="border-b border-stone-100 px-4 py-3">
              <ReminderSetup
                perm={perm}
                install={install}
                settings={settings}
                persist={persist}
                onEnable={() => void onEnable()}
              />
            </div>
          )}

          {/* Liste */}
          <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                <Check size={22} className="text-emerald-500" />
                <p className="text-sm font-medium text-stone-700">Alles im Griff</p>
                <p className="text-xs text-stone-400">
                  {settings.enabled
                    ? 'Keine offenen Fristen in Sicht.'
                    : 'Erinnerungen sind ausgeschaltet.'}
                </p>
              </div>
            ) : (
              grouped.map((g) => (
                <div key={g.bucket} className="mb-1">
                  <div
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide',
                      BUCKET_META[g.bucket].text,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', BUCKET_META[g.bucket].dot)} />
                    {BUCKET_META[g.bucket].label}
                  </div>
                  {g.items.map((it) => {
                    const course = courses.find((c) => c.id === it.task.courseId)
                    return (
                      <button
                        key={it.task.id}
                        onClick={() => openTask(it.task.id)}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition hover:bg-stone-50"
                      >
                        {course && (
                          <span
                            className="mt-0.5 h-7 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: course.color }}
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-stone-800">
                            {it.task.title}
                          </span>
                          <span className="block truncate text-xs text-stone-400">
                            {[course?.name, formatDue(it.task.dueDate)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <ChevronRight size={15} className="shrink-0 text-stone-300" />
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[10px] font-bold text-stone-600">
      {n}
    </span>
  )
}

/** Plattformbewusster Aktivierungs-Flow für Erinnerungen.
 *  Kern: Auf iOS funktioniert Web-Push nur als installierte PWA – sonst gibt es
 *  keine Notification-API. Darum dort zuerst durch „Zum Home-Bildschirm" führen. */
function ReminderSetup({
  perm,
  install,
  settings,
  persist,
  onEnable,
}: {
  perm: PushPermission
  install: InstallState
  settings: ReminderSettings
  persist: (s: ReminderSettings) => void
  onEnable: () => void
}) {
  // Bereits erlaubt → normale Steuerung.
  if (perm === 'granted') {
    return (
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-stone-700">Erinnerungen aktiv</span>
          <Toggle
            checked={settings.enabled}
            onChange={(v) => persist({ ...settings, enabled: v })}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-stone-700">Erinnern</span>
          <Select
            ariaLabel="Vorlauf"
            className="w-40"
            value={String(settings.leadDays)}
            options={LEAD_OPTIONS}
            onChange={(v) => persist({ ...settings, leadDays: Number(v) })}
          />
        </div>
        {!install.standalone && (
          <p className="text-[11px] leading-relaxed text-stone-400">
            Tipp: Installiere SemBan als App, damit Erinnerungen am zuverlässigsten ankommen.
          </p>
        )}
      </div>
    )
  }

  // iOS im Browser-Tab → zuerst zum Home-Bildschirm hinzufügen (sonst kein Push).
  if (install.needsInstallForPush) {
    return (
      <div className="space-y-2.5">
        <p className="text-sm font-medium text-stone-700">Erinnerungen auf dem iPhone</p>
        <p className="text-xs leading-relaxed text-stone-500">
          Damit dich SemBan auch bei geschlossener App an Fristen erinnert, füge es einmal zum
          Home-Bildschirm hinzu:
        </p>
        <ol className="space-y-2 text-xs text-stone-600">
          <li className="flex items-center gap-2">
            <StepBadge n={1} /> Unten auf <Share size={13} className="text-stone-500" />
            <strong>Teilen</strong> tippen
          </li>
          <li className="flex items-center gap-2">
            <StepBadge n={2} /> <Plus size={13} className="text-stone-500" />
            <strong>Zum Home-Bildschirm</strong> wählen
          </li>
          <li className="flex items-center gap-2">
            <StepBadge n={3} /> SemBan über das neue Icon öffnen &amp; aktivieren
          </li>
        </ol>
      </div>
    )
  }

  // Browser ohne Notification-Unterstützung.
  if (perm === 'unsupported') {
    return (
      <p className="text-xs text-stone-500">
        Dein Browser unterstützt keine Benachrichtigungen. Nutze SemBan z. B. in Chrome oder Edge –
        oder installiere die App.
      </p>
    )
  }

  // Im Browser blockiert.
  if (perm === 'denied') {
    return (
      <p className="text-xs text-stone-500">
        Benachrichtigungen sind blockiert. Erlaube sie in den Browser- bzw. Website-Einstellungen,
        um an Fristen erinnert zu werden.
      </p>
    )
  }

  // perm === 'default' → aktivieren, ggf. vorher Installation anbieten.
  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-500">
        Lass dich an Abgaben erinnern – auch wenn die App geschlossen ist.
      </p>
      {!install.standalone && install.canPrompt && (
        <button
          onClick={() => void install.promptInstall()}
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50"
        >
          <Download size={15} /> Als App installieren
        </button>
      )}
      <button
        onClick={onEnable}
        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
      >
        <BellRing size={15} /> Erinnerungen aktivieren
      </button>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition',
        checked ? 'bg-stone-900' : 'bg-stone-300',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition',
          checked ? 'left-[1.125rem]' : 'left-0.5',
        )}
      />
    </button>
  )
}
