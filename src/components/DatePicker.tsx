import { useEffect, useRef, useState } from 'react'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  setHours,
  setMinutes,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface DatePickerProps {
  value?: string
  onChange: (iso?: string) => void
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const TIME_PRESETS = ['08:00', '12:00', '14:00', '18:00', '23:59']

/** Nächstes Vorkommen eines Wochentags (heute eingeschlossen). target: 1=Mo … 7=So */
function nextWeekday(target: number, from = new Date()): Date {
  const cur = ((from.getDay() + 6) % 7) + 1
  const diff = (target - cur + 7) % 7
  return addDays(from, diff)
}

export function DatePicker({ value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = value ? parseISO(value) : null
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? new Date())
  const time = selected ? format(selected, 'HH:mm') : '23:59'

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function withTime(day: Date, t = time): Date {
    const [h, m] = t.split(':').map(Number)
    return setMinutes(setHours(day, h || 0), m || 0)
  }
  const pickDay = (day: Date) => onChange(withTime(day).toISOString())
  const pickTime = (t: string) => onChange(withTime(selected ?? new Date(), t).toISOString())

  const gridDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 }),
  })

  const QUICK: { label: string; date: Date }[] = [
    { label: 'Heute', date: new Date() },
    { label: 'Morgen', date: addDays(new Date(), 1) },
    { label: '+1 Woche', date: addDays(new Date(), 7) },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
          open ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-stone-200 hover:border-stone-300',
        )}
      >
        <CalendarDays size={15} className="shrink-0 text-stone-400" />
        {selected ? (
          <span className="text-stone-800">
            {format(selected, 'EE, d. MMM yyyy', { locale: de })}
            <span className="text-stone-400"> · {time}</span>
          </span>
        ) : (
          <span className="text-stone-400">Kein Datum</span>
        )}
        {selected && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onChange(undefined)
            }}
            className="ml-auto rounded-full p-0.5 text-stone-300 hover:bg-stone-100 hover:text-stone-500"
          >
            <X size={14} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-3 shadow-xl">
          {/* Schnellauswahl */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => pickDay(q.date)}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-brand-200"
              >
                {q.label}
              </button>
            ))}
          </div>
          {/* Wochentag-Sprung */}
          <div className="mb-2.5 flex gap-1">
            {WEEKDAYS.map((w, i) => (
              <button
                key={w}
                type="button"
                title={`kommender ${w}`}
                onClick={() => pickDay(nextWeekday(i + 1))}
                className="flex-1 rounded-md py-1 text-[11px] font-medium text-stone-500 hover:bg-brand-100"
              >
                {w}
              </button>
            ))}
          </div>

          {/* Monatskopf */}
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-sm font-semibold capitalize text-stone-700">
              {format(viewMonth, 'MMMM yyyy', { locale: de })}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Wochentags-Header */}
          <div className="grid grid-cols-7 text-center text-[10px] font-medium text-stone-400">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>

          {/* Tage */}
          <div className="grid grid-cols-7 gap-0.5">
            {gridDays.map((day) => {
              const isSel = selected && isSameDay(day, selected)
              const inMonth = isSameMonth(day, viewMonth)
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-lg text-sm transition',
                    isSel
                      ? 'bg-brand-400 font-semibold text-stone-900'
                      : isToday(day)
                        ? 'font-semibold text-brand-600 ring-1 ring-brand-300 ring-inset hover:bg-brand-50'
                        : inMonth
                          ? 'text-stone-700 hover:bg-stone-100'
                          : 'text-stone-300 hover:bg-stone-50',
                  )}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>

          {/* Uhrzeit */}
          <div className="mt-3 border-t border-stone-100 pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500">Uhrzeit</span>
              <input
                type="time"
                value={time}
                onChange={(e) => pickTime(e.target.value)}
                className="rounded-md border border-stone-200 px-1.5 py-0.5 text-xs text-stone-700 outline-none focus:border-brand-400"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickTime(t)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition',
                    time === t
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-brand-400 px-4 py-1.5 text-xs font-semibold text-stone-900 hover:bg-brand-500"
            >
              Fertig
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
