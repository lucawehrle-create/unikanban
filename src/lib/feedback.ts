import { supabase } from './supabase'
import { useSync } from './sync'

// Admin sieht (private) Bug-Reports aller Nutzer; muss mit der RLS-Policy in
// der Datenbank übereinstimmen (siehe supabase/feedback.sql).
export const ADMIN_EMAIL = 'lucawehrle@gmail.com'

export type FeatureStatus = 'open' | 'planned' | 'done' | 'declined'

/** Bereiche zum Einordnen von Wünschen & Bugs. */
export const CATEGORIES = [
  { id: 'lernplaene', label: 'Lernpläne' },
  { id: 'aufgaben', label: 'Aufgaben & Board' },
  { id: 'kalender', label: 'Kalender' },
  { id: 'stundenplan', label: 'Stundenplan' },
  { id: 'studium', label: 'Studium & Noten' },
  { id: 'ui', label: 'Design & Bedienung' },
  { id: 'sonstiges', label: 'Sonstiges' },
] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export function categoryLabel(id: string | null | undefined): string | null {
  if (!id) return null
  return CATEGORIES.find((c) => c.id === id)?.label ?? null
}

export interface FeatureRequest {
  id: string
  user_id: string
  author_name: string | null
  title: string
  description: string | null
  status: FeatureStatus
  category: string | null
  is_anonymous: boolean
  created_at: string
}

/** Feature-Wunsch inkl. aggregierter Stimmen, eigener Stimme & Kommentarzahl. */
export interface FeatureWithVotes extends FeatureRequest {
  score: number
  myVote: -1 | 0 | 1
  mine: boolean
  commentCount: number
}

export interface FeatureComment {
  id: string
  feature_id: string
  user_id: string
  author_name: string | null
  body: string
  created_at: string
  mine: boolean
}

export interface BugReport {
  id: string
  user_id: string
  reporter_email: string | null
  title: string
  description: string | null
  category: string | null
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

/** Alle Feature-Wünsche mit Stimmen & Kommentarzahl. */
export async function listFeatures(): Promise<FeatureWithVotes[]> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const uid = currentUser()?.id
  const [features, votes, comments] = await Promise.all([
    supabase.from('feature_requests').select('*'),
    supabase.from('feature_votes').select('feature_id, user_id, value'),
    supabase.from('feature_comments').select('feature_id'),
  ])
  if (features.error) throw features.error
  if (votes.error) throw votes.error
  if (comments.error) throw comments.error

  const scoreByFeature = new Map<string, number>()
  const myVoteByFeature = new Map<string, number>()
  for (const v of votes.data ?? []) {
    scoreByFeature.set(v.feature_id, (scoreByFeature.get(v.feature_id) ?? 0) + v.value)
    if (uid && v.user_id === uid) myVoteByFeature.set(v.feature_id, v.value)
  }
  const commentsByFeature = new Map<string, number>()
  for (const c of comments.data ?? [])
    commentsByFeature.set(c.feature_id, (commentsByFeature.get(c.feature_id) ?? 0) + 1)

  return (features.data ?? []).map((f): FeatureWithVotes => ({
    ...(f as FeatureRequest),
    score: scoreByFeature.get(f.id) ?? 0,
    myVote: (myVoteByFeature.get(f.id) ?? 0) as -1 | 0 | 1,
    mine: !!uid && f.user_id === uid,
    commentCount: commentsByFeature.get(f.id) ?? 0,
  }))
}

export async function createFeature(input: {
  title: string
  description: string
  category: CategoryId | ''
  anonymous: boolean
}): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const user = currentUser()
  if (!user) throw new Error('Bitte melde dich an.')
  const { data, error } = await supabase
    .from('feature_requests')
    .insert({
      user_id: user.id,
      author_name: input.anonymous ? null : displayName(),
      is_anonymous: input.anonymous,
      title: input.title.trim(),
      description: input.description.trim() || null,
      category: input.category || null,
    })
    .select('id')
    .single()
  if (error) throw error
  // Eigener Wunsch startet mit einer Up-Stimme – schlägt das fehl, ist der
  // Wunsch trotzdem angelegt, also den ganzen Vorgang nicht scheitern lassen.
  if (data) await castVote(data.id, 1).catch(() => {})
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

/** Autor (oder Admin): Titel, Beschreibung & Kategorie bearbeiten. */
export async function updateFeature(
  id: string,
  title: string,
  description: string,
  category: CategoryId | '',
): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const { error } = await supabase
    .from('feature_requests')
    .update({
      title: title.trim(),
      description: description.trim() || null,
      category: category || null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteFeature(id: string): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const { error } = await supabase.from('feature_requests').delete().eq('id', id)
  if (error) throw error
}

// ---------- Kommentare ----------

export async function listComments(featureId: string): Promise<FeatureComment[]> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const uid = currentUser()?.id
  const { data, error } = await supabase
    .from('feature_comments')
    .select('*')
    .eq('feature_id', featureId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((c): FeatureComment => ({ ...(c as FeatureComment), mine: !!uid && c.user_id === uid }))
}

export async function addComment(featureId: string, body: string): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const user = currentUser()
  if (!user) throw new Error('Bitte melde dich an.')
  const { error } = await supabase.from('feature_comments').insert({
    feature_id: featureId,
    user_id: user.id,
    author_name: displayName(),
    body: body.trim(),
  })
  if (error) throw error
}

export async function deleteComment(id: string): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const { error } = await supabase.from('feature_comments').delete().eq('id', id)
  if (error) throw error
}

// ---------- Bugs ----------

export async function createBug(input: {
  title: string
  description: string
  category: CategoryId | ''
}): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const user = currentUser()
  if (!user) throw new Error('Bitte melde dich an.')
  const appInfo = `${navigator.userAgent} · ${window.location.host}`
  const { error } = await supabase.from('bug_reports').insert({
    user_id: user.id,
    reporter_email: user.email ?? null,
    title: input.title.trim(),
    description: input.description.trim() || null,
    category: input.category || null,
    app_info: appInfo,
  })
  if (error) throw error
}

// ---------- KI-Coach: Nachfrage-Signal ----------

export type PaySignal = 'yes' | 'maybe' | 'free_only'

/** Interesse am (geplanten) KI-Lerncoach festhalten – eine Zeile pro Nutzer. */
export async function recordCoachInterest(paySignal: PaySignal, note: string): Promise<void> {
  if (!supabase) throw new Error('Online-Sync ist nicht konfiguriert.')
  const user = currentUser()
  if (!user) throw new Error('Bitte melde dich an.')
  const { error } = await supabase
    .from('coach_interest')
    .upsert(
      { user_id: user.id, email: user.email ?? null, pay_signal: paySignal, note: note.trim() || null },
      { onConflict: 'user_id' },
    )
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
