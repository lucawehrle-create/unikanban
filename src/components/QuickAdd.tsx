import { useMemo, useRef, useState } from 'react'
import { Plus, CornerDownLeft, Check } from 'lucide-react'
import type { Course } from '@/db/types'
import { parseQuickAdd } from '@/lib/quickAdd'
import { SELECTABLE_TASK_TYPES, TASK_TYPES } from '@/lib/taskTypes'
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

/**
 * Inline-Autovervollständigung: ergänzt das Trigger-Token am Cursor zum besten
 * Treffer (Kurs/Art/Frist) und gibt zurück, welcher Teil markiert werden soll –
 * so wird der ergänzte Rest beim Weitertippen ersetzt und per Backspace komplett
 * gelöscht. Nur bei echtem Vorwärts-Tippen am Token-Ende.
 */
function bestInlineCompletion(
  value: string,
  caret: number,
  courses: Course[],
): { value: string; selStart: number; selEnd: number } | null {
  const { token, start } = tokenAt(value, caret)
  if (start + token.length !== caret) return null // Cursor nicht am Token-Ende
  const low = token.toLowerCase()
  const q = low.slice(1)
  let insert: string | null = null
  if (token.startsWith('#')) {
    if (!q) return null
    const c =
      courses.find((c) => c.short.toLowerCase().startsWith(q)) ??
      courses.find((c) => c.name.toLowerCase().startsWith(q))
    if (c) insert = `#${c.short}`
  } else if (token.startsWith('@')) {
    if (!q) return null
    const d = SELECTABLE_TASK_TYPES.find(
      (d) => d.id.toLowerCase().startsWith(q) || d.label.toLowerCase().startsWith(q),
    )
    if (d) insert = `@${d.id}`
  } else if (token.startsWith('!')) {
    if (!q) return null
    const o = DATE_OPTS.find((o) => o.t.startsWith(q) || o.label.toLowerCase().startsWith(q))
    if (o) insert = `!${o.t}`
  } else {
    return null
  }
  if (!insert) return null
  const insLow = insert.toLowerCase()
  if (insLow === low || !insLow.startsWith(low)) return null // schon komplett / kein Präfix
  return {
    value: value.slice(0, start) + insert + value.slice(caret),
    selStart: caret,
    selEnd: start + insert.length,
  }
}

export function QuickAdd({ semesterId, courses }: QuickAddProps) {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [sel, setSel] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  // true, solange der zuletzt automatisch ergänzte Rest markiert ist.
  const [inlineActive, setInlineActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const draft = useMemo(() => parseQuickAdd(value, courses), [value, courses])
  const course = draft.courseId ? courses.find((c) => c.id === draft.courseId) : undefined
  const prio = priorityMeta(draft.priority)

  // Beispiele für den Leerzustand: eines mit ausdrücklichen Kürzeln, eines in
  // reiner Umgangssprache – führt die Auto-Erkennung (Kurs/Art/Frist/Priorität
  // ganz ohne #@!p) direkt vor.
  const sampleShort = courses[0]?.short ?? 'kurs'
  const sampleWord = courses[0]?.name.split(/\s+/)[0] ?? 'Mathe'
  const examples = [
    `Blatt 3 #${sampleShort} @übung !fr`,
    `${sampleWord} Übung abgeben morgen dringend`,
  ]

  // Aktiver Trigger + Vorschläge
  const { token } = useMemo(() => tokenAt(value, caret), [value, caret])
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
      return SELECTABLE_TASK_TYPES.filter(
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

  // Popover nur, wenn keine Inline-Ergänzung aktiv ist (sonst doppelte UI).
  const showSuggest = focused && !dismissed && trigger != null && suggestions.length > 0 && !inlineActive
  // Kürzel-Legende dauerhaft während der Eingabe sichtbar (nicht nur bei leerem
  // Feld) – damit man immer sieht, welches Zeichen wofür steht.
  const showLegend = focused && trigger == null

  function accept(s: Suggestion) {
    // Cursorposition live aus dem Input lesen (State kann nach Maus-Drag veralten)
    const el = inputRef.current
    const c = el?.selectionStart ?? caret
    const { start: st } = tokenAt(value, c)
    const newLeft = value.slice(0, st) + s.insert + ' '
    const next = newLeft + value.slice(c)
    setValue(next)
    setDismissed(false)
    requestAnimationFrame(() => {
      const pos = newLeft.length
      el?.focus()
      el?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  /** Fügt ein Trigger-Zeichen am Cursor ein (Helfer-Chips). */
  function insertTrigger(ch: string) {
    const el = inputRef.current
    const c = el?.selectionStart ?? caret
    const needSpace = c > 0 && !/\s$/.test(value.slice(0, c))
    const ins = (needSpace ? ' ' : '') + ch
    const newLeft = value.slice(0, c) + ins
    setValue(newLeft + value.slice(c))
    requestAnimationFrame(() => {
      const pos = newLeft.length
      el?.focus()
      el?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  function syncCaret() {
    setCaret(inputRef.current?.selectionStart ?? value.length)
  }

  /** Erstes noch nicht gesetztes Feld (in der Reihenfolge #, @, !, p). */
  function firstMissingTrigger(): string | null {
    if (!draft.courseId) return '#'
    if (!draft.type) return '@'
    if (!draft.dueDate) return '!'
    if (!draft.priority) return 'p'
    return null
  }

  /** Übernimmt ein Syntax-Beispiel in das Feld und setzt den Cursor ans Ende. */
  function fillExample(ex: string) {
    setValue(ex)
    setInlineActive(false)
    setDismissed(false)
    requestAnimationFrame(() => {
      const el = inputRef.current
      el?.focus()
      const pos = ex.length
      el?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
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
    const el = inputRef.current
    const selActive = !!el && inlineActive && el.selectionStart !== el.selectionEnd
    if (selActive && el) {
      // Übernehmen: Leertaste (+ Leerzeichen), Tab / Pfeil-rechts (Cursor ans
      // Ende, wie Adressleiste), Enter (absenden).
      if (e.key === ' ' || e.key === 'Tab' || e.key === 'ArrowRight') {
        e.preventDefault()
        const end = el.selectionEnd ?? el.value.length
        const space = e.key === ' ' ? ' ' : ''
        const nv = el.value.slice(0, end) + space + el.value.slice(end)
        setValue(nv)
        setInlineActive(false)
        const pos = end + space.length
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(pos, pos)
          setCaret(pos)
        })
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        setInlineActive(false)
        void submit()
        return
      }
      // Backspace löscht die Markierung (Standard) → ergänzter Rest komplett weg.
      // Weitertippen: Standardverhalten (Markierung ersetzen/aufheben).
    }
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
      // Bei bloßem "p" (ohne Ziffer) NICHT kapern – sonst würde z.B. "Praktikum"
      // beim Enter zu Priorität p1. Erst ab "p1"/"p2"/"p3" übernehmen.
      const canAccept = trigger !== 'p' || /\d/.test(token)
      if ((e.key === 'Enter' || e.key === 'Tab') && canAccept) {
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
    // Tab springt zum nächsten noch fehlenden Feld (fügt dessen Kürzel ein),
    // solange schon etwas getippt wurde. Ist alles gesetzt, verlässt Tab das
    // Feld wie gewohnt. Shift+Tab nie kapern (Rücknavigation).
    if (e.key === 'Tab' && !e.shiftKey && value.trim()) {
      const missing = firstMissingTrigger()
      if (missing) {
        e.preventDefault()
        insertTrigger(missing)
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
              const raw = e.target.value
              const rawCaret = e.target.selectionStart ?? raw.length
              setDismissed(false)
              setSel(0)
              // Inline-Autofill nur bei einzelnem Tastendruck (nicht Löschen/Paste/IME).
              const itype = (e.nativeEvent as InputEvent).inputType
              const comp = itype === 'insertText' ? bestInlineCompletion(raw, rawCaret, courses) : null
              if (comp) {
                setValue(comp.value)
                setCaret(comp.selEnd)
                setInlineActive(true)
                requestAnimationFrame(() => inputRef.current?.setSelectionRange(comp.selStart, comp.selEnd))
              } else {
                setValue(raw)
                setCaret(rawCaret)
                setInlineActive(false)
              }
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

      </div>

      {/* Hinweis, solange eine Inline-Ergänzung markiert ist (Adressleisten-Stil) */}
      {inlineActive && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 px-1 text-[11px] text-stone-400">
          <kbd className="rounded bg-stone-100 px-1 py-0.5 font-mono text-stone-600">↹ Tab</kbd>
          <span>oder</span>
          <kbd className="rounded bg-stone-100 px-1 py-0.5 font-mono text-stone-600">Leer</kbd>
          <span>übernehmen ·</span>
          <kbd className="rounded bg-stone-100 px-1 py-0.5 font-mono text-stone-600">→</kbd>
          <span>ans Ende ·</span>
          <kbd className="rounded bg-stone-100 px-1 py-0.5 font-mono text-stone-600">⌫</kbd>
          <span>verwerfen</span>
        </div>
      )}

      {/* Beispiele im Leerzustand: zeigen Syntax + Auto-Erkennung, füllen bei Klick */}
      {focused && !value.trim() && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[11px] font-medium text-stone-400">Beispiele:</span>
          {examples.map((ex) => (
            <button
              key={ex}
              onMouseDown={(e) => {
                e.preventDefault()
                fillExample(ex)
              }}
              className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-600 transition hover:bg-brand-100"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Persistente Kürzel-Legende: immer sichtbar während der Eingabe, klickbar */}
      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[11px] font-medium text-stone-400">Kürzel:</span>
          {[
            { ch: '#', label: 'Kurs', used: !!draft.courseId },
            { ch: '@', label: 'Art', used: !!draft.type },
            { ch: '!', label: 'Frist', used: !!draft.dueDate },
            { ch: 'p', label: 'Priorität', used: !!draft.priority },
          ].map((h) => (
            <button
              key={h.ch}
              onMouseDown={(e) => {
                e.preventDefault()
                insertTrigger(h.ch)
              }}
              title={`${h.ch} ${h.label} einfügen`}
              className={cn(
                'flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-medium transition',
                h.used ? 'bg-brand-100 text-stone-700' : 'bg-stone-100 text-stone-600 hover:bg-brand-100',
              )}
            >
              <kbd className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-stone-700 shadow-sm ring-1 ring-stone-200">
                {h.ch}
              </kbd>
              {h.label}
              {h.used && <Check size={12} className="text-brand-600" />}
            </button>
          ))}
        </div>
      )}

      {/* Live-Vorschau der erkannten Felder */}
      {value.trim() && !showSuggest && !inlineActive && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-stone-500">
          <span className="text-stone-400">→</span>
          <span className="font-medium text-stone-700">{draft.title || '(Titel?)'}</span>
          {course && (
            <span
              className="rounded-full px-2 py-0.5 font-semibold"
              style={{ backgroundColor: course.color + '22', color: course.color }}
            >
              {course.short}
              {draft.courseAuto && (
                <span className="ml-1" title="automatisch erkannt">
                  ✨
                </span>
              )}
            </span>
          )}
          <span className="rounded-full bg-stone-100 px-2 py-0.5">
            {TASK_TYPES[draft.type ?? 'sonstiges'].emoji} {TASK_TYPES[draft.type ?? 'sonstiges'].label}
            {draft.typeAuto && (
              <span className="ml-1 text-brand-600" title="automatisch erkannt">
                ✨
              </span>
            )}
          </span>
          {draft.dueDate && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5">
              📅 {formatDue(draft.dueDate)}
              {draft.dueAuto && (
                <span className="ml-1 text-brand-600" title="automatisch erkannt">
                  ✨
                </span>
              )}
            </span>
          )}
          {prio && (
            <span
              className="rounded-full px-2 py-0.5 font-semibold"
              style={{ backgroundColor: prio.color + '22', color: prio.color }}
            >
              ⚑ {prio.label}
              {draft.priorityAuto && (
                <span className="ml-1" title="automatisch erkannt">
                  ✨
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
