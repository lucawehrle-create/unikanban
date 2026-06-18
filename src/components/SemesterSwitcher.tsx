import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, GraduationCap, Settings2 } from 'lucide-react'
import type { Program, Semester } from '@/db/types'
import { switchSemester } from '@/lib/actions'
import { usePrograms, useSemesters } from '@/hooks/data'
import { getPhaseInfo } from '@/lib/semester'
import { useUI } from '@/store/ui'
import { cn } from '@/lib/cn'

/** Kompakte Phasen-Info als Text. */
function phaseText(semester: Semester): string {
  const info = getPhaseInfo(semester)
  if (info.phase === 'vorlesung') return `Vorlesungszeit · Woche ${info.week}/${info.weeks}`
  if (info.phase === 'klausurphase') return `Klausurenphase`
  if (info.phase === 'vor') return 'vor Vorlesungsbeginn'
  return 'vorlesungsfreie Zeit'
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
  const countdown =
    info.nextExam && info.nextExam.daysUntil >= 0 && info.nextExam.daysUntil <= 21
      ? `${info.nextExam.daysUntil} T bis Klausuren`
      : null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-white/70 px-3.5 py-2 text-left shadow-sm ring-1 ring-stone-200/70 backdrop-blur transition hover:bg-white"
      >
        <div className="leading-tight">
          <div className="flex items-center gap-1 text-xs font-semibold text-stone-700">
            {semester.name}
            <ChevronDown size={13} className="text-stone-400" />
          </div>
          <div className="text-[10px] text-stone-400">{phaseText(semester)}</div>
        </div>
        {countdown && (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
            {countdown}
          </span>
        )}
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
