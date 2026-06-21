import { create } from 'zustand'
import type { TaskTypeId } from '@/db/types'

export type ViewId = 'board' | 'week' | 'schedule' | 'study' | 'plans'
export type GroupBy = 'status' | 'deadline' | 'course' | 'type' | 'priority'
export type SortBy = 'deadline' | 'priority' | 'title' | 'created'

interface UIState {
  view: ViewId
  groupBy: GroupBy
  sortBy: SortBy
  search: string
  filterCourseIds: string[]
  filterTypes: TaskTypeId[]
  showDone: boolean
  /** false = pro Serie nur die nächsten Wochen zeigen (gestaffelt). */
  showAllSeries: boolean

  editingTaskId: string | null
  creatingTask: boolean
  showCourseManager: boolean
  showCalendar: boolean
  showAccount: boolean
  /** true, wenn aktuell die Beispieldaten erkundet werden. */
  isDemo: boolean
  tour: boolean

  setView: (v: ViewId) => void
  setGroupBy: (g: GroupBy) => void
  setSortBy: (s: SortBy) => void
  setSearch: (s: string) => void
  toggleCourseFilter: (id: string) => void
  toggleTypeFilter: (t: TaskTypeId) => void
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
}

const DEMO_KEY = 'semban:demo'

export const useUI = create<UIState>((set) => ({
  view: 'board',
  groupBy: 'status',
  sortBy: 'deadline',
  search: '',
  filterCourseIds: [],
  filterTypes: [],
  showDone: true,
  showAllSeries: false,

  editingTaskId: null,
  creatingTask: false,
  showCourseManager: false,
  showCalendar: false,
  showAccount: false,
  isDemo: typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_KEY) === '1',
  tour: false,

  setView: (view) => set({ view }),
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
  clearFilters: () => set({ filterCourseIds: [], filterTypes: [], search: '' }),
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
}))
