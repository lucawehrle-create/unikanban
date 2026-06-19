import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

/**
 * Zeigt einen Hinweis, sobald eine neue Version im Hintergrund bereitliegt.
 * Erst per Klick wird aktualisiert & neu geladen – kein erzwungener Reload
 * mitten in der Arbeit, und kein manuelles Hard-Reload mehr nötig.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:bottom-4 sm:px-0">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-xl">
        <RefreshCw size={18} className="shrink-0 text-brand-300" />
        <div className="flex-1 leading-tight">
          <div className="font-semibold">Neue Version verfügbar</div>
          <div className="text-xs text-stone-300">Neu laden, um zu aktualisieren.</div>
        </div>
        <button
          onClick={() => void updateServiceWorker(true)}
          className="rounded-full bg-brand-400 px-3.5 py-1.5 text-xs font-semibold text-stone-900 transition hover:bg-brand-300"
        >
          Neu laden
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Hinweis schließen"
          className="rounded-full p-1 text-stone-400 transition hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
