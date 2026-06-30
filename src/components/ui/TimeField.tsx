import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/cn'

interface TimeFieldProps {
  value: string // "HH:mm"
  onChange: (value: string) => void
  className?: string
  minuteStep?: number
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))

/** Gestylter Zeit-Picker (ersetzt natives <input type="time">). */
export function TimeField({ value, onChange, className, minuteStep = 5 }: TimeFieldProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [h, m] = value.split(':')
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) =>
    String(i * minuteStep).padStart(2, '0'),
  )

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault() // nur Popover schließen, nicht ein umgebendes Modal
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const set = (hh: string, mm: string) => onChange(`${hh}:${mm}`)

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-sm transition',
          open ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-stone-200 hover:border-stone-300',
        )}
      >
        <Clock size={14} className="shrink-0 text-stone-400" />
        <span className="text-stone-800">{value || '––:––'}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 flex h-44 w-28 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl">
          <div className="flex-1 overflow-y-auto p-1">
            {HOURS.map((hh) => (
              <button
                key={hh}
                type="button"
                onClick={() => set(hh, m ?? '00')}
                className={cn(
                  'block w-full rounded-md px-2 py-1 text-center text-sm transition',
                  hh === h ? 'bg-brand-400 font-semibold text-stone-900' : 'text-stone-600 hover:bg-stone-100',
                )}
              >
                {hh}
              </button>
            ))}
          </div>
          <div className="w-px bg-stone-100" />
          <div className="flex-1 overflow-y-auto p-1">
            {minutes.map((mm) => (
              <button
                key={mm}
                type="button"
                onClick={() => set(h ?? '00', mm)}
                className={cn(
                  'block w-full rounded-md px-2 py-1 text-center text-sm transition',
                  mm === m ? 'bg-brand-400 font-semibold text-stone-900' : 'text-stone-600 hover:bg-stone-100',
                )}
              >
                {mm}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
