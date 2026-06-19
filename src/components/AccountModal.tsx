import { useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { AlertTriangle, Check, Cloud, CloudOff, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { useUI } from '@/store/ui'
import { useSync, resolveConflict, syncNow } from '@/lib/sync'
import {
  resetPassword,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
} from '@/lib/auth'
import { Modal } from './Modal'

export function AccountModal() {
  const setShowAccount = useUI((s) => s.setShowAccount)
  const { user, status, lastSyncAt, error, conflict } = useSync()
  const close = () => setShowAccount(false)

  return (
    <Modal title={user ? 'Konto & Sync' : 'Anmelden'} onClose={close}>
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
        <SignedOut />
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
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200/70">
        <div className="text-xs text-stone-400">Angemeldet als</div>
        <div className="truncate font-medium text-stone-800">{email}</div>
        <div className="mt-2 text-xs">
          <StatusLine status={status} lastSyncAt={lastSyncAt} error={error} />
        </div>
      </div>

      <p className="text-xs text-stone-500">
        Deine Daten werden automatisch mit der Cloud abgeglichen und stehen auf allen Geräten zur
        Verfügung, auf denen du angemeldet bist.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void syncNow()}
          className="flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          <RefreshCw size={15} /> Jetzt synchronisieren
        </button>
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
        >
          <LogOut size={15} /> Abmelden
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

type Mode = 'signin' | 'signup'

function SignedOut() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      if (mode === 'signup') {
        const { needsConfirm } = await signUpWithEmail(email, password)
        if (needsConfirm) setMsg('Fast geschafft – bestätige den Link in deiner E-Mail.')
      } else {
        await signInWithEmail(email, password)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    if (!email) {
      setErr('Bitte zuerst deine E-Mail eintragen.')
      return
    }
    setErr('')
    try {
      await resetPassword(email)
      setMsg('Link zum Zurücksetzen verschickt.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Konnte E-Mail nicht senden.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">
        Melde dich an, um deine Daten zu sichern und auf allen Geräten synchron zu halten.
      </p>

      <div className="grid grid-cols-1 gap-2">
        <button
          onClick={() => void signInWithGoogle()}
          className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
        >
          <GoogleIcon /> Weiter mit Google
        </button>
        <button
          onClick={() => void signInWithApple()}
          className="flex items-center justify-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
        >
          <AppleIcon /> Weiter mit Apple
        </button>
      </div>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-stone-300">
        <span className="h-px flex-1 bg-stone-200" /> oder <span className="h-px flex-1 bg-stone-200" />
      </div>

      <form onSubmit={submit} className="space-y-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passwort"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</div>}
        {msg && (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <Check size={13} /> {msg}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-brand-400 px-4 py-2.5 text-sm font-semibold text-stone-900 hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? '…' : mode === 'signup' ? 'Konto erstellen' : 'Anmelden'}
        </button>
      </form>

      <div className="flex items-center justify-between text-xs">
        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="font-medium text-stone-600 hover:text-stone-800"
        >
          {mode === 'signin' ? 'Neu? Konto erstellen' : 'Schon ein Konto? Anmelden'}
        </button>
        {mode === 'signin' && (
          <button onClick={() => void forgot()} className="text-stone-400 hover:text-stone-600">
            Passwort vergessen?
          </button>
        )}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-8 20-20 0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39.6 35.9 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.7 2.3 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7 1.9-1.1 2.6-2.2c.8-1.2 1.2-2.4 1.2-2.5-.1 0-2.3-.9-2.3-3.4zM14.2 5.9c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.6.6-1.1 1.6-.9 2.6 1 .1 2-.5 2.5-1.2z" />
    </svg>
  )
}
