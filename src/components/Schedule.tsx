import { useEffect, useMemo, useRef, useState } from 'react'
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
import { slotKindLabel, slotKindShort } from '@/lib/slotKinds'
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

/** Minuten → "10:15". */
function fmtTime(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}
/** "10:15–11:45". */
function timeRange(s: { start: number; end: number }): string {
  return `${fmtTime(s.start)}–${fmtTime(s.end)}`
}
/** Relative Zeit bis zum Start ("in 23 min" / "in 1 h 05 min"). */
function relStart(min: number): string {
  if (min < 60) return `in ${min} min`
  return `in ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

/**
 * Überlappende Termine eines Tages in Spalten aufteilen, damit parallele Kurse
 * NEBENEINANDER (statt übereinander) liegen. Pro Termin: Spaltenindex + Anzahl
 * Spalten seines Überlappungs-Clusters (gleiche Breite innerhalb des Clusters).
 */
function layoutDay(daySlots: SlotView[]): Map<string, { col: number; cols: number }> {
  const res = new Map<string, { col: number; cols: number }>()
  const sorted = [...daySlots].sort((a, b) => a.start - b.start || a.end - b.end)
  let cluster: SlotView[] = []
  let clusterEnd = -1
  const flush = () => {
    if (!cluster.length) return
    const colEnds: number[] = [] // Endzeit je Spalte
    const colOf = new Map<string, number>()
    for (const s of cluster) {
      let placed = colEnds.findIndex((end) => end <= s.start)
      if (placed === -1) { placed = colEnds.length; colEnds.push(s.end) }
      else colEnds[placed] = s.end
      colOf.set(s.id, placed)
    }
    const cols = colEnds.length
    for (const s of cluster) res.set(s.id, { col: colOf.get(s.id)!, cols })
    cluster = []
    clusterEnd = -1
  }
  for (const s of sorted) {
    if (cluster.length && s.start >= clusterEnd) flush()
    cluster.push(s)
    clusterEnd = Math.max(clusterEnd, s.end)
  }
  flush()
  return res
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
  // Ausgewählter Wochentag (1=Mo) für die mobile Einzeltag-Ansicht.
  const [selectedDay, setSelectedDay] = useState(() => ((new Date().getDay() + 6) % 7) + 1)
  // Mobiler Scroll-Container – beim Öffnen auf „jetzt"/ersten Termin springen.
  const mobileScrollRef = useRef<HTMLDivElement>(null)

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

  // Zeitfenster: morgens spätestens ab 8 Uhr, abends mindestens bis 20 Uhr –
  // damit der Tag „vollständig" wirkt; bei früheren/späteren Terminen erweitert
  // es sich automatisch.
  const startHour = slots.length
    ? Math.min(8, Math.max(0, Math.floor(Math.min(...slots.map((s) => s.start)) / 60)))
    : 8
  const endHour = slots.length
    ? Math.min(24, Math.max(20, Math.ceil(Math.max(...slots.map((s) => s.end)) / 60)))
    : 20
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const gridHeight = (endHour - startHour) * PX_PER_HOUR

  // Position der "Jetzt"-Linie (nur sichtbar, wenn im dargestellten Zeitfenster)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowVisible = nowMin >= startHour * 60 && nowMin <= endHour * 60
  const nowTop = ((nowMin - startHour * 60) / 60) * PX_PER_HOUR

  // „Was kommt jetzt/als Nächstes?" – heute-bezogener Anker über dem Raster.
  const todayWd = ((now.getDay() + 6) % 7) + 1
  const nextUp = useMemo(() => {
    const today = slots.filter((s) => s.weekday === todayWd).sort((a, b) => a.start - b.start)
    const running = today.find((s) => nowMin >= s.start && nowMin < s.end)
    if (running) return { slot: running, mode: 'running' as const }
    const next = today.find((s) => s.start > nowMin)
    if (next) return { slot: next, mode: 'next' as const }
    return null
  }, [slots, todayWd, nowMin])

  const menuMarkers = menu ? (attendance[attendanceKey(menu.slotId, menu.date)] ?? []) : []
  function toggle(marker: AttendanceMarker) {
    if (menu) void toggleAttendanceMarker(semesterId, menu.slotId, menu.date, marker)
  }
  function reset() {
    if (menu) void clearAttendance(menu.slotId, menu.date)
    setMenu(null)
  }

  const weekRange = `${format(weekStart, 'd.', { locale: de })}–${format(addDays(weekStart, 6), 'd. MMM', { locale: de })}`

  const activeDay = days.includes(selectedDay) ? selectedDay : days[0]

  // Mobil beim Öffnen / Tageswechsel auf „jetzt" (heute) bzw. den ersten Termin
  // des Tages scrollen – nicht bei jedem Minuten-Tick (now bewusst nicht in deps).
  useEffect(() => {
    const el = mobileScrollRef.current
    if (!el) return
    const date = addDays(weekStart, activeDay - 1)
    if (isToday(date) && weekOffset === 0 && nowVisible) {
      el.scrollTop = Math.max(0, nowTop - 80)
      return
    }
    const first = slots
      .filter((s) => s.weekday === activeDay)
      .sort((a, b) => a.start - b.start)[0]
    if (first) el.scrollTop = Math.max(0, ((first.start - startHour * 60) / 60) * PX_PER_HOUR - 16)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, weekOffset, slots])

  const renderTaskChip = (t: Task) => {
    const c = t.courseId ? byId.get(t.courseId) : undefined
    return (
      <button
        key={t.id}
        onClick={() => editTask(t.id)}
        title={t.title}
        className="flex max-w-full items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-medium text-stone-600 shadow-sm ring-1 ring-stone-200/80 hover:ring-stone-300"
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
  }

  const timeAxis = (
    <div className="w-10 shrink-0 sm:w-12" style={{ height: gridHeight }}>
      {hours.map((h) => (
        <div key={h} className="relative" style={{ height: PX_PER_HOUR }}>
          <span className="absolute right-1 top-0 -translate-y-1/2 text-[11px] tabular-nums text-stone-400">
            {h}:00
          </span>
        </div>
      ))}
    </div>
  )

  // Eine Tagesspalte mit Terminen + "Jetzt"-Linie (für Wochen- UND Tagesansicht).
  const renderDayColumn = (wd: number, mobile = false) => {
    const date = addDays(weekStart, wd - 1)
    const dateStr = format(date, 'yyyy-MM-dd')
    const today = isToday(date) && weekOffset === 0
    const daySlots = slots.filter((s) => s.weekday === wd)
    const layout = layoutDay(daySlots)
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
          const rawHeight = ((s.end - s.start) / 60) * PX_PER_HOUR
          const height = Math.max(rawHeight - 2, 34)
          const markers = attendance[attendanceKey(s.id, dateStr)] ?? []
          const notAttended = markers.includes('nicht_besucht')
          const lay = layout.get(s.id) ?? { col: 0, cols: 1 }
          const widthPct = 100 / lay.cols
          const leftPct = lay.col * widthPct
          // Schmale Parallel-Blöcke (≥3 Spalten) → nur Kürzel + Farbe; Rest per Tap.
          const narrow = lay.cols >= 3
          const showMeta = !narrow && (mobile || height >= 34)
          const showTime = !narrow && (mobile || height >= 44)
          const isRunning = today && nowMin >= s.start && nowMin < s.end
          const isPast = today && nowMin >= s.end
          // Farbe = NUR Kursidentität (Status nie als Fläche – Konflikt/WCAG).
          const tint = s.color
          return (
            <button
              key={s.id}
              onClick={(e) => setMenu({ slotId: s.id, date: dateStr, x: e.clientX, y: e.clientY })}
              title={`${s.short} · ${slotKindShort(s.kind)}${s.room ? ` · ${s.room}` : ''} · ${timeRange(s)}`}
              className={cn(
                'absolute overflow-hidden px-2 py-1 text-left leading-tight shadow-sm transition hover:shadow-md',
                narrow ? 'rounded-md px-1.5' : 'rounded-lg',
                isRunning && 'ring-2 ring-rose-400/70',
              )}
              style={{
                top,
                height,
                left: `calc(${leftPct}% + 2px)`,
                width: `calc(${widthPct}% - 4px)`,
                backgroundColor: tint + '22',
                borderLeft: `3px solid ${tint}`,
                opacity: isPast ? 0.55 : notAttended ? 0.6 : undefined,
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
              {/* Kürzel: Identität trägt der Farbrand; Text bleibt lesbar (WCAG). */}
              <div
                className={cn(
                  'truncate text-[13px] font-semibold leading-tight text-stone-800',
                  markers.length > 0 && 'pr-9',
                  notAttended && 'text-stone-500 line-through',
                )}
              >
                {s.short}
              </div>
              {showMeta && (
                <div className="truncate text-[11px] leading-snug text-stone-600">
                  {slotKindShort(s.kind)}
                  {s.room ? ` · ${s.room}` : ''}
                </div>
              )}
              {showTime && (
                <div className="truncate text-[11px] font-medium leading-snug tabular-nums text-stone-500">
                  {timeRange(s)}
                </div>
              )}
            </button>
          )
        })}

        {today && nowVisible && (
          <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }}>
            <div className="relative h-px bg-rose-400/80">
              <span className="absolute -left-[3px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-rose-400" />
            </div>
          </div>
        )}
      </div>
    )
  }

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

        <div className="ml-auto hidden items-center gap-3 text-[11px] text-stone-500 sm:flex">
          {ATT_ORDER.map((s) => {
            const m = ATT_META[s]
            return (
              <span key={s} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
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
        <>
          {/* „Next up" – der wichtigste Blick: was läuft / kommt als Nächstes */}
          {nextUp && (
            <div
              className={cn(
                'mx-4 mb-2 flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-2.5 ring-1 sm:mx-5',
                nextUp.mode === 'running' ? 'ring-rose-300/70' : 'ring-stone-200/70',
              )}
            >
              <span
                className="h-9 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: nextUp.slot.color }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-stone-900">{nextUp.slot.short}</span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
                    {slotKindLabel(nextUp.slot.kind)}
                  </span>
                </div>
                <div className="truncate text-[11px] tabular-nums text-stone-500">
                  {timeRange(nextUp.slot)}
                  {nextUp.slot.room ? ` · ${nextUp.slot.room}` : ''}
                </div>
              </div>
              <div className="ml-auto shrink-0 text-right">
                <div
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    nextUp.mode === 'running' ? 'text-rose-600' : 'text-brand-600',
                  )}
                >
                  {nextUp.mode === 'running'
                    ? `läuft · bis ${fmtTime(nextUp.slot.end)}`
                    : relStart(nextUp.slot.start - nowMin)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-stone-400">
                  {nextUp.mode === 'running' ? 'gerade' : 'als Nächstes'}
                </div>
              </div>
            </div>
          )}

          {/* MOBIL: Einzeltag mit Tagesauswahl */}
          <div className="flex flex-1 flex-col overflow-hidden sm:hidden">
            <div className="flex gap-1 overflow-x-auto px-4 pb-2">
              {days.map((wd) => {
                const date = addDays(weekStart, wd - 1)
                const active = wd === activeDay
                return (
                  <button
                    key={wd}
                    onClick={() => setSelectedDay(wd)}
                    className={cn(
                      'flex min-w-[44px] flex-1 flex-col items-center rounded-xl px-1 py-1.5 text-xs transition',
                      active
                        ? 'bg-stone-900 text-white'
                        : isToday(date)
                          ? 'bg-brand-50 text-stone-700'
                          : 'text-stone-500 hover:bg-white',
                    )}
                  >
                    <span className="font-semibold">{WEEKDAY_LABEL[wd - 1]}</span>
                    <span className={cn('text-[10px]', active ? 'text-white/70' : 'text-stone-400')}>
                      {format(date, 'd.M.')}
                    </span>
                  </button>
                )
              })}
            </div>

            {(tasksByDay.get(activeDay) ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 px-4 pb-2">
                {(tasksByDay.get(activeDay) ?? []).map(renderTaskChip)}
              </div>
            )}

            <div ref={mobileScrollRef} className="flex-1 overflow-auto px-4 pb-6">
              <div className="flex" data-tour="schedule">
                {timeAxis}
                {renderDayColumn(activeDay, true)}
              </div>
            </div>
          </div>

          {/* DESKTOP: ganze Woche */}
          <div className="hidden flex-1 overflow-auto px-5 pb-6 sm:block">
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
                          isToday(date) && 'border-b-2 border-brand-400',
                        )}
                      >
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            isToday(date) ? 'text-brand-600' : 'text-stone-700',
                          )}
                        >
                          {WEEKDAY_LABEL[wd - 1]}
                        </span>
                        <span className="text-[11px] tabular-nums text-stone-400">
                          {format(date, 'd.M.')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">{dayTasks.map(renderTaskChip)}</div>
                    </div>
                  )
                })}
              </div>

              {/* Raster */}
              <div className="flex" data-tour="schedule">
                {timeAxis}
                {days.map((wd) => renderDayColumn(wd, false))}
              </div>
            </div>
          </div>
        </>
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
