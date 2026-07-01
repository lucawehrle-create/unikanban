// SemBan – Konto endgültig löschen (Auth-Nutzer + alle zugehörigen Daten).
//
// Aufruf:  POST (ohne Body), MIT gültigem JWT.
// Antwort: { ok: true }  bzw.  { error: '…' } bei Problemen.
//
// Auth: Wird MIT JWT-Prüfung deployt (Default). Nur eingeloggte Nutzer
//   erreichen die Function; gelöscht wird immer NUR das eigene Konto (sub aus
//   dem geprüften JWT) – niemand kann fremde Konten löschen.
//
// Ablauf:
//   1. Nutzer-ID aus dem (vom Gateway geprüften) JWT lesen.
//   2. parse_timetable_calls best-effort löschen – die einzige Tabelle OHNE
//      FK-Cascade auf auth.users (reine Rate-Limit-Logs).
//   3. auth.admin.deleteUser(uid): löscht den Nutzer. Alle übrigen Tabellen
//      (user_data, push_subscriptions, reminder_settings, calendar_tokens,
//      feature_requests/-comments/-votes, bug_reports, coach_interest …)
//      hängen per ON DELETE CASCADE dran und gehen automatisch mit. Danach ist
//      die E-Mail wieder frei für eine Neuregistrierung.
//
// Deploy:  supabase functions deploy delete-account
//   (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY sind in Edge-Functions
//    automatisch gesetzt – kein zusätzliches Secret nötig.)

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/** Nutzer-ID aus dem (vom Gateway bereits geprüften) JWT lesen. */
function userIdFromJwt(req: Request): string | null {
  const part = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').split('.')[1]
  if (!part) return null
  try {
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const payload = JSON.parse(atob(b64))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY)
    return json({ error: 'Server nicht konfiguriert.' }, 500)

  const uid = userIdFromJwt(req)
  if (!uid) return json({ error: 'Nicht angemeldet.' }, 401)

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // Einzige Tabelle ohne Cascade – best effort, Fehler ignorieren.
  try {
    await supa.from('parse_timetable_calls').delete().eq('user_id', uid)
  } catch {
    /* egal – Löschung des Nutzers räumt den Rest auf */
  }

  const { error } = await supa.auth.admin.deleteUser(uid)
  if (error) return json({ error: error.message }, 500)

  return json({ ok: true })
})
