import { supabase } from './supabase'
import { useSync, flushPush } from './sync'
import { resetAll } from './backup'

const redirectTo = typeof location !== 'undefined' ? location.origin : undefined

/** Übersetzt Supabase-/Netzwerkfehler in klare, deutsche Hinweise. */
export function friendlyAuthError(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  if (!raw) return 'Etwas ist schiefgelaufen. Bitte versuch es erneut.'
  if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('load failed'))
    return 'Keine Verbindung. Bitte prüfe dein Internet und versuch es erneut.'
  if (raw.includes('invalid login credentials')) return 'E-Mail oder Passwort ist nicht korrekt.'
  if (raw.includes('email not confirmed'))
    return 'Bitte bestätige zuerst den Link in deiner Bestätigungs-E-Mail.'
  if (raw.includes('already registered') || raw.includes('already been registered'))
    return 'Mit dieser E-Mail gibt es schon ein Konto. Melde dich einfach an.'
  if (raw.includes('password should be at least'))
    return 'Das Passwort muss mindestens 6 Zeichen haben.'
  if (raw.includes('unable to validate email') || raw.includes('invalid format'))
    return 'Diese E-Mail-Adresse sieht nicht gültig aus.'
  if (raw.includes('for security purposes') || raw.includes('rate limit') || raw.includes('too many'))
    return 'Zu viele Versuche. Bitte warte einen Moment und versuch es nochmal.'
  if (raw.includes('provider is not enabled') || raw.includes('unsupported provider'))
    return 'Diese Anmeldeart ist gerade nicht verfügbar. Nutze bitte eine andere.'
  return e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.'
}

async function oauth(provider: 'google' | 'apple') {
  const { error } = await supabase!.auth.signInWithOAuth({ provider, options: { redirectTo } })
  if (error) throw new Error(friendlyAuthError(error))
  // Bei Erfolg leitet der Browser weiter – hier kommt nichts mehr an.
}

export function signInWithGoogle() {
  return oauth('google')
}

export function signInWithApple() {
  return oauth('apple')
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw new Error(friendlyAuthError(error))
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase!.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: redirectTo },
  })
  if (error) throw new Error(friendlyAuthError(error))
  // Wenn Bestätigung per E-Mail aktiv ist, gibt es noch keine Session.
  return { needsConfirm: !data.session }
}

export async function resetPassword(email: string) {
  const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo })
  if (error) throw new Error(friendlyAuthError(error))
}

export async function signOut() {
  // 1. Letzte Änderungen noch sichern (solange wir noch angemeldet sind).
  await flushPush().catch(() => {})
  // 2. Sofort als abgemeldet markieren – verhindert, dass das Leeren der
  //    lokalen DB einen Push auslöst.
  useSync.setState({ user: null, status: 'idle', lastSyncAt: null, conflict: null })
  await supabase!.auth.signOut().catch(() => {})
  // 3. Lokale Daten entfernen: abgemeldet = keine Daten auf dem Gerät.
  await resetAll()
}
