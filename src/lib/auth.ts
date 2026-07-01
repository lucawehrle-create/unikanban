import { supabase } from './supabase'
import { useSync, flushPush } from './sync'
import { resetAll } from './backup'

const redirectTo = typeof location !== 'undefined' ? location.origin : undefined

/** Übersetzt Supabase-/Netzwerkfehler in klare, deutsche Hinweise. */
export function friendlyAuthError(e: unknown): string {
  // Für die Diagnose den echten Fehler (inkl. Status/Code) in die Konsole schreiben.
  if (e) console.error('[SemBan] Auth-Fehler:', e)

  const rawMsg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const raw = rawMsg.toLowerCase().trim()
  const status = (e as { status?: number; code?: string } | null)?.status

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
  if (
    raw.includes('for security purposes') ||
    raw.includes('rate limit') ||
    raw.includes('rate_limit') ||
    raw.includes('too many')
  )
    return 'Zu viele Versuche. Bitte warte einen Moment und versuch es nochmal.'
  if (raw.includes('provider is not enabled') || raw.includes('unsupported provider'))
    return 'Diese Anmeldeart ist gerade nicht verfügbar. Nutze bitte eine andere.'
  // E-Mail-Versand scheitert oft an einer kaputten SMTP-Konfiguration im Backend.
  if (
    raw.includes('error sending') ||
    raw.includes('sending email') ||
    raw.includes('confirmation email') ||
    raw.includes('smtp') ||
    raw.includes('mailer')
  )
    return 'Die E-Mail konnte gerade nicht versendet werden. Bitte versuch es später erneut.'
  if (raw.includes('same') && raw.includes('email'))
    return 'Das ist bereits deine aktuelle E-Mail-Adresse.'

  // Leere/nichtssagende Antwort (z.B. "{}", "[object Object]") niemals roh zeigen.
  const uninformative =
    !raw || raw === '{}' || raw === '[]' || raw === '[object object]' || raw === 'null' || raw === 'undefined'
  if (uninformative) {
    if (status && status >= 500)
      return 'Der Server hat gerade ein Problem. Bitte versuch es in einem Moment erneut.'
    return 'Das hat gerade nicht geklappt. Bitte versuch es in einem Moment erneut.'
  }

  return rawMsg
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

/** E-Mail-Adresse ändern – Supabase schickt eine Bestätigung an die neue Adresse. */
export async function updateEmail(newEmail: string) {
  const { error } = await supabase!.auth.updateUser(
    { email: newEmail.trim() },
    { emailRedirectTo: redirectTo },
  )
  if (error) throw new Error(friendlyAuthError(error))
}

/** Passwort des angemeldeten Kontos setzen/ändern. */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase!.auth.updateUser({ password: newPassword })
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

/**
 * Löscht das Konto endgültig: serverseitig via Edge-Function (Auth-Nutzer +
 * alle Cloud-Daten per Cascade), danach lokale Session & Daten entfernen. Die
 * E-Mail ist anschließend wieder frei. Nicht rückgängig zu machen.
 */
export async function deleteAccount() {
  if (!supabase) throw new Error('Kein Konto konfiguriert.')
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'delete-account',
    { method: 'POST' },
  )
  if (error) {
    // Serverfehler-Text möglichst konkret melden (Edge-Function-Body auslesen).
    let msg = ''
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json()
        if (body && typeof body.error === 'string') msg = body.error
      } catch {
        /* Body nicht lesbar */
      }
    }
    throw new Error(msg || friendlyAuthError(error))
  }
  if (data?.error) throw new Error(data.error)
  // Erfolgreich gelöscht → lokal aufräumen (App wechselt danach zur Landing).
  useSync.setState({ user: null, status: 'idle', lastSyncAt: null, conflict: null })
  await supabase.auth.signOut().catch(() => {})
  await resetAll()
}
