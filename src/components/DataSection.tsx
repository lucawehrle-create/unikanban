import { useRef, useState } from 'react'
import { Download, Upload, RotateCcw, Check, ShieldAlert, AlertTriangle } from 'lucide-react'
import { downloadBackup, importBackup, resetAll } from '@/lib/backup'
import { Modal } from './Modal'

const CONFIRM_WORD = 'LÖSCHEN'

export function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [flash, setFlash] = useState('')
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const canDelete = ['LÖSCHEN', 'LOESCHEN'].includes(confirmText.trim().toUpperCase())

  function note(msg: string) {
    setError('')
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  async function onFile(file: File) {
    setError('')
    try {
      await importBackup(await file.text())
      note('Backup wiederhergestellt.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import fehlgeschlagen.')
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <h3 className="text-sm font-semibold text-stone-700">Daten & Sicherung</h3>
      <p className="mt-1 text-xs text-stone-400">
        Alles liegt lokal auf diesem Gerät. Sichere regelmäßig – oder übertrage deine Daten auf ein
        anderes Gerät.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void downloadBackup()}
          className="flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          <Download size={15} /> Backup exportieren
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
        >
          <Upload size={15} /> Backup importieren
        </button>
        <button
          onClick={() => {
            setConfirmText('')
            setConfirmOpen(true)
          }}
          className="ml-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <RotateCcw size={15} /> Zurücksetzen
        </button>
      </div>

      <p className="mt-2 flex items-center gap-1 text-[11px] text-stone-400">
        <ShieldAlert size={12} /> Importieren ersetzt den gesamten aktuellen Bestand.
      </p>

      {flash && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <Check size={15} /> {flash}
        </div>
      )}
      {error && (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {confirmOpen && (
        <Modal
          title="Alles unwiderruflich löschen?"
          onClose={() => setConfirmOpen(false)}
          footer={
            <>
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-full px-4 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100"
              >
                Abbrechen
              </button>
              <button
                disabled={!canDelete}
                onClick={() => {
                  void resetAll()
                  setConfirmOpen(false)
                }}
                className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Endgültig löschen
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>
                Alle Studiengänge, Semester, Kurse, Aufgaben und Anwesenheiten werden gelöscht.
                Das lässt sich <strong>nicht rückgängig</strong> machen.
              </span>
            </div>

            <button
              onClick={() => void downloadBackup()}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              <Download size={15} /> Zuerst Backup exportieren
            </button>

            <label className="block">
              <span className="mb-1 block text-sm text-stone-600">
                Tippe <strong className="font-mono">{CONFIRM_WORD}</strong> ein, um zu bestätigen:
              </span>
              <input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm uppercase tracking-wide outline-none focus:border-red-400"
              />
            </label>
          </div>
        </Modal>
      )}
    </section>
  )
}
