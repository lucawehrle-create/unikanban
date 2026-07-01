// SemBan – stündlich per Cron aufgerufene Edge-Function.
// Sendet Web-Push-Erinnerungen für demnächst fällige, offene Aufgaben.
//
// Ablauf (vgl. supabase/reminders.sql):
//   1. Alle reminder_settings mit enabled = true laden.
//   2. Je Nutzer dessen lokale Stunde + Datum in seiner Zeitzone bestimmen.
//      Stimmt die lokale Stunde nicht mit notify_hour überein → überspringen.
//   3. Ziel-Fälligkeitsdatum = lokales Heute + lead_days.
//   4. user_data.data laden, offene Aufgaben (status !== 'erledigt') mit
//      passendem Fälligkeitsdatum (in der TZ des Nutzers) sammeln.
//   5. Je Aufgabe: schon im reminder_log? → überspringen, sonst an ALLE
//      push_subscriptions des Nutzers senden und danach loggen.
//   6. Zusammenfassung als JSON zurückgeben.
//
// Wird per Cron (POST, ohne Body) aufgerufen, manuelle Aufrufe sind erlaubt.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// --- Typen (nur die hier benötigten Felder, vgl. src/db/types.ts) ----------
interface Task {
  id: string
  title: string
  dueDate?: string
  status: 'offen' | 'dran' | 'erledigt'
  courseId?: string
  semesterId: string
}
interface Course {
  id: string
  name: string
  short?: string
}
interface UserData {
  tasks?: Task[]
  courses?: Course[]
}
interface ReminderSettings {
  user_id: string
  enabled: boolean
  lead_days: number
  notify_hour: number
  tz: string
}
// Volle PushSubscription-JSON (inkl. keys.p256dh/auth), wie vom Client gespeichert.
interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}
interface PushSubRow {
  endpoint: string
  subscription: PushSubscriptionJSON
}

// --- Env -------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'
// Geteiltes Geheimnis für den Cron-Aufruf. Die Function läuft mit --no-verify-jwt
// (der Cron sendet kein Nutzer-JWT), darf aber nicht anonym auslösbar sein –
// sonst könnte jeder wiederholt alle Nutzerdaten durchlaufen und Pushes anstoßen.
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

/** Konstantzeit-Vergleich, damit die Prüfung kein Timing-Leck ist. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Nur der Cron (oder ein Admin mit Service-Role-Key) darf auslösen. */
function authorized(req: Request): boolean {
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const cronHeader = (req.headers.get('x-cron-secret') ?? '').trim()
  if (CRON_SECRET && (safeEqual(bearer, CRON_SECRET) || safeEqual(cronHeader, CRON_SECRET))) return true
  // Der Cron sendet standardmäßig den Service-Role-Key als Bearer – auch der gilt.
  if (SERVICE_ROLE_KEY && safeEqual(bearer, SERVICE_ROLE_KEY)) return true
  return false
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// --- Zeitzonen-Helfer ------------------------------------------------------
// Liefert {hour, date} (date = 'YYYY-MM-DD') für "jetzt" in der gegebenen TZ.
function localNow(tz: string): { hour: number; date: string } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  // en-CA liefert hour '00'..'24'; '24' auf '00' normalisieren.
  let hour = parseInt(get('hour'), 10)
  if (hour === 24) hour = 0
  return { hour, date: `${get('year')}-${get('month')}-${get('day')}` }
}

// Kalenderdatum ('YYYY-MM-DD') eines ISO-Strings in der gegebenen TZ.
function localDateOf(iso: string, tz: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Heute + n Tage als 'YYYY-MM-DD' (datumssichere UTC-Arithmetik).
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Lesbares Fälligkeitsdatum in de-DE in der TZ des Nutzers.
function formatDue(iso: string, tz: string): string {
  const d = new Date(iso)
  // Jeder ISO-String enthält eine Uhrzeit – ein reiner /\d{2}:\d{2}/-Test wäre
  // also immer true. „Ganztägige" Fristen ohne echte Uhrzeit werden als
  // Tagesende (23:59 lokal) gespeichert; das erkennen wir an der Uhrzeit in der
  // TZ des Nutzers und blenden sie dann aus (sonst stünde überall „23:59").
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hour = Number(clock.find((p) => p.type === 'hour')?.value ?? '0')
  const min = Number(clock.find((p) => p.type === 'minute')?.value ?? '0')
  const allDay = hour === 23 && min >= 58
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(d)
}

function leadLabel(leadDays: number): string {
  if (leadDays === 1) return 'Morgen fällig'
  if (leadDays === 0) return 'Heute fällig'
  return `In ${leadDays} Tagen fällig`
}

// --- Hauptlogik ------------------------------------------------------------
async function run(): Promise<{ usersChecked: number; notificationsSent: number }> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  let usersChecked = 0
  let notificationsSent = 0

  const { data: settingsRows, error: settingsErr } = await supabase
    .from('reminder_settings')
    .select('user_id, enabled, lead_days, notify_hour, tz')
    .eq('enabled', true)

  if (settingsErr) throw settingsErr

  for (const settings of (settingsRows ?? []) as ReminderSettings[]) {
    // Pro Nutzer defensiv: ein Fehler darf den Lauf nicht abbrechen.
    try {
      usersChecked++
      const tz = settings.tz || 'Europe/Berlin'
      const { hour, date: today } = localNow(tz)

      // Cron läuft stündlich → nur zur eingestellten Stunde feuern.
      if (hour !== settings.notify_hour) continue

      const targetDate = addDays(today, settings.lead_days)

      // Datenbestand des Nutzers laden.
      const { data: udRow, error: udErr } = await supabase
        .from('user_data')
        .select('data')
        .eq('user_id', settings.user_id)
        .maybeSingle()
      if (udErr) throw udErr
      const data = (udRow?.data ?? {}) as UserData
      const tasks = data.tasks ?? []
      const courses = data.courses ?? []

      // Kurs-Lookup für schöneren Text.
      const courseById = new Map<string, Course>()
      for (const c of courses) courseById.set(c.id, c)

      // Offene Aufgaben mit Fälligkeit am Zieldatum (in der TZ des Nutzers).
      const due = tasks.filter(
        (t) =>
          t.status !== 'erledigt' &&
          !!t.dueDate &&
          localDateOf(t.dueDate!, tz) === targetDate,
      )
      if (due.length === 0) continue

      // Push-Abos des Nutzers laden.
      const { data: subRows, error: subErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint, subscription')
        .eq('user_id', settings.user_id)
      if (subErr) throw subErr
      const subs = (subRows ?? []) as PushSubRow[]
      if (subs.length === 0) continue

      for (const task of due) {
        // Bereits benachrichtigt? (user_id, task_id, due_date)
        const { data: logRow, error: logErr } = await supabase
          .from('reminder_log')
          .select('task_id')
          .eq('user_id', settings.user_id)
          .eq('task_id', task.id)
          .eq('due_date', task.dueDate!)
          .maybeSingle()
        if (logErr) throw logErr
        if (logRow) continue

        const course = task.courseId ? courseById.get(task.courseId) : undefined
        const courseName = course ? course.short || course.name : ''
        const payload = JSON.stringify({
          title: `${leadLabel(settings.lead_days)}: ${task.title}`,
          body: [courseName, formatDue(task.dueDate!, tz)].filter(Boolean).join(' · '),
          url: '/',
          tag: `semban-${task.id}`,
          taskId: task.id,
        })

        let anySent = false
        for (const sub of subs) {
          try {
            // deno-lint-ignore no-explicit-any
            await webpush.sendNotification(sub.subscription as any, payload)
            anySent = true
          } catch (err) {
            // Gerät hat das Abo widerrufen → aufräumen.
            const code = (err as { statusCode?: number })?.statusCode
            if (code === 404 || code === 410) {
              await supabase
                .from('push_subscriptions')
                .delete()
                .eq('endpoint', sub.endpoint)
            } else {
              console.error('push error', settings.user_id, code, err)
            }
          }
        }

        // Erst nach mind. einem erfolgreichen Versand loggen.
        if (anySent) {
          notificationsSent++
          const { error: insErr } = await supabase.from('reminder_log').insert({
            user_id: settings.user_id,
            task_id: task.id,
            due_date: task.dueDate!,
          })
          if (insErr) console.error('reminder_log insert error', insErr)
        }
      }
    } catch (err) {
      console.error('user run failed', settings.user_id, err)
    }
  }

  return { usersChecked, notificationsSent }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  try {
    const summary = await run()
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // Details nur ins Log, nicht an den Aufrufer (verrät sonst interne Struktur).
    console.error('run failed', err)
    return new Response(JSON.stringify({ error: 'Interner Fehler.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
