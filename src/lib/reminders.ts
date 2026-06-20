import { useEffect, useRef } from 'react'
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import type { Course, Task } from '@/db/types'
import { formatDue } from './deadline'

/* ---------------- Einstellungen (pro Gerät, lokal) ---------------- */

export interface ReminderSettings {
  /** Erinnerungen grundsätzlich an/aus. */
  enabled: boolean
  /** Wie viele Tage vor der Frist erinnert wird (z.B. 1 = einen Tag vorher). */
  leadDays: number
}

const SETTINGS_KEY = 'semban:reminders'
const DEFAULTS: ReminderSettings = { enabled: true, leadDays: 1 }

export function getReminderSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>
    return {
      enabled: parsed.enabled ?? DEFAULTS.enabled,
      leadDays: Math.max(0, Math.min(7, parsed.leadDays ?? DEFAULTS.leadDays)),
    }
  } catch {
    return DEFAULTS
  }
}

export function setReminderSettings(s: ReminderSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/* ---------------- Fällige Aufgaben einordnen ---------------- */

export type ReminderBucket = 'overdue' | 'today' | 'soon'

export interface ReminderItem {
  task: Task
  bucket: ReminderBucket
  /** Kalendertage bis zur Frist (negativ = überfällig). */
  days: number
}

const BUCKET_ORDER: Record<ReminderBucket, number> = { overdue: 0, today: 1, soon: 2 }

/**
 * Offene Aufgaben mit Frist, die Aufmerksamkeit brauchen: überfällig, heute
 * fällig oder innerhalb der Vorlauf-Tage (leadDays) fällig.
 */
export function buildReminders(tasks: Task[], leadDays: number): ReminderItem[] {
  const today = startOfDay(new Date())
  const items: ReminderItem[] = []
  for (const t of tasks) {
    if (t.status === 'erledigt' || !t.dueDate) continue
    const days = differenceInCalendarDays(startOfDay(parseISO(t.dueDate)), today)
    let bucket: ReminderBucket | null = null
    if (days < 0) bucket = 'overdue'
    else if (days === 0) bucket = 'today'
    else if (days <= leadDays) bucket = 'soon'
    if (bucket) items.push({ task: t, bucket, days })
  }
  items.sort((a, b) => {
    if (a.bucket !== b.bucket) return BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]
    return (a.task.dueDate ?? '') < (b.task.dueDate ?? '') ? -1 : 1
  })
  return items
}

export const BUCKET_META: Record<ReminderBucket, { label: string; dot: string; text: string }> = {
  overdue: { label: 'Überfällig', dot: 'bg-red-500', text: 'text-red-600' },
  today: { label: 'Heute fällig', dot: 'bg-orange-500', text: 'text-orange-600' },
  soon: { label: 'Bald fällig', dot: 'bg-amber-500', text: 'text-amber-600' },
}

/* ---------------- Lokale Benachrichtigungen (App offen/zurück) ---------------- */

const NOTIFIED_KEY = 'semban:reminders:notified'
const MONTH_MS = 30 * 24 * 60 * 60 * 1000

function loadNotified(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}
function saveNotified(map: Record<string, number>) {
  // Alte Einträge ausmisten, damit der Speicher nicht wächst.
  const now = Date.now()
  for (const k of Object.keys(map)) if (now - map[k] > MONTH_MS) delete map[k]
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

const notifyKey = (it: ReminderItem) => `${it.task.id}|${it.task.dueDate}|${it.bucket}`

async function showNotifications(items: ReminderItem[], courses: Course[]) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker?.ready.catch(() => null)
  const show = (title: string, body: string, tag: string) => {
    const opts: NotificationOptions = { body, tag, icon: '/pwa-192.png', badge: '/favicon-32.png' }
    try {
      if (reg) void reg.showNotification(title, opts).catch(() => {})
      else new Notification(title, opts)
    } catch {
      /* Berechtigung kann sich geändert haben – nicht abstürzen. */
    }
  }
  const courseName = (id?: string) => courses.find((c) => c.id === id)?.name

  if (items.length > 3) {
    // Bei vielen offenen Fristen nicht zuspammen – eine Sammelmeldung.
    show(`${items.length} Aufgaben brauchen deine Aufmerksamkeit`, 'Tippe, um sie zu öffnen.', 'semban-summary')
    return
  }
  for (const it of items) {
    const meta = BUCKET_META[it.bucket]
    const cn = courseName(it.task.courseId)
    const body = [cn, formatDue(it.task.dueDate)].filter(Boolean).join(' · ')
    show(`${meta.label}: ${it.task.title}`, body, `semban-${it.task.id}`)
  }
}

/**
 * Feuert lokale Benachrichtigungen für neu fällige Aufgaben – beim Öffnen der
 * App und wenn man zur App zurückkehrt. Dedupliziert pro (Aufgabe, Frist,
 * Kategorie), damit nichts doppelt kommt.
 */
export function useLocalReminderNotifications(tasks: Task[], courses: Course[]) {
  const tasksRef = useRef(tasks)
  const coursesRef = useRef(courses)
  tasksRef.current = tasks
  coursesRef.current = courses

  useEffect(() => {
    const run = () => {
      const settings = getReminderSettings()
      if (!settings.enabled) return
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const items = buildReminders(tasksRef.current, settings.leadDays)
      if (!items.length) return
      const notified = loadNotified()
      const fresh = items.filter((it) => !notified[notifyKey(it)])
      if (!fresh.length) return
      const now = Date.now()
      for (const it of fresh) notified[notifyKey(it)] = now
      saveNotified(notified)
      void showNotifications(fresh, coursesRef.current)
    }

    // Kurz nach dem Start (Daten sind dann geladen) und bei Rückkehr zur App.
    const t = setTimeout(run, 2500)
    const onVisible = () => {
      if (!document.hidden) run()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])
}
