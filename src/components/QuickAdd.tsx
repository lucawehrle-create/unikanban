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
    <div className="px-5 pt-1 pb-2" data-tour="quickadd">
      <div className="flex items-center gap-2 rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-stone-200/80 backdrop-blur focus-within:ring-2 focus-within:ring-brand-400">
        <Plus size={18} className="shrink-0 text-stone-400" />
        <input
          id="quickadd"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="Aufgabe schnell erfassen…  z.B.  Blatt 3 #ana2 @übung !fr"
          className="flex-1 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
          autoComplete="off"
        />
        {value.trim() && (
          <button
            onClick={() => void submit()}
            className="flex shrink-0 items-center gap-1 rounded-full bg-brand-400 px-3 py-1.5 text-xs font-semibold text-stone-900 transition hover:bg-brand-500"
          >
            <CornerDownLeft size={13} /> Enter
          </button>
        )}
      </div>

      {value.trim() && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-stone-500">
          <span className="text-stone-400">→</span>
          <span className="font-medium text-stone-700">
            {draft.title || '(Titel?)'}
          </span>
          {course && (
            <span
              className="rounded-full px-2 py-0.5 font-semibold"
              style={{ backgroundColor: course.color + '22', color: course.color }}
            >
              {course.short}
            </span>
          )}
          <span className="rounded-full bg-stone-100 px-2 py-0.5">
            {TASK_TYPES[draft.type ?? 'sonstiges'].emoji} {TASK_TYPES[draft.type ?? 'sonstiges'].label}
          </span>
          {draft.dueDate && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5">
              📅 {formatDue(draft.dueDate)}
            </span>
          )}
          <span className="ml-auto text-stone-300"># Kurs · @ Art · ! Frist</span>
        </div>
      )}
    </div>
  )
}
