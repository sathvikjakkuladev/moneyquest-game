// Battle engine: a pure state machine. Each action returns the new state and a list of events;
// Phaser animates the events and React shows the question card. Every rule is unit-tested.

import type { EffectRule } from '../data/effectRules.ts';
import type { Attack, MonsterDef } from './monsters.ts';
import type { Rng } from './rng.ts';
import { between } from './rng.ts';
import type { SpellId } from './spells.ts';
import { SPELLS } from './spells.ts';
import type { Band } from './types.ts';

export const HITS = { regular: 5, boss: 7 } as const;
export const HP_PER_HIT = 10; // = Budget Beam's damage at level 1
export const POT_PER_RIGHT = 2;
export const WIN_REWARD = { regular: { coins: 10, xp: 20 }, boss: { coins: 30, xp: 60 } } as const;
export const EXPLORER_DAMAGE = 0.75;
export const BARRIER_BLOCKS_OVER = 12;

const scale = (level: number) => 1 + 0.1 * (level - 1);
export const maxHpFor = (level: number) => 100 + 10 * (level - 1);

export interface BattleSetup { monster: MonsterDef; band: Band; level: number; wallet: number; petBonus?: number; rematch?: boolean; insured?: boolean }

/** Tricks that apply to one question (set by an attack for the next turn). */
export interface TurnFx { lock?: boolean; fog?: boolean; fakeHint?: boolean; shuffle?: boolean; riddle?: boolean; nap?: boolean; removeOption?: boolean; timer?: number; slowed?: boolean; glare?: boolean; scramble?: boolean }

export interface BattleState {
  monsterId: string;
  boss: boolean;
  explorer: boolean;
  level: number;
  hp: number;
  maxHp: number;
  playerHp: number;
  playerMaxHp: number;
  wallet: number;
  coinsTaken: number;
  pot: number;
  potRate: number; // Inflation Balloon shrinks what the pot is worth
  nextAttack: number; // bosses alternate their attacks
  turn: number;
  now: TurnFx; // this question's tricks
  next: TurnFx; // set for the next question
  // Your buffs
  shield: number;
  barrier: boolean; // Insurance Barrier: blocks the next hit over 12
  insured: boolean; // holding an Insurance Scroll
  scrollUsed: boolean;
  streak: number; // right answers in a row (Compound Burst)
  // Your debuffs (Credit Cleanse removes them)
  weaken: number | null; // next spell does this % damage
  slowTurns: number;
  bonusHit: number; // extra damage on the next hit (Explorer version of a rush)
  burnLeft: number;
  burnDamage: number;
  // The monster's state
  ramp: number;
  split: boolean;
  blaze: number;
  bubble: number;
  petBonus: number;
  petOut: boolean;
  rematch: boolean;
  outcome: 'fighting' | 'won' | 'lost';
}

export type BattleEvent =
  | { type: 'cast'; spell: SpellId; damage: number }
  | { type: 'monsterHurt'; amount: number; hp: number }
  | { type: 'potUp'; amount: number; pot: number }
  | { type: 'shieldUp'; amount: number }
  | { type: 'buff'; text: string } // barrier up, Wise Choice ready, effects cleansed…
  | { type: 'attack'; name: string; does: string; hit: number; of: number }
  | { type: 'playerHurt'; amount: number; blocked: number; hp: number }
  | { type: 'shieldEaten' }
  | { type: 'coinsTaken'; amount: number; wallet: number }
  | { type: 'potTaken'; amount: number; pot: number }
  | { type: 'monsterGrows'; text: string; hp: number; maxHp: number } // split, burn ramp
  | { type: 'hpBalanced'; hp: number; playerHp: number }
  | { type: 'petOut' }
  | { type: 'woke' }
  | { type: 'bubble'; size: number }
  | { type: 'burned'; amount: number; hp: number }
  | { type: 'headDown'; left: number }
  | { type: 'healed'; amount: number; hp: number }
  | { type: 'warning'; text: string }
  | { type: 'won'; coins: number; xp: number }
  | { type: 'lost' };

export interface Timer { seconds: number; kind: 'slowStrike' | 'rush' }
export interface AnswerCtx { rng: Rng; seconds?: number }
type Step = { state: BattleState; events: BattleEvent[] };
const rules = (m: MonsterDef) => m.attacks.map((a) => a.rule);
const ruleOf = <K extends EffectRule['kind']>(m: MonsterDef, kind: K) => rules(m).find((r): r is Extract<EffectRule, { kind: K }> => r.kind === kind);

export function startBattle(s: BattleSetup): BattleState {
  const maxHp = (s.monster.boss ? HITS.boss : HITS.regular) * Math.round(HP_PER_HIT * scale(s.level));
  const playerMaxHp = maxHpFor(s.level);
  return {
    monsterId: s.monster.id, boss: s.monster.boss, explorer: s.band === 'K-5', level: s.level,
    hp: maxHp, maxHp, playerHp: playerMaxHp, playerMaxHp, wallet: s.wallet, coinsTaken: 0, pot: 0, potRate: 1,
    nextAttack: 0, turn: 0, now: {}, next: {},
    shield: 0, barrier: false, insured: !!s.insured, scrollUsed: false, streak: 0,
    weaken: null, slowTurns: 0, bonusHit: 0, burnLeft: 0, burnDamage: 0,
    ramp: 0, split: false, blaze: 0, bubble: 0, petBonus: s.petBonus ?? 0, petOut: false, rematch: !!s.rematch, outcome: 'fighting',
  };
}

/** Before the first question: monsters that always attack first get one free strike. */
export function opening(state: BattleState, m: MonsterDef): Step {
  if (!ruleOf(m, 'attacksFirst')) return { state, events: [] };
  const events: BattleEvent[] = [{ type: 'warning', text: `${m.name} is fast and attacks first!` }];
  return { state: strike(state, m.attacks[0]!, 1, 1, events), events };
}

/** A new question starts: this turn's tricks and timer, plus per-turn monster effects. */
export function beginTurn(state: BattleState, m: MonsterDef): { state: BattleState; timer: Timer | null; events: BattleEvent[] } {
  const events: BattleEvent[] = [];
  let s: BattleState = { ...state, turn: state.turn + 1, now: { ...state.next, slowed: state.slowTurns > 0 }, next: {}, slowTurns: Math.max(0, state.slowTurns - 1) };
  let timer: Timer | null = null;
  if (!s.explorer) {
    if (s.now.timer) timer = { seconds: s.now.timer, kind: 'rush' };
    else {
      const slow = ruleOf(m, 'slowStrike');
      if (slow) timer = { seconds: slow.seconds, kind: 'slowStrike' };
    }
  }
  const split = ruleOf(m, 'split');
  if (split && !s.split && s.turn > split.turns && s.hp > 0) {
    const add = Math.round(s.maxHp / 2);
    s = { ...s, split: true, hp: s.hp + add, maxHp: s.maxHp + add };
    events.push({ type: 'monsterGrows', text: `${m.name} split in two! Unpaid debt multiplies.`, hp: s.hp, maxHp: s.maxHp });
  }
  if (s.burnLeft > 0) {
    // Burns can't knock you out: fainting only happens from a monster's attack.
    const amount = Math.min(s.playerHp - 1, Math.max(1, Math.round(s.burnDamage * (s.explorer ? EXPLORER_DAMAGE : 1))));
    s = { ...s, playerHp: s.playerHp - amount, burnLeft: s.burnLeft - 1 };
    events.push({ type: 'burned', amount, hp: s.playerHp });
  }
  const nth = ruleOf(m, 'everyNth');
  if (nth) {
    const left = (nth.n - (s.turn % nth.n)) % nth.n;
    events.push({ type: 'warning', text: left === 0 ? `${m.name} is fully charged: a wrong answer now hits ×${nth.mult}!` : `${m.name} is charging up: ${left} more turn${left > 1 ? 's' : ''}.` });
  }
  const burn = ruleOf(m, 'burnRamp');
  if (burn && s.turn > 1) {
    s = { ...s, blaze: s.blaze + burn.step, hp: Math.max(1, s.hp - burn.selfDamage) };
    events.push({ type: 'monsterGrows', text: `${m.name} burns hotter (+${burn.step} damage) but loses ${burn.selfDamage} HP.`, hp: s.hp, maxHp: s.maxHp });
  }
  return { state: s, timer, events };
}

/** Right answer: cast. Wrong answer (or a rush timer running out): the monster attacks. */
export function answer(state: BattleState, m: MonsterDef, right: boolean, spell: SpellId, ctx: AnswerCtx): Step {
  if (state.outcome !== 'fighting') return { state, events: [] };
  return right ? cast(state, spell, m) : attack(state, m, ctx);
}

/** A slow-strike timer ran out: one free hit, and the question stays open. */
export function slowStrike(state: BattleState, m: MonsterDef): Step {
  if (state.outcome !== 'fighting') return { state, events: [] };
  const events: BattleEvent[] = [];
  return { state: strike(state, m.attacks[0]!, 1, 1, events), events };
}

/** How much a spell would hit for right now (shown on the card). */
export function spellDamage(s: BattleState, spell: SpellId, m?: MonsterDef): number {
  if (s.weaken === 0) return 0; // blocked
  const pet = s.petOut ? 0 : s.petBonus;
  const base = SPELLS[spell].damage + (spell === 'compound_burst' ? 3 * s.streak : 0) + pet;
  let d = base * scale(s.level);
  if (s.weaken !== null) d *= s.weaken / 100;
  if (s.now.slowed) d *= 0.75;
  if (m && ruleOf(m, 'halfSpells')) d *= 0.5;
  return Math.max(1, Math.round(d));
}

/** Hydra heads still standing: heads fall after `split` hits each (Lunar Hydra 2/2/3 of its 7). */
export function headsLeft(s: BattleState, split: readonly number[]): number {
  const total = split.reduce((a, b) => a + b, 0);
  const hitsDone = ((s.maxHp - s.hp) / s.maxHp) * total + 1e-9;
  let edge = 0;
  return split.filter((n) => (edge += n) > hitsDone).length;
}

function cast(state: BattleState, spell: SpellId, m: MonsterDef): Step {
  const events: BattleEvent[] = [];
  let s: BattleState = { ...state, pot: state.pot + POT_PER_RIGHT };
  if (s.now.nap) {
    // Napping: a right answer only wakes you.
    events.push({ type: 'woke' }, { type: 'potUp', amount: POT_PER_RIGHT, pot: s.pot });
    return { state: { ...s, now: { ...s.now, nap: false } }, events };
  }
  const damage = spellDamage(s, spell, m);
  const hp = Math.max(0, s.hp - damage);
  const hydra = ruleOf(m, 'hydra');
  const headsBefore = hydra ? headsLeft(s, hydra.split) : 0;
  if (s.weaken === 0) events.push({ type: 'warning', text: `${m.name} blocked your spell!` });
  s = { ...s, hp, weaken: null, streak: s.streak + 1 };
  events.push({ type: 'cast', spell, damage }, { type: 'monsterHurt', amount: damage, hp }, { type: 'potUp', amount: POT_PER_RIGHT, pot: s.pot });
  if (hydra && hp > 0 && headsLeft(s, hydra.split) < headsBefore) events.push({ type: 'headDown', left: headsLeft(s, hydra.split) });
  if (s.bubble > 0) s = { ...s, bubble: s.bubble - 1 };
  if (hp > 0) {
    switch (spell) {
      case 'save_shield':
        s = { ...s, shield: SPELLS.save_shield.shield! };
        events.push({ type: 'shieldUp', amount: s.shield });
        break;
      case 'paycheck_strike':
        s = { ...s, pot: s.pot + 3 };
        events.push({ type: 'potUp', amount: 3, pot: s.pot });
        break;
      case 'insurance_barrier':
        s = { ...s, barrier: true };
        events.push({ type: 'buff', text: 'Insurance Barrier is up: the next big hit is blocked.' });
        break;
      case 'wise_choice':
        s = { ...s, next: { ...s.next, removeOption: true } };
        events.push({ type: 'buff', text: 'Wise Choice: one wrong answer will vanish next question.' });
        break;
      case 'credit_cleanse': {
        const { lock: _l, fog: _f, fakeHint: _h, shuffle: _s, riddle: _r, nap: _n, timer: _t, glare: _g, scramble: _c, ...keep } = s.next;
        s = { ...s, weaken: null, slowTurns: 0, bonusHit: 0, burnLeft: 0, next: keep };
        events.push({ type: 'buff', text: 'Credit Cleanse washed away every bad effect.' });
        break;
      }
    }
  }
  if (hp === 0) {
    const r = s.boss ? WIN_REWARD.boss : WIN_REWARD.regular;
    const k = s.rematch ? 0.5 : 1;
    s = { ...s, outcome: 'won' };
    events.push({ type: 'won', coins: Math.round((Math.round(s.pot * s.potRate) + r.coins) * k), xp: Math.round(r.xp * k) });
  }
  return { state: s, events };
}

function attack(state: BattleState, m: MonsterDef, ctx: AnswerCtx): Step {
  const a = m.attacks[state.nextAttack % m.attacks.length]!;
  const r = a.rule;
  const events: BattleEvent[] = [];
  let s: BattleState = { ...state, nextAttack: state.nextAttack + 1, streak: 0 };
  const hadShield = s.shield > 0;

  if (r.kind === 'bubble') {
    const size = s.bubble + 1;
    if (size < r.popAt) {
      events.push({ type: 'bubble', size }, { type: 'warning', text: `${m.name}'s bubble is growing! Answer right to shrink it.` });
      return { state: { ...s, bubble: size }, events };
    }
    s = { ...s, bubble: 0 };
    events.push({ type: 'warning', text: 'POP! The bubble burst.' });
  }

  const insuredNow = s.insured || s.barrier;
  let base = a.damage;
  if (r.kind === 'randomDamage') base = between(ctx.rng, r.min, r.max);
  if (r.kind === 'latePenalty' && !s.explorer && (ctx.seconds ?? 0) > r.seconds) {
    base += r.extra;
    events.push({ type: 'warning', text: `Too slow! Late fee: +${r.extra} damage.` });
  }
  if (r.kind === 'hitsPet') {
    if (s.petBonus > 0 && !s.petOut) {
      s = { ...s, petOut: true };
      events.push({ type: 'petOut' });
    } else base += r.elseExtra;
  }
  if (r.kind === 'catastrophe' && insuredNow) {
    base = r.insuredDamage;
    // The scroll pays out (and is used up); otherwise the barrier takes the blow.
    if (s.insured) s = { ...s, insured: false, scrollUsed: true };
    else s = { ...s, barrier: false };
    events.push({ type: 'warning', text: `Insurance pays out! You only pay the ${r.insuredDamage}-point deductible.` });
  }
  if (r.kind === 'breakShieldUninsured' && !insuredNow) {
    if (s.shield > 0) events.push({ type: 'shieldEaten' });
    s = { ...s, shield: 0 };
    base += r.extra;
  }
  base += s.ramp + (r.kind === 'burnRamp' ? s.blaze : 0);
  if (s.split) base = Math.round(base * 1.5);
  if (s.now.riddle) base *= 2;
  if (r.kind === 'crit' && ctx.rng() < r.chance) {
    base = Math.round(base * r.mult);
    events.push({ type: 'warning', text: 'Critical hit!' });
  }
  if (r.kind === 'everyNth' && s.turn % r.n === 0) base *= r.mult;

  let hits = r.kind === 'multiHit' && (r.chance === undefined || ctx.rng() < r.chance) ? r.hits : 1;
  if (r.kind === 'hydra') {
    // Each living head bites once for its share of the attack.
    hits = Math.max(1, headsLeft(s, r.split));
    base = Math.round(a.damage / r.split.length) + s.ramp;
  }
  for (let i = 1; i <= hits && s.outcome === 'fighting'; i++) s = strike(s, { ...a, damage: base }, i, hits, events);
  if (s.outcome === 'fighting') s = afterHit(s, m, a, hadShield, events, ctx);
  return { state: s, events };
}

/** One hit: pending bonus, Explorer reduction, Insurance Barrier, shield, fainting. */
function strike(state: BattleState, a: Attack, hit: number, of: number, events: BattleEvent[]): BattleState {
  let raw = Math.max(1, Math.round((a.damage + state.bonusHit) * (state.explorer ? EXPLORER_DAMAGE : 1)));
  let s: BattleState = { ...state, bonusHit: 0 };
  events.push({ type: 'attack', name: a.name, does: a.does, hit, of });
  let blocked = 0;
  if (s.barrier && raw > BARRIER_BLOCKS_OVER) {
    blocked = raw;
    raw = 0;
    s = { ...s, barrier: false };
  } else {
    blocked = Math.min(s.shield, raw);
    raw -= blocked;
    s = { ...s, shield: 0 }; // a shield soaks one hit, then it's gone
  }
  const playerHp = Math.max(0, s.playerHp - raw);
  events.push({ type: 'playerHurt', amount: raw, blocked, hp: playerHp });
  s = { ...s, playerHp };
  if (playerHp > 0) return s;
  events.push({ type: 'lost' });
  return { ...s, outcome: 'lost' };
}

function afterHit(s: BattleState, m: MonsterDef, a: Attack, hadShield: boolean, events: BattleEvent[], ctx: AnswerCtx): BattleState {
  const r = a.rule;
  const warn = (text: string) => events.push({ type: 'warning', text });
  switch (r.kind) {
    case 'stealCoins':
      return take(s, r.amount, events);
    case 'eatShield':
      if (hadShield) {
        events.push({ type: 'shieldEaten' });
        return s;
      }
      return take(s, r.elseCoins, events);
    case 'rushNextTurn':
      if (s.explorer) {
        warn(`Watch out! The next hit does ${r.explorerBonus} extra damage.`);
        return { ...s, bonusHit: s.bonusHit + r.explorerBonus };
      }
      warn(`Hurry! Next turn you have only ${r.seconds} seconds.`);
      return { ...s, next: { ...s.next, timer: r.seconds } };
    case 'rampOnMiss':
      warn(`Interest grows: ${m.name} now does +${s.ramp + r.step} damage.`);
      return { ...s, ramp: s.ramp + r.step };
    case 'lockAnswer':
      warn('Next turn one answer is chained up. Tap it 3 times to break the chain.');
      return { ...s, next: { ...s.next, lock: true } };
    case 'potTax': {
      const cut = Math.floor((s.pot * r.percent) / 100);
      if (!cut) return s;
      events.push({ type: 'potTaken', amount: cut, pot: s.pot - cut });
      return { ...s, pot: s.pot - cut };
    }
    case 'napNext':
      if (r.chance !== undefined && ctx.rng() >= r.chance) return s;
      warn("You feel sleepy. Next turn, a right answer only wakes you up.");
      return { ...s, next: { ...s.next, nap: true } };
    case 'burn':
      warn(`You're burning: ${r.damage} damage at the start of the next ${r.turns} turns.`);
      return { ...s, burnLeft: r.turns, burnDamage: r.damage };
    case 'glare':
      warn('Solar Glare! Next turn the answers take 2 seconds to appear.');
      return { ...s, next: { ...s.next, glare: true } };
    case 'runeShield':
      warn(`${m.name} raises a rune shield: your next spell does ${r.percent}% damage.`);
      return { ...s, weaken: r.percent };
    case 'blockSpell':
      warn(`${m.name} will block your next spell.`);
      return { ...s, weaken: 0 };
    case 'scramble':
      warn('Crescent Screech! Next turn one answer gets scrambled for a moment.');
      return { ...s, next: { ...s.next, scramble: true } };
    case 'healSelf': {
      const hp = Math.min(s.maxHp, s.hp + r.amount);
      if (hp === s.hp) return s;
      events.push({ type: 'healed', amount: hp - s.hp, hp });
      return { ...s, hp };
    }
    case 'weakenSpell':
      warn(`Panic! Your next spell does only ${r.percent}% damage.`);
      return { ...s, weaken: r.percent };
    case 'slow':
      warn(`You're slowed: spells do 25% less damage for ${r.turns} turns.`);
      return { ...s, slowTurns: r.turns };
    case 'removeBuff':
      if (s.barrier) return (warn('Your Insurance Barrier washed away!'), { ...s, barrier: false });
      if (s.next.removeOption) return (warn('Your Wise Choice washed away!'), { ...s, next: { ...s.next, removeOption: false } });
      if (s.streak) return { ...s, streak: 0 };
      return s;
    case 'shuffleAnswers':
      warn('Whirlpool! Next turn the answers will swap places. Read carefully.');
      return { ...s, next: { ...s.next, shuffle: true } };
    case 'fakeHint':
      warn('Look out for "free tips" next turn. Too good to be true?');
      return { ...s, next: { ...s.next, fakeHint: true } };
    case 'inflation':
      if (s.potRate <= 0.5) return s;
      warn(`Inflation! Your battle coins are worth ${Math.round((s.potRate - r.percent / 100) * 100)}% now.`);
      return { ...s, potRate: Math.max(0.5, Math.round((s.potRate - r.percent / 100) * 100) / 100) };
    case 'fogAnswer':
      warn('Fog rolls in. Next turn one answer is hidden: tap it to clear the fog.');
      return { ...s, next: { ...s.next, fog: true } };
    case 'riddle':
      warn('Next question is a RIDDLE: a wrong answer does double damage!');
      return { ...s, next: { ...s.next, riddle: true } };
    case 'balanceHp': {
      const p = s.playerHp / s.playerMaxHp, q = s.hp / s.maxHp, avg = (p + q) / 2;
      const playerHp = Math.max(1, Math.round((p + (avg - p) / 2) * s.playerMaxHp));
      const hp = Math.max(1, Math.round((q + (avg - q) / 2) * s.maxHp));
      events.push({ type: 'hpBalanced', hp, playerHp });
      return { ...s, hp, playerHp };
    }
    default:
      return s;
  }
}

function take(s: BattleState, amount: number, events: BattleEvent[]): BattleState {
  const n = Math.min(amount, s.wallet);
  if (!n) return s;
  events.push({ type: 'coinsTaken', amount: n, wallet: s.wallet - n });
  return { ...s, wallet: s.wallet - n, coinsTaken: s.coinsTaken + n };
}
