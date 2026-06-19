import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import {
  resetPassword,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/lib/auth'
import { useSync } from '@/lib/sync'

type Mode = 'signin' | 'signup'

/** Anmelde-/Registrier-Formular (Google, Apple, E-Mail+Passwort). */
export function SignInPanel() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [redirecting, setRedirecting] = useState<'google' | 'apple' | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  // Fehler aus einem vorherigen OAuth-Redirect (Google/Apple).
  const authError = useSync((s) => s.authError)

  function clearMessages() {
    setErr('')
    setMsg('')
    if (useSync.getState().authError) useSync.setState({ authError: null })
  }

  async function oauth(provider: 'google' | 'apple') {
    clearMessages()
    setRedirecting(provider)
    try {
      if (provider === 'google') await signInWithGoogle()
      else await signInWithApple()
      // Bei Erfolg verlässt der Browser die Seite – sonst kam ein Fehler.
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.')
      setRedirecting(null)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    clearMessages()
    try {
      if (mode === 'signup') {
        const { needsConfirm } = await signUpWithEmail(email, password)
        if (needsConfirm) setMsg('Fast geschafft – bestätige den Link in deiner E-Mail.')
      } else {
        await signInWithEmail(email, password)
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.'
      setErr(m)
      // Bei „Konto existiert schon" direkt zum Anmelden wechseln.
      if (mode === 'signup' && m.includes('schon ein Konto')) setMode('signin')
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    if (!email) {
      setErr('Bitte zuerst deine E-Mail eintragen.')
      return
    }
    clearMessages()
    try {
      await resetPassword(email)
      setMsg('Link zum Zurücksetzen verschickt.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Konnte E-Mail nicht senden.')
    }
  }

  const shownErr = err || authError

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2">
        <button
          onClick={() => void oauth('google')}
          disabled={!!redirecting}
          className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50 disabled:opacity-60"
        >
          {redirecting === 'google' ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}
          Weiter mit Google
        </button>
        <button
          onClick={() => void oauth('apple')}
          disabled={!!redirecting}
          className="flex items-center justify-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {redirecting === 'apple' ? <Loader2 size={16} className="animate-spin" /> : <AppleIcon />}
          Weiter mit Apple
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
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passwort"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        {shownErr && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{shownErr}</div>
        )}
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
