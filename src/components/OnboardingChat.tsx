import { useEffect, useRef, useState } from 'react'
import { startOfWeek, format } from 'date-fns'
import { Send, Sparkles, X } from 'lucide-react'
import { Logo } from './Logo'
import type { ProgramType } from '@/db/types'
import { db, uid } from '@/db/db'
import { createProgram, createSemester } from '@/lib/actions'
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

interface CourseDraft {
  name: string
  short: string
  color: string
}
function toDraft(name: string, idx: number): CourseDraft {
  return { name, short: name.replace(/\s+/g, '').slice(0, 4).toUpperCase(), color: PALETTE[idx % PALETTE.length] }
}

type Msg = { id: string; role: 'bot' | 'user'; text: string }
type Phase =
  | 'boot' | 'subject' | 'type' | 'semester' | 'semesterCustom'
  | 'courses' | 'prior' | 'priorInput' | 'done'

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
  const [priorEcts, setPriorEcts] = useState('')
  const [priorAvg, setPriorAvg] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

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
    setPhase('boot')
    void say(['Hast du schon ECTS oder einen Schnitt aus früheren Semestern?'], 'prior')
  }

  function choosePrior(withPrior: boolean) {
    if (!withPrior) {
      pushUser('Erstsemester / nein')
      void finish()
      return
    }
    pushUser('Ja, eintragen')
    setPhase('priorInput')
  }

  function submitPrior() {
    draft.current.priorEcts = Number(priorEcts) || 0
    draft.current.priorAvg = Number(priorAvg) || 0
    pushUser(`${draft.current.priorEcts || 0} ECTS · Ø ${draft.current.priorAvg || '—'}`)
    void finish()
  }

  async function finish() {
    if (busy) return
    setBusy(true)
    setPhase('done')
    await say(['Perfekt — ich leg alles an … 🚀'], 'done')
    try {
      const d = draft.current
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
      const toAdd = d.courses
        .filter((c) => c.name.trim())
        .map((c) => ({
          id: uid(),
          semesterId: sid,
          name: c.name.trim(),
          short: (c.short.trim() || c.name.slice(0, 4)).toUpperCase(),
          color: c.color,
          slots: [],
        }))
      if (toAdd.length) await db.courses.bulkAdd(toAdd)
      // App rendert nach Anlegen automatisch um (programCount > 0).
    } catch {
      setBusy(false)
      setPhase('boot')
      void say(['Da ist etwas schiefgelaufen 😕 — bitte versuch es nochmal.'], 'prior')
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
  const showText = phase === 'subject' || phase === 'semesterCustom' || phase === 'courses'
  const placeholder =
    phase === 'subject' ? 'z.B. Informatik Bachelor, 3. Semester'
      : phase === 'semesterCustom' ? 'z.B. WiSe 2026/27'
        : 'z.B. Analysis II, Lineare Algebra, Programmierung'
  function onSubmitText() {
    if (phase === 'subject') submitSubject()
    else if (phase === 'semesterCustom') submitSemesterCustom()
    else if (phase === 'courses') addCourses()
  }

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

          {/* Kurs-Chips */}
          {(phase === 'courses' || phase === 'prior' || phase === 'priorInput') && courses.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {courses.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-2 pr-1 text-xs font-medium text-stone-700 ring-1 ring-stone-200"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                  {phase === 'courses' && (
                    <button onClick={() => removeCourse(i)} className="rounded-full p-0.5 text-stone-300 hover:bg-stone-100 hover:text-stone-500">
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
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
                  {courses.length ? `Passt — weiter (${courses.length})` : 'Weiter'}
                </Chip>
              </ChipRow>
            </div>
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

          {showText && (
            <div className="flex items-end gap-2">
              <textarea
                autoFocus rows={phase === 'courses' ? 2 : 1} value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && phase !== 'courses') { e.preventDefault(); onSubmitText() }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && phase === 'courses') { e.preventDefault(); onSubmitText() }
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
