import { useEffect, useRef, useState } from 'react'
import { startOfWeek, format } from 'date-fns'
import { FileText, Send, Sparkles, X } from 'lucide-react'
import { Logo } from './Logo'
import type { Course, CourseSlot, ProgramType, RecurringConfig, SlotKind } from '@/db/types'
import { db, uid } from '@/db/db'
import { createProgram, createSemester } from '@/lib/actions'
import { generateRecurringTasks } from '@/lib/recurring'
import { seedIfEmpty } from '@/lib/seed'
import { useUI } from '@/store/ui'
import { cn } from '@/lib/cn'

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b',
]
const TARGET_BY_TYPE: Record<ProgramType, number> = { bachelor: 180, master: 120, other: 180 }
const TYPE_LABEL: Record<ProgramType, string> = { bachelor: 'Bachelor', master: 'Master', other: 'Sonstiges' }

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

// Wochentag → 1 = Montag … 7 = Sonntag (Slot-/Recurring-Konvention).
const WEEKDAY_1: Record<string, number> = {
  mo: 1, mon: 1, montag: 1, di: 2, die: 2, dienstag: 2, mi: 3, mit: 3, mittwoch: 3,
  do: 4, don: 4, donnerstag: 4, fr: 5, fre: 5, freitag: 5, sa: 6, sam: 6, samstag: 6, so: 7, son: 7, sonntag: 7,
}
const WEEKDAY_SHORT = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** „Mo 10-12 HS1" → Wochentag + Zeit + Raum. Kurszuordnung passiert außerhalb. */
function parseSlotFromText(rest: string): Omit<CourseSlot, 'id'> | null {
  const lower = rest.toLowerCase()
  let weekday = 0
  for (const tok of lower.split(/[\s,]+/)) {
    if (tok in WEEKDAY_1) { weekday = WEEKDAY_1[tok]; break }
  }
  if (!weekday) return null
  const m = rest.match(/(\d{1,2})(?::(\d{2}))?\s*(?:-|–|bis)\s*(\d{1,2})(?::(\d{2}))?/)
  if (!m) return null
  const start = `${pad2(Number(m[1]))}:${m[2] ?? '00'}`
  const end = `${pad2(Number(m[3]))}:${m[4] ?? '00'}`
  let kind: SlotKind = 'vorlesung'
  if (/tut/i.test(rest)) kind = 'tutorium'
  else if (/übung|ueb/i.test(rest)) kind = 'uebung'
  else if (/seminar/i.test(rest)) kind = 'seminar'
  // Raum = Rest nach Entfernen von Wochentag- und Zeit-Teil.
  const room = rest
    .replace(m[0], '')
    .replace(/\b(mo|di|mi|do|fr|sa|so|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/gi, '')
    .replace(/\b(vorlesung|vl|übung|ueb|tut(orium)?|seminar)\b/gi, '')
    .replace(/[,;]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { kind, weekday, start, end, room: room || undefined }
}

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
}
function toDraft(name: string, idx: number): CourseDraft {
  return { name, short: makeShort(name), color: PALETTE[idx % PALETTE.length], slots: [], weekly: false }
}

type Msg = { id: string; role: 'bot' | 'user'; text: string }
type Phase =
  | 'boot' | 'subject' | 'type' | 'semester' | 'semesterCustom'
  | 'courses' | 'times' | 'weeklyWhich' | 'weeklyDay'
  | 'prior' | 'priorInput' | 'review' | 'done'

// Fortschritt: welcher der sichtbaren Schritte ist aktiv (für die Kopf-Leiste).
const STEP_OF: Record<Phase, number> = {
  boot: 0, subject: 0, type: 0, semester: 1, semesterCustom: 1,
  courses: 2, times: 3, weeklyWhich: 4, weeklyDay: 4,
  prior: 5, priorInput: 5, review: 6, done: 6,
}
const TOTAL_STEPS = 7

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Konversationelles Onboarding: eine Frage nach der anderen, Parser darunter. */
export function OnboardingChat() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [phase, setPhase] = useState<Phase>('boot')
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  // Entwurfsdaten
  const draft = useRef({
    name: '', type: 'bachelor' as ProgramType, target: 180,
    semName: suggestSemester(),
    semStart: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    semWeeks: 14,
    courses: [] as CourseDraft[],
    priorEcts: 0, priorAvg: 0,
  })
  const [courses, setCourses] = useState<CourseDraft[]>([])
  const [weeklyDay, setWeeklyDay] = useState(5) // Fr
  const [priorEcts, setPriorEcts] = useState('')
  const [priorAvg, setPriorAvg] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const reviewing = useRef(false) // true, wenn vom Überblick aus Kurse bearbeitet werden
  const maxStep = useRef(0) // höchster erreichter Schritt (für die Fortschrittsleiste)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, typing, phase, courses])

  // Begrüßung
  useEffect(() => {
    if (started.current) return
    started.current = true
    void say(['Hi! 👋 Ich richte SemBan mit dir ein — das dauert keine Minute.', 'Was studierst du?'], 'subject')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function say(lines: string[], next: Phase) {
    for (const line of lines) {
      setTyping(true)
      await sleep(Math.min(700, 280 + line.length * 12))
      setTyping(false)
      setMsgs((m) => [...m, { id: uid(), role: 'bot', text: line }])
      await sleep(140)
    }
    setPhase(next)
  }
  const pushUser = (t: string) => setMsgs((m) => [...m, { id: uid(), role: 'user', text: t }])

  // ---- Schritt-Handler ----------------------------------------------------
  function submitSubject() {
    const v = text.trim()
    if (!v) return
    pushUser(v)
    setText('')
    const { name, type, fs } = parseSubject(v)
    draft.current.name = name
    setPhase('boot')
    if (type) {
      draft.current.type = type
      draft.current.target = TARGET_BY_TYPE[type]
      const fsNote = fs ? ` (${fs}. Semester)` : ''
      void say([`Alles klar: ${name} · ${TYPE_LABEL[type]}${fsNote}.`, 'Welches Semester läuft gerade?'], 'semester')
    } else {
      void say([`${name} — cool.`, 'Bachelor oder Master?'], 'type')
    }
  }

  function chooseType(t: ProgramType) {
    draft.current.type = t
    draft.current.target = TARGET_BY_TYPE[t]
    pushUser(TYPE_LABEL[t])
    setPhase('boot')
    void say(['Welches Semester läuft gerade?'], 'semester')
  }

  function chooseSemester(name: string) {
    draft.current.semName = name
    pushUser(name)
    setPhase('boot')
    void say(
      [
        `${name} — notiert.`,
        'Start setze ich auf diese Woche, 14 Wochen Vorlesungszeit (später unter „Studium" änderbar).',
        'Jetzt zu deinen Kursen 📚 — tipp sie einfach untereinander oder füg deinen Stundenplan ein.',
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
    setPhase('boot')
    void say(
      [
        'Wann finden die Vorlesungen statt? (optional)',
        'Schreib z.B. „Analysis II Mo 10-12 HS1" — eine Zeile pro Termin.',
      ],
      'times',
    )
  }

  function addTimes() {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return
    pushUser(text.trim())
    setText('')
    let matched = 0
    setCourses((cur) => {
      const next = cur.map((c) => ({ ...c, slots: [...c.slots] }))
      for (const line of lines) {
        // Kurs per Name/Kürzel am Zeilenanfang finden (längster Name zuerst).
        const idx = next
          .map((c, i) => ({ i, key: c.name.toLowerCase() }))
          .sort((a, b) => b.key.length - a.key.length)
          .find(({ i, key }) => {
            const low = line.toLowerCase()
            return low.includes(key) || low.startsWith(next[i].short.toLowerCase())
          })?.i
        if (idx == null) continue
        const c = next[idx]
        const rest = line
          .toLowerCase().includes(c.name.toLowerCase())
          ? line.slice(line.toLowerCase().indexOf(c.name.toLowerCase()) + c.name.length)
          : line.replace(new RegExp('^' + c.short, 'i'), '')
        const slot = parseSlotFromText(rest)
        if (!slot) continue
        c.slots.push({ id: uid(), ...slot })
        matched++
      }
      const missed = lines.length - matched
      const lines2: string[] = []
      if (matched) lines2.push(`${matched} Termin${matched > 1 ? 'e' : ''} eingetragen ✅`)
      if (missed) {
        lines2.push(
          matched
            ? `${missed} Zeile${missed > 1 ? 'n' : ''} konnte ich nicht zuordnen. Beginn am besten mit dem Kursnamen.`
            : `Das konnte ich keinem Kurs zuordnen. Beginn die Zeile mit dem Kursnamen, z.B.: ${next.map((c) => c.name).slice(0, 3).join(', ')}`,
        )
      }
      setPhase('boot')
      void say(lines2.length ? lines2 : ['Alles klar.'], 'times')
      return next
    })
  }

  function timesDone() {
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

  function weeklyWhichDone() {
    if (!courses.some((c) => c.weekly)) {
      pushUser('Keine')
      draft.current.courses = courses
      setPhase('boot')
      void say(['Alles klar, keine Serien.', 'Hast du schon ECTS oder einen Schnitt aus früheren Semestern?'], 'prior')
      return
    }
    pushUser(courses.filter((c) => c.weekly).map((c) => c.short).join(', '))
    setPhase('boot')
    void say(['An welchem Tag ist meist die Abgabe?'], 'weeklyDay')
  }

  function chooseWeeklyDay(day: number) {
    setWeeklyDay(day)
    pushUser(WEEKDAY_SHORT[day])
    draft.current.courses = courses
    setPhase('boot')
    void say(['Hast du schon ECTS oder einen Schnitt aus früheren Semestern?'], 'prior')
  }

  function choosePrior(withPrior: boolean) {
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
    const taskApprox = weeklyN * d.semWeeks
    setPhase('done')
    await say(
      [`Perfekt — ich lege dein Semester, ${list.length} Kurs${list.length === 1 ? '' : 'e'}${taskApprox ? ` und ~${taskApprox} Abgaben` : ''} an … 🚀`],
      'done',
    )
    try {
      useUI.getState().setDemo(false)
      const pid = await createProgram({
        name: d.name.trim() || 'Mein Studium',
        type: d.type,
        targetEcts: d.target,
        priorEcts: d.priorEcts || undefined,
        priorGradeAvg: d.priorAvg || undefined,
        priorGradedEcts: d.priorEcts || undefined,
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
      // Wöchentliche Serien → echte Aufgaben fürs ganze Semester materialisieren.
      if (sem) {
        const tasks = records.flatMap((c) => generateRecurringTasks(c, sem))
        if (tasks.length) await db.tasks.bulkAdd(tasks)
      }
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
      await seedIfEmpty()
      useUI.getState().setDemo(true)
    } finally {
      setBusy(false)
    }
  }

  // ---- Eingabezeile je nach Phase -----------------------------------------
  const multiline = phase === 'courses' || phase === 'times'
  const showText = phase === 'subject' || phase === 'semesterCustom' || phase === 'courses' || phase === 'times'
  const placeholder =
    phase === 'subject' ? 'z.B. Informatik Bachelor, 3. Semester'
      : phase === 'semesterCustom' ? 'z.B. WiSe 2026/27'
        : phase === 'times' ? 'z.B. Analysis II Mo 10-12 HS1'
          : 'z.B. Analysis II, Lineare Algebra, Programmierung'
  function onSubmitText() {
    if (phase === 'subject') submitSubject()
    else if (phase === 'semesterCustom') submitSemesterCustom()
    else if (phase === 'courses') addCourses()
    else if (phase === 'times') addTimes()
  }

  // Fortschritt steigt nur (kein Zurückspringen während „boot"/Tippen).
  if (phase !== 'boot') maxStep.current = Math.max(maxStep.current, STEP_OF[phase])
  const shownStep = maxStep.current

  return (
    <div className="flex h-full flex-col bg-cream-50">
      {/* Kopf */}
      <header className="flex items-center gap-3 border-b border-stone-200/70 bg-white/70 px-4 py-3 backdrop-blur">
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
        <div className="mx-auto flex max-w-md flex-col gap-2.5">
          {msgs.map((m) => (
            <Bubble key={m.id} role={m.role}>{m.text}</Bubble>
          ))}
          {typing && (
            <Bubble role="bot">
              <span className="inline-flex gap-1 py-0.5">
                <Dot /> <Dot d="0.15s" /> <Dot d="0.3s" />
              </span>
            </Bubble>
          )}

          {/* Kurs-Chips (mit Termin-Hinweis ab dem Zeiten-Schritt) */}
          {(phase === 'courses' || phase === 'times' || phase === 'prior' || phase === 'priorInput') && courses.length > 0 && (
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
                  {phase === 'courses' && (
                    <button onClick={() => removeCourse(i)} className="rounded-full p-0.5 text-stone-300 hover:bg-stone-100 hover:text-stone-500">
                      <X size={12} />
                    </button>
                  )}
                </span>
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

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Eingabe / Chips */}
      <div className="border-t border-stone-200/70 bg-white/70 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          {phase === 'type' && (
            <ChipRow>
              {(['bachelor', 'master', 'other'] as ProgramType[]).map((t) => (
                <Chip key={t} onClick={() => chooseType(t)}>{TYPE_LABEL[t]}</Chip>
              ))}
            </ChipRow>
          )}

          {phase === 'semester' && (
            <ChipRow>
              <Chip primary onClick={() => chooseSemester(suggestSemester())}>{suggestSemester()}</Chip>
              <Chip onClick={() => { setPhase('semesterCustom'); setText('') }}>Anderes…</Chip>
            </ChipRow>
          )}

          {phase === 'courses' && (
            <div className="space-y-2">
              <ChipRow>
                <Chip primary onClick={coursesDone}>
                  {reviewing.current ? 'Fertig' : courses.length ? `Passt — weiter (${courses.length})` : 'Weiter'}
                </Chip>
              </ChipRow>
            </div>
          )}

          {phase === 'times' && (
            <ChipRow>
              <Chip primary onClick={timesDone}>
                {courses.some((c) => c.slots.length) ? 'Fertig — weiter' : 'Überspringen'}
              </Chip>
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
                type="number" inputMode="decimal" autoFocus value={priorEcts}
                onChange={(e) => setPriorEcts(e.target.value)} placeholder="bisherige ECTS"
                className="w-full rounded-full border border-stone-200 px-4 py-2 text-sm outline-none focus:border-brand-400"
              />
              <input
                type="number" inputMode="decimal" step="0.1" value={priorAvg}
                onChange={(e) => setPriorAvg(e.target.value)} placeholder="Schnitt z.B. 2,1"
                className="w-full rounded-full border border-stone-200 px-4 py-2 text-sm outline-none focus:border-brand-400"
              />
              <button onClick={submitPrior} className="shrink-0 rounded-full bg-brand-400 p-2.5 text-stone-900 hover:bg-brand-500">
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

          {showText && (
            <div className="flex items-end gap-2">
              <textarea
                autoFocus rows={multiline ? 2 : 1} value={text}
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
                className="shrink-0 rounded-full bg-brand-400 p-2.5 text-stone-900 hover:bg-brand-500 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          )}

          {(phase === 'done' || phase === 'boot') && !showText && (
            <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-stone-400">
              <Sparkles size={12} /> Sicher in deinem Konto · auf allen Geräten synchron
            </div>
          )}
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
