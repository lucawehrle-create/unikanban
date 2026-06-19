import type { ReactNode } from 'react'

interface Action {
  label: string
  onClick: () => void
  icon?: ReactNode
}

/** Freundlicher Leer-Zustand: Icon, Titel, Erklärung und optionale Aktionen. */
export function EmptyState({
  icon,
  title,
  description,
  primary,
  secondary,
}: {
  icon: ReactNode
  title: string
  description: string
  primary?: Action
  secondary?: Action
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-500 shadow-sm ring-1 ring-stone-200/70">
        {icon}
      </div>
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
