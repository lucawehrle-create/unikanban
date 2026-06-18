import { useMemo, useState } from 'react'
import { Plus, CornerDownLeft } from 'lucide-react'
import type { Course } from '@/db/types'
import { parseQuickAdd } from '@/lib/quickAdd'
import { TASK_TYPES } from '@/lib/taskTypes'
import { formatDue } from '@/lib/deadline'
import { createTask } from '@/lib/actions'

interface QuickAddProps {
  semesterId: string
  courses: Course[]
}

export function QuickAdd({ semesterId, courses }: QuickAddProps) {
  const [value, setValue] = useState('')
  const draft = useMemo(() => parseQuickAdd(value, courses), [value, courses])
  const course = draft.courseId ? courses.find((c) => c.id === draft.courseId) : undefined

  async function submit() {
    const title = draft.title.trim()
    if (!title) return
    await createTask({
      semesterId,
      title,
      type: draft.type ?? 'sonstiges',
      courseId: draft.courseId,
      dueDate: draft.dueDate,
    })
    setValue('')
  }

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-sky-400 dark:bg-slate-800 dark:ring-slate-700">
        <Plus size={18} className="shrink-0 text-slate-400" />
        <input
          id="quickadd"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="Aufgabe schnell erfassen…  z.B.  Blatt 3 #ana2 @übung !fr"
          className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          autoComplete="off"
        />
        {value.trim() && (
          <button
            onClick={() => void submit()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-sky-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-600"
          >
            <CornerDownLeft size={13} /> Enter
          </button>
        )}
      </div>

      {value.trim() && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500">
          <span className="text-slate-400">→</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {draft.title || '(Titel?)'}
          </span>
          {course && (
            <span
              className="rounded px-1.5 py-0.5 font-semibold"
              style={{ backgroundColor: course.color + '22', color: course.color }}
            >
              {course.short}
            </span>
          )}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">
            {TASK_TYPES[draft.type ?? 'sonstiges'].emoji} {TASK_TYPES[draft.type ?? 'sonstiges'].label}
          </span>
          {draft.dueDate && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">
              📅 {formatDue(draft.dueDate)}
            </span>
          )}
          <span className="ml-auto text-slate-300 dark:text-slate-600">
            #kurs · @typ · !datum
          </span>
        </div>
      )}
    </div>
  )
}
