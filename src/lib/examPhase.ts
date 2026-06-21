import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { ExamPhase, Semester, Task } from '@/db/types'
import { useActiveSemester, useTasks } from '@/hooks/data'

export interface ExamStatus {
  /** Laufende oder nächste (noch nicht vergangene) Klausurphase. */
  phase?: ExamPhase
  /** Läuft die Phase gerade? */
  active: boolean
  /** Tage bis Phasenbeginn (nur sinnvoll, wenn nicht aktiv). */
  daysUntilStart: number
  /** Tag X von Y (nur wenn aktiv). */
  dayNum: number
  totalDays: number
  /** Verbleibende Tage der laufenden Phase. */
  daysLeft: number
  /** Anstehende Klausuren (Typ 'klausur', offen, ab heute), nach Datum sortiert. */
  exams: Task[]
  /** Tage bis zur nächsten Klausur (oder null). */
  nextExamInDays: number | null
}

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function computeExamStatus(
  semester: Semester | undefined,
  tasks: Task[],
): ExamStatus | null {
  if (!semester) return null
  const today = new Date()

  const phases = [...(semester.examPhases ?? [])].sort((a, b) => a.start.localeCompare(b.start))
  // Erste Phase, die noch nicht komplett vorbei ist.
  const phase = phases.find((p) => differenceInCalendarDays(parseISO(p.end), today) >= 0)

  let active = false
  let daysUntilStart = 0
  let dayNum = 0
  let totalDays = 0
  let daysLeft = 0
  if (phase) {
    const dStart = differenceInCalendarDays(parseISO(phase.start), today)
    const dEnd = differenceInCalendarDays(parseISO(phase.end), today)
    active = dStart <= 0 && dEnd >= 0
    daysUntilStart = Math.max(0, dStart)
    totalDays = differenceInCalendarDays(parseISO(phase.end), parseISO(phase.start)) + 1
    dayNum = Math.min(totalDays, Math.max(1, totalDays - dEnd))
    daysLeft = Math.max(0, dEnd)
  }

  const startMs = startOfTodayMs()
  const exams = tasks
    .filter(
      (t) =>
        t.type === 'klausur' &&
        t.status !== 'erledigt' &&
        !!t.dueDate &&
        parseISO(t.dueDate).getTime() >= startMs,
    )
    .sort((a, b) => parseISO(a.dueDate!).getTime() - parseISO(b.dueDate!).getTime())

  const nextExamInDays = exams.length
    ? Math.max(0, differenceInCalendarDays(parseISO(exams[0].dueDate!), today))
    : null

  // Nichts Relevantes → kein Panel/Badge.
  if (!phase && exams.length === 0) return null

  return { phase, active, daysUntilStart, dayNum, totalDays, daysLeft, exams, nextExamInDays }
}

export function useExamStatus(): ExamStatus | null {
  const semester = useActiveSemester()
  const tasks = useTasks(semester?.id)
  return computeExamStatus(semester, tasks)
}

/** Kompaktes Badge-Label für die Navigation – nur bei aktueller Relevanz (≤14 Tage). */
export function examBadge(s: ExamStatus | null): string | null {
  if (!s) return null
  if (s.active) return 'läuft'
  if (s.nextExamInDays != null && s.nextExamInDays <= 14) {
    return s.nextExamInDays === 0 ? 'heute' : `${s.nextExamInDays} T`
  }
  if (s.phase && s.daysUntilStart <= 14) {
    return s.daysUntilStart === 0 ? 'heute' : `${s.daysUntilStart} T`
  }
  return null
}
