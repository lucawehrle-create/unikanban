import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, GraduationCap, Settings2 } from 'lucide-react'
import type { Program, Semester } from '@/db/types'
import { switchSemester } from '@/lib/actions'
import { usePrograms, useSemesters } from '@/hooks/data'
import { getPhaseInfo } from '@/lib/semester'
import { useUI } from '@/store/ui'
import { cn } from '@/lib/cn'

/** Kompakte Phasen-Info (einzeilig) für den Trigger. */
function shortPhase(semester: Semester): string {
  const info = getPhaseInfo(semester)
  if (info.phase === 'vorlesung') return `Woche ${info.week}/${info.weeks}`
  if (info.phase === 'klausurphase') return 'Klausurenphase'
  if (info.phase === 'vor') return 'vor Beginn'
  return 'vorlesungsfrei'
}

export function SemesterSwitcher({ semester }: { semester: Semester }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const programs = usePrograms()
  const setView = useUI((s) => s.setView)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const info = getPhaseInfo(semester)
  const nearExam =
    info.nextExam && info.nextExam.daysUntil >= 0 && info.nextExam.daysUntil <= 14
      ? info.nextExam.daysUntil
      : null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Semester wechseln"
        className="flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-2 text-xs font-medium shadow-sm ring-1 ring-stone-200/70 backdrop-blur transition hover:bg-white"
      >
        <span className="font-semibold text-stone-700">{semester.name}</span>
        <span className="hidden text-stone-400 sm:inline">· {shortPhase(semester)}</span>
        {nearExam != null && (
          <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">
            {nearExam} T
          </span>
        )}
        <ChevronDown size={13} className="text-stone-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
          {programs.map((p) => (
            <ProgramGroup
              key={p.id}
              program={p}
              activeSemesterId={semester.id}
              onPick={async (id) => {
                await switchSemester(id)
                setOpen(false)
              }}
            />
          ))}
          <button
            onClick={() => {
              setView('study')
              setOpen(false)
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-stone-500 hover:bg-stone-100"
          >
            <Settings2 size={15} /> Studium verwalten
          </button>
        </div>
      )}
    </div>
  )
}

function ProgramGroup({
  program,
  activeSemesterId,
  onPick,
}: {
  program: Program
  activeSemesterId: string
  onPick: (id: string) => void
}) {
  const semesters = useSemesters(program.id)
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
        <GraduationCap size={12} /> {program.name}
      </div>
      {semesters.map((s) => (
        <button
          key={s.id}
          onClick={() => onPick(s.id)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm',
            s.id === activeSemesterId
              ? 'bg-brand-100 font-medium text-stone-800'
              : 'text-stone-600 hover:bg-stone-100',
          )}
        >
          {s.name}
          {s.id === activeSemesterId && <Check size={14} className="text-brand-600" />}
        </button>
      ))}
      {semesters.length === 0 && (
        <div className="px-2.5 py-1 text-xs text-stone-300">noch kein Semester</div>
      )}
    </div>
  )
}
