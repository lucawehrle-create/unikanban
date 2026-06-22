import { useCallback, useEffect, useState } from 'react'
import { Bug, ChevronDown, ChevronUp, Lightbulb, Loader2, Plus, Trash2, Check } from 'lucide-react'
import { useSync } from '@/lib/sync'
import { isSyncConfigured } from '@/lib/supabase'
import {
  castVote,
  createBug,
  createFeature,
  deleteFeature,
  isAdmin,
  listBugs,
  listFeatures,
  setFeatureStatus,
  type BugReport,
  type FeatureStatus,
  type FeatureWithVotes,
} from '@/lib/feedback'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { cn } from '@/lib/cn'

type Tab = 'features' | 'bug'

const STATUS_META: Record<FeatureStatus, { label: string; cls: string }> = {
  open: { label: 'Offen', cls: 'bg-stone-100 text-stone-500' },
  planned: { label: 'Geplant', cls: 'bg-indigo-100 text-indigo-700' },
  done: { label: 'Erledigt', cls: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Abgelehnt', cls: 'bg-stone-200 text-stone-400' },
}

export function FeedbackModal() {
  const close = () => useUI.getState().setShowFeedback(false)
  const user = useSync((s) => s.user)
  const [tab, setTab] = useState<Tab>('features')
  const admin = isAdmin()

  return (
    <Modal title="Feedback" onClose={close}>
      <div className="mb-4 flex rounded-xl bg-stone-100 p-0.5">
        <TabButton active={tab === 'features'} onClick={() => setTab('features')} icon={<Lightbulb size={14} />}>
          Feature-Wünsche
        </TabButton>
        <TabButton active={tab === 'bug'} onClick={() => setTab('bug')} icon={<Bug size={14} />}>
          Bug melden
        </TabButton>
      </div>

      {!isSyncConfigured ? (
        <Notice>Feedback gibt es nur in der Online-Version mit Konto.</Notice>
      ) : !user ? (
        <Notice>Bitte melde dich an, um Feedback zu geben oder abzustimmen.</Notice>
      ) : tab === 'features' ? (
        <FeaturesTab admin={admin} />
      ) : (
        <BugTab admin={admin} />
      )}
    </Modal>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
        active ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
      {children}
    </div>
  )
}

// ---------- Feature-Wünsche ----------

function FeaturesTab({ admin }: { admin: boolean }) {
  const [items, setItems] = useState<FeatureWithVotes[] | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await listFeatures())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte Wünsche nicht laden.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const vote = async (f: FeatureWithVotes, dir: 1 | -1) => {
    const next = (f.myVote === dir ? 0 : dir) as -1 | 0 | 1
    // optimistisch
    setItems((cur) =>
      cur?.map((x) =>
        x.id === f.id ? { ...x, score: x.score - x.myVote + next, myVote: next } : x,
      ) ?? cur,
    )
    try {
      await castVote(f.id, next)
    } catch {
      void load()
    }
  }

  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await createFeature(title, desc)
      setTitle('')
      setDesc('')
      setAdding(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte nicht speichern.')
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (id: string, status: FeatureStatus) => {
    setItems((cur) => cur?.map((x) => (x.id === id ? { ...x, status } : x)) ?? cur)
    try {
      await setFeatureStatus(id, status)
    } catch {
      void load()
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Diesen Wunsch löschen?')) return
    setItems((cur) => cur?.filter((x) => x.id !== id) ?? cur)
    try {
      await deleteFeature(id)
    } catch {
      void load()
    }
  }

  return (
    <div>
      {adding ? (
        <div className="mb-3 space-y-2 rounded-xl bg-white p-3 ring-1 ring-stone-200">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Was wünschst du dir? (kurzer Titel)"
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Optional: Beschreibung, warum das hilft…"
            rows={3}
            className="w-full resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAdding(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
            >
              Abbrechen
            </button>
            <button
              onClick={submit}
              disabled={!title.trim() || busy}
              className="flex items-center gap-1.5 rounded-lg bg-brand-400 px-3 py-1.5 text-sm font-medium text-stone-900 disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Wunsch posten
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 py-2.5 text-sm font-medium text-stone-500 hover:border-brand-400 hover:text-stone-700"
        >
          <Plus size={15} /> Neuen Feature-Wunsch hinzufügen
        </button>
      )}

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {items === null ? (
        <div className="flex justify-center py-8 text-stone-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Notice>Noch keine Wünsche – sei der/die Erste!</Notice>
      ) : (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {items.map((f) => (
            <li key={f.id} className="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-stone-200">
              <VoteBox feature={f} onVote={vote} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-stone-800">{f.title}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      STATUS_META[f.status].cls,
                    )}
                  >
                    {STATUS_META[f.status].label}
                  </span>
                </div>
                {f.description && (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-stone-500">{f.description}</p>
                )}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
                  <span>{f.author_name ?? 'Anonym'}</span>
                  {admin && (
                    <>
                      <select
                        value={f.status}
                        onChange={(e) => changeStatus(f.id, e.target.value as FeatureStatus)}
                        className="rounded border border-stone-200 bg-white px-1 py-0.5 text-[11px]"
                      >
                        {(Object.keys(STATUS_META) as FeatureStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_META[s].label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => remove(f.id)}
                        className="text-stone-300 hover:text-red-500"
                        aria-label="Löschen"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VoteBox({
  feature,
  onVote,
}: {
  feature: FeatureWithVotes
  onVote: (f: FeatureWithVotes, dir: 1 | -1) => void
}) {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center">
      <button
        onClick={() => onVote(feature, 1)}
        className={cn(
          'rounded-md p-0.5 transition',
          feature.myVote === 1 ? 'text-brand-600' : 'text-stone-300 hover:text-stone-500',
        )}
        aria-label="Hochstimmen"
      >
        <ChevronUp size={20} strokeWidth={2.5} />
      </button>
      <span
        className={cn(
          'text-sm font-bold tabular-nums',
          feature.score > 0 ? 'text-stone-700' : feature.score < 0 ? 'text-stone-400' : 'text-stone-500',
        )}
      >
        {feature.score}
      </span>
      <button
        onClick={() => onVote(feature, -1)}
        className={cn(
          'rounded-md p-0.5 transition',
          feature.myVote === -1 ? 'text-red-500' : 'text-stone-300 hover:text-stone-500',
        )}
        aria-label="Runterstimmen"
      >
        <ChevronDown size={20} strokeWidth={2.5} />
      </button>
    </div>
  )
}

// ---------- Bug melden ----------

function BugTab({ admin }: { admin: boolean }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await createBug(title, desc)
      setTitle('')
      setDesc('')
      setDone(true)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte nicht senden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        Beschreibe kurz, was nicht funktioniert. Bug-Reports sind privat und gehen nur an das
        Entwickler-Konto – andere Nutzer sehen sie nicht.
      </p>
      {done ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check size={16} /> Danke! Dein Bug-Report ist angekommen.
          <button onClick={() => setDone(false)} className="ml-auto text-xs underline">
            Noch einen melden
          </button>
        </div>
      ) : (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Was ist passiert? (kurzer Titel)"
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Schritte zum Reproduzieren, was du erwartet hast, was stattdessen passierte…"
            rows={4}
            className="w-full resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={!title.trim() || busy}
              className="flex items-center gap-1.5 rounded-lg bg-brand-400 px-4 py-1.5 text-sm font-medium text-stone-900 disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Bug senden
            </button>
          </div>
        </>
      )}

      {admin && <AdminBugList />}
    </div>
  )
}

function AdminBugList() {
  const [bugs, setBugs] = useState<BugReport[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listBugs()
      .then(setBugs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Konnte Bugs nicht laden.'))
  }, [])

  return (
    <div className="mt-4 border-t border-stone-100 pt-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
        Gemeldete Bugs (nur für dich sichtbar)
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {bugs === null ? (
        <div className="flex justify-center py-4 text-stone-400">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : bugs.length === 0 ? (
        <p className="text-xs text-stone-400">Noch keine Bug-Reports.</p>
      ) : (
        <ul className="max-h-[30vh] space-y-2 overflow-y-auto">
          {bugs.map((b) => (
            <li key={b.id} className="rounded-lg bg-stone-50 p-2.5 text-xs">
              <div className="font-medium text-stone-700">{b.title}</div>
              {b.description && <p className="mt-0.5 whitespace-pre-wrap text-stone-500">{b.description}</p>}
              <div className="mt-1 text-[10px] text-stone-400">
                {b.reporter_email ?? 'unbekannt'} · {new Date(b.created_at).toLocaleString('de-DE')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
