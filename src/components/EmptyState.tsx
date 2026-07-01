import type { ReactNode } from 'react'
import { Mascot, type MascotPose } from './Mascot'

interface Action {
  label: string
  onClick: () => void
  icon?: ReactNode
}

/** Freundlicher Leer-Zustand: Sem (oder Icon), Titel, Erklärung und Aktionen. */
export function EmptyState({
  icon,
  mascot,
  title,
  description,
  primary,
  secondary,
}: {
  icon: ReactNode
  /** Zeigt statt des Icon-Kachel-Symbols das Maskottchen Sem. */
  mascot?: MascotPose
  title: string
  description: string
  primary?: Action
  secondary?: Action
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      {mascot ? (
        <Mascot pose={mascot} size={128} className="drop-shadow-sm" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-500 shadow-sm ring-1 ring-stone-200/70">
          {icon}
        </div>
      )}
      <h2 className="mt-5 text-lg font-semibold text-stone-800">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-stone-500">{description}</p>
      {(primary || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primary && (
            <button
              onClick={primary.onClick}
              className="flex items-center gap-1.5 rounded-full bg-brand-400 px-5 py-2.5 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-brand-500"
            >
              {primary.icon}
              {primary.label}
            </button>
          )}
          {secondary && (
            <button
              onClick={secondary.onClick}
              className="flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-50"
            >
              {secondary.icon}
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
