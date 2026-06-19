import type { Task } from '@/db/types'
import { dueSortKey } from './deadline'

/**
 * Staffelt Serien-Aufgaben: pro Serie (recurringId) werden nur die nächsten
 * `limit` noch offenen Aufgaben behalten. Erledigte/begonnene und manuelle
 * Aufgaben (ohne recurringId) bleiben immer erhalten. Wird auf Board und
 * "Diese Woche" angewandt, damit nicht alle Wochen auf einmal erscheinen.
 */
export function staggerSeries(tasks: Task[], limit: number): Task[] {
  const openBySeries = new Map<string, Task[]>()
  for (const t of tasks) {
    if (t.recurringId && t.status === 'offen') {
      const arr = openBySeries.get(t.recurringId) ?? []
      arr.push(t)
      openBySeries.set(t.recurringId, arr)
    }
  }
  const allowed = new Set<string>()
  for (const arr of openBySeries.values()) {
    arr.sort((a, b) => dueSortKey(a.dueDate) - dueSortKey(b.dueDate))
    for (const t of arr.slice(0, limit)) allowed.add(t.id)
  }
  return tasks.filter((t) => !(t.recurringId && t.status === 'offen') || allowed.has(t.id))
}
