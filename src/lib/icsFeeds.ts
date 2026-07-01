// Abonnierte Uni-Kalender (Moodle/StudIP/ILIAS-ICS-Feeds).
//
// Ein Feed wird regelmäßig abgerufen; NEUE Einzel-/Ganztags-Termine (Abgaben,
// Klausuren …) landen automatisch als Aufgaben im aktiven Semester. Wöchentliche
// Termine (Stundenplan) werden bewusst NICHT automatisch angelegt – das macht
// der Nutzer einmalig über den manuellen Import im Kalender-Modal.
//
// „Schon gesehen"-Liste (importedKeys): Jeder jemals im Feed gesehene Termin
// wird gemerkt. Löscht der Nutzer eine daraus entstandene Aufgabe, kommt sie
// beim nächsten Abgleich NICHT wieder. Die Liste synct (wie der Feed selbst)
// über den Cloud-Sync mit – so importieren zwei Geräte nicht doppelt.

import { db, uid } from '@/db/db'
import type { IcsFeed } from '@/db/types'
import { parseICS, planImport, deadlineKey, deadlineKeysOf } from './ics'
import { createTask } from './actions'
import { supabase } from './supabase'
import { useSync } from './sync'

/** Abgleich frühestens alle 6 h pro Feed (Kalender-Apps machen es ähnlich). */
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000
/** Obergrenze der „schon gesehen"-Schlüssel (älteste fliegen raus). */
const MAX_KEYS = 1000

export const normalizeFeedUrl = (raw: string) => raw.trim().replace(/^webcal:\/\//i, 'https://')

/** Feed über die Edge-Function laden (umgeht CORS). null = Function nicht
 *  erreichbar/konfiguriert → Aufrufer versucht den direkten Weg. */
async function viaProxy(url: string): Promise<string | null> {
  if (!supabase || !useSync.getState().user) return null
  const { data, error } = await supabase.functions.invoke<{ ics?: string; error?: string }>(
    'fetch-ics',
    { body: { url } },
  )
  if (error) {
    // Function hat geantwortet (4xx/5xx) → konkreten Grund melden.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null)
      if (body && typeof body.error === 'string') throw new Error(body.error)
    }
    return null // nicht deployt / Netzwerk → direkter Versuch
  }
  if (data?.error) throw new Error(data.error)
  return data?.ics ?? null
}

/** ICS-Text einer Feed-Adresse laden: erst Proxy, dann direkter Fetch
 *  (letzterer klappt nur bei CORS-freundlichen Servern). */
export async function fetchIcsText(rawUrl: string): Promise<string> {
  const url = normalizeFeedUrl(rawUrl)
  const proxied = await viaProxy(url)
  if (proxied !== null) return proxied
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Der Kalender-Server antwortete mit ${res.status}.`)
  const text = await res.text()
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Die Adresse liefert keinen Kalender (ICS).')
  return text
}

/** Feed abonnieren (idempotent: gleiche URL → bestehender Feed).
 *  seedKeys: bereits beim Verbinden sichtbare Termine – sie gelten als
 *  „gesehen", damit der erste Auto-Abgleich nichts doppelt anlegt. */
export async function addFeed(rawUrl: string, opts?: { seedKeys?: string[] }): Promise<IcsFeed> {
  const url = normalizeFeedUrl(rawUrl)
  const existing = (await db.icsFeeds.toArray()).find((f) => f.url === url)
  if (existing) return existing
  let label = url
  try {
    label = new URL(url).hostname
  } catch {
    /* Label bleibt die URL */
  }
  const feed: IcsFeed = {
    id: uid(),
    url,
    label,
    createdAt: new Date().toISOString(),
    lastSyncAt: new Date().toISOString(), // gerade eben importiert
    importedKeys: (opts?.seedKeys ?? []).slice(-MAX_KEYS),
  }
  await db.icsFeeds.add(feed)
  return feed
}

export async function removeFeed(id: string): Promise<void> {
  await db.icsFeeds.delete(id)
}

let running = false

/**
 * Alle fälligen Feeds abgleichen. Läuft beim App-Start und bei Rückkehr zur
 * App; pro Feed höchstens alle 6 h (force überspringt das Throttle).
 * Fehler landen als lastError am Feed, nie als Exception beim Aufrufer.
 */
export async function syncIcsFeeds(opts?: { force?: boolean; feedId?: string }): Promise<void> {
  if (running) return
  running = true
  try {
    const feeds = await db.icsFeeds.toArray()
    const due = feeds.filter(
      (f) =>
        (!opts?.feedId || f.id === opts.feedId) &&
        (opts?.force ||
          !f.lastSyncAt ||
          Date.now() - new Date(f.lastSyncAt).getTime() > SYNC_INTERVAL_MS),
    )
    if (due.length === 0) return

    const semester = (await db.semesters.toArray()).find((s) => s.active)
    if (!semester) return

    for (const feed of due) {
      try {
        const [courses, tasks] = await Promise.all([
          db.courses.where('semesterId').equals(semester.id).toArray(),
          db.tasks.where('semesterId').equals(semester.id).toArray(),
        ])
        const events = parseICS(await fetchIcsText(feed.url))
        const plan = planImport(events, semester, courses, tasks)

        // Nur wirklich Neues und nur Zukünftiges (alte Fristen wären Rauschen).
        const known = new Set(feed.importedKeys ?? [])
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const fresh = plan.deadlines.filter(
          (d) => !known.has(deadlineKey(d.title, d.dueDate)) && new Date(d.dueDate) >= todayStart,
        )
        for (const d of fresh) {
          await createTask({
            semesterId: semester.id,
            title: d.title,
            type: d.type,
            courseId: d.courseId,
            dueDate: d.dueDate,
          })
        }

        // ALLE aktuell im Feed sichtbaren Termine als „gesehen" merken – auch
        // übersprungene/vergangene, damit nichts später doch noch auftaucht.
        const merged = Array.from(new Set([...known, ...deadlineKeysOf(events)])).slice(-MAX_KEYS)
        await db.icsFeeds.put({
          ...feed,
          lastSyncAt: new Date().toISOString(),
          lastError: undefined,
          lastNewCount: fresh.length,
          importedKeys: merged,
        })
      } catch (e) {
        await db.icsFeeds.put({
          ...feed,
          lastSyncAt: new Date().toISOString(),
          lastError: e instanceof Error && e.message ? e.message : 'Abgleich fehlgeschlagen.',
        })
      }
    }
  } finally {
    running = false
  }
}
