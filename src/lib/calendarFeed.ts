import { supabase } from './supabase'
import { useSync } from './sync'

// Basis-URL des Supabase-Projekts (gleiche Quelle wie der Client).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined

/** Kalender-Abo nur möglich, wenn Cloud (Konto) konfiguriert ist. */
export const isFeedConfigured = Boolean(SUPABASE_URL && supabase)

function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function feedUrl(token: string): string {
  return `${SUPABASE_URL}/functions/v1/calendar-feed?token=${token}`
}

/** webcal://-Variante – öffnet direkt den Abo-Dialog von Apple/Outlook. */
export function webcalUrl(token: string): string {
  return feedUrl(token).replace(/^https?:\/\//, 'webcal://')
}

/** Vorhandenes Token dieses Kontos lesen (oder null). */
export async function getFeedToken(): Promise<string | null> {
  const user = useSync.getState().user
  if (!supabase || !user) return null
  const { data } = await supabase
    .from('calendar_tokens')
    .select('token')
    .eq('user_id', user.id)
    .maybeSingle()
  return data?.token ?? null
}

/** Token sicherstellen (anlegen, falls noch keins existiert). */
export async function ensureFeedToken(): Promise<string | null> {
  const user = useSync.getState().user
  if (!supabase || !user) return null
  const existing = await getFeedToken()
  if (existing) return existing
  const token = randomToken()
  const { error } = await supabase
    .from('calendar_tokens')
    .upsert({ user_id: user.id, token }, { onConflict: 'user_id' })
  return error ? null : token
}

/** Neues Token erzeugen (macht den alten Link ungültig). */
export async function regenerateFeedToken(): Promise<string | null> {
  const user = useSync.getState().user
  if (!supabase || !user) return null
  const token = randomToken()
  const { error } = await supabase
    .from('calendar_tokens')
    .upsert({ user_id: user.id, token }, { onConflict: 'user_id' })
  return error ? null : token
}

/** Abo deaktivieren (Token löschen → Link liefert nichts mehr). */
export async function disableFeed(): Promise<void> {
  const user = useSync.getState().user
  if (!supabase || !user) return
  await supabase.from('calendar_tokens').delete().eq('user_id', user.id)
}
