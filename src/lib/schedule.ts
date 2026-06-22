import type { Course } from '@/db/types'

// Tagesfenster, in dem Lern-Sessions liegen dürfen.
const DAY_START = 8 * 60 // 08:00
const DAY_END = 22 * 60 // 22:00

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

export interface FreeBlock {
  start: number
  end: number
} // Minuten ab Mitternacht

/** Belegte (zusammengeführte) Intervalle eines Wochentags aus allen Stundenplan-Slots. */
function busyIntervals(courses: Course[], weekday: number): [number, number][] {
  const raw: [number, number][] = []
  for (const c of courses) {
    for (const s of c.slots) {
      if (s.weekday === weekday) raw.push([toMin(s.start), toMin(s.end)])
    }
  }
  raw.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const iv of raw) {
    const last = merged[merged.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else merged.push([iv[0], iv[1]])
  }
  return merged
}

/** Freie Blöcke (≥ minDuration Minuten) an einem Datum, außerhalb der Vorlesungen. */
export function freeBlocks(courses: Course[], date: Date, minDuration = 60): FreeBlock[] {
  const busy = busyIntervals(courses, isoWeekday(date))
  const blocks: FreeBlock[] = []
  let cur = DAY_START
  for (const [bs, be] of busy) {
    if (bs - cur >= minDuration) blocks.push({ start: cur, end: bs })
    cur = Math.max(cur, be)
  }
  if (DAY_END - cur >= minDuration) blocks.push({ start: cur, end: DAY_END })
  return blocks
}

/**
 * Beste Start-Minute für eine Session an einem Tag: bevorzugt einen freien Block
 * ab der Wunschzeit; sonst den frühesten freien Block; sonst die Wunschzeit
 * (Fallback, falls der Tag voll ist).
 */
export function pickSessionTime(
  courses: Course[],
  date: Date,
  preferredMin: number,
  duration = 60,
): number {
  const blocks = freeBlocks(courses, date, duration)
  if (blocks.length === 0) return preferredMin
  for (const b of blocks) {
    const s = Math.max(b.start, preferredMin)
    if (s + duration <= b.end) return s
  }
  // Kein passender Block: Wunschzeit respektieren (≥ frühester Block), damit
  // beim sequentiellen Platzieren mehrere Sessions nicht auf derselben Minute
  // landen, sondern hintereinander.
  return Math.max(blocks[0].start, preferredMin)
}
