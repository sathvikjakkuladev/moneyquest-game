// Battle engine: a pure state machine. Each action returns the new state and a list of events;
// Phaser animates the events and React shows the question card. Every rule is unit-tested.

import type { Attack, MonsterDef } from './monsters.ts';
import type { SpellId } from './spells.ts';
import { SPELLS } from './spells.ts';
import type { Band } from './types.ts';

export const HITS = { regular: 5, boss: 7 } as const;
export const HP_PER_HIT = 10; // = Budget Beam's damage at level 1
export const POT_PER_RIGHT = 2;
export const WIN_REWARD = { regular: { coins: 10, xp: 20 }, boss: { coins: 30, xp: 60 } } as const;
export const EXPLORER_DAMAGE = 0.75;

const scale = (level: number) => 1 + 0.1 * (level - 1);
export const maxHpFor = (level: number) => 100 + 10 * (level - 1);
export const spellDamage = (spell: SpellId, level: number, petBonus = 0) => Math.round((SPELLS[spell].damage + petBonus) * scale(level));

export interface BattleSetup { monster: MonsterDef; band: Band; level: number; wallet: number; petBonus?: number; rematch?: boolean }

export interface BattleState {
  monsterId: string;
  boss: boolean;
  explorer: boolean;
  level: number;
  hp: number;
  maxHp: number;
  playerHp: number;
  playerMaxHp: number;
  shield: number;
  pot: number;
  wallet: number;
  coinsTaken: number;
  nextAttack: number; // index into the monster's attacks (bosses alternate)
  turn: number;
  pending: { timer?: number; extraDamage?: number }; // set by effects for the next turn
  petBonus: number;
  rematch: boolean;
  outcome: 'fighting' | 'won' | 'lost';
}

export type BattleEvent =
  | { type: 'cast'; spell: SpellId; damage: number }
  | { type: 'monsterHurt'; amount: number; hp: number }
  | { type: 'potUp'; amount: number; pot: number }
  | { type: 'shieldUp'; amount: number }
  | { type: 'attack'; name: string; does: string; hit: number; of: number }
  | { type: 'playerHurt'; amount: number; blocked: number; hp: number }
  | { type: 'shieldEaten' }
  | { type: 'coinsTaken'; amount: number; wallet: number }
  | { type: 'warning'; text: string }
  | { type: 'won'; coins: number; xp: number }
  | { type: 'lost' };

export interface Timer { seconds: number; kind: 'slowStrike' | 'rush' }
type Step = { state: BattleState; events: BattleEvent[] };

export function startBattle(s: BattleSetup): BattleState {
  const maxHp = (s.monster.boss ? HITS.boss : HITS.regular) * Math.round(HP_PER_HIT * scale(s.level));
  const playerMaxHp = maxHpFor(s.level);
  return {
    monsterId: s.monster.id, boss: s.monster.boss, explorer: s.band === 'K-5', level: s.level,
    hp: maxHp, maxHp, playerHp: playerMaxHp, playerMaxHp, shield: 0, pot: 0, wallet: s.wallet, coinsTaken: 0,
    nextAttack: 0, turn: 0, pending: {}, petBonus: s.petBonus ?? 0, rematch: !!s.rematch, outcome: 'fighting',
  };
}

/** A new question starts. Returns this turn's timer, if an effect forces one. Explorer never gets one. */
export function beginTurn(state: BattleState, m: MonsterDef): { state: BattleState; timer: Timer | null } {
  let timer: Timer | null = null;
  if (!state.explorer) {
    if (state.pending.timer) timer = { seconds: state.pending.timer, kind: 'rush' };
    else {
      const slow = m.attacks.map((a) => a.rule).find((r) => r.kind === 'slowStrike');
      if (slow?.kind === 'slowStrike') timer = { seconds: slow.seconds, kind: 'slowStrike' };
    }
  }
  const { timer: _done, ...pending } = state.pending;
  return { state: { ...state, turn: state.turn + 1, pending }, timer };
}

/** Right answer: cast. Wrong answer (or a rush timer running out): the monster attacks. */
export function answer(state: BattleState, m: MonsterDef, right: boolean, spell: SpellId): Step {
  if (state.outcome !== 'fighting') return { state, events: [] };
  return right ? cast(state, spell) : attack(state, m);
}

/** A slow-strike timer ran out: one free hit, and the question stays open. */
export function slowStrike(state: BattleState, m: MonsterDef): Step {
  if (state.outcome !== 'fighting') return { state, events: [] };
  const events: BattleEvent[] = [];
  return { state: strike(state, m.attacks[0]!, 1, 1, events), events };
}

function cast(state: BattleState, spell: SpellId): Step {
  const damage = spellDamage(spell, state.level, state.petBonus);
  const hp = Math.max(0, state.hp - damage);
  const pot = state.pot + POT_PER_RIGHT;
  const events: BattleEvent[] = [{ type: 'cast', spell, damage }, { type: 'monsterHurt', amount: damage, hp }, { type: 'potUp', amount: POT_PER_RIGHT, pot }];
  let s: BattleState = { ...state, hp, pot };
  const shield = SPELLS[spell].shield;
  if (shield && hp > 0) {
    s = { ...s, shield };
    events.push({ type: 'shieldUp', amount: shield });
  }
  if (hp === 0) {
    const r = s.boss ? WIN_REWARD.boss : WIN_REWARD.regular;
    const k = s.rematch ? 0.5 : 1;
    s = { ...s, outcome: 'won' };
    events.push({ type: 'won', coins: Math.round((pot + r.coins) * k), xp: Math.round(r.xp * k) });
  }
  return { state: s, events };
}

function attack(state: BattleState, m: MonsterDef): Step {
  const a = m.attacks[state.nextAttack % m.attacks.length]!;
  const hits = a.rule.kind === 'multiHit' ? a.rule.hits : 1;
  const hadShield = state.shield > 0;
  const events: BattleEvent[] = [];
  let s: BattleState = { ...state, nextAttack: state.nextAttack + 1 };
  for (let i = 1; i <= hits && s.outcome === 'fighting'; i++) s = strike(s, a, i, hits, events);
  if (s.outcome === 'fighting') s = afterHit(s, a, hadShield, events);
  return { state: s, events };
}

/** One hit: pending extra damage, Explorer reduction, shield, fainting. */
function strike(state: BattleState, a: Attack, hit: number, of: number, events: BattleEvent[]): BattleState {
  const base = a.damage + (state.pending.extraDamage ?? 0);
  const raw = Math.max(1, Math.round(base * (state.explorer ? EXPLORER_DAMAGE : 1)));
  const blocked = Math.min(state.shield, raw);
  const playerHp = Math.max(0, state.playerHp - (raw - blocked));
  const { extraDamage: _used, ...pending } = state.pending;
  events.push({ type: 'attack', name: a.name, does: a.does, hit, of }, { type: 'playerHurt', amount: raw - blocked, blocked, hp: playerHp });
  const s: BattleState = { ...state, playerHp, shield: 0, pending }; // a shield soaks one hit, then it's gone
  if (playerHp > 0) return s;
  events.push({ type: 'lost' });
  return { ...s, outcome: 'lost' };
}

function afterHit(s: BattleState, a: Attack, hadShield: boolean, events: BattleEvent[]): BattleState {
  const r = a.rule;
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
        events.push({ type: 'warning', text: `Watch out! The next hit does ${r.explorerBonus} extra damage.` });
        return { ...s, pending: { ...s.pending, extraDamage: r.explorerBonus } };
      }
      events.push({ type: 'warning', text: `Hurry! Next turn you have only ${r.seconds} seconds.` });
      return { ...s, pending: { ...s.pending, timer: r.seconds } };
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
