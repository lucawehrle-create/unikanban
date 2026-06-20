import { supabase } from './supabase'
import { useSync } from './sync'
import { getReminderSettings } from './reminders'

// Öffentlicher VAPID-Key fürs Web-Push-Abo. Ohne diesen Key laufen nur lokale
// Benachrichtigungen (App offen / zurückgekehrt), kein Push bei geschlossener App.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
export const isPushConfigured = Boolean(VAPID_PUBLIC_KEY)

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export function pushPermission(): PushPermission {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported'
  return Notification.permission
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const userTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'
  } catch {
    return 'Europe/Berlin'
  }
}

/** Reminder-Einstellungen serverseitig spiegeln, damit der Cron sie kennt. */
export async function syncReminderSettingsToServer() {
  const user = useSync.getState().user
  if (!supabase || !user) return
  const s = getReminderSettings()
  await supabase
    .from('reminder_settings')
    .upsert(
      { user_id: user.id, enabled: s.enabled, lead_days: s.leadDays, notify_hour: 8, tz: userTz() },
      { onConflict: 'user_id' },
    )
    .then(undefined, () => {})
}

/**
 * Erinnerungen einschalten: Notification-Berechtigung anfragen und – falls
 * Push konfiguriert und angemeldet – ein Web-Push-Abo anlegen und beim Server
 * hinterlegen. Ohne Push-Backend bleibt es bei lokalen Benachrichtigungen.
 */
export async function enableReminders(): Promise<{ ok: boolean; reason?: 'unsupported' | 'denied' }> {
  if (pushPermission() === 'unsupported') return { ok: false, reason: 'unsupported' }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: 'denied' }

  // Web-Push (geschlossene App) nur, wenn Backend konfiguriert + angemeldet.
  const user = useSync.getState().user
  if (VAPID_PUBLIC_KEY && supabase && user) {
    try {
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      }
      await supabase
        .from('push_subscriptions')
        .upsert(
          { endpoint: sub.endpoint, user_id: user.id, subscription: sub.toJSON() },
          { onConflict: 'endpoint' },
        )
      await syncReminderSettingsToServer()
    } catch {
      // Lokale Benachrichtigungen funktionieren trotzdem – Push ist Bonus.
    }
  }
  return { ok: true }
}

/** Web-Push-Abo dieses Geräts entfernen (lokale Hinweise bleiben möglich). */
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch {
    /* ignore */
  }
}
