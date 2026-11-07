// Persistent save (localStorage key `moneyquest-save`), written on every change.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SaveFile, Slot } from '../core/save.ts';
import { emptySave, migrate, SAVE_VERSION } from '../core/save.ts';

interface SaveStore extends SaveFile {
  create: (i: number, slot: Slot) => void;
  open: (i: number | null) => void;
  remove: (i: number) => void;
  /** Change the open slot. */
  edit: (fn: (s: Slot) => Slot) => void;
}

export const useSave = create<SaveStore>()(
  persist(
    (set) => ({
      ...emptySave(),
      create: (i, slot) => set((s) => ({ slots: s.slots.map((x, j) => (j === i ? slot : x)), active: i })),
      open: (i) => set({ active: i }),
      remove: (i) => set((s) => ({ slots: s.slots.map((x, j) => (j === i ? null : x)), active: s.active === i ? null : s.active })),
      edit: (fn) => set((s) => (s.active === null || !s.slots[s.active] ? {} : { slots: s.slots.map((x, j) => (j === s.active ? fn(x!) : x)) })),
    }),
    { name: 'moneyquest-save', version: SAVE_VERSION, partialize: (s) => ({ version: s.version, slots: s.slots, active: s.active }), migrate: (p, v) => migrate(p, v) },
  ),
);

export function slot(): Slot {
  const s = useSave.getState();
  const x = s.active === null ? null : s.slots[s.active];
  if (!x) throw new Error('No save slot open');
  return x;
}
export const useSlot = () => useSave((s) => (s.active === null ? null : (s.slots[s.active] ?? null)));
