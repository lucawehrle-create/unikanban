import { addDays, parse as parseDate, isValid } from 'date-fns'
import type { Course, Priority, TaskTypeId } from '@/db/types'
import { matchTaskType } from './taskTypes'

export interface QuickAddDraft {
  title: string
  courseId?: string
  /** Kurs wurde aus dem Fließtext erkannt (nicht per # gesetzt). */
  courseAuto?: boolean
  type?: TaskTypeId
  /** Art wurde aus Titelwörtern erkannt (nicht per @ gesetzt). */
  typeAuto?: boolean
  dueDate?: string
  /** Frist wurde aus dem Fließtext erkannt (nicht per ! gesetzt). */
  dueAuto?: boolean
  priority?: Priority
  /** Priorität wurde aus dem Fließtext erkannt (nicht per p1/p2/p3 gesetzt). */
  priorityAuto?: boolean
}

const WEEKDAYS: Record<string, number> = {
  // JS getDay(): 0=So … 6=Sa
  so: 0, son: 0, sonntag: 0,
  mo: 1, mon: 1, montag: 1,
  di: 2, die: 2, dienstag: 2,
  mi: 3, mit: 3, mittwoch: 3,
  do: 4, don: 4, donnerstag: 4,
  fr: 5, fre: 5, freitag: 5,
  sa: 6, sam: 6, samstag: 6,
}

/** Nächstes Vorkommen eines Wochentags (heute eingeschlossen). */
function nextWeekday(target: number, from = new Date()): Date {
  const diff = (target - from.getDay() + 7) % 7
  return addDays(from, diff)
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 0, 0)
  return x
}

function parseDateToken(tokenRaw: string): string | undefined {
  const token = tokenRaw.toLowerCase()
  const today = new Date()

  if (token === 'heute') return endOfDay(today).toISOString()
  if (token === 'morgen') return endOfDay(addDays(today, 1)).toISOString()
  if (token === 'übermorgen' || token === 'uebermorgen')
    return endOfDay(addDays(today, 2)).toISOString()

  if (token in WEEKDAYS) {
    return endOfDay(nextWeekday(WEEKDAYS[token])).toISOString()
  }

  // Datumsformate – date-fns validiert streng (kein stilles Überrollen wie 29.2.)
  for (const fmt of ['d.M.yyyy', 'd.M.', 'd.M']) {
    const d = parseDate(token, fmt, today)
    if (!isValid(d)) continue
    // Ohne Jahresangabe: liegt das Datum (Kalendertag) vor heute, ist das
    // nächste Jahr gemeint (z. B. „1.1." im Dezember → kommender Januar).
    if (!fmt.includes('yyyy')) {
      const dDay = new Date(d)
      dDay.setHours(0, 0, 0, 0)
      const tDay = new Date(today)
      tDay.setHours(0, 0, 0, 0)
      if (dDay.getTime() < tDay.getTime()) d.setFullYear(d.getFullYear() + 1)
    }
    return endOfDay(d).toISOString()
  }
  return undefined
}

// Wörter, die im Fließtext eine darauffolgende Frist einleiten („… bis Freitag“).
const DATE_PREPOSITIONS = new Set(['bis', 'am', 'zum', 'fällig', 'faellig', 'deadline'])
// Eindeutige Relativ-Tage, die auch allein im Text als Frist gelten dürfen.
const RELATIVE_DAYS = new Set(['heute', 'morgen', 'übermorgen', 'uebermorgen'])
// Eigenständiges numerisches Datum („3.7.“, „12.07.2026“).
const NUMERIC_DATE = /^\d{1,2}\.\d{1,2}\.?(\d{2,4})?$/

function stripWord(w: string): string {
  return w.toLowerCase().replace(/[^a-zäöüß]/g, '')
}

/** Normalisiert ein Wort für Vergleiche (Kürzel/Namen): klein, ohne Satzzeichen. */
function normTok(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')
}

// Umgangssprachliche Prioritäts-Wörter (Präfix-Match, also auch „wichtige“ etc.).
const PRIO_WORDS: Array<{ prefix: string; prio: Priority }> = [
  { prefix: 'dringend', prio: 'hoch' },
  { prefix: 'wichtig', prio: 'hoch' },
  { prefix: 'eilig', prio: 'hoch' },
  { prefix: 'asap', prio: 'hoch' },
  { prefix: 'urgent', prio: 'hoch' },
  { prefix: 'unwichtig', prio: 'niedrig' },
  { prefix: 'optional', prio: 'niedrig' },
  { prefix: 'irgendwann', prio: 'niedrig' },
]

/**
 * Erkennt den Kurs aus dem Fließtext – ohne `#`. Zwei Stufen, beide
 * fehlerkennungs-arm: (1) ein Wort entspricht exakt einem Kürzel; (2) ein Wort
 * (≥ 4 Zeichen) kommt als Namenswort genau EINES Kurses vor (mehrdeutige
 * Treffer werden verworfen → dann hilft `#`). Gibt zusätzlich den Wort-Index
 * zurück, damit das erkannte Wort aus dem Titel entfernt werden kann.
 */
function detectCourse(words: string[], courses: Course[]): { courseId: string; idx: number } | undefined {
  for (let i = 0; i < words.length; i++) {
    const s = normTok(words[i])
    if (!s) continue
    const c = courses.find((c) => normTok(c.short) === s)
    if (c) return { courseId: c.id, idx: i }
  }
  const hits = new Map<string, number>()
  for (let i = 0; i < words.length; i++) {
    const s = normTok(words[i])
    if (s.length < 4) continue
    for (const c of courses) {
      if (c.name.toLowerCase().split(/\s+/).map(normTok).includes(s) && !hits.has(c.id)) {
        hits.set(c.id, i)
      }
    }
  }
  if (hits.size !== 1) return undefined
  const [courseId, idx] = [...hits][0]
  return { courseId, idx }
}

/** Erkennt eine umgangssprachliche Priorität aus dem Fließtext (ohne p1/p2/p3). */
function detectPriority(words: string[]): { prio: Priority; idx: number } | undefined {
  for (let i = 0; i < words.length; i++) {
    const s = normTok(words[i])
    for (const { prefix, prio } of PRIO_WORDS) {
      if (s.startsWith(prefix)) return { prio, idx: i }
    }
  }
  return undefined
}

/**
 * Erkennt eine natürlich formulierte Frist im Titel – ohne `!`. Konservativ,
 * um Fehlerkennung zu vermeiden: entweder eine Präposition + Datumswort
 * („bis Freitag“, „am 3.7.“) oder ein eigenständiges numerisches Datum
 * („3.7.“). Bare Wochentage allein lösen NICHT aus (zu fehleranfällig).
 * Gibt die Frist und den um die Datumswörter bereinigten Titel zurück.
 */
function extractTitleDate(words: string[]): { dueDate?: string; rest: string[] } {
  for (let i = 0; i < words.length; i++) {
    const curLow = words[i].toLowerCase().replace(/[.,;:]+$/, '')
    if (DATE_PREPOSITIONS.has(curLow) && i + 1 < words.length) {
      const nextRaw = words[i + 1].replace(/[.,;:]+$/, '')
      const due = parseDateToken(nextRaw)
      if (due) return { dueDate: due, rest: words.slice(0, i).concat(words.slice(i + 2)) }
    }
    if (NUMERIC_DATE.test(words[i]) || RELATIVE_DAYS.has(curLow)) {
      const due = parseDateToken(NUMERIC_DATE.test(words[i]) ? words[i] : curLow)
      if (due) return { dueDate: due, rest: words.slice(0, i).concat(words.slice(i + 1)) }
    }
  }
  return { rest: words }
}

/**
 * Parst eine Schnell-Erfassen-Zeile.
 *   #kurs   → Kurs (über Kürzel oder Name)
 *   @typ    → Aufgaben-Typ
 *   !datum  → Fälligkeit (mo/di/.., heute/morgen, 12.07.)
 * Alles übrige wird zum Titel. Zusätzlich werden Aufgaben-Art (aus Stichwörtern
 * wie „Übungsblatt“, „Hausarbeit“) und natürliche Fristen („bis Freitag“) auch
 * ohne ausdrückliches @/! erkannt – ein explizites @typ/!datum hat Vorrang.
 */
export function parseQuickAdd(raw: string, courses: Course[]): QuickAddDraft {
  const draft: QuickAddDraft = { title: '' }
  const titleParts: string[] = []

  for (const word of raw.trim().split(/\s+/)) {
    if (!word) continue
    const prefix = word[0]
    const rest = word.slice(1)

    if (prefix === '#' && rest) {
      const needle = rest.toLowerCase()
      const match = courses.find(
        (c) =>
          c.short.toLowerCase() === needle ||
          c.short.toLowerCase().startsWith(needle) ||
          c.name.toLowerCase().includes(needle),
      )
      if (match) {
        draft.courseId = match.id
        continue
      }
    } else if (prefix === '@' && rest) {
      const type = matchTaskType(rest)
      if (type) {
        draft.type = type
        continue
      }
    } else if (prefix === '!' && rest) {
      const due = parseDateToken(rest)
      if (due) {
        draft.dueDate = due
        continue
      }
    } else if (/^p[1-3]$/i.test(word)) {
      draft.priority = word.toLowerCase() === 'p1' ? 'hoch' : word.toLowerCase() === 'p2' ? 'mittel' : 'niedrig'
      continue
    }
    titleParts.push(word)
  }

  let words = titleParts
  // Natürliche Frist im Titel – nur, wenn keine ausdrückliche !-Frist gesetzt ist.
  if (!draft.dueDate) {
    const { dueDate, rest } = extractTitleDate(words)
    if (dueDate) {
      draft.dueDate = dueDate
      draft.dueAuto = true
      words = rest
    }
  }
  // Auto-erkannte Wörter werden – wie ein ausdrückliches #/@/!/p – aus dem Titel
  // entfernt und nur als Tag gezeigt. Ihre Indizes sammeln wir hier ein.
  const remove = new Set<number>()

  // Kurs aus dem Fließtext – nur, wenn kein ausdrücklicher #kurs gesetzt ist.
  if (!draft.courseId) {
    const hit = detectCourse(words, courses)
    if (hit) {
      draft.courseId = hit.courseId
      draft.courseAuto = true
      remove.add(hit.idx)
    }
  }
  // Priorität aus dem Fließtext – nur, wenn kein ausdrückliches p1/p2/p3.
  if (!draft.priority) {
    const hit = detectPriority(words)
    if (hit) {
      draft.priority = hit.prio
      draft.priorityAuto = true
      remove.add(hit.idx)
    }
  }
  // Aufgaben-Art aus Titelwörtern – nur, wenn kein ausdrückliches @typ gesetzt
  // ist. Kurze Stichwörter (< 3 Zeichen) ignorieren, um Fehlerkennung zu
  // vermeiden.
  if (!draft.type) {
    for (let i = 0; i < words.length; i++) {
      const s = stripWord(words[i])
      if (s.length < 3) continue
      const t = matchTaskType(s)
      if (t) {
        draft.type = t
        draft.typeAuto = true
        remove.add(i)
        break
      }
    }
  }

  // Erkannte Metadaten-Wörter aus dem Titel streichen. Bleibt dadurch nichts
  // übrig (reine Metadaten-Eingabe), den vollen Text als Titel behalten, damit
  // immer ein Titel da ist.
  const titleWords = words.filter((_, i) => !remove.has(i))
  draft.title = (titleWords.length ? titleWords : words).join(' ').trim()
  return draft
}
