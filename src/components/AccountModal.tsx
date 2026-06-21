import { useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Loader2,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
} from 'lucide-react'
import { useUI } from '@/store/ui'
import { useSync, resolveConflict, syncNow } from '@/lib/sync'
import { signOut, updateEmail, updatePassword } from '@/lib/auth'
import { Modal } from './Modal'
import { SignInPanel } from './SignInPanel'
import { DataSection } from './DataSection'
import { cn } from '@/lib/cn'

export function AccountModal() {
  const setShowAccount = useUI((s) => s.setShowAccount)
  const { user, status, lastSyncAt, error, conflict } = useSync()
  const close = () => setShowAccount(false)

  return (
    <Modal title={conflict ? 'Daten abgleichen' : user ? 'Einstellungen' : 'Anmelden'} onClose={close}>
      {conflict ? (
        <ConflictView remoteUpdatedAt={conflict.remoteUpdatedAt} />
      ) : user ? (
        <SignedIn
          email={user.email ?? 'Angemeldet'}
          status={status}
          lastSyncAt={lastSyncAt}
          error={error}
        />
      ) : (
        <SignInPanel />
      )}
    </Modal>
  )
}

function StatusLine({
  status,
  lastSyncAt,
  error,
}: {
  status: string
  lastSyncAt: string | null
  error: string | null
}) {
  if (status === 'syncing')
    return (
      <span className="flex items-center gap-1.5 text-stone-500">
        <Loader2 size={14} className="animate-spin" /> Synchronisiere…
      </span>
    )
  if (status === 'error')
    return (
      <span className="flex items-center gap-1.5 text-red-500">
        <CloudOff size={14} /> {error ?? 'Fehler'}
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-emerald-600">
      <Cloud size={14} />
      {lastSyncAt
        ? `Synchronisiert · vor ${formatDistanceToNow(parseISO(lastSyncAt), { locale: de })}`
        : 'Bereit'}
    </span>
  )
}

type Panel = 'none' | 'email' | 'password'

function SignedIn({
  email,
  status,
  lastSyncAt,
  error,
}: {
  email: string
  status: string
  lastSyncAt: string | null
  error: string | null
}) {
  const [panel, setPanel] = useState<Panel>('none')

  return (
    <div className="space-y-4">
      {/* Konto */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
        <h3 className="text-sm font-semibold text-stone-700">Konto</h3>
        <div className="mt-1 text-xs text-stone-400">Angemeldet als</div>
        <div className="truncate font-medium text-stone-800">{email}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setPanel((p) => (p === 'email' ? 'none' : 'email'))}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
          >
            <Mail size={15} /> E-Mail ändern
          </button>
          <button
            onClick={() => setPanel((p) => (p === 'password' ? 'none' : 'password'))}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
          >
            <Lock size={15} /> Passwort ändern
          </button>
        </div>

        {panel === 'email' && <ChangeEmailForm currentEmail={email} onDone={() => setPanel('none')} />}
        {panel === 'password' && <ChangePasswordForm onDone={() => setPanel('none')} />}
      </section>

      {/* Synchronisierung */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
        <h3 className="text-sm font-semibold text-stone-700">Synchronisierung</h3>
        <p className="mt-1 text-xs text-stone-400">
          Deine Daten werden automatisch zwischen deinen Geräten abgeglichen.
        </p>
        <div className="mt-2 text-xs">
          <StatusLine status={status} lastSyncAt={lastSyncAt} error={error} />
        </div>
        <button
          onClick={() => void syncNow()}
          className="mt-3 flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          <RefreshCw size={15} /> Jetzt synchronisieren
        </button>
      </section>

      {/* Lernen */}
      <PreferencesSection />

      {/* Daten & Sicherung */}
      <DataSection />

      {/* Abmelden */}
      <button
        onClick={() => void signOut()}
        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
      >
        <LogOut size={15} /> Abmelden
      </button>
      <p className="text-center text-[11px] text-stone-400">
        Beim Abmelden werden die Daten von diesem Gerät entfernt – in der Cloud bleiben sie sicher.
      </p>
    </div>
  )
}

const STUDY_MAX_OPTS = [120, 180, 240, 300, 360].map((m) => ({ value: String(m), label: `${m / 60} h` }))
const STUDY_WEEK_OPTS = [600, 900, 1200, 1500, 1800, 2400].map((m) => ({
  value: String(m),
  label: `${m / 60} h`,
}))
const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const selectCls = 'mt-0.5 shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm'

function PreferencesSection() {
  const reflectionPrompts = useUI((s) => s.reflectionPrompts)
  const setReflectionPrompts = useUI((s) => s.setReflectionPrompts)
  const studyDailyMaxMin = useUI((s) => s.studyDailyMaxMin)
  const setStudyDailyMaxMin = useUI((s) => s.setStudyDailyMaxMin)
  const studyWeeklyMaxMin = useUI((s) => s.studyWeeklyMaxMin)
  const setStudyWeeklyMaxMin = useUI((s) => s.setStudyWeeklyMaxMin)
  const studyDays = useUI((s) => s.studyDays)
  const setStudyDays = useUI((s) => s.setStudyDays)
  const maxCourses = useUI((s) => s.studyMaxCoursesPerDay)
  const setMaxCourses = useUI((s) => s.setStudyMaxCoursesPerDay)
  const prepWeeks = useUI((s) => s.studyPrepWindowWeeks)
  const setPrepWeeks = useUI((s) => s.setStudyPrepWindowWeeks)

  const toggleDay = (iso: number) =>
    setStudyDays(
      studyDays.includes(iso)
        ? studyDays.filter((d) => d !== iso)
        : [...studyDays, iso].sort((a, b) => a - b),
    )

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <h3 className="text-sm font-semibold text-stone-700">Lernplan</h3>

      <label className="mt-2 flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-medium text-stone-700">Max. Lernzeit pro Tag</span>
          <span className="block text-xs text-stone-400">
            Gesamtdeckel über alle Kurse – kein Tag wird überladen.
          </span>
        </span>
        <select
          value={String(studyDailyMaxMin)}
          onChange={(e) => setStudyDailyMaxMin(Number(e.target.value))}
          className={selectCls}
        >
          {STUDY_MAX_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-medium text-stone-700">Max. Lernzeit pro Woche</span>
          <span className="block text-xs text-stone-400">Wochendeckel über alle Kurse.</span>
        </span>
        <select
          value={String(studyWeeklyMaxMin)}
          onChange={(e) => setStudyWeeklyMaxMin(Number(e.target.value))}
          className={selectCls}
        >
          {STUDY_WEEK_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3">
        <span className="block text-sm font-medium text-stone-700">Lerntage</span>
        <span className="mb-1.5 block text-xs text-stone-400">
          Tage außerhalb bleiben Ruhetage – dann wird nicht geplant.
        </span>
        <div className="flex gap-1.5">
          {WEEKDAY_LABELS.map((lbl, i) => {
            const iso = i + 1
            const on = studyDays.includes(iso)
            return (
              <button
                key={iso}
                onClick={() => toggleDay(iso)}
                className={cn(
                  'h-8 w-8 rounded-full text-xs font-medium transition',
                  on ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200',
                )}
              >
                {lbl}
              </button>
            )
          })}
        </div>
      </div>

      <label className="mt-3 flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-medium text-stone-700">Kurse pro Tag (max.)</span>
          <span className="block text-xs text-stone-400">
            Weniger Kurse = längere Fokus-Blöcke, weniger Wechsel.
          </span>
        </span>
        <select
          value={String(maxCourses)}
          onChange={(e) => setMaxCourses(Number(e.target.value))}
          className={selectCls}
        >
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-medium text-stone-700">Vorbereitungsfenster</span>
          <span className="block text-xs text-stone-400">
            Wie viele Wochen vor der Klausur intensiv gelernt wird (pro Kurs anpassbar).
          </span>
        </span>
        <select
          value={String(prepWeeks)}
          onChange={(e) => setPrepWeeks(Number(e.target.value))}
          className={selectCls}
        >
          {[2, 3, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n} Wochen
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 flex items-start justify-between gap-3 border-t border-stone-100 pt-3">
        <span>
          <span className="block text-sm font-medium text-stone-700">Reflexion nach Erledigen</span>
          <span className="block text-xs text-stone-400">
            Kurzes Popup nach jedem erledigten Übungs-/Tutoriumsblatt (Schwierigkeit & Tags) – fließt
            in die Lernplan-Auswahl ein.
          </span>
        </span>
        <button
          role="switch"
          aria-checked={reflectionPrompts}
          onClick={() => setReflectionPrompts(!reflectionPrompts)}
          className={cn(
            'mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition',
            reflectionPrompts ? 'bg-brand-400' : 'bg-stone-300',
          )}
        >
          <span
            className={cn(
              'block h-5 w-5 rounded-full bg-white shadow transition-transform',
              reflectionPrompts && 'translate-x-5',
            )}
          />
        </button>
      </label>
    </section>
  )
}

const inputCls =
  'w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-brand-400'

function ChangeEmailForm({ currentEmail, onDone }: { currentEmail: string; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    const next = email.trim()
    if (!next || next === currentEmail) {
      setErr('Bitte gib eine neue, andere E-Mail-Adresse ein.')
      return
    }
    setBusy(true)
    try {
      await updateEmail(next)
      setMsg('Wir haben dir eine Bestätigung an die neue Adresse geschickt. Die Änderung wird aktiv, sobald du den Link darin anklickst.')
      setEmail('')
      setTimeout(onDone, 4000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  if (msg)
    return (
      <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        <Check size={15} className="mt-0.5 shrink-0" /> {msg}
      </div>
    )

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-stone-50 p-3">
      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Neue E-Mail-Adresse</span>
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="neu@beispiel.de"
          className={inputCls}
        />
      </label>
      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="rounded-full px-4 py-1.5 text-sm text-stone-500 hover:bg-stone-100">
          Abbrechen
        </button>
        <button
          onClick={() => void submit()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-brand-400 px-4 py-1.5 text-sm font-semibold text-stone-900 hover:bg-brand-500 disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />} Bestätigung senden
        </button>
      </div>
    </div>
  )
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    if (pw.length < 6) {
      setErr('Das Passwort muss mindestens 6 Zeichen haben.')
      return
    }
    if (pw !== pw2) {
      setErr('Die beiden Passwörter stimmen nicht überein.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(pw)
      setMsg('Passwort aktualisiert.')
      setPw('')
      setPw2('')
      setTimeout(onDone, 2000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  if (msg)
    return (
      <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        <Check size={15} /> {msg}
      </div>
    )

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-stone-50 p-3">
      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Neues Passwort</span>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="mind. 6 Zeichen"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-stone-500">Wiederholen</span>
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className={inputCls}
        />
      </label>
      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="rounded-full px-4 py-1.5 text-sm text-stone-500 hover:bg-stone-100">
          Abbrechen
        </button>
        <button
          onClick={() => void submit()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-brand-400 px-4 py-1.5 text-sm font-semibold text-stone-900 hover:bg-brand-500 disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />} Speichern
        </button>
      </div>
    </div>
  )
}

function ConflictView({ remoteUpdatedAt }: { remoteUpdatedAt: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <span>
          Auf diesem Gerät <strong>und</strong> in der Cloud liegen Daten. Welche möchtest du
          behalten? Die andere Version wird überschrieben.
        </span>
      </div>
      <button
        onClick={() => void resolveConflict('cloud')}
        className="w-full rounded-xl bg-white p-3 text-left ring-1 ring-stone-200 hover:bg-stone-50"
      >
        <div className="text-sm font-semibold text-stone-800">Cloud-Daten laden</div>
        <div className="text-xs text-stone-500">
          Stand aus der Cloud (zuletzt {formatDistanceToNow(parseISO(remoteUpdatedAt), { locale: de })}{' '}
          aktualisiert) übernehmen.
        </div>
      </button>
      <button
        onClick={() => void resolveConflict('local')}
        className="w-full rounded-xl bg-white p-3 text-left ring-1 ring-stone-200 hover:bg-stone-50"
      >
        <div className="text-sm font-semibold text-stone-800">Lokale Daten hochladen</div>
        <div className="text-xs text-stone-500">Was auf diesem Gerät liegt, in die Cloud schreiben.</div>
      </button>
    </div>
  )
}
