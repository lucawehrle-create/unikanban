import { useState } from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import { useUI } from '@/store/ui'
import { resetAll } from '@/lib/backup'
import { Modal } from './Modal'

/**
 * Hinweisleiste beim Erkunden der Beispieldaten – mit klarem Ausweg
 * „Eigenes Studium starten" (verwirft das Demo und öffnet die Einrichtung).
 */
export function DemoBanner() {
  const setDemo = useUI((s) => s.setDemo)
  const [confirm, setConfirm] = useState(false)

  async function startOwn() {
    setDemo(false)
    await resetAll() // Demo verwerfen → leerer Stand → Einrichtung erscheint
    setConfirm(false)
  }

  return (
    <>
      <div className="mx-4 mb-1 mt-1 flex items-center gap-2 rounded-2xl bg-brand-100/80 px-3 py-2 text-sm text-stone-700 ring-1 ring-brand-300/60 sm:mx-5">
        <Sparkles size={15} className="shrink-0 text-brand-600" />
        <span className="min-w-0 flex-1 truncate">
          Du erkundest <strong>Beispieldaten</strong>.
        </span>
        <button
          onClick={() => setConfirm(true)}
          className="flex shrink-0 items-center gap-1 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-700"
        >
          Eigenes Studium starten <ArrowRight size={13} />
        </button>
      </div>

      {confirm && (
        <Modal
          title="Beispieldaten verwerfen?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <button
                onClick={() => setConfirm(false)}
                className="rounded-full px-4 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100"
              >
                Weiter erkunden
              </button>
              <button
                onClick={() => void startOwn()}
                className="rounded-full bg-brand-400 px-4 py-1.5 text-sm font-semibold text-stone-900 hover:bg-brand-500"
              >
                Eigenes Studium anlegen
              </button>
            </>
          }
        >
          <p className="text-sm text-stone-600">
            Die Beispieldaten werden entfernt und du richtest dein eigenes Studium ein. Das ist nur
            das Demo – es gehen keine echten Daten verloren.
          </p>
        </Modal>
      )}
    </>
  )
}
