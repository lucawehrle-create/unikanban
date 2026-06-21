import type { TaskTypeId } from '@/db/types'

/** Aufgabentypen, bei denen nach dem Erledigen reflektiert wird. */
const REFLECTABLE: TaskTypeId[] = ['uebung', 'tutoriumsblatt', 'altklausur']

export function isReflectableType(type: TaskTypeId): boolean {
  return REFLECTABLE.includes(type)
}

/** Kuratierte Tag-Vorschläge (der Nutzer kann eigene ergänzen). */
export const PRESET_TAGS = [
  'Beweise',
  'Rechnen',
  'Konzept unklar',
  'Definitionen',
  'Transfer/Anwendung',
  'Zeitdruck',
  'Flüchtigkeitsfehler',
  'Hilfe gebraucht',
  'Selbstständig gelöst',
] as const

/** Ab dieser Schwierigkeit gilt ein Blatt als „schwer" (Lernplan-Vorauswahl). */
export const HARD_THRESHOLD = 3

export interface DifficultyMeta {
  label: string
  color: string
}

/** 1 (leicht) … 5 (schwer) – Beschriftung und Farbe (grün → rot). */
export const DIFFICULTY: Record<number, DifficultyMeta> = {
  1: { label: 'sehr leicht', color: '#10b981' },
  2: { label: 'leicht', color: '#84cc16' },
  3: { label: 'mittel', color: '#f59e0b' },
  4: { label: 'schwer', color: '#f97316' },
  5: { label: 'sehr schwer', color: '#ef4444' },
}

export function difficultyMeta(d: number): DifficultyMeta {
  return DIFFICULTY[Math.min(5, Math.max(1, Math.round(d)))]
}
