import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  ariaLabel?: string
}

/** Gestyltes Dropdown im App-Stil (ersetzt native <select>). */
export function Select({ value, options, onChange, className, placeholder, ariaLabel }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cur = options.find((o) => o.value === value)

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

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-left text-sm transition',
          open ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-stone-200 hover:border-stone-300',
        )}
      >
        <span className={cn('truncate', cur ? 'text-stone-800' : 'text-stone-400')}>
          {cur?.label ?? placeholder ?? '–'}
        </span>
        <ChevronDown size={14} className="shrink-0 text-stone-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 max-h-60 min-w-full overflow-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm transition',
                o.value === value
                  ? 'bg-brand-100 font-medium text-stone-800'
                  : 'text-stone-600 hover:bg-stone-100',
              )}
            >
              {o.label}
              {o.value === value && <Check size={14} className="text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
