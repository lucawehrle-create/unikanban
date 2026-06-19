import { formatDistanceToNow, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { AlertTriangle, Cloud, CloudOff, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { useUI } from '@/store/ui'
import { useSync, resolveConflict, syncNow } from '@/lib/sync'
import { signOut } from '@/lib/auth'
import { Modal } from './Modal'
import { SignInPanel } from './SignInPanel'

export function AccountModal() {
  const setShowAccount = useUI((s) => s.setShowAccount)
  const { user, status, lastSyncAt, error, conflict } = useSync()
  const close = () => setShowAccount(false)

  return (
    <Modal title={user ? 'Konto & Sync' : 'Anmelden'} onClose={close}>
      {conflict ? (
        <ConflictView remoteUpdatedAt={conflict.remoteUpdatedAt} />
      ) : user ? (
        <SignedIn
          email={user.email ?? 'Angemeldet'}
          status={status}
          lastSyncAt={lastSyncAt}
          error={error}
        />
      ) : (
        <SignInPanel />
      )}
    </Modal>
  )
}

function StatusLine({
  status,
  lastSyncAt,
  error,
}: {
  status: string
  lastSyncAt: string | null
  error: string | null
}) {
  if (status === 'syncing')
    return (
      <span className="flex items-center gap-1.5 text-stone-500">
        <Loader2 size={14} className="animate-spin" /> Synchronisiere…
      </span>
    )
  if (status === 'error')
    return (
      <span className="flex items-center gap-1.5 text-red-500">
        <CloudOff size={14} /> {error ?? 'Fehler'}
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-emerald-600">
      <Cloud size={14} />
      {lastSyncAt
        ? `Synchronisiert · vor ${formatDistanceToNow(parseISO(lastSyncAt), { locale: de })}`
        : 'Bereit'}
    </span>
  )
}

function SignedIn({
  email,
  status,
  lastSyncAt,
  error,
}: {
  email: string
  status: string
  lastSyncAt: string | null
  error: string | null
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200/70">
        <div className="text-xs text-stone-400">Angemeldet als</div>
        <div className="truncate font-medium text-stone-800">{email}</div>
        <div className="mt-2 text-xs">
          <StatusLine status={status} lastSyncAt={lastSyncAt} error={error} />
        </div>
      </div>

      <p className="text-xs text-stone-500">
        Deine Daten werden automatisch mit der Cloud abgeglichen und stehen auf allen Geräten zur
        Verfügung, auf denen du angemeldet bist. Beim Abmelden werden sie von diesem Gerät entfernt.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void syncNow()}
          className="flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          <RefreshCw size={15} /> Jetzt synchronisieren
        </button>
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
        >
          <LogOut size={15} /> Abmelden
        </button>
      </div>
    </div>
  )
}

function ConflictView({ remoteUpdatedAt }: { remoteUpdatedAt: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <span>
          Auf diesem Gerät <strong>und</strong> in der Cloud liegen Daten. Welche möchtest du
          behalten? Die andere Version wird überschrieben.
        </span>
      </div>
      <button
        onClick={() => void resolveConflict('cloud')}
        className="w-full rounded-xl bg-white p-3 text-left ring-1 ring-stone-200 hover:bg-stone-50"
      >
        <div className="text-sm font-semibold text-stone-800">Cloud-Daten laden</div>
        <div className="text-xs text-stone-500">
          Stand aus der Cloud (zuletzt {formatDistanceToNow(parseISO(remoteUpdatedAt), { locale: de })}{' '}
          aktualisiert) übernehmen.
        </div>
      </button>
      <button
        onClick={() => void resolveConflict('local')}
        className="w-full rounded-xl bg-white p-3 text-left ring-1 ring-stone-200 hover:bg-stone-50"
      >
        <div className="text-sm font-semibold text-stone-800">Lokale Daten hochladen</div>
        <div className="text-xs text-stone-500">Was auf diesem Gerät liegt, in die Cloud schreiben.</div>
      </button>
    </div>
  )
}
