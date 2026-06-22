import { supabase } from './supabase'
import { useSync } from './sync'

// Admin sieht (private) Bug-Reports aller Nutzer; muss mit der RLS-Policy in
// der Datenbank übereinstimmen (siehe supabase/feedback.sql).
export const ADMIN_EMAIL = 'lucawehrle@gmail.com'

export type FeatureStatus = 'open' | 'planned' | 'done' | 'declined'

export interface FeatureRequest {
  id: string
  user_id: string
  author_name: string | null
  title: string
  description: string | null
  status: FeatureStatus
  created_at: string
}

/** Feature-Wunsch inkl. aggregierter Stimmen & eigener Stimme. */
export interface FeatureWithVotes extends FeatureRequest {
  score: number
  myVote: -1 | 0 | 1
  mine: boolean
}

export interface BugReport {
  id: string
  user_id: string
  reporter_email: string | null
  title: string
  description: string | null
  app_info: string | null
  status: string
  created_at: string
}

function currentUser() {
  return useSync.getState().user
}

export function isAdmin(): boolean {
  return currentUser()?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
}

/** Anzeigename des aktuellen Nutzers (ohne E-Mail öffentlich zu machen). */
function displayName(): string {
  const u = currentUser()
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>
  const name = (meta.full_name || meta.name) as string | undefined
  if (name) return String(name).split(' ')[0]
  const email = u?.email ?? ''
  return email ? email.split('@')[0] : 'Anonym'
}

/** Alle Feature-Wünsche mit Stimmen, sortiert nach Score (dann neuste zuerst). */
export async function listFeatures(): Promise<FeatureWithVotes[]> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const uid = currentUser()?.id
  const [{ data: features, error: fErr }, { data: votes, error: vErr }] = await Promise.all([
    supabase.from('feature_requests').select('*'),
    supabase.from('feature_votes').select('feature_id, user_id, value'),
  ])
  if (fErr) throw fErr
  if (vErr) throw vErr

  const scoreByFeature = new Map<string, number>()
  const myVoteByFeature = new Map<string, number>()
  for (const v of votes ?? []) {
    scoreByFeature.set(v.feature_id, (scoreByFeature.get(v.feature_id) ?? 0) + v.value)
    if (uid && v.user_id === uid) myVoteByFeature.set(v.feature_id, v.value)
  }

  return (features ?? [])
    .map((f): FeatureWithVotes => ({
      ...(f as FeatureRequest),
      score: scoreByFeature.get(f.id) ?? 0,
      myVote: (myVoteByFeature.get(f.id) ?? 0) as -1 | 0 | 1,
      mine: !!uid && f.user_id === uid,
    }))
    .sort((a, b) => {
      // Offene oben, erledigte/abgelehnte ans Ende; sonst nach Score, dann neuste.
      const rank = (s: FeatureStatus) => (s === 'done' || s === 'declined' ? 1 : 0)
      return (
        rank(a.status) - rank(b.status) ||
        b.score - a.score ||
        (a.created_at < b.created_at ? 1 : -1)
      )
    })
}

export async function createFeature(title: string, description: string): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const user = currentUser()
  if (!user) throw new Error('Bitte melde dich an.')
  const { data, error } = await supabase
    .from('feature_requests')
    .insert({
      user_id: user.id,
      author_name: displayName(),
      title: title.trim(),
      description: description.trim() || null,
    })
    .select('id')
    .single()
  if (error) throw error
  // Eigener Wunsch startet mit einer Up-Stimme des Autors.
  if (data) await castVote(data.id, 1)
}

/** Setzt/ändert/entfernt die eigene Stimme (value 0 = entfernen). */
export async function castVote(featureId: string, value: -1 | 0 | 1): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const user = currentUser()
  if (!user) throw new Error('Bitte melde dich an.')
  if (value === 0) {
    const { error } = await supabase
      .from('feature_votes')
      .delete()
      .eq('feature_id', featureId)
      .eq('user_id', user.id)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('feature_votes')
    .upsert({ feature_id: featureId, user_id: user.id, value }, { onConflict: 'feature_id,user_id' })
  if (error) throw error
}

/** Admin: Status eines Wunsches ändern. */
export async function setFeatureStatus(id: string, status: FeatureStatus): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const { error } = await supabase.from('feature_requests').update({ status }).eq('id', id)
  if (error) throw error
}

/** Autor (oder Admin): Titel & Beschreibung eines Wunsches bearbeiten. */
export async function updateFeature(
  id: string,
  title: string,
  description: string,
): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const { error } = await supabase
    .from('feature_requests')
    .update({ title: title.trim(), description: description.trim() || null })
    .eq('id', id)
  if (error) throw error
}

export async function deleteFeature(id: string): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const { error } = await supabase.from('feature_requests').delete().eq('id', id)
  if (error) throw error
}

/** Bug melden (privat – nur Autor & Admin sehen es). */
export async function createBug(title: string, description: string): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const user = currentUser()
  if (!user) throw new Error('Bitte melde dich an.')
  const appInfo = `${navigator.userAgent} · ${window.location.host}`
  const { error } = await supabase.from('bug_reports').insert({
    user_id: user.id,
    reporter_email: user.email ?? null,
    title: title.trim(),
    description: description.trim() || null,
    app_info: appInfo,
  })
  if (error) throw error
}

/** Bug-Reports laden – RLS liefert nur eigene (bzw. alle für den Admin). */
export async function listBugs(): Promise<BugReport[]> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const { data, error } = await supabase
    .from('bug_reports')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BugReport[]
}
