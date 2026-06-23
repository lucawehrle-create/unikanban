import { useState } from 'react'
import { Sparkles, X, Check, Loader2 } from 'lucide-react'
import { useSync } from '@/lib/sync'
import { isSyncConfigured } from '@/lib/supabase'
import { recordCoachInterest, type PaySignal } from '@/lib/feedback'
import { cn } from '@/lib/cn'

const DISMISS_KEY = 'semban:coachTeaser'

const OPTIONS: { id: PaySignal; label: string }[] = [
  { id: 'yes', label: 'Ja, klar' },
  { id: 'maybe', label: 'Vielleicht' },
  { id: 'free_only', label: 'Nur kostenlos' },
]

function alreadyHandled(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}
function markHandled() {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}

/**
 * Dezenter Nachfrage-Test für einen geplanten KI-Lerncoach: misst Interesse +
 * Zahlungsbereitschaft, bevor irgendetwas gebaut wird. Erscheint nur einmal
 * (eingeloggt), speichert das Signal in Supabase und blendet sich danach aus.
 */
export function CoachTeaser() {
  const user = useSync((s) => s.user)
  const [hidden, setHidden] = useState(alreadyHandled)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Braucht ein Konto (Signal landet serverseitig). Sonst nicht anzeigen.
  if (hidden || !isSyncConfigured || !user) return null

  const choose = async (paySignal: PaySignal) => {
    if (busy) return
    setBusy(true)
    try {
      await recordCoachInterest(paySignal, note)
      markHandled()
      setDone(true)
    } catch {
      // Bei Fehler trotzdem nicht nerven – lokal merken.
      markHandled()
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = () => {
    markHandled()
    setHidden(true)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-50 to-cream-50 p-4 ring-1 ring-indigo-100">
      <button
        onClick={dismiss}
        aria-label="Ausblenden"
        className="absolute right-2.5 top-2.5 rounded-full p-1 text-stone-300 transition hover:bg-white/60 hover:text-stone-500"
      >
        <X size={16} />
      </button>

      {done ? (
        <div className="flex items-center gap-2 py-1 text-sm font-medium text-indigo-700">
          <Check size={16} /> Danke! Du stehst auf der Liste – wir melden uns.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500 text-white">
              <Sparkles size={15} />
            </span>
            <span className="text-sm font-semibold text-stone-800">KI-Lerncoach · in Planung</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
            Ein Coach, der deine Fristen, Noten und deinen Lernplan kennt: sagt dir, was heute dran
            ist, plant um, wenn’s eng wird, und hilft, wenn’s zu viel wird. Hättest du Interesse –
            wäre dir das einen kleinen Aufpreis wert?
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional: Was sollte der Coach unbedingt können?"
            className="mt-3 w-full rounded-lg border border-stone-200 bg-white/70 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => choose(o.id)}
                disabled={busy}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition disabled:opacity-50',
                  o.id === 'yes'
                    ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                    : 'bg-white/80 text-stone-600 ring-1 ring-stone-200 hover:bg-white',
                )}
              >
                {busy && o.id === 'yes' && <Loader2 size={14} className="animate-spin" />}
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
