import { type ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Hat ein offenes Popover (Select/DatePicker/TimeField) das Escape schon
      // verarbeitet (preventDefault), schließt das Modal NICHT mit – sonst gingen
      // Formulareingaben verloren, statt nur das Popover zu schließen.
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/30 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-cream-50 shadow-xl ring-1 ring-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-stone-800">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
