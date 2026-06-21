import type { Phase, TaskTypeId } from '@/db/types'

export interface TaskTypeDef {
  id: TaskTypeId
  label: string
  emoji: string
  /** Default-Lebenszyklus, der beim Anlegen als Phasen-Checkliste vorbefüllt wird. */
  phases: string[]
  /** Erkennungs-Stichwörter für den Schnell-Erfassen-Parser (@token). */
  keywords: string[]
}

export const TASK_TYPES: Record<TaskTypeId, TaskTypeDef> = {
  uebung: {
    id: 'uebung',
    label: 'Übungsblatt',
    emoji: '📄',
    phases: ['Bearbeitet', 'Abgegeben', 'Korrigiert', 'Verstanden'],
    keywords: ['uebung', 'übung', 'blatt', 'ub', 'sheet', 'uebungsblatt', 'übungsblatt'],
  },
  tutoriumsblatt: {
    id: 'tutoriumsblatt',
    label: 'Tutoriumsblatt',
    emoji: '📑',
    phases: ['Bearbeitet', 'Abgegeben', 'Korrigiert', 'Verstanden'],
    keywords: ['tutoriumsblatt', 'tutblatt', 'tut', 'tutorium'],
  },
  hausarbeit: {
    id: 'hausarbeit',
    label: 'Hausarbeit',
    emoji: '📝',
    phases: ['Recherche', 'Gliederung', 'Rohfassung', 'Korrektur', 'Abgegeben'],
    keywords: ['hausarbeit', 'seminararbeit', 'essay', 'paper', 'ha'],
  },
  referat: {
    id: 'referat',
    label: 'Referat',
    emoji: '🎤',
    phases: ['Recherche', 'Folien', 'Geübt', 'Gehalten'],
    keywords: ['referat', 'praesentation', 'präsentation', 'vortrag', 'talk'],
  },
  lektuere: {
    id: 'lektuere',
    label: 'Lektüre',
    emoji: '📖',
    phases: ['Gelesen'],
    keywords: ['lektuere', 'lektüre', 'reading', 'lesen', 'text'],
  },
  klausur: {
    id: 'klausur',
    label: 'Klausur',
    emoji: '🎓',
    phases: ['Lernplan', 'Altklausuren', 'Geschrieben'],
    keywords: ['klausur', 'pruefung', 'prüfung', 'exam', 'test'],
  },
  altklausur: {
    id: 'altklausur',
    label: 'Altklausur',
    emoji: '🗂️',
    phases: ['Gerechnet', 'Kontrolliert', 'Verstanden'],
    keywords: ['altklausur', 'altklausuren', 'probeklausur', 'altfragen', 'oldexam'],
  },
  karteikarten: {
    id: 'karteikarten',
    label: 'Karteikarten',
    emoji: '🃏',
    phases: ['Erstellt', 'Gelernt'],
    keywords: ['karteikarten', 'karteikarte', 'karten', 'flashcards', 'anki'],
  },
  sonstiges: {
    id: 'sonstiges',
    label: 'Sonstiges',
    emoji: '•',
    phases: [],
    keywords: ['sonstiges', 'todo', 'misc'],
  },
}

export const TASK_TYPE_LIST: TaskTypeDef[] = Object.values(TASK_TYPES)

/**
 * Vom Nutzer wählbare Aufgabentypen. „Klausur" ist ein Termin (wird am Kurs
 * gepflegt), keine Aufgabe – daher hier ausgenommen.
 */
export const SELECTABLE_TASK_TYPES: TaskTypeDef[] = TASK_TYPE_LIST.filter(
  (t) => t.id !== 'klausur',
)

/** Erzeugt frische Phasen-Objekte für einen Aufgaben-Typ. */
export function makePhases(type: TaskTypeId): Phase[] {
  return TASK_TYPES[type].phases.map((label) => ({ label, done: false }))
}

/** Findet einen wählbaren Typ anhand eines @tokens (z.B. "übung", "ha"). */
export function matchTaskType(token: string): TaskTypeId | undefined {
  const t = token.toLowerCase()
  for (const def of SELECTABLE_TASK_TYPES) {
    if (def.id === t || def.keywords.includes(t)) return def.id
  }
  return undefined
}
