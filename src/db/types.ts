// Uni-natives Datenmodell:
// Studiengang → Semester → Kurse → Aufgaben (mit Typ-Lebenszyklus)
//
// Zwei Schichten:
//   - Operativ (Board/Stundenplan/Aufgaben) ist auf das AKTIVE Semester begrenzt
//     und "resettet" beim Semesterwechsel (= Kontextwechsel, nichts wird gelöscht).
//   - Studienakte (Noten/ECTS aus Kursen) kumuliert über alle Semester eines
//     Studiengangs und wird nie zurückgesetzt.

export type ProgramType = 'bachelor' | 'master' | 'other'

export interface Program {
  id: string
  name: string // "B.Sc. Informatik"
  type: ProgramType
  targetEcts: number // 180 (Bachelor) / 120 (Master) …
  /** Startbilanz für Quereinstieg mitten im Studium (optional). */
  priorEcts?: number // bereits erbrachte ECTS vor Tool-Nutzung
  priorGradeAvg?: number // bisheriger Schnitt
  priorGradedEcts?: number // ECTS, auf denen priorGradeAvg beruht (für korrekte Gewichtung)
  active: boolean
  order: number
  createdAt: string
}

export type TaskTypeId =
  | 'uebung'
  | 'tutoriumsblatt'
  | 'hausarbeit'
  | 'referat'
  | 'lektuere'
  | 'klausur'
  | 'altklausur'
  | 'karteikarten'
  | 'sonstiges'

/** Spalten des Boards. */
export type TaskStatus = 'offen' | 'dran' | 'erledigt'

/** Priorität einer Aufgabe (undefined = keine). */
export type Priority = 'hoch' | 'mittel' | 'niedrig'

/** Ein Klausurenphasen-Zeitraum (eine Uni kann zwei haben). */
export interface ExamPhase {
  id: string
  label: string // "1. Klausurenphase"
  start: string // ISO-Datum
  end: string // ISO-Datum
}

export interface Semester {
  id: string
  programId: string
  name: string // z.B. "SoSe 2026"
  /** ISO-Datum (yyyy-mm-dd) des Montags von Woche 1 (Vorlesungsbeginn). */
  startDate: string
  /** Anzahl Vorlesungswochen, z.B. 14. */
  weeks: number
  /** Klausurenphasen (0–2). */
  examPhases: ExamPhase[]
  /** Semesterende (ISO) – danach beginnt das nächste Semester. */
  endDate?: string
  active: boolean
}

/** Art eines Stundenplan-Termins. */
export type SlotKind =
  | 'vorlesung'
  | 'uebung'
  | 'tutorium'
  | 'seminar'
  | 'praktikum'
  | 'repetitorium'
  | 'kolloquium'
  | 'klausur'

/** Unabhängige Markierungen einer Termin-Sitzung (Mehrfachauswahl). */
export type AttendanceMarker = 'vorbereitet' | 'besucht' | 'nicht_besucht' | 'nachbereitet'

/** Status einer konkreten Termin-Sitzung (slot an einem Datum). */
export interface Attendance {
  id: string // `${slotId}|${yyyy-mm-dd}`
  semesterId: string
  slotId: string
  date: string // yyyy-mm-dd
  markers: AttendanceMarker[]
}

export interface CourseSlot {
  id: string
  kind: SlotKind
  /** 1 = Montag … 7 = Sonntag */
  weekday: number
  start: string // "10:00"
  end: string // "12:00"
  room?: string
}

/** Konfiguration für eine automatisch generierte Serie (z.B. Übungsblätter). */
export interface RecurringConfig {
  id: string
  type: TaskTypeId // meist 'uebung'/'tutoriumsblatt'/'lektuere'
  labelPrefix: string // "Übungsblatt"
  /** 1 = Montag … 7 = Sonntag (Abgabetag) */
  weekday: number
  time?: string // "12:00"
  count: number // Anzahl Blätter
  startWeek: number // ab welcher Semesterwoche (1-basiert)
  /** Rhythmus: alle wie viele Wochen (1 = wöchentlich, 2 = zweiwöchentlich …). */
  intervalWeeks?: number
  maxPoints?: number // Punkte pro Blatt (optional)
}

/** Studienstatus eines Kurses – steuert, ob er in die Studienakte einfließt. */
export type CourseStatus = 'laufend' | 'bestanden' | 'nicht_bestanden'

export interface Course {
  id: string
  semesterId: string
  name: string // "Analysis II"
  short: string // "ANA2"
  color: string // Hex, z.B. "#6366f1"
  ects?: number
  grade?: number // 1.0 – 5.0
  status?: CourseStatus // default: 'laufend'
  /** Klausurdauer in Minuten (Standard für den Lernplan, Altklausur-Budget). */
  examDurationMin?: number
  slots: CourseSlot[]
  /** Mehrere Wochen-Serien (z.B. Übungsblatt UND Tutoriumsblatt). */
  recurring?: RecurringConfig[]
  /** Hinterlegter Lernplan für die Klausur dieses Kurses. */
  studyPlan?: StudyPlanConfig
}

export type StudyStrategy = 'now' | 'breaks' | 'later'

/** Pro Kurs hinterlegte Lernplan-Konfiguration (Lernpläne-Ansicht). */
export interface StudyPlanConfig {
  /** Klausurdatum (ISO yyyy-mm-dd). */
  examDate: string
  /** Klausurdauer in Minuten (Altklausur-Budget = Dauer × 2). */
  examDurationMin: number
  /** Karteikarten/Tag (Planungs-Regler; 0 = keine). */
  cardsPerDay: number
  /** Anzahl vorhandener Altklausuren. */
  altklausuren: number
  /** Anzahl Skript-/Vorlesungskapitel. */
  chapters: number
  /** IDs der konkret zum Wiederholen ausgewählten Übungs-/Tutoriumsblätter. */
  uebungReviewIds: string[]
  tutReviewIds: string[]
  /** Gewählte Start-Strategie. */
  strategy: StudyStrategy
  /** Maximale Lernzeit pro Tag (Minuten) – kursübergreifender Deckel. */
  dailyMaxMin: number
  /** Bevorzugte Uhrzeit der Sessions (HH:mm). */
  time: string
}

export interface Phase {
  label: string
  done: boolean
}

/**
 * Reflexion nach dem Erledigen eines Übungs-/Tutoriumsblatts. Hilft später bei
 * der Lernplan-Auswahl (schwere Blätter erkennen, auch lang zurückliegende).
 */
export interface TaskReflection {
  /** 1 = sehr leicht … 5 = sehr schwer. */
  difficulty: number
  /** Schlagworte (Presets + eigene), z.B. "Beweise", "Zeitdruck". */
  tags: string[]
  /** Freitext: Was ist schwergefallen? */
  hardParts?: string
  /** Zeitpunkt der Reflexion (ISO). */
  reflectedAt: string
}

export interface Task {
  id: string
  semesterId: string
  courseId?: string
  type: TaskTypeId
  title: string
  status: TaskStatus
  priority?: Priority
  /** ISO-Datum/-Zeit der Fälligkeit. */
  dueDate?: string
  notes?: string
  phases: Phase[]
  points?: { earned?: number; max?: number }
  /** Sortierung innerhalb einer Spalte. */
  order: number
  /** true, wenn automatisch aus RecurringConfig erzeugt. */
  autoGenerated?: boolean
  /** id der Wochen-Serie (RecurringConfig), aus der die Aufgabe stammt. */
  recurringId?: string
  /** id der Klausur-Aufgabe, zu der diese Lern-Session gehört (Lernplan). */
  examId?: string
  /** geplante Dauer in Minuten (Lern-Sessions; für Tagesbudget-Planung). */
  duration?: number
  /** Reflexion nach dem Erledigen (Übungs-/Tutoriumsblätter). */
  reflection?: TaskReflection
  createdAt: string
  completedAt?: string
}
