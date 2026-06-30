// SemBan – Stundenplan-Upload (Foto/PDF) per Claude-Vision auslesen.
//
// Aufruf:  POST { file: <base64>, mediaType: 'image/png'|'image/jpeg'|'image/webp'|'application/pdf' }
// Antwort: { courses: [{ name, slots: [{ weekday, start, end, room? }] }] }
//          bzw. { error: '…' } bei Problemen.
//
// Auth: Diese Function wird MIT JWT-Prüfung deployt (Default, kein
//   --no-verify-jwt). Nur eingeloggte Nutzer erreichen sie – das schützt den
//   kostenpflichtigen Anthropic-Key vor anonymem Missbrauch.
//
// Secret setzen:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
// Deploy:         supabase functions deploy parse-timetable
//
// Modell: günstigstes Claude mit Bild-/PDF-Fähigkeit (Haiku 4.5). Per Secret
//   TIMETABLE_MODEL überschreibbar.

import { createClient } from 'npm:@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Pro Nutzer max. RATE_MAX Uploads je RATE_WINDOW_SEC – schützt den bezahlten
// Key vor Spam. Greift nur, wenn die Tabelle parse_timetable_calls existiert
// (sonst läuft die Function ungebremst weiter, kein harter Fehler).
const RATE_MAX = 8
const RATE_WINDOW_SEC = 60
const ANTHROPIC_TIMEOUT_MS = 45_000
// Sonnet als Standard: Stundenpläne sind dichte Raster mit kleinen Raumkürzeln
// und verbundenen Zellen – Haiku liest die zu unzuverlässig. Per Secret
// TIMETABLE_MODEL überschreibbar (z.B. claude-opus-4-8 für max. Genauigkeit,
// oder claude-haiku-4-5-20251001 für minimale Kosten).
const MODEL = Deno.env.get('TIMETABLE_MODEL') ?? 'claude-sonnet-4-6'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB Rohgröße

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

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])

// Strukturierte Ausgabe erzwingen: Claude MUSS dieses Tool aufrufen.
const TOOL = {
  name: 'report_timetable',
  description: 'Meldet die im Stundenplan erkannten Kurse mit ihren wöchentlichen Terminen.',
  input_schema: {
    type: 'object',
    properties: {
      semester: {
        type: 'string',
        description: 'Falls im Kopf/Titel des Plans erkennbar: das Semester, z.B. "WS 2025/26" oder "SoSe 2026". Sonst weglassen.',
      },
      fachsemester: {
        type: 'integer',
        minimum: 1,
        maximum: 14,
        description: 'Falls eindeutig EINE Fachsemester-Zahl erkennbar ist. Bei mehrdeutigen Angaben wie "5. + 7. Semester" weglassen.',
      },
      courses: {
        type: 'array',
        description: 'Alle erkannten Lehrveranstaltungen.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Voller Name der Veranstaltung, z.B. "Analysis II".' },
            slots: {
              type: 'array',
              description: 'Wöchentliche Termine dieser Veranstaltung.',
              items: {
                type: 'object',
                properties: {
                  weekday: { type: 'integer', minimum: 1, maximum: 7, description: '1=Montag … 7=Sonntag' },
                  start: { type: 'string', description: 'Beginn als HH:MM im 24h-Format.' },
                  end: { type: 'string', description: 'Ende als HH:MM im 24h-Format.' },
                  room: { type: 'string', description: 'Raum/Hörsaal, falls erkennbar.' },
                  kind: {
                    type: 'string',
                    enum: ['vorlesung', 'uebung', 'tutorium', 'seminar', 'praktikum', 'repetitorium', 'kolloquium'],
                    description: 'Art der Veranstaltung (Standard: vorlesung).',
                  },
                },
                required: ['weekday', 'start', 'end'],
              },
            },
          },
          required: ['name', 'slots'],
        },
      },
    },
    required: ['courses'],
  },
}

const SYSTEM = `Du extrahierst einen Wochen-Stundenplan (deutsche Hochschule) aus einem Bild oder PDF. Arbeite extrem sorgfältig – jede Veranstaltung, jeder Tag, jede Uhrzeit und jeder Raum muss exakt stimmen.

So liest du die Tabelle:
- Die SPALTEN sind Wochentage: Montag=1, Dienstag=2, Mittwoch=3, Donnerstag=4, Freitag=5, Samstag=6, Sonntag=7. Ordne jede Zelle GENAU der Spalte zu, in der sie steht. Verwechsle Tage niemals – gehe die Tabelle Spalte für Spalte (Tag für Tag) durch.
- Die LINKE Spalte ist die Zeitachse. Beginn und Ende eines Termins ergeben sich aus den Zeilen, die der Block überdeckt. Ein Block, der zwei Stundenzeilen ausfüllt (z.B. 08:00–09:00 UND 09:00–10:00), dauert 08:00–10:00. Ein Block über zwei Zeilen ist also 2 Stunden lang, nicht 1.
- Stehen in EINER Tag/Zeit-Zelle zwei Kästchen NEBENEINANDER, sind das zwei verschiedene, parallele Veranstaltungen zur selben Zeit – gib beide als getrennte Einträge zurück (gleicher Tag, gleiche Uhrzeit, je eigener Raum).
- Innerhalb einer Zelle steht oben der KURSNAME, darunter der Dozentenname (links) und der RAUM (rechts).

Felder pro Termin:
- name: der Kursname OHNE hochgestellte Fußnotenziffern (z.B. "Spezialfragen der Abschlusserstellung²" → "Spezialfragen der Abschlusserstellung"). Nimm KEINE Dozentennamen in den Namen auf.
- weekday: 1–7 wie oben.
- start / end: HH:MM im 24-Stunden-Format.
- room: das Raumkürzel unten rechts in der Zelle, ZEICHENGENAU übernehmen – Buchstaben, Groß-/Kleinschreibung, Ziffern und Schrägstriche exakt so wie abgebildet (z.B. "He22/142", "He22/E03", "N24/226", "H20", "N24/131"). Verwechsle keine Ziffern und vereinfache/rate NICHT. Wenn der Raum nicht eindeutig lesbar ist, lass das Feld lieber leer.
- kind: Art der Veranstaltung. Erkenne sie an Beschriftungen in der Zelle oder im Kursnamen ("Vorlesung"/"VL" → vorlesung, "Übung"/"Ü" → uebung, "Tutorium"/"Tut" → tutorium, "Seminar" → seminar, "Praktikum" → praktikum, "Repetitorium"/"Rep" → repetitorium, "Kolloquium" → kolloquium). Wenn keine Art erkennbar ist, nimm vorlesung.

Aus dem Kopf/Titel des Plans (falls vorhanden):
- semester: das Semester wie "WS 2025/26" oder "SoSe 2026". Nur wenn klar lesbar.
- fachsemester: nur, wenn EINDEUTIG eine einzelne Zahl genannt ist. Bei Angaben wie "5. + 7. Semester" weglassen.

Weitere Regeln:
- Dieselbe Veranstaltung an mehreren Terminen = EIN Kurs mit mehreren "slots". Das gilt AUCH, wenn der Name leicht abweichend oder abgekürzt geschrieben ist (z.B. "Spezialfragen d. Abschlusserstellung" und "Spezialfragen der Abschlusserstellung") oder dieselbe Fußnotenziffer trägt – fasse ihn zu EINEM Kurs mit EINEM einheitlichen Namen zusammen, niemals doppelt.
- Ignoriere die Legende/Schattierung (z.B. "5. Semester / 7. Semester"), die Kopfzeile, Pausen und leere Zellen.
- Erfinde nichts. Gib nur zurück, was wirklich im Plan steht.
- Wenn nichts Verwertbares erkennbar ist, gib eine leere "courses"-Liste zurück.

Rufe ausschließlich das Tool report_timetable auf.`

function normTime(v: unknown): string {
  const m = String(v ?? '').match(/(\d{1,2})(?::(\d{2}))?/)
  if (!m) return ''
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  return `${String(h).padStart(2, '0')}:${(m[2] ?? '00').padStart(2, '0')}`
}

interface RawSlot { weekday?: unknown; start?: unknown; end?: unknown; room?: unknown; kind?: unknown }
interface RawCourse { name?: unknown; slots?: unknown }

const KINDS = new Set(['vorlesung', 'uebung', 'tutorium', 'seminar', 'praktikum', 'repetitorium', 'kolloquium'])

function cleanCourses(courses: unknown) {
  if (!Array.isArray(courses)) return []
  return courses
    .map((c: RawCourse) => {
      const slots = (Array.isArray(c?.slots) ? c.slots : [])
        .map((s: RawSlot) => {
          const weekday = parseInt(String(s?.weekday), 10)
          const start = normTime(s?.start)
          return {
            weekday,
            start,
            end: normTime(s?.end) || start,
            room: s?.room ? String(s.room).trim().slice(0, 40) || undefined : undefined,
            kind: KINDS.has(String(s?.kind)) ? String(s?.kind) : 'vorlesung',
          }
        })
        .filter((s) => Number.isInteger(s.weekday) && s.weekday >= 1 && s.weekday <= 7 && s.start)
      return { name: String(c?.name ?? '').trim().slice(0, 80), slots }
    })
    .filter((c) => c.name)
    .slice(0, 30)
}

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

/** true = Limit überschritten. Bei fehlender Tabelle/Fehler: nicht blockieren. */
async function rateLimited(userId: string): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return false
  try {
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const since = new Date(Date.now() - RATE_WINDOW_SEC * 1000).toISOString()
    const { count, error } = await supa
      .from('parse_timetable_calls')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('called_at', since)
    if (error) return false
    if ((count ?? 0) >= RATE_MAX) return true
    await supa.from('parse_timetable_calls').insert({ user_id: userId })
    return false
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405)
  if (!ANTHROPIC_API_KEY) return json({ error: 'Server nicht konfiguriert (ANTHROPIC_API_KEY fehlt).' }, 500)

  let file = ''
  let mediaType = ''
  try {
    const body = await req.json()
    file = String(body.file ?? '')
    mediaType = String(body.mediaType ?? '')
  } catch {
    return json({ error: 'Ungültige Anfrage.' }, 400)
  }
  if (!file) return json({ error: 'Keine Datei übergeben.' }, 400)
  if (!ALLOWED.has(mediaType)) return json({ error: 'Nicht unterstütztes Format. Bitte PNG, JPG oder PDF.' }, 415)
  if (file.length * 0.75 > MAX_BYTES) return json({ error: 'Datei zu groß (max. 8 MB).' }, 413)

  const userId = userIdFromJwt(req)
  if (userId && (await rateLimited(userId))) {
    return json({ error: 'Zu viele Uploads in kurzer Zeit – bitte einen Moment warten.' }, 429)
  }

  const source = { type: 'base64', media_type: mediaType, data: file }
  const fileBlock = mediaType === 'application/pdf'
    ? { type: 'document', source }
    : { type: 'image', source }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'report_timetable' },
        messages: [
          {
            role: 'user',
            content: [
              fileBlock,
              { type: 'text', text: 'Lies diesen Stundenplan aus und melde die Kurse über das Tool. Gehe Spalte für Spalte (Tag für Tag) vor, damit kein Termin in den falschen Tag rutscht, und übernimm die Raumkürzel zeichengenau.' },
            ],
          },
        ],
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error('anthropic error', res.status, detail)
      return json({ error: 'Stundenplan konnte nicht gelesen werden.' }, 502)
    }
    const data = await res.json()
    const tool = (data.content ?? []).find((c: { type: string }) => c.type === 'tool_use') as
      | { input?: { courses?: unknown; semester?: unknown; fachsemester?: unknown } }
      | undefined
    const input = tool?.input ?? {}
    const semester = typeof input.semester === 'string' && input.semester.trim()
      ? input.semester.trim().slice(0, 40)
      : undefined
    const fsNum = parseInt(String(input.fachsemester), 10)
    const fachsemester = Number.isInteger(fsNum) && fsNum >= 1 && fsNum <= 14 ? fsNum : undefined
    return json({ courses: cleanCourses(input.courses), semester, fachsemester })
  } catch (err) {
    console.error('parse-timetable failed', err)
    const timedOut = (err as Error)?.name === 'TimeoutError'
    return json(
      { error: timedOut ? 'Zeitüberschreitung beim Auslesen – bitte erneut versuchen.' : 'Interner Fehler.' },
      timedOut ? 504 : 500,
    )
  }
})
