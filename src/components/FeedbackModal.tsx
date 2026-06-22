import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bug,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Check,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import { useSync } from '@/lib/sync'
import { isSyncConfigured } from '@/lib/supabase'
import {
  CATEGORIES,
  addComment,
  castVote,
  categoryLabel,
  createBug,
  createFeature,
  deleteComment,
  deleteFeature,
  isAdmin,
  listBugs,
  listComments,
  listFeatures,
  setFeatureStatus,
  updateFeature,
  type BugReport,
  type CategoryId,
  type FeatureComment,
  type FeatureStatus,
  type FeatureWithVotes,
} from '@/lib/feedback'
import { useUI } from '@/store/ui'
import { Modal } from './Modal'
import { Select } from './ui/Select'
import { cn } from '@/lib/cn'

type Tab = 'features' | 'bug'
type SortBy = 'top' | 'new'
type StatusFilter = 'all' | FeatureStatus

const STATUS_META: Record<FeatureStatus, { label: string; cls: string }> = {
  open: { label: 'Offen', cls: 'bg-stone-100 text-stone-500' },
  planned: { label: 'Geplant', cls: 'bg-indigo-100 text-indigo-700' },
  done: { label: 'Erledigt', cls: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Abgelehnt', cls: 'bg-stone-200 text-stone-400' },
}

const inputCls =
  'w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-brand-400'

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
  icon: ReactNode
  children: ReactNode
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

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">{children}</div>
  )
}

function CategoryBadge({ id }: { id: string | null }) {
  const label = categoryLabel(id)
  if (!label) return null
  return (
    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
      {label}
    </span>
  )
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'Ohne Kategorie' },
  ...CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
]

function CategorySelect({
  value,
  onChange,
  className,
}: {
  value: CategoryId | ''
  onChange: (v: CategoryId | '') => void
  className?: string
}) {
  return (
    <Select
      value={value}
      options={CATEGORY_OPTIONS}
      onChange={(v) => onChange(v as CategoryId | '')}
      placeholder="Kategorie…"
      ariaLabel="Kategorie"
      className={cn('w-40', className)}
    />
  )
}

// ---------- Feature-Wünsche ----------

function FeaturesTab({ admin }: { admin: boolean }) {
  const [items, setItems] = useState<FeatureWithVotes[] | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState<CategoryId | ''>('')
  const [anonymous, setAnonymous] = useState(false)
  const [busy, setBusy] = useState(false)

  const [sort, setSort] = useState<SortBy>('top')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [catFilter, setCatFilter] = useState<CategoryId | 'all'>('all')
  const [search, setSearch] = useState('')

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

  const visible = useMemo(() => {
    let arr = items ?? []
    if (statusFilter !== 'all') arr = arr.filter((f) => f.status === statusFilter)
    if (catFilter !== 'all') arr = arr.filter((f) => f.category === catFilter)
    const q = search.trim().toLowerCase()
    if (q) arr = arr.filter((f) => `${f.title} ${f.description ?? ''}`.toLowerCase().includes(q))
    const rank = (s: FeatureStatus) => (s === 'done' || s === 'declined' ? 1 : 0)
    const byDate = (a: FeatureWithVotes, b: FeatureWithVotes) => (a.created_at < b.created_at ? 1 : -1)
    return [...arr].sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        (sort === 'top' ? b.score - a.score || byDate(a, b) : byDate(a, b)),
    )
  }, [items, statusFilter, catFilter, search, sort])

  const vote = async (f: FeatureWithVotes, dir: 1 | -1) => {
    const next = (f.myVote === dir ? 0 : dir) as -1 | 0 | 1
    setItems((cur) =>
      cur?.map((x) => (x.id === f.id ? { ...x, score: x.score - x.myVote + next, myVote: next } : x)) ?? cur,
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
      await createFeature({ title, description: desc, category, anonymous })
      setTitle('')
      setDesc('')
      setCategory('')
      setAnonymous(false)
      setAdding(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte nicht speichern.')
    } finally {
      setBusy(false)
    }
  }

  const total = items?.length ?? 0

  return (
    <div>
      {adding ? (
        <div className="mb-3 space-y-2 rounded-xl bg-white p-3 ring-1 ring-stone-200">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Was wünschst du dir? (kurzer Titel)"
            className={inputCls}
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Optional: Beschreibung, warum das hilft…"
            rows={3}
            className={cn(inputCls, 'resize-none')}
          />
          <div className="flex flex-wrap items-center gap-2">
            <CategorySelect value={category} onChange={setCategory} />
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
              Anonym posten
            </label>
            <div className="ml-auto flex gap-2">
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
                Posten
              </button>
            </div>
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

      {/* Toolbar: Suche + Sortieren + Filter */}
      {total > 0 && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5">
            <Search size={14} className="text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Wünsche durchsuchen…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-stone-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-stone-100 p-0.5 text-xs font-medium">
              {(['top', 'new'] as SortBy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={cn(
                    'rounded-md px-2.5 py-1 transition',
                    sort === s ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500',
                  )}
                >
                  {s === 'top' ? 'Top' : 'Neu'}
                </button>
              ))}
            </div>
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              ariaLabel="Status filtern"
              className="w-32"
              options={[
                { value: 'all', label: 'Alle Status' },
                ...(Object.keys(STATUS_META) as FeatureStatus[]).map((s) => ({
                  value: s,
                  label: STATUS_META[s].label,
                })),
              ]}
            />
            <Select
              value={catFilter}
              onChange={(v) => setCatFilter(v as CategoryId | 'all')}
              ariaLabel="Bereich filtern"
              className="w-40"
              options={[
                { value: 'all', label: 'Alle Bereiche' },
                ...CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
          </div>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {items === null ? (
        <div className="flex justify-center py-8 text-stone-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <Notice>{total === 0 ? 'Noch keine Wünsche – sei der/die Erste!' : 'Keine Treffer.'}</Notice>
      ) : (
        <ul className="max-h-[48vh] space-y-2 overflow-y-auto">
          {visible.map((f) => (
            <FeatureItem key={f.id} f={f} admin={admin} onVote={vote} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FeatureItem({
  f,
  admin,
  onVote,
  onChanged,
}: {
  f: FeatureWithVotes
  admin: boolean
  onVote: (f: FeatureWithVotes, dir: 1 | -1) => void
  onChanged: () => Promise<void> | void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(f.title)
  const [desc, setDesc] = useState(f.description ?? '')
  const [category, setCategory] = useState<CategoryId | ''>((f.category as CategoryId) ?? '')
  const [showComments, setShowComments] = useState(false)
  const [count, setCount] = useState(f.commentCount)

  const canManage = f.mine || admin

  const save = async () => {
    if (!title.trim()) return
    setEditing(false)
    try {
      await updateFeature(f.id, title, desc, category)
    } finally {
      await onChanged()
    }
  }

  const remove = async () => {
    if (!window.confirm('Diesen Wunsch löschen?')) return
    try {
      await deleteFeature(f.id)
    } finally {
      await onChanged()
    }
  }

  const changeStatus = async (status: FeatureStatus) => {
    try {
      await setFeatureStatus(f.id, status)
    } finally {
      await onChanged()
    }
  }

  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
      <div className="flex gap-3">
        <VoteBox feature={f} onVote={onVote} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} autoFocus />
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                placeholder="Beschreibung (optional)"
                className={cn(inputCls, 'resize-none')}
              />
              <div className="flex items-center gap-2">
                <CategorySelect value={category} onChange={setCategory} className="py-1.5 text-xs" />
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-lg px-2.5 py-1 text-xs text-stone-500 hover:bg-stone-100"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={save}
                    disabled={!title.trim()}
                    className="rounded-lg bg-brand-400 px-2.5 py-1 text-xs font-medium text-stone-900 disabled:opacity-50"
                  >
                    Speichern
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
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
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                <CategoryBadge id={f.category} />
                <span>{f.is_anonymous ? 'Anonym' : f.author_name ?? 'Anonym'}</span>
                {f.mine && (
                  <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
                    Du
                  </span>
                )}
                <button
                  onClick={() => setShowComments((v) => !v)}
                  className="flex items-center gap-1 hover:text-stone-600"
                >
                  <MessageSquare size={12} /> {count}
                </button>
                <span className="mr-auto" />
                {admin && (
                  <Select
                    value={f.status}
                    onChange={(v) => changeStatus(v as FeatureStatus)}
                    ariaLabel="Status setzen"
                    className="w-28"
                    options={(Object.keys(STATUS_META) as FeatureStatus[]).map((s) => ({
                      value: s,
                      label: STATUS_META[s].label,
                    }))}
                  />
                )}
                {canManage && (
                  <button onClick={() => setEditing(true)} className="hover:text-stone-600" aria-label="Bearbeiten">
                    <Pencil size={13} />
                  </button>
                )}
                {canManage && (
                  <button onClick={remove} className="hover:text-red-500" aria-label="Löschen">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {showComments && !editing && (
        <CommentThread
          featureId={f.id}
          admin={admin}
          onCountChange={(d) => setCount((c) => Math.max(0, c + d))}
        />
      )}
    </li>
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

function CommentThread({
  featureId,
  admin,
  onCountChange,
}: {
  featureId: string
  admin: boolean
  onCountChange: (delta: number) => void
}) {
  const [comments, setComments] = useState<FeatureComment[] | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setComments(await listComments(featureId))
    } catch {
      setComments([])
    }
  }, [featureId])

  useEffect(() => {
    void load()
  }, [load])

  const send = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      await addComment(featureId, body)
      setBody('')
      onCountChange(1)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteComment(id)
      onCountChange(-1)
      await load()
    } catch {
      void load()
    }
  }

  return (
    <div className="mt-2 border-t border-stone-100 pt-2">
      {comments === null ? (
        <div className="flex justify-center py-2 text-stone-300">
          <Loader2 size={14} className="animate-spin" />
        </div>
      ) : (
        <ul className="space-y-1.5">
          {comments.map((c) => (
            <li key={c.id} className="group rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs">
              <div className="flex items-center gap-1.5 text-[10px] text-stone-400">
                <span className="font-semibold text-stone-500">{c.author_name ?? 'Anonym'}</span>
                <span>· {formatDistanceToNow(new Date(c.created_at), { locale: de, addSuffix: true })}</span>
                {(c.mine || admin) && (
                  <button
                    onClick={() => remove(c.id)}
                    className="ml-auto text-stone-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
                    aria-label="Kommentar löschen"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-stone-600">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Kommentar schreiben…"
          className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
        />
        <button
          onClick={send}
          disabled={!body.trim() || busy}
          className="shrink-0 rounded-lg bg-brand-400 p-1.5 text-stone-900 disabled:opacity-40"
          aria-label="Senden"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  )
}

// ---------- Bug melden ----------

function BugTab({ admin }: { admin: boolean }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState<CategoryId | ''>('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await createBug({ title, description: desc, category })
      setTitle('')
      setDesc('')
      setCategory('')
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
            className={inputCls}
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Schritte zum Reproduzieren, was du erwartet hast, was stattdessen passierte…"
            rows={4}
            className={cn(inputCls, 'resize-none')}
          />
          <div className="flex items-center gap-2">
            <CategorySelect value={category} onChange={setCategory} />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={submit}
              disabled={!title.trim() || busy}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-400 px-4 py-2 text-sm font-medium text-stone-900 disabled:opacity-50"
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
              <div className="flex items-center gap-2">
                <span className="font-medium text-stone-700">{b.title}</span>
                <CategoryBadge id={b.category} />
              </div>
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
