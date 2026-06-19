import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase, isSyncConfigured } from './supabase'
import { db } from '@/db/db'
import { exportData, importBackup, type Backup } from './backup'

const TABLE = 'user_data'
const lastSyncKey = (uid: string) => `semban:lastSyncAt:${uid}`

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

interface SyncState {
  configured: boolean
  user: User | null
  status: SyncStatus
  lastSyncAt: string | null
  error: string | null
  /** Erstes Verknüpfen, wenn lokal UND Cloud Daten haben → Nutzer entscheidet. */
  conflict: { remoteUpdatedAt: string } | null
}

export const useSync = create<SyncState>(() => ({
  configured: isSyncConfigured,
  user: null,
  status: 'idle',
  lastSyncAt: null,
  error: null,
  conflict: null,
}))

const set = (p: Partial<SyncState>) => useSync.setState(p)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Sync fehlgeschlagen.')

function getLastSync(uid: string) {
  return localStorage.getItem(lastSyncKey(uid))
}
function setLastSync(uid: string, ts: string) {
  localStorage.setItem(lastSyncKey(uid), ts)
  set({ lastSyncAt: ts })
}

// Während wir Cloud-Daten lokal einspielen, dürfen die Schreib-Hooks KEINEN
// Push auslösen (sonst Endlosschleife).
let applyingRemote = false
let pushTimer: ReturnType<typeof setTimeout> | null = null

async function pullRemote(uid: string): Promise<{ data: Backup; updatedAt: string } | null> {
  const { data, error } = await supabase!
    .from(TABLE)
    .select('data, updated_at')
    .eq('user_id', uid)
    .maybeSingle()
  if (error) throw error
  return data ? { data: data.data as Backup, updatedAt: data.updated_at as string } : null
}

async function push() {
  const { user } = useSync.getState()
  if (!supabase || !user) return
  set({ status: 'syncing', error: null })
  try {
    const data = await exportData()
    const updatedAt = new Date().toISOString()
    const { error } = await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, data, updated_at: updatedAt })
    if (error) throw error
    setLastSync(user.id, updatedAt)
    set({ status: 'synced' })
  } catch (e) {
    set({ status: 'error', error: errMsg(e) })
  }
}

async function applyRemote(uid: string, remote: { data: Backup; updatedAt: string }) {
  applyingRemote = true
  try {
    await importBackup(JSON.stringify(remote.data))
    setLastSync(uid, remote.updatedAt)
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
      set({ status: 'idle', conflict: { remoteUpdatedAt: remote.updatedAt } })
      return
    }
    // Sonst: neuere Version gewinnt.
    if (remote.updatedAt > lastSync) await applyRemote(user.id, remote)
    else await push()
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
  if (remote && (!lastSync || remote.updatedAt > lastSync)) await applyRemote(user.id, remote)
  else await push()
}

function schedulePush() {
  if (!useSync.getState().user || applyingRemote) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void push(), 1500)
}

let inited = false
/** Einmalig: Session laden, Auth-Listener + lokale Schreib-Hooks aufsetzen. */
export function initSync() {
  if (inited || !supabase) return
  inited = true

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
  window.addEventListener('focus', () => {
    const u = useSync.getState().user
    if (u) void syncNow()
  })
}

function handleSession(user: User | null) {
  const prev = useSync.getState().user
  useSync.setState({ user })
  if (user) {
    if (user.id !== prev?.id) {
      set({ lastSyncAt: getLastSync(user.id) })
      void reconcile(user)
    }
  } else {
    set({ status: 'idle', lastSyncAt: null, conflict: null })
  }
}
