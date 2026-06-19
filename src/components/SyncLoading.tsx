import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, LogOut } from 'lucide-react'
import { syncNow } from '@/lib/sync'
import { signOut } from '@/lib/auth'

/**
 * Zwischenscreen, während nach dem Login die Cloud-Daten geladen werden.
 * Dauert es ungewöhnlich lange (langsames/abgebrochenes Netz), gibt es einen
 * klaren Ausweg – damit man nie auf einem hängenden Ladescreen festsitzt.
 */
export function SyncLoading() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Loader2 size={26} className="animate-spin text-brand-500" />
      <p className="text-sm text-stone-500">Deine Daten werden geladen…</p>
      {slow && (
        <div className="mt-2 flex flex-col items-center gap-3">
          <p className="max-w-xs text-xs text-stone-400">
            Das dauert ungewöhnlich lange. Prüfe deine Verbindung.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void syncNow()}
              className="flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              <RefreshCw size={15} /> Erneut versuchen
            </button>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
            >
              <LogOut size={15} /> Abmelden
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
