import { describe, expect, it } from 'vitest';
import manifest from '../assets/manifest.json';
import type { BattleState } from './battle.ts';
import { answer, beginTurn, slowStrike, startBattle } from './battle.ts';
import type { MonsterDef } from './monsters.ts';
import { MONSTERS, monster } from './monsters.ts';
import type { SpellId } from './spells.ts';
import type { Band } from './types.ts';

const start = (id: string, band: Band = '6-8', wallet = 50, level = 1, rematch = false) => startBattle({ monster: monster(id), band, level, wallet, rematch });
function run(s: BattleState, m: MonsterDef, answers: boolean[], spell: SpellId = 'budget_beam') {
  const events = [];
  for (const a of answers) {
    s = beginTurn(s, m).state;
    const r = answer(s, m, a, spell);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}

describe('monster data', () => {
  it('has all 40 monsters, each with an art sheet', () => {
    expect(Object.keys(MONSTERS)).toHaveLength(40);
    for (const id of Object.keys(MONSTERS)) expect((manifest as { monsters: Record<string, unknown> }).monsters[id], id).toBeTruthy();
  });
  it('topic bosses have two attacks; each zone has 3 monsters and a boss', () => {
    expect(monster('boss_king_splurge').attacks).toHaveLength(2);
    for (const zone of new Set(Object.values(MONSTERS).map((m) => m.zone))) {
      const ms = Object.values(MONSTERS).filter((m) => m.zone === zone);
      expect(ms.filter((m) => m.boss), zone).toHaveLength(1);
      expect(ms.filter((m) => !m.boss), zone).toHaveLength(3);
    }
  });
});

describe('battle rules', () => {
  it('a regular monster takes 5 right answers, a boss 7, at any level', () => {
    for (const level of [1, 4, 9]) {
      const sp = monster('mon_spendling');
      expect(run(start('mon_spendling', '6-8', 0, level), sp, Array(4).fill(true)).s.outcome).toBe('fighting');
      expect(run(start('mon_spendling', '6-8', 0, level), sp, Array(5).fill(true)).s.outcome).toBe('won');
      const k = monster('boss_king_splurge');
      expect(run(start('boss_king_splurge', '6-8', 0, level), k, Array(6).fill(true)).s.outcome).toBe('fighting');
      expect(run(start('boss_king_splurge', '6-8', 0, level), k, Array(7).fill(true)).s.outcome).toBe('won');
    }
  });
  it('pays the pot plus the reward, half on a rematch', () => {
    const m = monster('mon_spendling');
    expect(run(start('mon_spendling'), m, Array(5).fill(true)).events.find((e) => e.type === 'won')).toEqual({ type: 'won', coins: 20, xp: 20 });
    expect(run(start('mon_spendling', '6-8', 0, 1, true), m, Array(5).fill(true)).events.find((e) => e.type === 'won')).toEqual({ type: 'won', coins: 10, xp: 10 });
  });
  it('the monster attacks only on a wrong answer; Explorer takes 75%', () => {
    const m = monster('mon_impulse_magpie'); // 9 damage
    const r = run(start('mon_impulse_magpie'), m, [true, false]);
    expect(r.events.filter((e) => e.type === 'playerHurt')).toHaveLength(1);
    expect(r.s.playerHp).toBe(91);
    expect(run(start('mon_impulse_magpie', 'K-5'), m, [false]).s.playerHp).toBe(93);
  });
  it('fainting ends the battle as lost', () => {
    const { s } = run(start('boss_king_splurge'), monster('boss_king_splurge'), Array(10).fill(false));
    expect(s.outcome).toBe('lost');
  });
  it('Save Shield blocks 8 of the next hit, then is gone', () => {
    const m = monster('mon_spendling'); // 8 damage
    const r = run(start('mon_spendling', '6-8', 0), m, [true, false], 'save_shield');
    expect(r.s.playerHp).toBe(100);
    expect(r.s.shield).toBe(0);
  });
});

describe('Piggybank effects', () => {
  it('Spendling takes 5 coins on a hit, never below zero', () => {
    const m = monster('mon_spendling');
    expect(run(start('mon_spendling', '6-8', 12), m, [false]).s.wallet).toBe(7);
    const poor = run(start('mon_spendling', '6-8', 3), m, [false, false]);
    expect([poor.s.wallet, poor.s.coinsTaken]).toEqual([0, 3]);
  });
  it('Impulse Magpie: Adventurer gets a 10 s timer; running out is one free strike; Explorer never', () => {
    const m = monster('mon_impulse_magpie');
    const t = beginTurn(start('mon_impulse_magpie'), m);
    expect(t.timer).toEqual({ seconds: 10, kind: 'slowStrike' });
    const r = slowStrike(t.state, m);
    expect([r.state.playerHp, r.state.outcome]).toEqual([91, 'fighting']);
    expect(beginTurn(start('mon_impulse_magpie', 'K-5'), m).timer).toBeNull();
  });
  it('Jar Muncher eats a shield if one is up, else takes 3 coins', () => {
    const m = monster('mon_jar_muncher'); // 10 damage
    expect(run(start('mon_jar_muncher', '6-8', 20), m, [false]).s.wallet).toBe(17);
    const r = run(start('mon_jar_muncher', '6-8', 20), m, [true, false], 'save_shield');
    expect([r.s.playerHp, r.s.wallet]).toEqual([98, 20]);
    expect(r.events.some((e) => e.type === 'shieldEaten')).toBe(true);
  });
  it('King Splurge alternates: A hits twice, B forces an 8 s timer for Adventurer', () => {
    const m = monster('boss_king_splurge'); // A 16×2, B 12
    const a = run(start('boss_king_splurge'), m, [false]);
    expect(a.s.playerHp).toBe(68);
    const b = run(a.s, m, [false]);
    expect(b.s.playerHp).toBe(56);
    expect(beginTurn(b.s, m).timer).toEqual({ seconds: 8, kind: 'rush' });
  });
  it('King Splurge B for Explorer: no timer, the next hit does +4 instead', () => {
    const m = monster('boss_king_splurge');
    const two = run(start('boss_king_splurge', 'K-5'), m, [false, false]); // 12+12, then 9
    expect(two.s.playerHp).toBe(67);
    expect(beginTurn(two.s, m).timer).toBeNull();
    expect(run(two.s, m, [false]).s.playerHp).toBe(67 - 15 - 12); // (16+4)×0.75, then 12
  });
});
