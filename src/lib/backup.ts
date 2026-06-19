import { db } from '@/db/db'
import type { Attendance, Course, Program, Semester, Task } from '@/db/types'

const BACKUP_VERSION = 1

export interface Backup {
  app: 'unikanban'
  version: number
  exportedAt: string
  programs: Program[]
  semesters: Semester[]
  courses: Course[]
  tasks: Task[]
  attendance: Attendance[]
}

/** Liest den gesamten Datenbestand in ein Backup-Objekt. */
export async function exportData(): Promise<Backup> {
  const [programs, semesters, courses, tasks, attendance] = await Promise.all([
    db.programs.toArray(),
    db.semesters.toArray(),
    db.courses.toArray(),
    db.tasks.toArray(),
    db.attendance.toArray(),
  ])
  return {
    app: 'unikanban',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    programs,
    semesters,
    courses,
    tasks,
    attendance,
  }
}

/** Lädt das Backup als .json-Datei herunter. */
export async function downloadBackup(): Promise<void> {
  const data = await exportData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `unikanban-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isBackup(x: unknown): x is Backup {
  const b = x as Partial<Backup>
  return (
    !!b &&
    b.app === 'unikanban' &&
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
  await db.transaction('rw', db.programs, db.semesters, db.courses, db.tasks, db.attendance, async () => {
    await Promise.all([
      db.programs.clear(),
      db.semesters.clear(),
      db.courses.clear(),
      db.tasks.clear(),
      db.attendance.clear(),
    ])
    await db.programs.bulkAdd(data.programs)
    await db.semesters.bulkAdd(data.semesters)
    await db.courses.bulkAdd(data.courses)
    await db.tasks.bulkAdd(data.tasks)
    await db.attendance.bulkAdd(data.attendance ?? [])
  })
}

/** Löscht den gesamten Datenbestand (Zurücksetzen → Onboarding). */
export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.programs, db.semesters, db.courses, db.tasks, db.attendance, async () => {
    await Promise.all([
      db.programs.clear(),
      db.semesters.clear(),
      db.courses.clear(),
      db.tasks.clear(),
      db.attendance.clear(),
    ])
  })
}
