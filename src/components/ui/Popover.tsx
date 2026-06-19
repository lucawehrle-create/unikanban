import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PopoverProps {
  label: string
  icon?: ReactNode
  badge?: number
  align?: 'left' | 'right'
  width?: number
  children: ReactNode | ((close: () => void) => ReactNode)
}

/** Pill-Trigger + Panel-Popover (Outside-Click/Escape schließt). */
export function Popover({ label, icon, badge, align = 'right', width = 260, children }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm ring-1 transition',
          badge
            ? 'bg-stone-900 text-white ring-stone-900'
            : 'bg-white/70 text-stone-600 ring-stone-200/70 hover:bg-white',
        )}
      >
        {icon}
        {label}
        {badge ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-stone-900">
            {badge}
          </span>
        ) : null}
        <ChevronDown size={13} className={badge ? 'text-white/70' : 'text-stone-400'} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1.5 rounded-2xl border border-stone-200 bg-white p-3 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          style={{ width }}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}
