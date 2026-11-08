// Save file (localStorage, versioned). Kids' privacy: the only personal field is a nickname.

import type { FormId } from '../data/moneyCheckForms.ts';
import type { QuestionState } from './questions.ts';
import { newQuestionState } from './questions.ts';
import type { SpellId } from './spells.ts';
import type { Band, Topic } from './types.ts';

export const SAVE_VERSION = 3;
export const SLOTS = 3;

/** One Money Check result: score per topic (0–2) and total (0–12). */
export interface CheckResult { date: string; band: Band; form: FormId; perTopic: Record<Topic, number>; total: number }

/**
 * This save slot's class membership (multiplayer). `url` is the server it belongs to, so the token is
 * never sent to a different server. The nickname is never sent anywhere; others see `publicName`.
 */
export interface Membership { url: string; classCode: string; className: string; token: string; publicName: string }

export interface Slot {
  nickname: string;
  band: Band;
  createdAt: string;
  progress: { level: number; xp: number; coins: number; coinsEarned: number; defeated: string[]; zonesCleared: string[]; spells: SpellId[]; spell: SpellId; tamed: string[] };
  inventory: { owned: string[]; hat: string | null; pet: string | null };
  questions: QuestionState;
  moneyCheck: { firstForm: FormId; pre: CheckResult | null; post: CheckResult | null };
  redeemed: string[];
  settings: { readAloud: boolean; reducedMotion: boolean | null; playOffline: boolean }; // reducedMotion null = follow the device
  online: Membership | null;
}

export interface SaveFile { version: number; slots: (Slot | null)[]; active: number | null }

export const emptySave = (): SaveFile => ({ version: SAVE_VERSION, slots: Array.from({ length: SLOTS }, () => null), active: null });

export function newSlot(nickname: string, band: Band, firstForm: FormId, now = new Date()): Slot {
  return {
    nickname, band, createdAt: now.toISOString(),
    progress: { level: 1, xp: 0, coins: 0, coinsEarned: 0, defeated: [], zonesCleared: [], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
    inventory: { owned: [], hat: null, pet: null },
    questions: newQuestionState(),
    moneyCheck: { firstForm, pre: null, post: null },
    redeemed: [],
    settings: { readAloud: false, reducedMotion: null, playOffline: false },
    online: null,
  };
}

/** Nicknames: letters and numbers only, 2–12 characters. */
export const validNickname = (s: string) => /^[A-Za-z0-9]{2,12}$/.test(s);

const FIRST = ['Coin', 'Lucky', 'Penny', 'Star', 'Brave', 'Clever', 'Golden', 'Swift', 'Sunny', 'Happy'];
const SECOND = ['Wizard', 'Fox', 'Saver', 'Owl', 'Comet', 'Otter', 'Dragon', 'Rocket', 'Tiger', 'Knight'];
export const randomNickname = (rng: () => number) => `${FIRST[Math.floor(rng() * FIRST.length)]}${SECOND[Math.floor(rng() * SECOND.length)]}`;

/** Each step upgrades a save from version N to N+1. Add one per schema change, with a test. */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2 (Phase 5): monsters tamed in the bonus zones.
  1: (s) => ({
    ...s,
    version: 2,
    slots: (s.slots as (Record<string, unknown> | null)[]).map((x) => (x ? { ...x, progress: { ...(x.progress as object), tamed: [] } } : null)),
  }),
  // v2 → v3 (multiplayer): coins earned (seeded from the wallet), the Play offline switch, class membership.
  2: (s) => ({
    ...s,
    version: 3,
    slots: (s.slots as (Record<string, unknown> | null)[]).map((x) => {
      if (!x) return null;
      const p = x.progress as Record<string, unknown>;
      return { ...x, progress: { ...p, coinsEarned: typeof p.coins === 'number' ? p.coins : 0 }, settings: { ...(x.settings as object), playOffline: false }, online: null };
    }),
  }),
};

/** Upgrade old saves; anything unreadable starts fresh instead of crashing. */
export function migrate(raw: unknown, from: number): SaveFile {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Record<string, unknown>).slots)) return emptySave();
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
