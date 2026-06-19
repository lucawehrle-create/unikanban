import type { Course, Program } from '@/db/types'

export interface ProgramStats {
  targetEcts: number
  /** abgeschlossene (bestandene) ECTS inkl. Startbilanz. */
  doneEcts: number
  /** zusätzlich aktuell laufende ECTS. */
  runningEcts: number
  /** gewichteter Notenschnitt inkl. Startbilanz (oder undefined). */
  gradeAvg?: number
  /** Anzahl benoteter, bestandener Kurse (ohne Startbilanz). */
  gradedCourses: number
  /** Fortschritt 0–1 Richtung Ziel-ECTS. */
  progress: number
}

/**
 * Aggregiert die Studienakte eines Studiengangs aus allen seinen Kursen
 * (über alle Semester) plus der optionalen Startbilanz (Quereinstieg).
 */
export function computeProgramStats(program: Program, courses: Course[]): ProgramStats {
  let doneEcts = program.priorEcts ?? 0
  let runningEcts = 0

  // gewichteter Schnitt: Startbilanz nur einbeziehen, wenn auch ein Schnitt angegeben
  // wurde (sonst würde ein 0er-Schnitt fälschlich als 0,0 erscheinen).
  const hasPrior = program.priorGradeAvg != null && (program.priorGradedEcts ?? 0) > 0
  let gradeNum = hasPrior ? program.priorGradeAvg! * program.priorGradedEcts! : 0
  let gradeDen = hasPrior ? program.priorGradedEcts! : 0
  let gradedCourses = 0

  for (const c of courses) {
    const ects = c.ects ?? 0
    const status = c.status ?? 'laufend'
    if (status === 'bestanden') {
      doneEcts += ects
      if (typeof c.grade === 'number' && ects > 0) {
        gradeNum += c.grade * ects
        gradeDen += ects
        gradedCourses++
      }
    } else if (status === 'laufend') {
      runningEcts += ects
    }
    // 'nicht_bestanden' zählt nicht zu ECTS
  }

  return {
    targetEcts: program.targetEcts,
    doneEcts,
    runningEcts,
    gradeAvg: gradeDen > 0 ? gradeNum / gradeDen : undefined,
    gradedCourses,
    progress: program.targetEcts > 0 ? Math.min(1, doneEcts / program.targetEcts) : 0,
  }
}

export const PROGRAM_TYPE_LABEL: Record<Program['type'], string> = {
  bachelor: 'Bachelor',
  master: 'Master',
  other: 'Studium',
}

/** Note schön formatiert (1.7 → "1,7"). */
export function fmtGrade(g?: number): string {
  return g == null ? '–' : g.toFixed(1).replace('.', ',')
}
