import { create } from 'zustand'
import type { Task, TaskTypeId } from '@/db/types'
import { isReflectableType } from '@/lib/reflection'

export type ViewId = 'board' | 'week' | 'schedule' | 'study' | 'plans'
export type GroupBy = 'status' | 'deadline' | 'course' | 'type' | 'priority'
export type SortBy = 'deadline' | 'priority' | 'title' | 'created'
/** Lernplan-/Klausurvorbereitungs-Sessions: alle / nur diese / ausblenden. */
export type ExamPrepFilter = 'all' | 'only' | 'hide'

interface UIState {
  view: ViewId
  groupBy: GroupBy
  sortBy: SortBy
  search: string
  filterCourseIds: string[]
  filterTypes: TaskTypeId[]
  examPrep: ExamPrepFilter
  showDone: boolean
  /** true = nur heute fällige & überfällige Aufgaben (Tagesfokus). */
  dueToday: boolean
  /** false = pro Serie nur die nächsten Wochen zeigen (gestaffelt). */
  showAllSeries: boolean

  editingTaskId: string | null
  creatingTask: boolean
  showCourseManager: boolean
  showCalendar: boolean
  showAccount: boolean
  /** Vorausgewählter Kurs beim Öffnen der Lernpläne-Ansicht (Deep-Link). */
  plansCourseId: string | null
  /** true, wenn aktuell die Beispieldaten erkundet werden. */
  isDemo: boolean
  tour: boolean
  /** Reflexions-Abfrage nach dem Erledigen von Übungs-/Tutoriumsblättern. */
  reflectionPrompts: boolean
  /** Globaler Tagesdeckel für Lern-Sessions über ALLE Kurse (Minuten). */
  studyDailyMaxMin: number
  /** Globaler Wochendeckel für Lern-Sessions über ALLE Kurse (Minuten). */
  studyWeeklyMaxMin: number
  /** Lerntage (ISO 1=Mo … 7=So). Tage außerhalb = Ruhetage. */
  studyDays: number[]
  /** Max. Kurse pro Lern-Tag (Fokus-Blöcke statt Häppchen). */
  studyMaxCoursesPerDay: number
  /** Standard-Vorbereitungsfenster vor der Klausur (Wochen). */
  studyPrepWindowWeeks: number
  /** id der Aufgabe, für die gerade das Reflexions-Popup offen ist. */
  reflectingTaskId: string | null

  setView: (v: ViewId) => void
  /** Öffnet die Lernpläne-Ansicht, optional mit vorausgewähltem Kurs. */
  openPlans: (courseId?: string) => void
  setGroupBy: (g: GroupBy) => void
  setSortBy: (s: SortBy) => void
  setSearch: (s: string) => void
  toggleCourseFilter: (id: string) => void
  toggleTypeFilter: (t: TaskTypeId) => void
  setExamPrep: (f: ExamPrepFilter) => void
  clearFilters: () => void
  setShowDone: (b: boolean) => void
  setDueToday: (b: boolean) => void
  setShowAllSeries: (b: boolean) => void

  editTask: (id: string | null) => void
  setCreatingTask: (b: boolean) => void
  setShowCourseManager: (b: boolean) => void
  setShowCalendar: (b: boolean) => void
  setShowAccount: (b: boolean) => void
  setDemo: (b: boolean) => void
  setTour: (b: boolean) => void
  setReflectionPrompts: (b: boolean) => void
  setStudyDailyMaxMin: (n: number) => void
  setStudyWeeklyMaxMin: (n: number) => void
  setStudyDays: (d: number[]) => void
  setStudyMaxCoursesPerDay: (n: number) => void
  setStudyPrepWindowWeeks: (n: number) => void
  /** Öffnet das Reflexions-Popup, falls aktiviert & passender, noch nicht reflektierter Task. */
  maybeReflect: (task: Task) => void
  /** Öffnet das Reflexions-Popup direkt (Ansehen/Bearbeiten), ohne Bedingungen. */
  openReflection: (taskId: string) => void
  closeReflection: () => void
}

const DEMO_KEY = 'semban:demo'
const REFLECT_KEY = 'semban:reflectionPrompts'
const STUDY_MAX_KEY = 'semban:studyDailyMax'
const STUDY_WEEKLY_KEY = 'semban:studyWeeklyMax'
const STUDY_DAYS_KEY = 'semban:studyDays'
const STUDY_MAXCOURSES_KEY = 'semban:studyMaxCourses'
const STUDY_PREPWEEKS_KEY = 'semban:studyPrepWeeks'

function loadNum(key: string, def: number, min: number): number {
  try {
    const n = Number(localStorage.getItem(key))
    return Number.isFinite(n) && n >= min ? n : def
  } catch {
    return def
  }
}
function loadStudyDays(): number[] {
  try {
    const raw = localStorage.getItem(STUDY_DAYS_KEY)
    if (!raw) return [1, 2, 3, 4, 5, 6]
    const arr = JSON.parse(raw) as number[]
    return Array.isArray(arr) && arr.length ? arr.filter((n) => n >= 1 && n <= 7) : [1, 2, 3, 4, 5, 6]
  } catch {
    return [1, 2, 3, 4, 5, 6]
  }
}

/** Lernplan-Einstellungen als Objekt (für den Scheduler). */
export function getStudySettings() {
  const s = useUI.getState()
  return {
    dailyMaxMin: s.studyDailyMaxMin,
    weeklyMaxMin: s.studyWeeklyMaxMin,
    studyDays: s.studyDays,
    maxCoursesPerDay: s.studyMaxCoursesPerDay,
    prepWindowWeeks: s.studyPrepWindowWeeks,
  }
}

export const useUI = create<UIState>((set) => ({
  view: 'board',
  groupBy: 'status',
  sortBy: 'deadline',
  search: '',
  filterCourseIds: [],
  filterTypes: [],
  examPrep: 'all',
  showDone: true,
  dueToday: false,
  showAllSeries: false,

  editingTaskId: null,
  creatingTask: false,
  showCourseManager: false,
  showCalendar: false,
  showAccount: false,
  plansCourseId: null,
  isDemo: typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_KEY) === '1',
  tour: false,
  reflectionPrompts:
    typeof localStorage === 'undefined' || localStorage.getItem(REFLECT_KEY) !== '0',
  studyDailyMaxMin: loadNum(STUDY_MAX_KEY, 180, 60),
  studyWeeklyMaxMin: loadNum(STUDY_WEEKLY_KEY, 900, 60),
  studyDays: loadStudyDays(),
  studyMaxCoursesPerDay: loadNum(STUDY_MAXCOURSES_KEY, 2, 1),
  studyPrepWindowWeeks: loadNum(STUDY_PREPWEEKS_KEY, 4, 1),
  reflectingTaskId: null,

  setView: (view) => set({ view }),
  openPlans: (plansCourseId = undefined) => set({ view: 'plans', plansCourseId: plansCourseId ?? null }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSearch: (search) => set({ search }),
  toggleCourseFilter: (id) =>
    set((s) => ({
      filterCourseIds: s.filterCourseIds.includes(id)
        ? s.filterCourseIds.filter((x) => x !== id)
        : [...s.filterCourseIds, id],
    })),
  toggleTypeFilter: (t) =>
    set((s) => ({
      filterTypes: s.filterTypes.includes(t)
        ? s.filterTypes.filter((x) => x !== t)
        : [...s.filterTypes, t],
    })),
  setExamPrep: (examPrep) => set({ examPrep }),
  clearFilters: () =>
    set({ filterCourseIds: [], filterTypes: [], examPrep: 'all', search: '', dueToday: false }),
  setShowDone: (showDone) => set({ showDone }),
  setDueToday: (dueToday) => set({ dueToday }),
  setShowAllSeries: (showAllSeries) => set({ showAllSeries }),

  editTask: (editingTaskId) => set({ editingTaskId }),
  setCreatingTask: (creatingTask) => set({ creatingTask }),
  setShowCourseManager: (showCourseManager) => set({ showCourseManager }),
  setShowCalendar: (showCalendar) => set({ showCalendar }),
  setShowAccount: (showAccount) => set({ showAccount }),
  setDemo: (isDemo) => {
    try {
      if (isDemo) localStorage.setItem(DEMO_KEY, '1')
      else localStorage.removeItem(DEMO_KEY)
    } catch {
      /* ignore */
    }
    set({ isDemo })
  },
  setTour: (tour) => set({ tour }),
  setReflectionPrompts: (reflectionPrompts) => {
    try {
      localStorage.setItem(REFLECT_KEY, reflectionPrompts ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ reflectionPrompts })
  },
  setStudyDailyMaxMin: (studyDailyMaxMin) => {
    try {
      localStorage.setItem(STUDY_MAX_KEY, String(studyDailyMaxMin))
    } catch {
      /* ignore */
    }
    set({ studyDailyMaxMin })
  },
  setStudyWeeklyMaxMin: (studyWeeklyMaxMin) => {
    try {
      localStorage.setItem(STUDY_WEEKLY_KEY, String(studyWeeklyMaxMin))
    } catch {
      /* ignore */
    }
    set({ studyWeeklyMaxMin })
  },
  setStudyDays: (studyDays) => {
    try {
      localStorage.setItem(STUDY_DAYS_KEY, JSON.stringify(studyDays))
    } catch {
      /* ignore */
    }
    set({ studyDays })
  },
  setStudyMaxCoursesPerDay: (studyMaxCoursesPerDay) => {
    try {
      localStorage.setItem(STUDY_MAXCOURSES_KEY, String(studyMaxCoursesPerDay))
    } catch {
      /* ignore */
    }
    set({ studyMaxCoursesPerDay })
  },
  setStudyPrepWindowWeeks: (studyPrepWindowWeeks) => {
    try {
      localStorage.setItem(STUDY_PREPWEEKS_KEY, String(studyPrepWindowWeeks))
    } catch {
      /* ignore */
    }
    set({ studyPrepWindowWeeks })
  },
  maybeReflect: (task) =>
    set((s) => {
      if (!s.reflectionPrompts) return {}
      if (!isReflectableType(task.type)) return {}
      if (task.reflection) return {}
      return { reflectingTaskId: task.id }
    }),
  openReflection: (reflectingTaskId) => set({ reflectingTaskId }),
  closeReflection: () => set({ reflectingTaskId: null }),
}))
