import { supabase } from './supabase'
import { useSync } from './sync'

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
  await supabase!.auth.signOut()
  useSync.setState({ user: null, status: 'idle', lastSyncAt: null, conflict: null })
}
