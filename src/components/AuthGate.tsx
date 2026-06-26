import { ArrowLeft } from 'lucide-react'
import { Logo } from './Logo'
import { SignInPanel } from './SignInPanel'

type Mode = 'signin' | 'signup'

/** Vollbild-Anmeldung: ohne Login gibt es keinen Zugriff auf die Daten. */
export function AuthGate({ onBack, initialMode }: { onBack?: () => void; initialMode?: Mode }) {
  return (
    <div className="relative flex h-full items-center justify-center p-4">
      {onBack && (
        <button
          onClick={onBack}
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-sm font-medium text-stone-600 ring-1 ring-stone-200/70 backdrop-blur transition hover:bg-white"
        >
          <ArrowLeft size={15} /> Zurück
        </button>
      )}
      <div className="w-full max-w-sm rounded-3xl bg-white/80 p-6 shadow-xl ring-1 ring-stone-200/70 backdrop-blur">
        <div className="mb-5 flex flex-col items-center text-center">
          <Logo size={48} />
          <h1 className="mt-3 text-xl font-bold tracking-tight" style={{ color: '#2a2a6e' }}>
            SemBan
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Melde dich an, um auf dein Semester zuzugreifen – auf allen Geräten synchron.
          </p>
        </div>
        <SignInPanel initialMode={initialMode} />
      </div>
    </div>
  )
}
