import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Fängt Render-Fehler ab, damit ein einzelner kaputter Bereich nicht die ganze
 * App auf einen weißen Bildschirm wirft. Die lokalen Daten (IndexedDB) bleiben
 * unangetastet – ein Neuladen genügt meist.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App-Fehler abgefangen:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream-50 p-6 text-center">
        <div className="text-4xl">😕</div>
        <div className="max-w-sm space-y-1.5">
          <h1 className="text-lg font-bold text-stone-800">Da ist etwas schiefgelaufen</h1>
          <p className="text-sm text-stone-500">
            Deine Daten sind sicher gespeichert. Lade die Seite neu – meist läuft danach alles
            wieder.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-brand-400 px-5 py-2.5 text-sm font-semibold text-stone-900 transition hover:bg-brand-500"
        >
          Neu laden
        </button>
      </div>
    )
  }
}
