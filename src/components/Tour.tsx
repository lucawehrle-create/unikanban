import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useUI, type ViewId } from '@/store/ui'
import { markTourSeen } from '@/lib/tour'

interface TourStep {
  target: string // data-tour="…"
  title: string
  body: string
  view?: ViewId
}

const STEPS: TourStep[] = [
  {
    target: 'schedule',
    view: 'schedule',
    title: 'Dein Stundenplan steht 🎉',
    body: 'Automatisch aus deinem Semester – deine Woche mit allen Veranstaltungen auf einen Blick. Parallele Kurse liegen nebeneinander.',
  },
  {
    target: 'nav',
    view: 'board',
    title: 'Vier Ansichten',
    body: '„Aufgaben" für den Überblick, „Diese Woche" für den Fokus, „Stundenplan" für deinen Rhythmus und „Studium" für Noten & ECTS.',
  },
  {
    target: 'quickadd',
    view: 'board',
    title: 'Aufgaben in Sekunden',
    body: 'Tippe einfach den Titel. Mit Kürzeln ordnest du direkt zu: # für den Kurs, @ für die Art, ! für die Frist. Aus „Blatt 3 #ana2 @übung !fr" wird: Blatt 3 · Kurs ANA2 · Übung · fällig Freitag.',
  },
  {
    target: 'filter',
    view: 'board',
    title: 'Filtern & gruppieren',
    body: 'Nach Kurs oder Typ filtern, suchen („/") und deine Aufgaben nach Status, Frist, Kurs oder Typ gruppieren.',
  },
  {
    target: 'semester',
    view: 'board',
    title: 'Semester & Phase',
    body: 'Hier siehst du dein aktives Semester und die aktuelle Phase (z. B. Vorlesungszeit oder Klausurenphase). Ein Klick wechselt Semester oder Studiengang.',
  },
  {
    target: 'courses',
    view: 'board',
    title: 'Kurse anlegen',
    body: 'Lege Kurse mit Stundenplan an – wöchentliche Aufgaben (z. B. Übungsblätter) erstellt SemBan dann automatisch fürs ganze Semester.',
  },
  {
    target: 'tab-study',
    view: 'study',
    title: 'Dein Studium im Blick',
    body: 'ECTS-Fortschritt und Notenschnitt – kumuliert über alle Semester, Bachelor und Master getrennt.',
  },
]

const PAD = 8

/** Sichtbares Ziel-Element finden (Desktop- und Mobil-Nav teilen sich data-tour;
 *  das jeweils versteckte hat Größe 0 und wird übersprungen). */
function findVisibleTarget(target: string): DOMRect | null {
  const els = document.querySelectorAll(`[data-tour="${target}"]`)
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return r
  }
  return null
}

export function Tour() {
  const active = useUI((s) => s.tour)
  const setTour = useUI((s) => s.setTour)
  const setView = useUI((s) => s.setView)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Bei Start auf Schritt 0 zurück
  useEffect(() => {
    if (active) setI(0)
  }, [active])

  // Element des aktuellen Schritts finden & vermessen (mit Retries nach View-Wechsel)
  useEffect(() => {
    if (!active) return
    const step = STEPS[i]
    if (step.view) setView(step.view)
    setRect(null) // beim Schrittwechsel zurücksetzen (kein veraltetes Spotlight)

    let raf = 0
    let tries = 0
    const locate = () => {
      const r = findVisibleTarget(step.target)
      if (r) setRect(r)
      else if (tries++ < 40) raf = requestAnimationFrame(locate)
    }
    locate()

    const onMove = () => {
      const r = findVisibleTarget(step.target)
      if (r) setRect(r)
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [active, i, setView])

  function finish() {
    markTourSeen()
    setTour(false)
    setView('board')
    setI(0)
  }

  if (!active) return null

  const step = STEPS[i]
  const last = i === STEPS.length - 1

  const panel = (
    <div
      className="pointer-events-auto rounded-2xl bg-white p-4 shadow-xl ring-1 ring-stone-200"
      style={{ width: 320, maxWidth: '90vw' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-stone-800">{step.title}</h3>
          <button
            onClick={finish}
            className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            aria-label="Tour beenden"
          >
            <X size={15} />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-stone-500">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          {/* Fortschritt */}
          <div className="flex gap-1.5">
            {STEPS.map((_, j) => (
              <span
                key={j}
                className={`h-1.5 rounded-full transition-all ${
                  j === i ? 'w-5 bg-brand-400' : 'w-1.5 bg-stone-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            {i > 0 && (
              <button
                onClick={() => setI((n) => n - 1)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
              >
                <ArrowLeft size={13} /> Zurück
              </button>
            )}
            <button
              onClick={() => (last ? finish() : setI((n) => n + 1))}
              className="flex items-center gap-1 rounded-full bg-brand-400 px-3.5 py-1.5 text-xs font-semibold text-stone-900 hover:bg-brand-500"
            >
              {last ? (
                <>
                  <Check size={14} /> Fertig
                </>
              ) : (
                <>
                  Weiter <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>

        {!last && (
          <button
            onClick={finish}
            className="mt-2 w-full text-center text-[11px] text-stone-400 hover:text-stone-600"
          >
            Tour überspringen
          </button>
        )}
    </div>
  )

  // Ziel (noch) nicht gefunden → zentrierter Fallback, damit die Tour nie
  // unsichtbar, aber aktiv ("tot") ist.
  if (!rect) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-stone-900/45" onClick={finish} />
        <div className="relative">{panel}</div>
      </div>
    )
  }

  // Spotlight + positioniertes Tooltip
  const top = rect.top - PAD
  const left = rect.left - PAD
  const w = rect.width + PAD * 2
  const h = rect.height + PAD * 2
  const below = top + h + 12 + 190 < window.innerHeight
  const ttTop = Math.max(12, below ? top + h + 12 : top - 12)
  const ttLeft = Math.max(12, Math.min(left, window.innerWidth - 332))

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="pointer-events-none absolute rounded-xl ring-2 ring-brand-400/70 transition-all duration-300"
        style={{ top, left, width: w, height: h, boxShadow: '0 0 0 9999px rgba(28,25,23,0.55)' }}
      />
      <div className="absolute inset-0" onClick={finish} />
      <div
        className="absolute"
        style={{ top: ttTop, left: ttLeft, transform: below ? undefined : 'translateY(-100%)' }}
      >
        {panel}
      </div>
    </div>
  )
}
