// Save file (localStorage, versioned). Kids' privacy: the only personal field is a nickname.

import type { FormId } from '../data/moneyCheckForms.ts';
import type { QuestionState } from './questions.ts';
import { newQuestionState } from './questions.ts';
import type { SpellId } from './spells.ts';
import type { Band } from './types.ts';

export const SAVE_VERSION = 1;
export const SLOTS = 3;

export interface Slot {
  nickname: string;
  band: Band;
  createdAt: string;
  progress: { level: number; xp: number; coins: number; defeated: string[]; zonesCleared: string[]; spells: SpellId[]; spell: SpellId };
  inventory: { owned: string[]; hat: string | null; pet: string | null };
  questions: QuestionState;
  moneyCheck: { firstForm: FormId; pre: unknown | null; post: unknown | null };
  redeemed: string[];
  settings: { readAloud: boolean; reducedMotion: boolean | null }; // null = follow the device
}

export interface SaveFile { version: number; slots: (Slot | null)[]; active: number | null }

export const emptySave = (): SaveFile => ({ version: SAVE_VERSION, slots: Array.from({ length: SLOTS }, () => null), active: null });

export function newSlot(nickname: string, band: Band, firstForm: FormId, now = new Date()): Slot {
  return {
    nickname, band, createdAt: now.toISOString(),
    progress: { level: 1, xp: 0, coins: 0, defeated: [], zonesCleared: [], spells: ['budget_beam'], spell: 'budget_beam' },
    inventory: { owned: [], hat: null, pet: null },
    questions: newQuestionState(),
    moneyCheck: { firstForm, pre: null, post: null },
    redeemed: [],
    settings: { readAloud: false, reducedMotion: null },
  };
}

/** Nicknames: letters and numbers only, 2–12 characters. */
export const validNickname = (s: string) => /^[A-Za-z0-9]{2,12}$/.test(s);

const FIRST = ['Coin', 'Lucky', 'Penny', 'Star', 'Brave', 'Clever', 'Golden', 'Swift', 'Sunny', 'Happy'];
const SECOND = ['Wizard', 'Fox', 'Saver', 'Owl', 'Comet', 'Otter', 'Dragon', 'Rocket', 'Tiger', 'Knight'];
export const randomNickname = (rng: () => number) => `${FIRST[Math.floor(rng() * FIRST.length)]}${SECOND[Math.floor(rng() * SECOND.length)]}`;

/** Each step upgrades a save from version N to N+1. Add one per schema change, with a test. */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {};

/** Upgrade old saves; anything unreadable starts fresh instead of crashing. */
export function migrate(raw: unknown, from: number): SaveFile {
  if (!raw || typeof raw !== 'object') return emptySave();
  let s = raw as Record<string, unknown>;
  for (let v = from; v < SAVE_VERSION; v++) {
    const up = MIGRATIONS[v];
    if (!up) return emptySave();
    s = up(s);
  }
  if (!Array.isArray(s.slots)) return emptySave();
  const slots = Array.from({ length: SLOTS }, (_, i) => ((s.slots as unknown[])[i] as Slot | null) ?? null);
  return { version: SAVE_VERSION, slots, active: typeof s.active === 'number' && slots[s.active] ? s.active : null };
}
