import { useMemo, useRef, useState } from 'react'
import { Plus, CornerDownLeft } from 'lucide-react'
import type { Course } from '@/db/types'
import { parseQuickAdd } from '@/lib/quickAdd'
import { TASK_TYPES, TASK_TYPE_LIST } from '@/lib/taskTypes'
import { formatDue } from '@/lib/deadline'
import { priorityMeta } from '@/lib/priority'
import { createTask } from '@/lib/actions'
import { cn } from '@/lib/cn'

interface QuickAddProps {
  semesterId: string
  courses: Course[]
}

const DATE_OPTS = [
  { t: 'heute', label: 'Heute' },
  { t: 'morgen', label: 'Morgen' },
  { t: 'übermorgen', label: 'Übermorgen' },
  { t: 'mo', label: 'Montag' },
  { t: 'di', label: 'Dienstag' },
  { t: 'mi', label: 'Mittwoch' },
  { t: 'do', label: 'Donnerstag' },
  { t: 'fr', label: 'Freitag' },
  { t: 'sa', label: 'Samstag' },
  { t: 'so', label: 'Sonntag' },
]
const PRIO_OPTS = [
  { t: 'p1', label: 'Hoch', color: '#ef4444' },
  { t: 'p2', label: 'Mittel', color: '#f59e0b' },
  { t: 'p3', label: 'Niedrig', color: '#64748b' },
]

type TriggerKind = '#' | '@' | '!' | 'p'
interface Suggestion {
  insert: string
  primary: string
  secondary?: string
  dot?: string
  emoji?: string
}

const TRIGGER_LABEL: Record<TriggerKind, string> = {
  '#': 'Kurs',
  '@': 'Aufgaben-Art',
  '!': 'Frist',
  p: 'Priorität',
}

/** Ermittelt das Token unmittelbar vor dem Cursor. */
function tokenAt(value: string, caret: number): { token: string; start: number } {
  const left = value.slice(0, caret)
  const m = left.match(/(?:^|\s)(\S*)$/)
  const token = m ? m[1] : ''
  return { token, start: caret - token.length }
}

export function QuickAdd({ semesterId, courses }: QuickAddProps) {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [sel, setSel] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const draft = useMemo(() => parseQuickAdd(value, courses), [value, courses])
  const course = draft.courseId ? courses.find((c) => c.id === draft.courseId) : undefined
  const prio = priorityMeta(draft.priority)

  // Aktiver Trigger + Vorschläge
  const { token, start } = useMemo(() => tokenAt(value, caret), [value, caret])
  const trigger: TriggerKind | null = useMemo(() => {
    if (token.startsWith('#')) return '#'
    if (token.startsWith('@')) return '@'
    if (token.startsWith('!')) return '!'
    if (/^p\d?$/i.test(token)) return 'p'
    return null
  }, [token])

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return []
    const q = (trigger === 'p' ? token.slice(1) : token.slice(1)).toLowerCase()
    if (trigger === '#') {
      return courses
        .filter((c) => !q || c.short.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
        .map((c) => ({ insert: `#${c.short}`, primary: c.short, secondary: c.name, dot: c.color }))
    }
    if (trigger === '@') {
      return TASK_TYPE_LIST.filter(
        (d) =>
          !q ||
          d.label.toLowerCase().includes(q) ||
          d.keywords.some((k) => k.includes(q)),
      ).map((d) => ({ insert: `@${d.id}`, primary: d.label, emoji: d.emoji }))
    }
    if (trigger === '!') {
      return DATE_OPTS.filter((o) => !q || o.t.includes(q) || o.label.toLowerCase().includes(q)).map(
        (o) => ({ insert: `!${o.t}`, primary: o.label, secondary: `!${o.t}` }),
      )
    }
    // Priorität
    return PRIO_OPTS.map((o) => ({ insert: o.t, primary: o.label, secondary: o.t, dot: o.color }))
  }, [trigger, token, courses])

  const showSuggest = focused && !dismissed && trigger != null && suggestions.length > 0
  const showHelper = focused && !dismissed && trigger == null && value.trim() === ''

  function accept(s: Suggestion) {
    const newLeft = value.slice(0, start) + s.insert + ' '
    const next = newLeft + value.slice(caret)
    setValue(next)
    setDismissed(false)
    requestAnimationFrame(() => {
      const pos = newLeft.length
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  /** Fügt ein Trigger-Zeichen am Cursor ein (Helfer-Chips). */
  function insertTrigger(ch: string) {
    const needSpace = start > 0 && !/\s$/.test(value.slice(0, caret))
    const ins = (needSpace ? ' ' : '') + ch
    const newLeft = value.slice(0, caret) + ins
    setValue(newLeft + value.slice(caret))
    requestAnimationFrame(() => {
      const pos = newLeft.length
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  function syncCaret() {
    setCaret(inputRef.current?.selectionStart ?? value.length)
  }

  async function submit() {
    const title = draft.title.trim()
    if (!title) return
    await createTask({
      semesterId,
      title,
      type: draft.type ?? 'sonstiges',
      courseId: draft.courseId,
      dueDate: draft.dueDate,
      priority: draft.priority,
    })
    setValue('')
    setCaret(0)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSuggest) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSel((s) => (s + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSel((s) => (s - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        accept(suggestions[Math.min(sel, suggestions.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Enter') void submit()
  }

  return (
    <div className="px-5 pt-1 pb-2" data-tour="quickadd">
      <div className="relative">
        <div className="flex items-center gap-2 rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-stone-200/80 backdrop-blur focus-within:ring-2 focus-within:ring-brand-400">
          <Plus size={18} className="shrink-0 text-stone-400" />
          <input
            id="quickadd"
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setCaret(e.target.selectionStart ?? e.target.value.length)
              setDismissed(false)
              setSel(0)
            }}
            onKeyDown={onKeyDown}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
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

        {/* Autocomplete-Popover */}
        {showSuggest && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              {TRIGGER_LABEL[trigger!]}
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {suggestions.map((s, i) => (
                <button
                  key={s.insert}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    accept(s)
                  }}
                  onMouseEnter={() => setSel(i)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition',
                    i === sel ? 'bg-brand-100 text-stone-800' : 'text-stone-600 hover:bg-stone-100',
                  )}
                >
                  {s.emoji && <span className="text-base leading-none">{s.emoji}</span>}
                  {s.dot && (
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.dot }} />
                  )}
                  <span className="font-medium">{s.primary}</span>
                  {s.secondary && <span className="truncate text-xs text-stone-400">{s.secondary}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Helfer: zeigt verfügbare Kürzel, wenn noch kein Trigger getippt */}
        {showHelper && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1.5 flex flex-wrap items-center gap-1.5 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 shadow-xl">
            <span className="mr-1 text-[11px] font-medium text-stone-400">Tippe:</span>
            {[
              { ch: '#', label: 'Kurs' },
              { ch: '@', label: 'Art' },
              { ch: '!', label: 'Frist' },
              { ch: 'p', label: 'Priorität' },
            ].map((h) => (
              <button
                key={h.ch}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertTrigger(h.ch)
                }}
                className="flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pl-1 pr-2.5 text-xs font-medium text-stone-600 hover:bg-brand-100"
              >
                <kbd className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-stone-700 shadow-sm ring-1 ring-stone-200">
                  {h.ch}
                </kbd>
                {h.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Live-Vorschau der erkannten Felder */}
      {value.trim() && !showSuggest && !showHelper && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-stone-500">
          <span className="text-stone-400">→</span>
          <span className="font-medium text-stone-700">{draft.title || '(Titel?)'}</span>
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
            <span className="rounded-full bg-stone-100 px-2 py-0.5">📅 {formatDue(draft.dueDate)}</span>
          )}
          {prio && (
            <span
              className="rounded-full px-2 py-0.5 font-semibold"
              style={{ backgroundColor: prio.color + '22', color: prio.color }}
            >
              ⚑ {prio.label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
