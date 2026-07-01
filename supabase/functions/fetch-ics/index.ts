// SemBan – ICS-Proxy für abonnierte Uni-Kalender (Moodle/StudIP/ILIAS).
//
// Browser können fremde Kalender-Server wegen CORS meist nicht direkt laden;
// diese Function holt den Feed serverseitig und reicht den Text durch.
//
// Aufruf:  POST { url: 'https://…/calendar.ics' }  MIT gültigem JWT.
// Antwort: { ics: '<text/calendar>' }  bzw.  { error: '…' }.
//
// Auth: Wird MIT JWT-Prüfung deployt (Default). Zusätzlich wird das JWT hier
//   serverseitig via auth.getUser() verifiziert (Defense-in-Depth, vgl.
//   parse-timetable) – die Function darf kein anonym nutzbarer Proxy sein.
//
// SSRF-Schutz: nur http/https, keine privaten/Link-Local-/Metadata-Adressen,
//   Redirects werden einzeln validiert. Größen- und Zeitlimit gegen Missbrauch.
//
// Deploy:  supabase functions deploy fetch-ics

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB – Uni-Feeds sind i.d.R. wenige 100 kB
const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 3

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

/** Nutzer serverseitig verifizieren (Signatur + Ablauf), nicht bloß dekodieren. */
async function verifiedUserId(req: Request): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null
  try {
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data, error } = await supa.auth.getUser(jwt)
    return error ? null : data.user?.id ?? null
  } catch {
    return null
  }
}

/** true = Ziel liegt in privaten/lokalen Netzen und darf nicht geholt werden. */
function hostBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === 'metadata.google.internal') return true
  // IPv4-Literale: privat, Loopback, Link-Local, Multicast/Reserved.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  }
  // IPv6-Literale (URL.hostname liefert sie in eckigen Klammern).
  if (h.startsWith('[')) {
    const v6 = h.slice(1, -1)
    if (v6 === '::1' || v6 === '::') return true
    if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true
    if (v6.startsWith('::ffff:')) return true // gemappte IPv4 – oben nicht prüfbar
  }
  return false
}

/** Validiert eine Feed-Adresse; null = nicht erlaubt. */
function validateUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (hostBlocked(u.hostname)) return null
  return u
}

/** Holt den Feed; Redirects werden einzeln gegen die Sperrliste geprüft. */
async function fetchFeed(start: URL): Promise<Response> {
  let url = start
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetch(url.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'text/calendar, text/plain, */*', 'user-agent': 'SemBan-Feed/1.0' },
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      await res.body?.cancel()
      if (!loc) throw new Error('Weiterleitung ohne Ziel.')
      let resolved: string
      try {
        resolved = new URL(loc, url).href
      } catch {
        throw new Error('Ungültige Weiterleitung.')
      }
      const next = validateUrl(resolved)
      if (!next) throw new Error('Weiterleitung auf eine nicht erlaubte Adresse.')
      url = next
      continue
    }
    return res
  }
  throw new Error('Zu viele Weiterleitungen.')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405)

  const userId = await verifiedUserId(req)
  if (!userId) return json({ error: 'Nicht autorisiert.' }, 401)

  let raw = ''
  try {
    const body = await req.json()
    raw = String(body.url ?? '').trim()
  } catch {
    return json({ error: 'Ungültige Anfrage.' }, 400)
  }
  const url = validateUrl(raw.replace(/^webcal:\/\//i, 'https://'))
  if (!url) return json({ error: 'Ungültige oder nicht erlaubte Adresse.' }, 400)

  try {
    const res = await fetchFeed(url)
    if (!res.ok) {
      await res.body?.cancel()
      return json({ error: `Der Kalender-Server antwortete mit ${res.status}.` }, 502)
    }
    const len = Number(res.headers.get('content-length') ?? '0')
    if (len > MAX_BYTES) {
      await res.body?.cancel()
      return json({ error: 'Der Kalender ist zu groß (max. 5 MB).' }, 413)
    }
    const text = await res.text()
    if (text.length > MAX_BYTES) return json({ error: 'Der Kalender ist zu groß (max. 5 MB).' }, 413)
    if (!text.includes('BEGIN:VCALENDAR'))
      return json({ error: 'Die Adresse liefert keinen Kalender (ICS).' }, 422)
    return json({ ics: text })
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError'
    if (timedOut) return json({ error: 'Der Kalender-Server antwortet nicht (Timeout).' }, 504)
    const msg = err instanceof Error && err.message ? err.message : 'Kalender konnte nicht geladen werden.'
    console.error('fetch-ics failed', err)
    return json({ error: msg }, 502)
  }
})
