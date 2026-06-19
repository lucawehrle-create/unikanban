import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  addWeeks,
  format,
  getISOWeek,
  isSameDay,
  isToday,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { Check, CheckCheck, ChevronLeft, ChevronRight, Clock, Pencil, X } from 'lucide-react'
import type { AttendanceMarker, Course, SlotKind, Task } from '@/db/types'
import { courseMap } from '@/lib/filter'
import { slotKindShort } from '@/lib/slotKinds'
import { TASK_TYPES } from '@/lib/taskTypes'
import { attendanceKey, clearAttendance, toggleAttendanceMarker } from '@/lib/actions'
import { useAttendance } from '@/hooks/data'
import { useUI } from '@/store/ui'
import { cn } from '@/lib/cn'

interface ScheduleProps {
  courses: Course[]
  tasks: Task[]
  semesterId: string
}

const WEEKDAY_LABEL = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const PX_PER_HOUR = 56

const ATT_META: Record<AttendanceMarker, { label: string; color: string; Icon: typeof Check }> = {
  vorbereitet: { label: 'Vorbereitet', color: '#f59e0b', Icon: Pencil },
  besucht: { label: 'Besucht', color: '#10b981', Icon: Check },
  nicht_besucht: { label: 'Nicht besucht', color: '#ef4444', Icon: X },
  nachbereitet: { label: 'Nachbereitet', color: '#6366f1', Icon: CheckCheck },
}
const ATT_ORDER: AttendanceMarker[] = ['vorbereitet', 'besucht', 'nicht_besucht', 'nachbereitet']

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

interface SlotView {
  id: string
  courseId: string
  short: string
  color: string
  kind: SlotKind
  weekday: number
  start: number
  end: number
  room?: string
}

export function Schedule({ courses, tasks, semesterId }: ScheduleProps) {
  const editTask = useUI((s) => s.editTask)
  const byId = useMemo(() => courseMap(courses), [courses])
  const attendance = useAttendance(semesterId)

  const [weekOffset, setWeekOffset] = useState(0)

  // Live mitlaufende Uhrzeit für die "Jetzt"-Linie (minütlich)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const weekStart = useMemo(
    () => addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset),
    [weekOffset],
  )

  // Menü zum Setzen des Anwesenheits-Status
  const [menu, setMenu] = useState<{ slotId: string; date: string; x: number; y: number } | null>(
    null,
  )

  const slots = useMemo<SlotView[]>(
    () =>
      courses.flatMap((c) =>
        c.slots.map((s) => ({
          id: s.id,
          courseId: c.id,
          short: c.short,
          color: c.color,
          kind: s.kind,
          weekday: s.weekday,
          start: toMin(s.start),
          end: toMin(s.end),
          room: s.room,
        })),
      ),
    [courses],
  )

  const tasksByDay = useMemo(() => {
    const map = new Map<number, Task[]>()
    for (const t of tasks) {
      if (!t.dueDate) continue
      const d = parseISO(t.dueDate)
      for (let wd = 1; wd <= 7; wd++) {
        if (isSameDay(d, addDays(weekStart, wd - 1))) {
          if (!map.has(wd)) map.set(wd, [])
          map.get(wd)!.push(t)
        }
      }
    }
    return map
  }, [tasks, weekStart])

  const maxWeekday = Math.max(5, ...slots.map((s) => s.weekday), ...[...tasksByDay.keys()])
  const days = Array.from({ length: maxWeekday }, (_, i) => i + 1)

  // Zeitfenster aus den echten Terminen ableiten (damit nichts negativ/abgeschnitten ist)
  const startHour = slots.length
    ? Math.max(0, Math.floor(Math.min(...slots.map((s) => s.start)) / 60))
    : 8
  const endHour = slots.length
    ? Math.min(24, Math.ceil(Math.max(...slots.map((s) => s.end)) / 60))
    : 18
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const gridHeight = (endHour - startHour) * PX_PER_HOUR

  // Position der "Jetzt"-Linie (nur sichtbar, wenn im dargestellten Zeitfenster)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowVisible = nowMin >= startHour * 60 && nowMin <= endHour * 60
  const nowTop = ((nowMin - startHour * 60) / 60) * PX_PER_HOUR

  const menuMarkers = menu ? (attendance[attendanceKey(menu.slotId, menu.date)] ?? []) : []
  function toggle(marker: AttendanceMarker) {
    if (menu) void toggleAttendanceMarker(semesterId, menu.slotId, menu.date, marker)
  }
  function reset() {
    if (menu) void clearAttendance(menu.slotId, menu.date)
    setMenu(null)
  }

  const weekRange = `${format(weekStart, 'd.', { locale: de })}–${format(addDays(weekStart, 6), 'd. MMM', { locale: de })}`

  return (
    <div className="flex h-full flex-col">
      {/* Wochen-Navigation + Legende */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="rounded-full p-1.5 text-stone-500 hover:bg-white"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[120px] text-center text-sm font-semibold text-stone-700">
            KW {getISOWeek(weekStart)} · {weekRange}
          </span>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="rounded-full p-1.5 text-stone-500 hover:bg-white"
          >
            <ChevronRight size={16} />
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="ml-1 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200/70 hover:bg-white"
            >
              Heute
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 text-[11px] text-stone-500">
          {ATT_ORDER.map((s) => {
            const m = ATT_META[s]
            return (
              <span key={s} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                {m.label}
              </span>
            )
          })}
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-stone-400">
          <Clock />
          <p>Noch keine Termine. Füge im Kurs-Manager Vorlesungen, Übungen & Tutorien hinzu.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-5 pb-6">
          <div className="mx-auto min-w-[640px] max-w-5xl">
            {/* Kopfzeile: Tage + fällige Aufgaben */}
            <div className="flex pb-2">
              <div className="w-12 shrink-0" />
              {days.map((wd) => {
                const date = addDays(weekStart, wd - 1)
                const dayTasks = tasksByDay.get(wd) ?? []
                return (
                  <div key={wd} className="flex-1 px-1">
                    <div
                      className={cn(
                        'mb-1 flex items-baseline gap-1.5 rounded-xl px-2 py-1',
                        isToday(date) ? 'bg-brand-300/60' : '',
                      )}
                    >
                      <span className="text-sm font-semibold text-stone-700">
                        {WEEKDAY_LABEL[wd - 1]}
                      </span>
                      <span className="text-[11px] text-stone-400">{format(date, 'd.M.')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {dayTasks.map((t) => {
                        const c = t.courseId ? byId.get(t.courseId) : undefined
                        return (
                          <button
                            key={t.id}
                            onClick={() => editTask(t.id)}
                            title={t.title}
                            className="flex max-w-full items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-600 shadow-sm ring-1 ring-stone-200/80 hover:ring-stone-300"
                          >
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: c?.color ?? '#a8a29e' }}
                            />
                            <span className="truncate">
                              {TASK_TYPES[t.type].emoji} {t.title}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Raster */}
            <div className="flex">
              <div className="w-12 shrink-0" style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <div key={h} className="relative" style={{ height: PX_PER_HOUR }}>
                    <span className="absolute -top-2 right-1 text-[10px] text-stone-400">
                      {h}:00
                    </span>
                  </div>
                ))}
              </div>

              {days.map((wd) => {
                const date = addDays(weekStart, wd - 1)
                const dateStr = format(date, 'yyyy-MM-dd')
                const daySlots = slots.filter((s) => s.weekday === wd)
                return (
                  <div
                    key={wd}
                    className={cn(
                      'relative flex-1 rounded-xl border-l border-stone-200/70',
                      isToday(date) && 'bg-brand-50/50',
                    )}
                    style={{ height: gridHeight }}
                  >
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-t border-stone-200/50"
                        style={{ top: i * PX_PER_HOUR }}
                      />
                    ))}

                    {daySlots.map((s) => {
                      const top = ((s.start - startHour * 60) / 60) * PX_PER_HOUR
                      const height = ((s.end - s.start) / 60) * PX_PER_HOUR
                      const markers = attendance[attendanceKey(s.id, dateStr)] ?? []
                      // Flächen-Tönung nach Anwesenheit, sonst Kursfarbe
                      const tint = markers.includes('besucht')
                        ? ATT_META.besucht.color
                        : markers.includes('nicht_besucht')
                          ? ATT_META.nicht_besucht.color
                          : s.color
                      const notAttended = markers.includes('nicht_besucht')
                      return (
                        <button
                          key={s.id}
                          onClick={(e) => setMenu({ slotId: s.id, date: dateStr, x: e.clientX, y: e.clientY })}
                          className={cn(
                            'absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:shadow-md',
                            notAttended && 'opacity-70',
                          )}
                          style={{
                            top,
                            height: Math.max(height - 2, 18),
                            backgroundColor: tint + '22',
                            borderLeft: `3px solid ${tint}`,
                          }}
                        >
                          {markers.length > 0 && (
                            <span className="absolute right-1 top-1 flex gap-0.5">
                              {ATT_ORDER.filter((m) => markers.includes(m)).map((m) => {
                                const mm = ATT_META[m]
                                return (
                                  <span
                                    key={m}
                                    title={mm.label}
                                    className="flex h-4 w-4 items-center justify-center rounded-full text-white"
                                    style={{ backgroundColor: mm.color }}
                                  >
                                    <mm.Icon size={10} strokeWidth={3} />
                                  </span>
                                )
                              })}
                            </span>
                          )}
                          <div
                            className={cn('font-semibold', notAttended && 'line-through')}
                            style={{ color: s.color }}
                          >
                            {s.short}
                          </div>
                          <div className="text-stone-500">
                            {slotKindShort(s.kind)}
                            {s.room ? ` · ${s.room}` : ''}
                          </div>
                        </button>
                      )
                    })}

                    {/* "Jetzt"-Linie */}
                    {isToday(date) && nowVisible && (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-20"
                        style={{ top: nowTop }}
                      >
                        <div className="relative h-px bg-rose-400/80">
                          <span className="absolute -left-[3px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-rose-400" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Status-Menü */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-52 rounded-xl border border-stone-200 bg-white p-1 shadow-xl"
            style={{
              top: Math.max(8, Math.min(menu.y, window.innerHeight - 230)),
              left: Math.max(8, Math.min(menu.x, window.innerWidth - 220)),
            }}
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-stone-400">
              Mehrfachauswahl möglich
            </div>
            {ATT_ORDER.map((m) => {
              const meta = ATT_META[m]
              const active = menuMarkers.includes(m)
              return (
                <button
                  key={m}
                  onClick={() => toggle(m)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition',
                    active ? 'bg-stone-50 text-stone-800' : 'text-stone-600 hover:bg-stone-100',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full transition',
                      active ? 'text-white' : 'text-stone-300 ring-1 ring-stone-200',
                    )}
                    style={active ? { backgroundColor: meta.color } : undefined}
                  >
                    <meta.Icon size={12} strokeWidth={3} />
                  </span>
                  <span className="flex-1 text-left">{meta.label}</span>
                  {active && <Check size={14} className="text-stone-400" />}
                </button>
              )
            })}
            <button
              onClick={reset}
              className="mt-0.5 w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-stone-400 hover:bg-stone-100"
            >
              Zurücksetzen
            </button>
          </div>
        </>
      )}
    </div>
  )
}
