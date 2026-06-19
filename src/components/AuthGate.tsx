import { Logo } from './Logo'
import { SignInPanel } from './SignInPanel'

/** Vollbild-Anmeldung: ohne Login gibt es keinen Zugriff auf die Daten. */
export function AuthGate() {
  return (
    <div className="flex h-full items-center justify-center p-4">
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
        <SignInPanel />
      </div>
    </div>
  )
}
