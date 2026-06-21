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
  /** Öffnet das Reflexions-Popup, falls aktiviert & passender, noch nicht reflektierter Task. */
  maybeReflect: (task: Task) => void
  /** Öffnet das Reflexions-Popup direkt (Ansehen/Bearbeiten), ohne Bedingungen. */
  openReflection: (taskId: string) => void
  closeReflection: () => void
}

const DEMO_KEY = 'semban:demo'
const REFLECT_KEY = 'semban:reflectionPrompts'
const STUDY_MAX_KEY = 'semban:studyDailyMax'

function loadStudyMax(): number {
  try {
    const n = Number(localStorage.getItem(STUDY_MAX_KEY))
    return Number.isFinite(n) && n >= 60 ? n : 180
  } catch {
    return 180
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
  studyDailyMaxMin: loadStudyMax(),
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
  clearFilters: () => set({ filterCourseIds: [], filterTypes: [], examPrep: 'all', search: '' }),
  setShowDone: (showDone) => set({ showDone }),
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
