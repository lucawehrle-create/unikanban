import type { SlotKind } from '@/db/types'

export interface SlotKindDef {
  id: SlotKind
  label: string
  short: string
}

export const SLOT_KINDS: SlotKindDef[] = [
  { id: 'vorlesung', label: 'Vorlesung', short: 'VL' },
  { id: 'uebung', label: 'Übung', short: 'Üb' },
  { id: 'tutorium', label: 'Tutorium', short: 'Tut' },
  { id: 'seminar', label: 'Seminar', short: 'Sem' },
  { id: 'praktikum', label: 'Praktikum', short: 'Prak' },
  { id: 'repetitorium', label: 'Repetitorium', short: 'Rep' },
  { id: 'kolloquium', label: 'Kolloquium', short: 'Koll' },
  { id: 'klausur', label: 'Klausur', short: 'Klausur' },
]

const byId = new Map(SLOT_KINDS.map((k) => [k.id, k]))

export function slotKindLabel(kind: SlotKind): string {
  return byId.get(kind)?.label ?? kind
}
export function slotKindShort(kind: SlotKind): string {
  return byId.get(kind)?.short ?? kind
}
