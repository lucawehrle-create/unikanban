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

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = Deno.env.get('TIMETABLE_MODEL') ?? 'claude-haiku-4-5-20251001'
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

const SYSTEM = `Du liest Stundenpläne deutscher Hochschulen aus Bildern oder PDFs und gibst sie strukturiert zurück.
Regeln:
- Erfasse jede Lehrveranstaltung mit ihrem vollen Namen.
- Mehrere Sitzungen derselben Veranstaltung (z.B. Vorlesung Mo und Mi) gehören als mehrere "slots" zu EINEM Kurs.
- Uhrzeiten immer als HH:MM im 24-Stunden-Format.
- weekday: 1=Montag, 2=Dienstag, … 7=Sonntag.
- WICHTIG: Erfasse zu JEDEM Termin den Raum/Hörsaal, wenn er im Plan steht – auch in Klammern, Fußzeilen oder Nebenspalten (z.B. "HS 1", "SR 204", "H 0.16", "Geb. 30.41", "Online", "B302"). Schreibe ihn in das Feld "room". Nur weglassen, wenn wirklich kein Raum dabeisteht.
- Ignoriere Kopf-/Zeitspalten, Pausen, Legenden, leere Zellen und einmalige Termine.
- Wenn nichts Verwertbares erkennbar ist, gib eine leere "courses"-Liste zurück.
Rufe ausschließlich das Tool report_timetable auf.`

function normTime(v: unknown): string {
  const m = String(v ?? '').match(/(\d{1,2})(?::(\d{2}))?/)
  if (!m) return ''
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  return `${String(h).padStart(2, '0')}:${(m[2] ?? '00').padStart(2, '0')}`
}

interface RawSlot { weekday?: unknown; start?: unknown; end?: unknown; room?: unknown }
interface RawCourse { name?: unknown; slots?: unknown }

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
          }
        })
        .filter((s) => Number.isInteger(s.weekday) && s.weekday >= 1 && s.weekday <= 7 && s.start)
      return { name: String(c?.name ?? '').trim().slice(0, 80), slots }
    })
    .filter((c) => c.name)
    .slice(0, 30)
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
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'report_timetable' },
        messages: [
          {
            role: 'user',
            content: [
              fileBlock,
              { type: 'text', text: 'Lies diesen Stundenplan aus und melde die Kurse über das Tool. Achte besonders auf die Räume/Hörsäle zu jedem Termin.' },
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
      | { input?: { courses?: unknown } }
      | undefined
    return json({ courses: cleanCourses(tool?.input?.courses) })
  } catch (err) {
    console.error('parse-timetable failed', err)
    return json({ error: 'Interner Fehler.' }, 500)
  }
})
