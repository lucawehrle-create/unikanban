import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase, isSyncConfigured } from './supabase'
import { db } from '@/db/db'
import { exportData, importBackup, resetAll, type Backup } from './backup'

const TABLE = 'user_data'
const lastSyncKey = (uid: string) => `semban:lastSyncAt:${uid}`
const lastEditKey = (uid: string) => `semban:lastEditAt:${uid}`

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

interface SyncState {
  configured: boolean
  user: User | null
  status: SyncStatus
  lastSyncAt: string | null
  error: string | null
  /** Fehler aus einem OAuth-Redirect (Google/Apple), für den Login-Screen. */
  authError: string | null
  /** Erstes Verknüpfen, wenn lokal UND Cloud Daten haben → Nutzer entscheidet. */
  conflict: { remoteUpdatedAt: string } | null
}

export const useSync = create<SyncState>(() => ({
  configured: isSyncConfigured,
  user: null,
  status: 'idle',
  lastSyncAt: null,
  error: null,
  authError: null,
  conflict: null,
}))

const set = (p: Partial<SyncState>) => useSync.setState(p)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Sync fehlgeschlagen.')

function getLastSync(uid: string) {
  return localStorage.getItem(lastSyncKey(uid))
}
function setLastSync(uid: string, ts: string) {
  // lastEditAt NICHT hier löschen: „dirty" ergibt sich aus dem Zeitvergleich
  // (lastEditAt > lastSync). Würde man hier löschen, könnte eine Bearbeitung,
  // die während des Push-Roundtrips passiert, ihr Dirty-Flag verlieren.
  localStorage.setItem(lastSyncKey(uid), ts)
  set({ lastSyncAt: ts })
}
function markLocalEdit(uid: string) {
  try {
    localStorage.setItem(lastEditKey(uid), new Date().toISOString())
  } catch {
    /* ignore */
  }
}
function clearLocalEdit(uid: string) {
  try {
    localStorage.removeItem(lastEditKey(uid))
  } catch {
    /* ignore */
  }
}
/** Gibt es lokale Änderungen, die seit dem letzten Sync noch nicht hochgeladen wurden? */
function hasLocalEdits(uid: string): boolean {
  const edit = localStorage.getItem(lastEditKey(uid))
  if (!edit) return false
  const sync = getLastSync(uid)
  return !sync || edit > sync
}

// Während wir Cloud-Daten lokal einspielen, dürfen die Schreib-Hooks KEINEN
// Push auslösen (sonst Endlosschleife).
let applyingRemote = false
let pushTimer: ReturnType<typeof setTimeout> | null = null

/** Einen entprellten, noch nicht ausgeführten Push abbrechen. Wichtig, sobald
 *  wir Cloud-Daten übernehmen oder einen Konflikt anzeigen: sonst feuert der
 *  alte Timer später los und überschreibt neuere Cloud-Daten bzw. lädt eine
 *  halb eingespielte DB hoch. */
function cancelPush() {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
}

async function pullRemote(uid: string): Promise<{ data: Backup; updatedAt: string } | null> {
  const { data, error } = await supabase!
    .from(TABLE)
    .select('data, updated_at')
    .eq('user_id', uid)
    .abortSignal(AbortSignal.timeout(12_000))
    .maybeSingle()
  if (error) throw error
  return data ? { data: data.data as Backup, updatedAt: data.updated_at as string } : null
}

async function push() {
  const { user, conflict } = useSync.getState()
  if (!supabase || !user) return
  // Nicht hochladen, während wir gerade Cloud-Daten einspielen (die DB ist
  // dann evtl. halb geleert) oder ein ungelöster Konflikt ansteht (ein
  // entprellter Push würde die neueren Cloud-Daten blind überschreiben).
  if (applyingRemote || conflict) return
  set({ status: 'syncing', error: null })
  try {
    const data = await exportData()
    const updatedAt = new Date().toISOString()
    const { error } = await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, data, updated_at: updatedAt })
      .abortSignal(AbortSignal.timeout(12_000))
    if (error) throw error
    setLastSync(user.id, updatedAt)
    set({ status: 'synced' })
  } catch (e) {
    set({ status: 'error', error: errMsg(e) })
  }
}

async function applyRemote(uid: string, remote: { data: Backup; updatedAt: string }) {
  cancelPush() // kein alter Timer darf während des Imports einen Push auslösen
  applyingRemote = true
  try {
    await importBackup(JSON.stringify(remote.data))
    setLastSync(uid, remote.updatedAt)
    // Remote übernommen → etwaige lokale „offene" Markierung verwerfen (auch
    // wenn der Nutzer im Konflikt „Cloud" wählt), sonst triggert es erneut.
    clearLocalEdit(uid)
    set({ status: 'synced' })
  } finally {
    applyingRemote = false
  }
}

async function reconcile(user: User) {
  set({ status: 'syncing', error: null })
  try {
    const remote = await pullRemote(user.id)
    const localCount = await db.programs.count()
    const lastSync = getLastSync(user.id)

    if (!remote) {
      if (localCount > 0) await push()
      else set({ status: 'synced' })
      return
    }
    if (localCount === 0) {
      await applyRemote(user.id, remote)
      return
    }
    // Beide Seiten haben Daten:
    if (!lastSync) {
      // Dieses Gerät war noch nie mit dem Konto verknüpft → Nutzer fragen.
      cancelPush()
      set({ status: 'idle', conflict: { remoteUpdatedAt: remote.updatedAt } })
      return
    }
    // Remote neuer:
    if (remote.updatedAt > lastSync) {
      // …aber lokal gibt es noch nicht hochgeladene Änderungen → echter
      // Mehrgeräte-Konflikt: nicht blind überschreiben, sondern nachfragen.
      if (hasLocalEdits(user.id)) {
        cancelPush()
        set({ status: 'idle', conflict: { remoteUpdatedAt: remote.updatedAt } })
        return
      }
      await applyRemote(user.id, remote)
    } else await push()
  } catch (e) {
    set({ status: 'error', error: errMsg(e) })
  }
}

/** Konflikt beim ersten Verknüpfen auflösen. */
export async function resolveConflict(choice: 'cloud' | 'local') {
  const { user } = useSync.getState()
  if (!supabase || !user) return
  set({ conflict: null, status: 'syncing' })
  try {
    if (choice === 'cloud') {
      const remote = await pullRemote(user.id)
      if (remote) await applyRemote(user.id, remote)
    } else {
      await push()
    }
  } catch (e) {
    set({ status: 'error', error: errMsg(e) })
  }
}

/** Manuell anstoßen (Button „Jetzt synchronisieren"). */
export async function syncNow() {
  const { user } = useSync.getState()
  if (!user) return
  const remote = await pullRemote(user.id).catch(() => null)
  const lastSync = getLastSync(user.id)
  if (remote && (!lastSync || remote.updatedAt > lastSync)) {
    // Remote neuer, aber lokal nicht hochgeladene Änderungen → Konflikt zeigen.
    if (hasLocalEdits(user.id)) {
      cancelPush()
      set({ status: 'idle', conflict: { remoteUpdatedAt: remote.updatedAt } })
      return
    }
    await applyRemote(user.id, remote)
  } else await push()
}

function schedulePush() {
  const u = useSync.getState().user
  if (!u || applyingRemote) return
  markLocalEdit(u.id) // lokale, noch nicht hochgeladene Änderung vormerken
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void push(), 1500)
}

/** Ausstehende Änderungen sofort hochladen (z.B. vor dem Abmelden). */
export async function flushPush() {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  if (useSync.getState().user) await push()
}

let inited = false
/** Einmalig: Session laden, Auth-Listener + lokale Schreib-Hooks aufsetzen. */
export function initSync() {
  if (inited || !supabase) return
  inited = true

  // Fehler aus einem OAuth-Redirect aufgreifen (z.B. abgebrochen/abgelehnt)
  // und die URL aufräumen, damit nichts „hängen" bleibt.
  try {
    const params = new URLSearchParams(location.hash.replace(/^#/, '') || location.search)
    const desc = params.get('error_description') || params.get('error')
    if (desc) {
      useSync.setState({ authError: decodeURIComponent(desc.replace(/\+/g, ' ')) })
      history.replaceState(null, '', location.pathname)
    }
  } catch {
    /* ignore */
  }

  // Jede lokale Änderung (egal woher) stößt einen entprellten Push an.
  const onWrite = () => schedulePush()
  for (const t of [db.programs, db.semesters, db.courses, db.tasks, db.attendance]) {
    t.hook('creating', onWrite)
    t.hook('updating', onWrite)
    t.hook('deleting', onWrite)
  }

  void supabase.auth.getSession().then(({ data }) => handleSession(data.session?.user ?? null))
  supabase.auth.onAuthStateChange((_e, session) => handleSession(session?.user ?? null))

  // Wenn man zur App zurückkehrt: prüfen, ob ein anderes Gerät neuer ist.
  // syncNow überschreibt lokale, noch nicht hochgeladene Änderungen nicht mehr
  // blind, sondern zeigt bei echtem Konflikt den Auswahldialog.
  window.addEventListener('focus', () => {
    if (useSync.getState().user) void syncNow()
  })
}

async function handleSession(user: User | null) {
  const prev = useSync.getState().user
  if (user) {
    if (user.id !== prev?.id) {
      // Direkter Kontowechsel OHNE vorherige Abmeldung (z.B. OAuth-Re-Auth im
      // selben Tab): die lokalen Daten des Vorgänger-Kontos dürfen NICHT ins neue
      // Konto übernommen (und hochgeladen) werden. Erst leeren – wie beim
      // Abmelden mit user=null, damit die Lösch-Hooks keinen Push auslösen –,
      // dann das neue Konto abgleichen. (prev == null = normales Login: lokale
      // Onboarding-/Demodaten sollen erhalten bleiben und werden gemerged.)
      if (prev) {
        cancelPush()
        useSync.setState({ user: null })
        await resetAll().catch(() => {})
      }
      useSync.setState({ user })
      set({ lastSyncAt: getLastSync(user.id) })
      void reconcile(user)
    } else {
      useSync.setState({ user })
    }
  } else {
    useSync.setState({ user, status: 'idle', lastSyncAt: null, conflict: null })
  }
}
