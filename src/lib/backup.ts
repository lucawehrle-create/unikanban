import { db } from '@/db/db'
import type { Attendance, Course, IcsFeed, Program, Semester, Task } from '@/db/types'
import { TASK_TYPES } from './taskTypes'

const BACKUP_VERSION = 1

/** Robustheit beim Import fremder/älterer Backups: unbekannte Aufgabentypen auf
 *  'sonstiges' zurückfallen (sonst wirft ein späteres TASK_TYPES[type].emoji und
 *  weißt den Bildschirm) und Pflichtfelder wie phases absichern. */
function sanitizeTask(t: Task): Task {
  return {
    ...t,
    type: t.type in TASK_TYPES ? t.type : 'sonstiges',
    phases: Array.isArray(t.phases) ? t.phases : [],
  }
}

export interface Backup {
  app: 'semban' | 'unikanban'
  version: number
  exportedAt: string
  programs: Program[]
  semesters: Semester[]
  courses: Course[]
  tasks: Task[]
  attendance: Attendance[]
  /** Abonnierte Uni-Kalender (ab v6; ältere Backups haben das Feld nicht). */
  icsFeeds?: IcsFeed[]
}

/** Liest den gesamten Datenbestand in ein Backup-Objekt. */
export async function exportData(): Promise<Backup> {
  const [programs, semesters, courses, tasks, attendance, icsFeeds] = await Promise.all([
    db.programs.toArray(),
    db.semesters.toArray(),
    db.courses.toArray(),
    db.tasks.toArray(),
    db.attendance.toArray(),
    db.icsFeeds.toArray(),
  ])
  return {
    app: 'semban',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    programs,
    semesters,
    courses,
    tasks,
    attendance,
    icsFeeds,
  }
}

/** Lädt das Backup als .json-Datei herunter. */
export async function downloadBackup(): Promise<void> {
  const data = await exportData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `semban-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isBackup(x: unknown): x is Backup {
  const b = x as Partial<Backup>
  return (
    !!b &&
    (b.app === 'semban' || b.app === 'unikanban') &&
    Array.isArray(b.programs) &&
    Array.isArray(b.semesters) &&
    Array.isArray(b.courses) &&
    Array.isArray(b.tasks)
  )
}

/** Ersetzt den gesamten Datenbestand durch das Backup (vorher alles löschen). */
export async function importBackup(raw: string): Promise<void> {
  const data: unknown = JSON.parse(raw)
  if (!isBackup(data)) throw new Error('Ungültige Backup-Datei.')
  await db.transaction(
    'rw',
    [db.programs, db.semesters, db.courses, db.tasks, db.attendance, db.icsFeeds],
    async () => {
      await Promise.all([
        db.programs.clear(),
        db.semesters.clear(),
        db.courses.clear(),
        db.tasks.clear(),
        db.attendance.clear(),
        db.icsFeeds.clear(),
      ])
      await db.programs.bulkAdd(data.programs)
      await db.semesters.bulkAdd(data.semesters)
      await db.courses.bulkAdd(data.courses)
      await db.tasks.bulkAdd(data.tasks.map(sanitizeTask))
      await db.attendance.bulkAdd(data.attendance ?? [])
      await db.icsFeeds.bulkAdd(data.icsFeeds ?? [])
    },
  )
}

/** Löscht den gesamten Datenbestand (Zurücksetzen → Onboarding). */
export async function resetAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.programs, db.semesters, db.courses, db.tasks, db.attendance, db.icsFeeds],
    async () => {
      await Promise.all([
        db.programs.clear(),
        db.semesters.clear(),
        db.courses.clear(),
        db.tasks.clear(),
        db.attendance.clear(),
        db.icsFeeds.clear(),
      ])
    },
  )
}
