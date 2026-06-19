import type { Priority } from '@/db/types'

export interface PriorityDef {
  id: Priority
  label: string
  color: string
  /** Rang für Sortierung/Gruppierung (höher = wichtiger). */
  rank: number
}

export const PRIORITIES: PriorityDef[] = [
  { id: 'hoch', label: 'Hoch', color: '#ef4444', rank: 3 },
  { id: 'mittel', label: 'Mittel', color: '#f59e0b', rank: 2 },
  { id: 'niedrig', label: 'Niedrig', color: '#64748b', rank: 1 },
]

const byId = new Map(PRIORITIES.map((p) => [p.id, p]))

export function priorityMeta(p?: Priority): PriorityDef | undefined {
  return p ? byId.get(p) : undefined
}

export function priorityRank(p?: Priority): number {
  return p ? (byId.get(p)?.rank ?? 0) : 0
}

/** Schnell-Erfassen-Token p1/p2/p3 → Priorität. */
export function matchPriority(token: string): Priority | undefined {
  const t = token.toLowerCase()
  if (t === 'p1' || t === 'hoch' || t === 'h') return 'hoch'
  if (t === 'p2' || t === 'mittel' || t === 'm') return 'mittel'
  if (t === 'p3' || t === 'niedrig' || t === 'n') return 'niedrig'
  return undefined
}
