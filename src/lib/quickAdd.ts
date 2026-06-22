import { addDays, parse as parseDate, isValid } from 'date-fns'
import type { Course, Priority, TaskTypeId } from '@/db/types'
import { matchTaskType } from './taskTypes'

export interface QuickAddDraft {
  title: string
  courseId?: string
  type?: TaskTypeId
  dueDate?: string
  priority?: Priority
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

/**
 * Parst eine Schnell-Erfassen-Zeile.
 *   #kurs   → Kurs (über Kürzel oder Name)
 *   @typ    → Aufgaben-Typ
 *   !datum  → Fälligkeit (mo/di/.., heute/morgen, 12.07.)
 * Alles übrige wird zum Titel.
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

  draft.title = titleParts.join(' ').trim()
  return draft
}
