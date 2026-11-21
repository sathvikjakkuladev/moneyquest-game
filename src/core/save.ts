// Save file (localStorage, versioned). Kids' privacy: the only personal field is a nickname.

import type { FormId } from '../data/moneyCheckForms.ts';
import type { Look } from './look.ts';
import { cleanLook, DEFAULT_LOOK } from './look.ts';
import type { QuestionState } from './questions.ts';
import { newQuestionState } from './questions.ts';
import type { SpellId } from './spells.ts';
import type { Band, Topic } from './types.ts';

export const SAVE_VERSION = 5;
export const SLOTS = 3;

/** One Money Check result: score per topic (0–2) and total (0–12). */
export interface CheckResult { date: string; band: Band; form: FormId; perTopic: Record<Topic, number>; total: number }

/**
 * This save slot's class membership (multiplayer). `url` is the server it belongs to, so the token is
 * never sent to a different server. The nickname is never sent anywhere; others see `publicName`.
 */
export interface Membership { url: string; classCode: string; className: string; token: string; publicName: string }

/** This slot's save code (backed up on `url`'s server; see src/net/backup.ts). The code is the only key to it. */
export interface Backup { url: string; code: string }

export interface Slot {
  nickname: string;
  band: Band;
  createdAt: string;
  progress: { level: number; xp: number; coins: number; coinsEarned: number; defeated: string[]; zonesCleared: string[]; spells: SpellId[]; spell: SpellId; tamed: string[] };
  /** `tamed` holds every monster captured (the first win over any monster captures it). */
  inventory: { owned: string[]; hat: string | null; pet: string | null; petLook: string | null };
  look: Look;
  questions: QuestionState;
  moneyCheck: { firstForm: FormId; pre: CheckResult | null; post: CheckResult | null };
  redeemed: string[];
  settings: { readAloud: boolean; reducedMotion: boolean | null; playOffline: boolean }; // reducedMotion null = follow the device
  online: Membership | null;
  /** When this slot was last opened (for Continue on the title screen). */
  playedAt: string;
  backup: Backup | null;
}

export interface SaveFile { version: number; slots: (Slot | null)[]; active: number | null }

export const emptySave = (): SaveFile => ({ version: SAVE_VERSION, slots: Array.from({ length: SLOTS }, () => null), active: null });

export function newSlot(nickname: string, band: Band, firstForm: FormId, now = new Date(), look: Look = DEFAULT_LOOK): Slot {
  return {
    nickname, band, createdAt: now.toISOString(),
    progress: { level: 1, xp: 0, coins: 0, coinsEarned: 0, defeated: [], zonesCleared: [], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
    inventory: { owned: [], hat: null, pet: null, petLook: null },
    look,
    questions: newQuestionState(),
    moneyCheck: { firstForm, pre: null, post: null },
    redeemed: [],
    settings: { readAloud: false, reducedMotion: null, playOffline: false },
    online: null,
    playedAt: now.toISOString(),
    backup: null,
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
  // v3 → v4 (the Vaultspire art, PLAN.md §12): the old zones, monsters, hats and pets map onto the new ones.
  3: (s) => ({ ...s, version: 4, slots: (s.slots as (Record<string, unknown> | null)[]).map((x) => (x ? toVaultspire(x) : null)) }),
  // v4 → v5 (save codes): when each slot was last played (for Continue), and no save code yet.
  4: (s) => ({ ...s, version: 5, slots: (s.slots as (Record<string, unknown> | null)[]).map((x) => (x ? { ...x, playedAt: x.createdAt, backup: null } : null)) }),
};

// ---- v3 → v4: from the pixel-art world to Vaultspire ----
const V3_TOPIC_ZONES = ['piggybank_village', 'borrowers_bridges', 'guildworks', 'compound_orchard', 'stormwatch_coast', 'crossroads_observatory'];
const V3_BONUS_ZONES = ['sunfire_pass', 'moonwell_cavern', 'astral_ruins', 'nebula_grove'];
const V3_REGULARS: Record<string, string[]> = {
  piggybank_village: ['mon_spendling', 'mon_impulse_magpie', 'mon_jar_muncher'], borrowers_bridges: ['mon_debt_slime', 'mon_interest_imp', 'mon_late_fee_troll'],
  guildworks: ['mon_tax_gremlin', 'mon_slacker_golem', 'mon_gig_goblin'], compound_orchard: ['mon_hype_hornet', 'mon_bubble_beetle', 'mon_panic_bear'],
  stormwatch_coast: ['mon_risk_squall', 'mon_mishap_crab', 'mon_flood_eel'], crossroads_observatory: ['mon_scam_serpent', 'mon_inflation_balloon', 'mon_doubt_wraith'],
};
/** The districts in play order, each with its two monsters and its boss. */
const V4_DISTRICTS: [zone: string, regulars: [string, string], boss: string][] = [
  ['coinfall-docks', ['mon_budget_breaker', 'mon_subscription_swarm'], 'boss_overspend_kraken'],
  ['the-sprawl', ['mon_impulse_wisp', 'mon_splurge_hound'], 'boss_splurge_peacock'],
  ['frostvault', ['mon_inflation_shade', 'mon_overdraft_golem'], 'boss_frostfang_mammoth'],
  ['credit-citadel', ['mon_late_fee_raptor', 'mon_minimum_payment_leech'], 'boss_collector_scorpion'],
  ['compound-rift', ['mon_apr_serpent', 'mon_rug_pull_mimic'], 'boss_compound_leviathan'],
  ['the-exchange', ['mon_hype_bull', 'mon_panic_bear'], 'boss_volatility_roc'],
  ['phish-fens', ['mon_phish_lurker', 'mon_identity_wraith'], 'boss_phish_queen'],
];
const V4_HATS: Record<string, string> = { 'hat-top': 'hat-top-hat', 'hat-wizard': 'hat-wizard-hat', 'hat-crown': 'hat-crown', 'hat-laurel': 'hat-laurel' };
/** Each pet bought in the old shop becomes one captured monster. Professor Owl, a legendary, becomes a boss. */
const V4_PETS: Record<string, string> = {
  'pet-coin-sprite': 'mon_budget_breaker', 'pet-sapling-fox': 'mon_splurge_hound', 'pet-star-kitten': 'mon_impulse_wisp', 'pet-gem-turtle': 'mon_overdraft_golem',
  'pet-piggy-dragonling': 'mon_late_fee_raptor', 'pet-vault-bot': 'mon_rug_pull_mimic', 'pet-professor-owl': 'boss_volatility_roc',
};

function toVaultspire(x: Record<string, unknown>): Record<string, unknown> {
  const p = x.progress as { defeated: string[]; zonesCleared: string[]; tamed?: string[] } & Record<string, unknown>;
  const inv = x.inventory as { owned: string[]; hat: string | null; pet: string | null };
  // Progress carries over by count: n topic zones cleared → the first n districts cleared.
  const topicCleared = V3_TOPIC_ZONES.filter((z) => p.zonesCleared.includes(z)).length;
  const bonusCleared = V3_BONUS_ZONES.some((z) => p.zonesCleared.includes(z));
  const cleared = topicCleared + (topicCleared === 6 && bonusCleared ? 1 : 0);
  const defeated: string[] = [];
  V4_DISTRICTS.slice(0, cleared).forEach(([, regs, boss]) => defeated.push(...regs, boss));
  // Regular monsters beaten in the first unfinished zone carry over by count too.
  const next = V4_DISTRICTS[cleared];
  const nextOld = cleared < 6 ? V3_REGULARS[V3_TOPIC_ZONES[cleared]!]! : [];
  if (next) defeated.push(...next[1].slice(0, Math.min(2, nextOld.filter((m) => p.defeated.includes(m)).length)));
  // Hats keep their place; pets (bought or tamed) become captured monsters.
  const captured = new Set(defeated);
  const tamedOld = [...(p.tamed ?? [])];
  const spare = V4_DISTRICTS.flatMap(([, regs]) => regs);
  const petFor = (id: string): string | null => {
    if (id === 'pet-bull') return 'pet-bull';
    const m = V4_PETS[id] ?? (id.startsWith('tame:') ? spare[tamedOld.indexOf(id.slice(5)) % spare.length] : undefined);
    if (!m) return null;
    captured.add(m);
    return `tame:${m}`;
  };
  const owned = new Set<string>();
  for (const id of inv.owned) {
    if (V4_HATS[id]) owned.add(V4_HATS[id]!);
    else if (id.startsWith('pet-') || id.startsWith('tame:')) { const pet = petFor(id); if (pet === 'pet-bull') owned.add(pet); }
    else owned.add(id); // the Insurance Scroll
  }
  const pet = inv.pet ? petFor(inv.pet) : null;
  for (const m of captured) owned.add(`tame:${m}`);
  return {
    ...x,
    progress: { ...p, defeated, zonesCleared: V4_DISTRICTS.slice(0, cleared).map(([zone]) => zone), tamed: [...captured] },
    inventory: { owned: [...owned], hat: inv.hat ? (V4_HATS[inv.hat] ?? null) : null, pet, petLook: null },
    look: cleanLook(x.look),
  };
}

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
