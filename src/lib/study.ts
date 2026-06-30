import type { Course, Program } from '@/db/types'

export interface ProgramStats {
  targetEcts: number
  /** abgeschlossene (bestandene) ECTS inkl. Startbilanz. */
  doneEcts: number
  /** zusätzlich aktuell laufende ECTS. */
  runningEcts: number
  /** gewichteter Notenschnitt inkl. Startbilanz (oder undefined). */
  gradeAvg?: number
  /** benotete, bestandene ECTS inkl. Startbilanz (Basis des Schnitts). */
  gradedEcts: number
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
    gradedEcts: gradeDen,
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

// --- Notenprognose ---------------------------------------------------------

export interface Forecast {
  /** Bereits benotete ECTS (Basis des aktuellen Schnitts). */
  gradedEcts: number
  /** Angenommene benotete ECTS am Ende (≈ Ziel; mind. die schon benoteten). */
  finalEcts: number
  /** Noch zu benotende ECTS bis zum Ziel. */
  remainingEcts: number
  /** Aktueller Schnitt (oder undefined, wenn noch keine Note). */
  current?: number
}

export function getForecast(stats: ProgramStats): Forecast {
  const gradedEcts = stats.gradedEcts
  const finalEcts = Math.max(stats.targetEcts, gradedEcts)
  return {
    gradedEcts,
    finalEcts,
    remainingEcts: Math.max(0, finalEcts - gradedEcts),
    current: stats.gradeAvg,
  }
}

export type NeededStatus = 'ok' | 'secured' | 'impossible' | 'done'

/**
 * Welchen Ø brauchst du in den restlichen ECTS, um den Ziel-Schnitt zu
 * erreichen? Gewichtet identisch zum Gesamtschnitt (ECTS-gewichtet).
 */
export function neededForTarget(
  stats: ProgramStats,
  targetGrade: number,
): { needed: number; status: NeededStatus } {
  const f = getForecast(stats)
  const sum = (stats.gradeAvg ?? 0) * f.gradedEcts
  if (f.remainingEcts <= 0) return { needed: stats.gradeAvg ?? targetGrade, status: 'done' }
  const needed = (targetGrade * f.finalEcts - sum) / f.remainingEcts
  // Notenskala 1,0 (beste) … 4,0 (gerade bestanden). needed < 1,0 → selbst mit
  // lauter 1,0ern unerreichbar; needed > 4,0 → selbst mit 4,0 schon sicher.
  let status: NeededStatus = 'ok'
  if (needed > 4.0) status = 'secured'
  else if (needed < 1.0) status = 'impossible'
  return { needed, status }
}

/** Voraussichtlicher Endschnitt, wenn der Rest im Ø `assumed` benotet wird. */
export function projectedFinal(stats: ProgramStats, assumed: number): number {
  const f = getForecast(stats)
  if (f.finalEcts <= 0) return assumed
  const sum = (stats.gradeAvg ?? 0) * f.gradedEcts
  return (sum + assumed * f.remainingEcts) / f.finalEcts
}

/**
 * Bestmöglicher und schlechtest-bestehender Endschnitt (Rest komplett 1,0 bzw.
 * 4,0) – der realistische Korridor, in dem dein Abschluss landen kann.
 */
export function forecastRange(stats: ProgramStats): { best: number; worst: number } {
  return { best: projectedFinal(stats, 1.0), worst: projectedFinal(stats, 4.0) }
}

export type Feasibility = 'relaxed' | 'doable' | 'ambitious'

/** Wie anspruchsvoll ist die benötigte Note – gemessen am bisherigen Schnitt? */
export function feasibility(needed: number, current?: number): Feasibility {
  if (current == null) return 'doable'
  const diff = current - needed // > 0: nötige Note ist besser (= schwerer) als bisher
  if (diff <= 0) return 'relaxed'
  if (diff <= 0.5) return 'doable'
  return 'ambitious'
}

// --- Tempo / „im Plan" -----------------------------------------------------

export interface Pace {
  /** Ist-Tempo (ECTS/Semester) ≥ Soll-Tempo (Regelstudienzeit). */
  onTrack: boolean
  /** Zusätzlich zur Regelstudienzeit voraussichtlich nötige Semester (≥ 0). */
  extraSemesters: number
}

/**
 * Studientempo gegen die Regelstudienzeit. Sanft gedacht: nur wenn die Daten
 * tragen (Bachelor/Master, ≥ 1 Semester, schon ECTS), sonst null (weglassen).
 */
export function computePace(
  program: Program,
  stats: ProgramStats,
  semesterCount: number,
): Pace | null {
  const reg = program.type === 'bachelor' ? 6 : program.type === 'master' ? 4 : null
  if (reg == null) return null // „other": keine Regelstudienzeit → weglassen
  if (semesterCount < 1 || stats.doneEcts <= 0 || stats.targetEcts <= 0) return null
  const sollTempo = stats.targetEcts / reg
  const istTempo = stats.doneEcts / semesterCount
  if (istTempo <= 0) return null
  const remaining = Math.max(0, stats.targetEcts - stats.doneEcts)
  const semestersLeft = Math.ceil(remaining / Math.max(istTempo, sollTempo))
  const extraSemesters = Math.max(0, semesterCount + semestersLeft - reg)
  return { onTrack: istTempo >= sollTempo, extraSemesters }
}
