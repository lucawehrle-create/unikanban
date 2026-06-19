import { supabase } from './supabase'
import { useSync, flushPush } from './sync'
import { resetAll } from './backup'

const redirectTo = typeof location !== 'undefined' ? location.origin : undefined

export async function signInWithGoogle() {
  await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
}

export async function signInWithApple() {
  await supabase!.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo } })
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase!.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  })
  if (error) throw error
  // Wenn Bestätigung per E-Mail aktiv ist, gibt es noch keine Session.
  return { needsConfirm: !data.session }
}

export async function resetPassword(email: string) {
  const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

export async function signOut() {
  // 1. Letzte Änderungen noch sichern (solange wir noch angemeldet sind).
  await flushPush().catch(() => {})
  // 2. Sofort als abgemeldet markieren – verhindert, dass das Leeren der
  //    lokalen DB einen Push auslöst.
  useSync.setState({ user: null, status: 'idle', lastSyncAt: null, conflict: null })
  await supabase!.auth.signOut()
  // 3. Lokale Daten entfernen: abgemeldet = keine Daten auf dem Gerät.
  await resetAll()
}
