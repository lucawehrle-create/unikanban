import { useEffect, useRef, useState } from 'react'
import { startOfWeek, format } from 'date-fns'
import { ArrowLeft, FileText, Send, Sparkles, X } from 'lucide-react'
import { Logo } from './Logo'
import type { Course, CourseSlot, ProgramType, RecurringConfig, Task } from '@/db/types'
import { db, uid } from '@/db/db'
import { createProgram, createSemester } from '@/lib/actions'
import { generateRecurringTasks } from '@/lib/recurring'
import { makePhases } from '@/lib/taskTypes'
import { seedIfEmpty } from '@/lib/seed'
import { useUI } from '@/store/ui'
import { cn } from '@/lib/cn'

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
]
const TARGET_BY_TYPE: Record<ProgramType, number> = { bachelor: 180, master: 120, other: 180 }
const TYPE_LABEL: Record<ProgramType, string> = { bachelor: 'Bachelor', master: 'Master', other: 'Sonstiges' }

// Die häufigsten Studiengänge in Deutschland (nach Einschreibungen) als Schnellwahl.
const COMMON_PROGRAMS: { icon: string; name: string }[] = [
  { icon: '📊', name: 'BWL' },
  { icon: '💻', name: 'Informatik' },
  { icon: '⚙️', name: 'Maschinenbau' },
  { icon: '⚖️', name: 'Jura' },
  { icon: '🩺', name: 'Medizin' },
  { icon: '🧠', name: 'Psychologie' },
]

function suggestSemester(d = new Date()): string {
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  if (m >= 4 && m <= 9) return `SoSe ${y}`
  if (m >= 10) return `WiSe ${y}/${String(y + 1).slice(2)}`
  return `WiSe ${y - 1}/${String(y).slice(2)}`
}

/** Aus „Informatik Bachelor, 3. Semester" Art + sauberen Namen ziehen. */
function parseSubject(raw: string): { name: string; type?: ProgramType; fs?: number } {
  const t = raw.trim()
  let type: ProgramType | undefined
  if (/\b(master|m\.?\s?sc|m\.?\s?a|magister)\b/i.test(t)) type = 'master'
  else if (/\b(bachelor|b\.?\s?sc|b\.?\s?a)\b/i.test(t)) type = 'bachelor'
  const fsMatch = t.match(/(\d{1,2})\.?\s*(?:fach)?(?:semester|fs)\b/i)
  const fs = fsMatch ? Number(fsMatch[1]) : undefined
  // Art-/Semester-Wörter aus dem Namen entfernen.
  const name = t
    .replace(/\b(bachelor|master|b\.?\s?sc\.?|m\.?\s?sc\.?|b\.?\s?a\.?|m\.?\s?a\.?|magister)\b/gi, '')
    .replace(/\d{1,2}\.?\s*(?:fach)?(?:semester|fs)\b/gi, '')
    .replace(/[,;–-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { name: name || t, type, fs }
}

/** Freitext/Paste in einzelne Kursnamen zerlegen. */
function parseCourses(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
}

// 1 = Montag … 7 = Sonntag (Slot-/Recurring-Konvention).
const WEEKDAY_SHORT = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

const ROMAN: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
}
const SHORT_STOP = new Set(['und', 'der', 'die', 'das', 'für', 'in', 'im', 'zur', 'zum', 'von', 'mit', 'des', 'zu', 'an'])

/** Aussagekräftiges Kürzel: „Analysis II" → ANA2, „Lineare Algebra" → LA. */
function makeShort(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return 'KURS'
  // Abschließende Nummer (Ziffer oder römisch) separat behalten.
  let num = ''
  const last = tokens[tokens.length - 1].toLowerCase().replace(/[.)]/g, '')
  if (/^\d{1,2}$/.test(last)) { num = last; tokens.pop() }
  else if (last in ROMAN) { num = ROMAN[last]; tokens.pop() }
  const words = tokens.filter((w) => !SHORT_STOP.has(w.toLowerCase()) && /[a-zäöü]/i.test(w))
  let base: string
  if (words.length >= 2) base = words.slice(0, 3).map((w) => w[0]).join('')
  else if (words.length === 1) base = words[0].slice(0, num ? 3 : 4)
  else base = (tokens[0] ?? name).slice(0, 4)
  const short = (base + num).toUpperCase().replace(/[^A-ZÄÖÜ0-9]/g, '').slice(0, 5)
  return short || name.replace(/\s+/g, '').slice(0, 4).toUpperCase() || 'KURS'
}

interface CourseDraft {
  name: string
  short: string
  color: string
  slots: CourseSlot[]
  weekly: boolean
  exam?: string // yyyy-MM-dd
}
function toDraft(name: string, idx: number): CourseDraft {
  return { name, short: makeShort(name), color: PALETTE[idx % PALETTE.length], slots: [], weekly: false }
}

type Msg = { id: string; role: 'bot' | 'user'; text: string }
type Phase =
  | 'boot' | 'subject' | 'type' | 'fachsemester' | 'semester' | 'semesterCustom'
  | 'courses' | 'finishOrMore' | 'times' | 'weeklyWhich' | 'weeklyDay' | 'exams'
  | 'prior' | 'priorInput' | 'review' | 'done'

// Fortschritt orientiert sich am kurzen Pflicht-Pfad (Studiengang → Abschluss →
// Kurse → fast fertig); optionale Schritte verlängern die Leiste bewusst nicht.
const STEP_OF: Record<Phase, number> = {
  boot: 0, subject: 0, type: 1, fachsemester: 3, semester: 1, semesterCustom: 1,
  courses: 2, finishOrMore: 3, times: 3, weeklyWhich: 3, weeklyDay: 3, exams: 3,
  prior: 3, priorInput: 3, review: 3, done: 3,
}
const TOTAL_STEPS = 4

type DraftShape = {
  name: string; type: ProgramType; target: number; fs: number
  semName: string; semStart: string; semWeeks: number
  courses: CourseDraft[]; priorEcts: number; priorAvg: number
}
// Schritte, zu denen „Zurück" zurückspringen kann (stabile Frage-Phasen).
type Checkpoint = {
  phase: Phase; msgsLen: number; draft: DraftShape
  courses: CourseDraft[]; weeklyDay: number; priorEcts: string; priorAvg: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const STORE_KEY = 'semban.onboarding.v1'

/** Konversationelles Onboarding: eine Frage nach der anderen, Parser darunter. */
export function OnboardingChat() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [phase, setPhase] = useState<Phase>('boot')
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  // Entwurfsdaten
  const draft = useRef<DraftShape>({
    name: '', type: 'bachelor', target: 180, fs: 0,
    semName: suggestSemester(),
    semStart: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    semWeeks: 14,
    courses: [],
    priorEcts: 0, priorAvg: 0,
  })
  const [courses, setCourses] = useState<CourseDraft[]>([])
  const [weeklyDay, setWeeklyDay] = useState(5) // Fr
  const [priorEcts, setPriorEcts] = useState('')
  const [priorAvg, setPriorAvg] = useState('')
  // Höhe des sichtbaren Viewports (schrumpft mit der Tastatur) → kein Sprung.
  const [vpHeight, setVpHeight] = useState<number | null>(null)
  // Offener Mini-Editor für einen neuen Stundenplan-Slot (welcher Kurs + Felder).
  const [slotEdit, setSlotEdit] = useState<{ course: number; weekday: number; start: string; end: string; room: string } | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const reviewing = useRef(false) // true, wenn vom Überblick aus Kurse bearbeitet werden
  const maxStep = useRef(0) // höchster erreichter Schritt (für die Fortschrittsleiste)
  const history = useRef<Checkpoint[]>([]) // Zurück-Stapel
  const [histLen, setHistLen] = useState(0)
  // Animationen/Verzögerungen bei „prefers-reduced-motion" überspringen.
  const reduceMotion = useRef(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  ).current

  // Momentaufnahme vor dem Beantworten eines Schritts (für „Zurück").
  function checkpoint(atPhase: Phase) {
    history.current.push({
      phase: atPhase,
      msgsLen: msgs.length,
      draft: JSON.parse(JSON.stringify(draft.current)),
      courses: JSON.parse(JSON.stringify(courses)),
      weeklyDay, priorEcts, priorAvg,
    })
    setHistLen(history.current.length)
  }

  function goBack() {
    const cp = history.current.pop()
    setHistLen(history.current.length)
    if (!cp) return
    setTyping(false)
    reviewing.current = false
    setMsgs((m) => m.slice(0, cp.msgsLen))
    draft.current = cp.draft
    setCourses(cp.courses)
    setWeeklyDay(cp.weeklyDay)
    setPriorEcts(cp.priorEcts)
    setPriorAvg(cp.priorAvg)
    setText('')
    setPhase(cp.phase)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, typing, phase, courses])

  // iOS scrollt die Seite, wenn ein Feld fokussiert wird – das verschiebt das
  // Layout. Lösung: Dokument hart sperren (position:fixed) UND die Container-Höhe
  // an den sichtbaren Viewport koppeln (verkleinert sich mit der Tastatur).
  useEffect(() => {
    if (typeof document === 'undefined') return
    const vv = window.visualViewport
    const body = document.body.style
    const html = document.documentElement.style
    const prev = { bp: body.position, bo: body.overflow, bw: body.width, bh: body.height, ho: html.overflow }
    body.position = 'fixed'
    body.overflow = 'hidden'
    body.width = '100%'
    body.height = '100%'
    html.overflow = 'hidden'
    const update = () => {
      if (vv) setVpHeight(vv.height)
      window.scrollTo(0, 0)
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      body.position = prev.bp
      body.overflow = prev.bo
      body.width = prev.bw
      body.height = prev.bh
      html.overflow = prev.ho
    }
  }, [])

  // Wiederherstellen (nach Tab-Wechsel/Reload) – sonst Begrüßung.
  useEffect(() => {
    if (started.current) return
    started.current = true
    try {
      const raw = localStorage.getItem(STORE_KEY)
      const s = raw ? JSON.parse(raw) : null
      if (s && Array.isArray(s.msgs) && s.msgs.length && typeof s.phase === 'string' && s.phase !== 'boot' && s.phase !== 'done') {
        setMsgs(s.msgs)
        if (s.draft) draft.current = { ...draft.current, ...s.draft }
        if (Array.isArray(s.courses)) setCourses(s.courses)
        if (typeof s.weeklyDay === 'number') setWeeklyDay(s.weeklyDay)
        if (typeof s.priorEcts === 'string') setPriorEcts(s.priorEcts)
        if (typeof s.priorAvg === 'string') setPriorAvg(s.priorAvg)
        if (typeof s.text === 'string') setText(s.text)
        setPhase(s.phase as Phase)
        return
      }
    } catch { /* defekter Speicher → frisch starten */ }
    void say(['Hi! 👋 In 30 Sekunden startklar — was studierst du?'], 'subject')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt sichern: jeder Schritt überlebt Tab-Wechsel/Reload.
  useEffect(() => {
    if (!started.current || phase === 'boot') return
    try {
      if (phase === 'done') localStorage.removeItem(STORE_KEY)
      else
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ msgs, phase, draft: draft.current, courses, weeklyDay, priorEcts, priorAvg, text }),
        )
    } catch { /* z.B. Speicher voll → ignorieren */ }
  }, [msgs, phase, courses, weeklyDay, priorEcts, priorAvg, text])

  async function say(lines: string[], next: Phase) {
    for (const line of lines) {
      if (!reduceMotion) {
        setTyping(true)
        await sleep(Math.min(230, 60 + line.length * 4))
        setTyping(false)
      }
      setMsgs((m) => [...m, { id: uid(), role: 'bot', text: line }])
      if (!reduceMotion) await sleep(45)
    }
    setPhase(next)
  }
  const pushUser = (t: string) => setMsgs((m) => [...m, { id: uid(), role: 'user', text: t }])

  // ---- Schritt-Handler ----------------------------------------------------
  // Kursfrage — Pflicht-Pfad endet hier (alles Weitere ist optional).
  function goCourses() {
    setPhase('boot')
    void say(['Welche Kurse hast du gerade? 📚', 'Tipp sie untereinander — oder füg deinen Stundenplan ein.'], 'courses')
  }

  // Studiengang gesetzt (per Kachel oder Freitext) → direkt zu Abschluss/Kursen.
  function setSubject(name: string, type?: ProgramType, fs?: number) {
    draft.current.name = name
    if (type) { draft.current.type = type; draft.current.target = TARGET_BY_TYPE[type] }
    if (fs) draft.current.fs = fs
    setPhase('boot')
    if (!type) { void say(['Bachelor oder Master?'], 'type'); return }
    goCourses()
  }

  function submitSubject() {
    const v = text.trim()
    if (!v) return
    checkpoint('subject')
    pushUser(v)
    setText('')
    const { name, type, fs } = parseSubject(v)
    setSubject(name, type, fs)
  }
  function pickSubject(name: string) {
    checkpoint('subject')
    pushUser(name)
    setText('')
    setSubject(name)
  }

  // Nach Bachelor/Master direkt zu den Kursen (Pflicht-Pfad kurz halten).
  function afterType() {
    goCourses()
  }
  function chooseType(t: ProgramType) {
    checkpoint('type')
    draft.current.type = t
    draft.current.target = TARGET_BY_TYPE[t]
    pushUser(TYPE_LABEL[t])
    afterType()
  }
  function submitTypeText() {
    const v = text.trim()
    if (!v) return
    checkpoint('type')
    draft.current.type = parseSubject(v).type ?? 'other'
    draft.current.target = TARGET_BY_TYPE[draft.current.type]
    pushUser(v)
    setText('')
    afterType()
  }

  function chooseFs(n: number) {
    checkpoint('fachsemester')
    draft.current.fs = n
    pushUser(`${n}. Semester`)
    goPrior()
  }
  function submitFsText() {
    const v = text.trim()
    if (!v) return
    checkpoint('fachsemester')
    const n = parseInt(v.replace(/\D/g, ''), 10)
    draft.current.fs = Number.isFinite(n) ? n : 0
    pushUser(v)
    setText('')
    goPrior()
  }

  function chooseSemester(name: string) {
    checkpoint('semester')
    draft.current.semName = name
    pushUser(name)
    setPhase('boot')
    void say(
      [
        `${name} — notiert.`,
        'Start setze ich auf diese Woche, 14 Wochen Vorlesungszeit (später unter „Studium" änderbar).',
        `Welche Kurse belegst du in ${name}? 📚`,
        'Tipp sie einfach untereinander — oder füg deinen Stundenplan ein.',
      ],
      'courses',
    )
  }

  function submitSemesterCustom() {
    const v = text.trim()
    if (!v) return
    setText('')
    chooseSemester(v)
  }

  function addCourses() {
    const names = parseCourses(text)
    if (!names.length) return
    pushUser(text.trim())
    setText('')
    setCourses((cur) => {
      const seen = new Set(cur.map((c) => c.name.toLowerCase()))
      const merged = [...cur]
      for (const n of names) {
        if (seen.has(n.toLowerCase())) continue
        seen.add(n.toLowerCase())
        merged.push(toDraft(n, merged.length))
      }
      const added = merged.length - cur.length
      setPhase('boot')
      void say([added === 1 ? '1 Kurs übernommen ✅' : `${added} Kurse übernommen ✅`], 'courses')
      return merged
    })
  }

  function removeCourse(i: number) {
    setCourses((cur) => cur.filter((_, j) => j !== i).map((c, j) => ({ ...c, color: PALETTE[j % PALETTE.length] })))
  }

  function coursesDone() {
    if (!courses.length) {
      setPhase('boot')
      void say(['Mindestens ein Kurs wäre super — tipp einfach den Namen 🙂'], 'courses')
      return
    }
    draft.current.courses = courses
    // Aus dem Überblick zurück → direkt wieder zum Überblick (Zeiten/Serien bleiben).
    if (reviewing.current) {
      reviewing.current = false
      setPhase('boot')
      void say(['Aktualisiert ✅'], 'review')
      return
    }
    checkpoint('courses')
    setPhase('boot')
    void say(
      [
        'Das reicht zum Loslegen 🎉',
        'Magst du noch Zeiten, Übungsblätter & Klausurtermine ergänzen? Daraus baue ich dir Lernpläne.',
      ],
      'finishOrMore',
    )
  }

  // „Mehr einrichten" → der optionale, wertvolle Teil (Zeiten/Blätter/Klausuren).
  function goMore() {
    checkpoint('finishOrMore')
    pushUser('Mehr einrichten')
    setPhase('boot')
    void say(
      ['Wann finden die Vorlesungen statt? (optional)', 'Tipp bei einem Kurs auf „+ Zeit" und wähl Tag & Uhrzeit.'],
      'times',
    )
  }

  // --- Strukturierte Eingabe: Stundenplan-Slots (kein Freitext) ---
  function openSlotEdit(course: number) {
    setSlotEdit({ course, weekday: 0, start: '10:00', end: '12:00', room: '' })
  }
  function addSlot() {
    if (!slotEdit || !slotEdit.weekday || !slotEdit.start) return
    const { course, weekday, start, end, room } = slotEdit
    setCourses((cur) =>
      cur.map((c, j) =>
        j === course
          ? { ...c, slots: [...c.slots, { id: uid(), kind: 'vorlesung', weekday, start, end: end || start, room: room.trim() || undefined }] }
          : c,
      ),
    )
    setSlotEdit(null)
  }
  function removeSlot(course: number, slotId: string) {
    setCourses((cur) => cur.map((c, j) => (j === course ? { ...c, slots: c.slots.filter((s) => s.id !== slotId) } : c)))
  }
  // --- Strukturierte Eingabe: Klausurdatum je Kurs (nativer Date-Picker) ---
  function setExam(course: number, date: string) {
    setCourses((cur) => cur.map((c, j) => (j === course ? { ...c, exam: date || undefined } : c)))
  }

  function timesDone() {
    checkpoint('times')
    setPhase('boot')
    void say(
      [
        '⭐ Jetzt die Superkraft: Bei welchen Kursen gibt es wöchentliche Übungsblätter?',
        'Ich lege dir daraus automatisch das ganze Semester an Abgaben an. (Tipp die Kurse an)',
      ],
      'weeklyWhich',
    )
  }

  function toggleWeekly(i: number) {
    setCourses((cur) => cur.map((c, j) => (j === i ? { ...c, weekly: !c.weekly } : c)))
  }

  // Übergang zum (optionalen) Klausur-Schritt — schaltet später den Lernplan frei.
  function goExams(lead: string[]) {
    setPhase('boot')
    void say(
      [
        ...lead,
        'Wann sind deine Klausuren? (optional)',
        'Wähl je Kurs einfach ein Datum — daraus baust du später deinen Lernplan.',
      ],
      'exams',
    )
  }

  function weeklyWhichDone() {
    checkpoint('weeklyWhich')
    if (!courses.some((c) => c.weekly)) {
      pushUser('Keine')
      draft.current.courses = courses
      goExams(['Alles klar, keine Serien.'])
      return
    }
    pushUser(courses.filter((c) => c.weekly).map((c) => c.short).join(', '))
    setPhase('boot')
    void say(['An welchem Tag ist meist die Abgabe?'], 'weeklyDay')
  }

  function chooseWeeklyDay(day: number) {
    checkpoint('weeklyDay')
    setWeeklyDay(day)
    pushUser(WEEKDAY_SHORT[day])
    draft.current.courses = courses
    goExams([])
  }

  function examsDone() {
    checkpoint('exams')
    draft.current.courses = courses
    if (!draft.current.fs) {
      setPhase('boot')
      void say(['Fast fertig — in welchem Fachsemester bist du?'], 'fachsemester')
      return
    }
    goPrior()
  }

  // Fachsemester clever nutzen: 1. Semester → keine Vorerfahrung; höher → ECTS schätzen.
  function goPrior() {
    const fs = draft.current.fs
    if (fs === 1) {
      draft.current.priorEcts = 0
      draft.current.priorAvg = 0
      goReview()
      return
    }
    if (fs > 1) {
      const est = (fs - 1) * 30
      setPriorEcts(String(est))
      setPhase('boot')
      void say([`Du bist im ${fs}. Semester — grob ${est} ECTS bisher? (anpassbar; Schnitt optional)`], 'priorInput')
      return
    }
    setPhase('boot')
    void say(['Hast du schon ECTS oder einen Schnitt aus früheren Semestern?'], 'prior')
  }

  function choosePrior(withPrior: boolean) {
    checkpoint('prior')
    if (!withPrior) {
      draft.current.priorEcts = 0
      draft.current.priorAvg = 0
      pushUser('Erstsemester / nein')
      goReview()
      return
    }
    pushUser('Ja, eintragen')
    setPhase('priorInput')
  }

  function submitPrior() {
    draft.current.priorEcts = Number(priorEcts) || 0
    draft.current.priorAvg = Number(priorAvg) || 0
    pushUser(`${draft.current.priorEcts || 0} ECTS · Ø ${draft.current.priorAvg || '—'}`)
    goReview()
  }

  function goReview() {
    draft.current.courses = courses
    setPhase('boot')
    void say(['Super — fast geschafft! Schau bitte einmal drüber:'], 'review')
  }

  function editCoursesFromReview() {
    reviewing.current = true
    setPhase('boot')
    void say(['Klar — pass deine Kurse an und tipp dann auf „Fertig".'], 'courses')
  }

  function editShort(i: number, val: string) {
    const v = val.toUpperCase().replace(/[^A-ZÄÖÜ0-9]/g, '').slice(0, 6)
    setCourses((cur) => cur.map((c, j) => (j === i ? { ...c, short: v } : c)))
  }

  async function finish() {
    if (busy) return
    setBusy(true)
    const d = draft.current
    const list = courses.filter((c) => c.name.trim())
    const weeklyN = list.filter((c) => c.weekly).length
    const examN = list.filter((c) => c.exam).length
    const taskApprox = weeklyN * d.semWeeks
    const parts = [`${list.length} Kurs${list.length === 1 ? '' : 'e'}`]
    if (taskApprox) parts.push(`~${taskApprox} Abgaben`)
    if (examN) parts.push(`${examN} Klausur${examN === 1 ? '' : 'en'}`)
    setPhase('done')
    await say([`Perfekt — ich lege dein Semester, ${parts.join(', ')} an … 🚀`], 'done')
    try {
      useUI.getState().setDemo(false)
      // Ohne ausgefüllten Studienstand: grob aus dem Fachsemester schätzen.
      const priorE = d.priorEcts || (d.fs > 1 ? (d.fs - 1) * 30 : 0)
      const pid = await createProgram({
        name: d.name.trim() || 'Mein Studium',
        type: d.type,
        targetEcts: d.target,
        priorEcts: priorE || undefined,
        priorGradeAvg: d.priorAvg || undefined,
        priorGradedEcts: priorE || undefined,
      })
      const sid = await createSemester({
        programId: pid,
        name: d.semName.trim() || suggestSemester(),
        startDate: d.semStart,
        weeks: d.semWeeks,
      })
      const sem = await db.semesters.get(sid)
      const records: Course[] = list
        .map((c) => {
          const recurring: RecurringConfig[] | undefined =
            c.weekly && sem
              ? [{
                  id: uid(),
                  type: 'uebung',
                  labelPrefix: 'Übungsblatt',
                  weekday: weeklyDay,
                  time: '12:00',
                  count: sem.weeks,
                  startWeek: 1,
                  intervalWeeks: 1,
                }]
              : undefined
          return {
            id: uid(),
            semesterId: sid,
            name: c.name.trim(),
            short: (c.short.trim() || c.name.slice(0, 4)).toUpperCase(),
            color: c.color,
            slots: c.slots,
            recurring,
          }
        })
      if (records.length) await db.courses.bulkAdd(records)
      // Klausuren als Termine (type 'klausur') – Lernplan ist damit nur 1 Klick entfernt.
      const nowIso = new Date().toISOString()
      const examTasks: Task[] = []
      records.forEach((rec, i) => {
        const ex = list[i]?.exam
        if (!ex) return
        examTasks.push({
          id: uid(),
          semesterId: sid,
          courseId: rec.id,
          type: 'klausur',
          title: `Klausur ${rec.name}`,
          status: 'offen',
          priority: 'hoch',
          dueDate: new Date(`${ex}T09:00:00`).toISOString(),
          phases: makePhases('klausur'),
          order: 900 + i,
          createdAt: nowIso,
        })
      })
      // Eine Klausurenphase über die Klausurtermine (für Countdown/Klausurphase-Ansicht).
      const examDates = list.map((c) => c.exam).filter((x): x is string => !!x).sort()
      if (examDates.length) {
        await db.semesters.update(sid, {
          examPhases: [{ id: uid(), label: 'Klausurenphase', start: examDates[0], end: examDates[examDates.length - 1] }],
        })
      }
      // Wöchentliche Serien → echte Aufgaben fürs ganze Semester materialisieren.
      const recurringTasks = sem ? records.flatMap((c) => generateRecurringTasks(c, sem)) : []
      const allTasks = [...recurringTasks, ...examTasks]
      if (allTasks.length) await db.tasks.bulkAdd(allTasks)
      // App rendert nach Anlegen automatisch um (programCount > 0).
    } catch {
      setBusy(false)
      setPhase('boot')
      void say(['Da ist etwas schiefgelaufen 😕 — bitte versuch es nochmal.'], 'review')
    }
  }

  async function loadDemo() {
    if (busy) return
    setBusy(true)
    try {
      try { localStorage.removeItem(STORE_KEY) } catch { /* ignore */ }
      await seedIfEmpty()
      useUI.getState().setDemo(true)
    } finally {
      setBusy(false)
    }
  }

  // ---- Eingabezeile je nach Phase -----------------------------------------
  const multiline = phase === 'courses'
  const showText = phase === 'subject' || phase === 'type' || phase === 'fachsemester' || phase === 'semesterCustom' || phase === 'courses'
  const placeholder =
    phase === 'subject' ? 'Anderes Fach eingeben…'
      : phase === 'type' ? 'Anderer Abschluss (z.B. Staatsexamen)…'
        : phase === 'fachsemester' ? 'Anderes (z.B. 12)…'
          : phase === 'semesterCustom' ? 'z.B. WiSe 2026/27'
            : 'z.B. Analysis II, Lineare Algebra, Programmierung'
  function onSubmitText() {
    if (phase === 'subject') submitSubject()
    else if (phase === 'type') submitTypeText()
    else if (phase === 'fachsemester') submitFsText()
    else if (phase === 'semesterCustom') submitSemesterCustom()
    else if (phase === 'courses') addCourses()
  }

  // Fortschritt steigt nur (kein Zurückspringen während „boot"/Tippen).
  if (phase !== 'boot') maxStep.current = Math.max(maxStep.current, STEP_OF[phase])
  const shownStep = maxStep.current
  const todayISO = format(new Date(), 'yyyy-MM-dd')

  return (
    <div
      className="ob-chat ob-chat-root fixed left-0 right-0 top-0 flex justify-center overflow-hidden bg-stone-100 sm:items-center sm:p-4"
      style={vpHeight ? { height: `${vpHeight}px` } : undefined}
    >
      {/* Abgegrenzte Chat-Karte: Vollbild auf Mobil, zentrierte Karte auf Desktop. */}
      <div className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-cream-50 sm:h-[min(90vh,860px)] sm:rounded-3xl sm:shadow-xl sm:ring-1 sm:ring-stone-200/80">
      {/* Kopf */}
      <header className="flex items-center gap-3 border-b border-stone-200/70 bg-white/70 px-4 py-3 backdrop-blur">
        {histLen > 0 && phase !== 'boot' && phase !== 'done' && (
          <button
            onClick={goBack}
            aria-label="Einen Schritt zurück"
            className="-ml-1 rounded-full p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <Logo size={34} />
        <div className="leading-tight">
          <div className="text-sm font-bold text-stone-800">SemBan-Assistent</div>
          <div className="text-[11px] text-stone-400">Richtet dein Semester ein</div>
        </div>
        <button
          onClick={() => void loadDemo()}
          disabled={busy}
          className="ml-auto rounded-full px-3 py-1.5 text-xs font-medium text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50"
        >
          Beispieldaten
        </button>
      </header>
      {/* Fortschritt */}
      <div className="flex gap-1 bg-white/70 px-4 pb-2.5 backdrop-blur">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <span
            key={i}
            className={cn('h-1 flex-1 rounded-full transition-colors', i <= shownStep ? 'bg-brand-400' : 'bg-stone-200')}
          />
        ))}
      </div>

      {/* Verlauf */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-xl flex-col gap-2.5" role="log" aria-live="polite" aria-label="Gespräch mit dem SemBan-Assistenten">
          {msgs.map((m) => (
            <Bubble key={m.id} role={m.role}>{m.text}</Bubble>
          ))}
          {typing && (
            <Bubble role="bot">
              <span className="inline-flex gap-1 py-0.5" aria-label="SemBan schreibt">
                <Dot /> <Dot d="0.15s" /> <Dot d="0.3s" />
              </span>
            </Bubble>
          )}

          {/* Kurs-Chips (mit Termin-/Klausur-Hinweis in den Bestätigungs-Schritten) */}
          {(phase === 'courses' || phase === 'prior' || phase === 'priorInput') && courses.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {courses.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-2 pr-1 text-xs font-medium text-stone-700 ring-1 ring-stone-200"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                  {c.slots.length > 0 && (
                    <span className="text-[10px] font-normal text-stone-400">
                      {c.slots.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.start}`).join(' · ')}
                    </span>
                  )}
                  {c.exam && (
                    <span className="text-[10px] font-normal text-amber-600">📝 {format(new Date(c.exam), 'dd.MM.')}</span>
                  )}
                  {phase === 'courses' && (
                    <button onClick={() => removeCourse(i)} aria-label={`${c.name} entfernen`} className="rounded-full p-0.5 text-stone-300 hover:bg-stone-100 hover:text-stone-500">
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Stundenplan-Editor (strukturiert, kein Freitext) */}
          {phase === 'times' && courses.length > 0 && (
            <div className="mt-1 rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-stone-200">
              {courses.map((c, i) => (
                <div key={i} className="border-b border-stone-100 py-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 truncate font-medium text-stone-800">{c.name}</span>
                    {slotEdit?.course !== i && (
                      <button onClick={() => openSlotEdit(i)} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200">
                        + Zeit
                      </button>
                    )}
                  </div>
                  {c.slots.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5">
                      {c.slots.map((s) => (
                        <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-stone-50 px-2 py-0.5 text-[11px] text-stone-600 ring-1 ring-stone-200">
                          {WEEKDAY_SHORT[s.weekday]} {s.start}–{s.end}{s.room ? ` · ${s.room}` : ''}
                          <button onClick={() => removeSlot(i, s.id)} aria-label="Termin entfernen" className="text-stone-300 hover:text-stone-500">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {slotEdit?.course === i && (
                    <div className="mt-2 space-y-2 rounded-xl bg-stone-50 p-2.5">
                      <div className="flex flex-wrap gap-1">
                        {[1, 2, 3, 4, 5, 6].map((d) => (
                          <button
                            key={d}
                            onClick={() => setSlotEdit((s) => (s ? { ...s, weekday: d } : s))}
                            aria-pressed={slotEdit.weekday === d}
                            className={cn('rounded-full px-2.5 py-1 text-xs font-medium', slotEdit.weekday === d ? 'bg-brand-400 text-stone-900' : 'bg-white text-stone-500 ring-1 ring-stone-200')}
                          >
                            {WEEKDAY_SHORT[d]}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="time" value={slotEdit.start} aria-label="Beginn" onChange={(e) => setSlotEdit((s) => (s ? { ...s, start: e.target.value } : s))} className="rounded-lg border border-stone-200 px-2 py-1 text-xs outline-none focus:border-brand-400" />
                        <span className="text-stone-400">–</span>
                        <input type="time" value={slotEdit.end} aria-label="Ende" onChange={(e) => setSlotEdit((s) => (s ? { ...s, end: e.target.value } : s))} className="rounded-lg border border-stone-200 px-2 py-1 text-xs outline-none focus:border-brand-400" />
                        <input value={slotEdit.room} placeholder="Raum (optional)" aria-label="Raum" onChange={(e) => setSlotEdit((s) => (s ? { ...s, room: e.target.value } : s))} className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1 text-xs outline-none focus:border-brand-400" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={addSlot} disabled={!slotEdit.weekday} className="rounded-full bg-brand-400 px-3 py-1 text-xs font-semibold text-stone-900 disabled:opacity-40">Hinzufügen</button>
                        <button onClick={() => setSlotEdit(null)} className="rounded-full px-3 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100">Abbrechen</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Klausur-Editor (nativer Datums-Picker je Kurs) */}
          {phase === 'exams' && courses.length > 0 && (
            <div className="mt-1 rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-stone-200">
              {courses.map((c, i) => (
                <div key={i} className="flex items-center gap-2 border-b border-stone-100 py-2 last:border-0">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="flex-1 truncate font-medium text-stone-800">{c.name}</span>
                  <input
                    type="date" value={c.exam || ''} min={todayISO}
                    aria-label={`Klausurdatum ${c.name}`}
                    onChange={(e) => setExam(i, e.target.value)}
                    className="rounded-lg border border-stone-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
                  />
                  {c.exam && (
                    <button onClick={() => setExam(i, '')} aria-label="Datum entfernen" className="rounded-md p-1 text-stone-300 hover:text-stone-500">
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Überblick zum Bestätigen */}
          {phase === 'review' && (
            <div className="mt-1 rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-stone-200">
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Dein Überblick</div>
              <SumRow label="Studiengang" value={`${draft.current.name} · ${TYPE_LABEL[draft.current.type]}`} />
              <SumRow
                label="Semester"
                value={`${draft.current.semName} · ab ${format(new Date(draft.current.semStart), 'dd.MM.yyyy')} · ${draft.current.semWeeks} Wochen`}
              />
              <SumRow
                label="Vorerfahrung"
                value={draft.current.priorEcts ? `${draft.current.priorEcts} ECTS · Ø ${draft.current.priorAvg || '—'}` : 'Erstsemester'}
              />
              <div className="mb-1.5 mt-3 text-[11px] font-medium text-stone-500">
                Kurse ({courses.length}) · Kürzel & Blätter (📄) hier anpassbar
              </div>
              <div className="space-y-1.5">
                {courses.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-stone-800">{c.name}</div>
                      <div className="text-[11px] text-stone-400">
                        {c.slots.length ? c.slots.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.start}`).join(' · ') : 'keine Zeit'}
                        {c.weekly ? ' · wöchentl. Blatt' : ''}
                        {c.exam ? ` · Klausur ${format(new Date(c.exam), 'dd.MM.')}` : ''}
                      </div>
                    </div>
                    <input
                      value={c.short}
                      onChange={(e) => editShort(i, e.target.value)}
                      aria-label={`Kürzel für ${c.name}`}
                      className="w-16 rounded-md border border-stone-200 px-2 py-1 text-center text-xs font-semibold uppercase outline-none focus:border-brand-400"
                    />
                    <button
                      onClick={() => toggleWeekly(i)}
                      title="Wöchentliche Übungsblätter"
                      aria-label={`Wöchentliche Übungsblätter für ${c.name} ${c.weekly ? 'aus' : 'ein'}schalten`}
                      aria-pressed={c.weekly}
                      className={cn('shrink-0 rounded-md p-1.5 transition', c.weekly ? 'bg-brand-400 text-stone-900' : 'text-stone-300 hover:bg-stone-100 hover:text-stone-500')}
                    >
                      <FileText size={14} />
                    </button>
                    <button
                      onClick={() => removeCourse(i)}
                      title="Entfernen"
                      className="shrink-0 rounded-md p-1.5 text-stone-300 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Antwort-Optionen & Aktionen — direkt im Verlauf, unter der Frage. */}
          {phase === 'subject' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COMMON_PROGRAMS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => pickSubject(p.name)}
                  className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-[.98]"
                >
                  <span className="text-lg leading-none">{p.icon}</span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}

          {phase === 'type' && (
            <ChipRow>
              {(['bachelor', 'master', 'other'] as ProgramType[]).map((t) => (
                <Chip key={t} onClick={() => chooseType(t)}>{TYPE_LABEL[t]}</Chip>
              ))}
            </ChipRow>
          )}

          {phase === 'fachsemester' && (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  onClick={() => chooseFs(n)}
                  aria-label={`${n}. Fachsemester`}
                  className="h-10 w-10 rounded-full bg-white text-sm font-semibold text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-95"
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {phase === 'courses' && courses.length > 0 && (
            <ChipRow>
              <Chip primary onClick={coursesDone}>{reviewing.current ? 'Fertig' : `Weiter (${courses.length})`}</Chip>
            </ChipRow>
          )}

          {phase === 'finishOrMore' && (
            <ChipRow>
              <Chip onClick={goMore}>Mehr einrichten</Chip>
              <Chip primary onClick={() => { pushUser('Direkt loslegen 🚀'); void finish() }}>Direkt loslegen 🚀</Chip>
            </ChipRow>
          )}

          {phase === 'times' && (
            <ChipRow>
              <Chip primary onClick={timesDone}>{courses.some((c) => c.slots.length) ? 'Fertig — weiter' : 'Überspringen'}</Chip>
            </ChipRow>
          )}

          {phase === 'exams' && (
            <ChipRow>
              <Chip primary onClick={examsDone}>{courses.some((c) => c.exam) ? 'Fertig — weiter' : 'Überspringen'}</Chip>
            </ChipRow>
          )}

          {phase === 'weeklyWhich' && (
            <div className="space-y-2">
              <ChipRow>
                {courses.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => toggleWeekly(i)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-[.98]',
                      c.weekly ? 'bg-brand-400 text-stone-900' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50',
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.short}
                  </button>
                ))}
              </ChipRow>
              <ChipRow>
                <Chip primary onClick={weeklyWhichDone}>
                  {courses.some((c) => c.weekly) ? `Weiter (${courses.filter((c) => c.weekly).length})` : 'Keine — weiter'}
                </Chip>
              </ChipRow>
            </div>
          )}

          {phase === 'weeklyDay' && (
            <ChipRow>
              {[1, 2, 3, 4, 5].map((d) => (
                <Chip key={d} primary={d === 5} onClick={() => chooseWeeklyDay(d)}>{WEEKDAY_SHORT[d]}</Chip>
              ))}
            </ChipRow>
          )}

          {phase === 'prior' && (
            <ChipRow>
              <Chip onClick={() => choosePrior(false)}>Erstsemester / nein</Chip>
              <Chip primary onClick={() => choosePrior(true)}>Ja, eintragen</Chip>
            </ChipRow>
          )}

          {phase === 'priorInput' && (
            <div className="flex items-center gap-2">
              <input
                type="number" inputMode="decimal" value={priorEcts}
                onChange={(e) => setPriorEcts(e.target.value)} placeholder="bisherige ECTS"
                className="w-full rounded-full border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-brand-400"
              />
              <input
                type="number" inputMode="decimal" step="0.1" value={priorAvg}
                onChange={(e) => setPriorAvg(e.target.value)} placeholder="Schnitt z.B. 2,1"
                className="w-full rounded-full border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-brand-400"
              />
              <button onClick={submitPrior} aria-label="Übernehmen" className="shrink-0 rounded-full bg-brand-400 p-2.5 text-stone-900 hover:bg-brand-500">
                <Send size={16} />
              </button>
            </div>
          )}

          {phase === 'review' && (
            <ChipRow>
              <Chip onClick={editCoursesFromReview}>Kurse bearbeiten</Chip>
              <Chip primary onClick={() => void finish()}>Los geht&apos;s 🚀</Chip>
            </ChipRow>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Eingabe-Leiste: nur noch Texteingabe (falls relevant), sonst Vertrauens-Hinweis. */}
      <div
        className="border-t border-stone-200/70 bg-white/70 px-4 py-3 backdrop-blur"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-xl">
          {showText && (
            <div className="flex items-end gap-2">
              <textarea
                rows={multiline ? 2 : 1} value={text}
                aria-label="Deine Antwort"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !multiline) { e.preventDefault(); onSubmitText() }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && multiline) { e.preventDefault(); onSubmitText() }
                }}
                placeholder={placeholder}
                className="max-h-32 w-full resize-none rounded-2xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-brand-400"
              />
              <button
                onClick={onSubmitText}
                disabled={!text.trim()}
                aria-label="Senden"
                className="shrink-0 rounded-full bg-brand-400 p-2.5 text-stone-900 hover:bg-brand-500 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          )}

          {!showText && (
            <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-stone-400">
              <Sparkles size={12} /> Sicher in deinem Konto · auf allen Geräten synchron
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

function Bubble({ role, children }: { role: 'bot' | 'user'; children: React.ReactNode }) {
  const bot = role === 'bot'
  return (
    <div className={cn('flex', bot ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-snug shadow-sm',
          bot ? 'rounded-bl-md bg-white text-stone-700 ring-1 ring-stone-200' : 'rounded-br-md bg-brand-400 text-stone-900',
        )}
      >
        {children}
      </div>
    </div>
  )
}
function Dot({ d = '0s' }: { d?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-stone-300"
      style={{ animation: 'sb-typing 1s infinite', animationDelay: d }}
    />
  )
}
function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-24 shrink-0 text-stone-400">{label}</span>
      <span className="min-w-0 flex-1 font-medium text-stone-700">{value}</span>
    </div>
  )
}
function ChipRow({ children }: { children: React.ReactNode }) {
  // Antwort-Optionen linksbündig im Verlauf – direkt unter der Bot-Frage.
  return <div className="flex flex-wrap gap-2">{children}</div>
}
function Chip({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-2 text-sm font-medium transition active:scale-[.98]',
        primary
          ? 'bg-brand-400 text-stone-900 hover:bg-brand-500'
          : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50',
      )}
    >
      {children}
    </button>
  )
}
