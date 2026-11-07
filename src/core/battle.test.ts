import { describe, expect, it } from 'vitest';
import manifest from '../assets/manifest.json';
import type { BattleEvent, BattleState } from './battle.ts';
import { answer, beginTurn, opening, slowStrike, spellDamage, startBattle } from './battle.ts';
import type { MonsterDef } from './monsters.ts';
import { MONSTERS, monster } from './monsters.ts';
import { seeded } from './rng.ts';
import type { SpellId } from './spells.ts';
import type { Band } from './types.ts';

interface Opts { band?: Band; wallet?: number; level?: number; rematch?: boolean; petBonus?: number; insured?: boolean }
const start = (id: string, o: Opts = {}) =>
  startBattle({ monster: monster(id), band: o.band ?? '6-8', level: o.level ?? 1, wallet: o.wallet ?? 50, rematch: o.rematch, petBonus: o.petBonus, insured: o.insured });

/** Play answers in order (true = right). `spells` per answer (default Budget Beam), `seconds` per answer. */
function run(s: BattleState, m: MonsterDef, answers: boolean[], spells: SpellId[] = [], seconds: number[] = [], seed = 1) {
  const rng = seeded(seed);
  const events: BattleEvent[] = [];
  answers.forEach((a, i) => {
    const t = beginTurn(s, m);
    events.push(...t.events);
    const r = answer(t.state, m, a, spells[i] ?? 'budget_beam', { rng, seconds: seconds[i] ?? 3 });
    s = r.state;
    events.push(...r.events);
  });
  return { s, events };
}
const M = monster;

describe('monster data', () => {
  it('has all 40 monsters with art; every zone has 3 monsters and a boss', () => {
    expect(Object.keys(MONSTERS)).toHaveLength(40);
    for (const id of Object.keys(MONSTERS)) expect((manifest as { monsters: Record<string, unknown> }).monsters[id], id).toBeTruthy();
    for (const zone of new Set(Object.values(MONSTERS).map((m) => m.zone))) {
      const ms = Object.values(MONSTERS).filter((m) => m.zone === zone);
      expect([ms.filter((m) => m.boss).length, ms.filter((m) => !m.boss).length], zone).toEqual([1, 3]);
    }
  });
  it('every topic-zone attack has a rule (bonus zones come in Phase 5)', () => {
    const topic = ['piggybank_village', 'borrowers_bridges', 'guildworks', 'compound_orchard', 'stormwatch_coast', 'crossroads_observatory'];
    const plain = Object.values(MONSTERS).filter((m) => topic.includes(m.zone)).flatMap((m) => m.attacks.map((a, i) => ({ m: m.id, i, kind: a.rule.kind })));
    // Burnout Blaze's Anvil Drop is the only attack whose effect is just "Big single hit".
    expect(plain.filter((p) => p.kind === 'plain')).toEqual([{ m: 'boss_burnout_blaze', i: 1, kind: 'plain' }]);
  });
});

describe('core rules', () => {
  it('regular monsters take 5 right answers, bosses 7, at any level', () => {
    for (const level of [1, 4, 9]) {
      expect(run(start('mon_spendling', { level }), M('mon_spendling'), Array(4).fill(true)).s.outcome).toBe('fighting');
      expect(run(start('mon_spendling', { level }), M('mon_spendling'), Array(5).fill(true)).s.outcome).toBe('won');
      expect(run(start('boss_king_splurge', { level }), M('boss_king_splurge'), Array(6).fill(true)).s.outcome).toBe('fighting');
      expect(run(start('boss_king_splurge', { level }), M('boss_king_splurge'), Array(7).fill(true)).s.outcome).toBe('won');
    }
  });
  it('pays the pot plus the reward, half on a rematch', () => {
    const won = (o: Opts) => run(start('mon_spendling', o), M('mon_spendling'), Array(5).fill(true)).events.find((e) => e.type === 'won');
    expect(won({})).toEqual({ type: 'won', coins: 20, xp: 20 });
    expect(won({ rematch: true })).toEqual({ type: 'won', coins: 10, xp: 10 });
  });
  it('only wrong answers get hit; Explorer takes 75%; fainting loses', () => {
    const r = run(start('mon_impulse_magpie'), M('mon_impulse_magpie'), [true, false]);
    expect(r.s.playerHp).toBe(91);
    expect(run(start('mon_impulse_magpie', { band: 'K-5' }), M('mon_impulse_magpie'), [false]).s.playerHp).toBe(93);
    expect(run(start('boss_king_splurge'), M('boss_king_splurge'), Array(10).fill(false)).s.outcome).toBe('lost');
  });
  it('a pet adds +2 (legendary +4) per spell', () => {
    expect(spellDamage(start('mon_spendling', { petBonus: 2 }), 'budget_beam')).toBe(12);
    expect(spellDamage(start('mon_spendling', { petBonus: 4 }), 'budget_beam')).toBe(14);
  });
});

describe('spells', () => {
  it('Save Shield blocks 8 of the next hit', () => {
    const r = run(start('mon_spendling', { wallet: 0 }), M('mon_spendling'), [true, false], ['save_shield']);
    expect([r.s.playerHp, r.s.shield]).toEqual([100, 0]);
  });
  it('Paycheck Strike adds 3 coins to the pot', () => {
    expect(run(start('mon_spendling'), M('mon_spendling'), [true], ['paycheck_strike']).s.pot).toBe(5);
  });
  it('Compound Burst grows +3 per right answer in a row, and resets on a miss', () => {
    const r = run(start('boss_king_splurge'), M('boss_king_splurge'), [true, true, true], ['compound_burst', 'compound_burst', 'compound_burst']);
    expect(r.events.filter((e) => e.type === 'cast').map((e) => (e as { damage: number }).damage)).toEqual([6, 9, 12]);
    const miss = run(r.s, M('boss_king_splurge'), [false, true], [, 'compound_burst'] as SpellId[]);
    expect(miss.events.filter((e) => e.type === 'cast').map((e) => (e as { damage: number }).damage)).toEqual([6]);
  });
  it('Insurance Barrier blocks the next hit over 12 entirely, but not small ones', () => {
    const big = run(start('boss_king_splurge'), M('boss_king_splurge'), [true, false], ['insurance_barrier']); // 16, then 16
    expect(big.s.playerHp).toBe(100 - 16);
    const small = run(start('mon_spendling', { wallet: 0 }), M('mon_spendling'), [true, false], ['insurance_barrier']); // 8
    expect([small.s.playerHp, small.s.barrier]).toEqual([92, true]);
  });
  it('Wise Choice removes a wrong answer next question; Credit Cleanse clears debuffs', () => {
    const w = run(start('mon_spendling'), M('mon_spendling'), [true], ['wise_choice']);
    expect(beginTurn(w.s, M('mon_spendling')).state.now.removeOption).toBe(true);
    const weak = run(start('mon_panic_bear'), M('mon_panic_bear'), [false, true], [, 'credit_cleanse'] as SpellId[]);
    expect(weak.s.weaken).toBeNull(); // Panic Bear's weaken was used up by the cleanse cast itself…
    const lock = run(start('boss_loan_shark_lord'), M('boss_loan_shark_lord'), [false]);
    expect(lock.s.next.lock).toBe(true);
    const cleansed = answer(lock.s, M('boss_loan_shark_lord'), true, 'credit_cleanse', { rng: seeded(1) });
    expect(cleansed.state.next.lock).toBeUndefined(); // …and the chain is gone
  });
});

describe('Piggybank Village effects', () => {
  it('Spendling takes 5 coins, never below zero', () => {
    expect(run(start('mon_spendling', { wallet: 12 }), M('mon_spendling'), [false]).s.wallet).toBe(7);
    expect(run(start('mon_spendling', { wallet: 3 }), M('mon_spendling'), [false, false]).s.wallet).toBe(0);
  });
  it('Impulse Magpie: 10 s timer for Adventurer (a free strike if it runs out), none for Explorer', () => {
    const t = beginTurn(start('mon_impulse_magpie'), M('mon_impulse_magpie'));
    expect(t.timer).toEqual({ seconds: 10, kind: 'slowStrike' });
    expect(slowStrike(t.state, M('mon_impulse_magpie')).state.playerHp).toBe(91);
    expect(beginTurn(start('mon_impulse_magpie', { band: 'K-5' }), M('mon_impulse_magpie')).timer).toBeNull();
  });
  it('Jar Muncher eats a shield, else 3 coins', () => {
    expect(run(start('mon_jar_muncher', { wallet: 20 }), M('mon_jar_muncher'), [false]).s.wallet).toBe(17);
    const r = run(start('mon_jar_muncher', { wallet: 20 }), M('mon_jar_muncher'), [true, false], ['save_shield']);
    expect([r.s.playerHp, r.s.wallet, r.events.some((e) => e.type === 'shieldEaten')]).toEqual([98, 20, true]);
  });
  it('King Splurge: double hit, then an 8 s rush (Explorer: +4 instead)', () => {
    const k = M('boss_king_splurge');
    const a = run(start('boss_king_splurge'), k, [false, false]);
    expect(a.s.playerHp).toBe(100 - 32 - 12);
    expect(beginTurn(a.s, k).timer).toEqual({ seconds: 8, kind: 'rush' });
    const e = run(start('boss_king_splurge', { band: 'K-5' }), k, [false, false, false]);
    expect(e.s.playerHp).toBe(100 - 24 - 9 - 15 - 12);
  });
});

describe("Borrowers' Bridges effects", () => {
  it('Debt Slime splits after 3 turns: +50% HP, hits ×1.5', () => {
    const m = M('mon_debt_slime');
    const r = run(start('mon_debt_slime'), m, [true, true, true, false]);
    expect(r.s.split).toBe(true);
    expect(r.s.maxHp).toBe(75);
    expect(r.s.playerHp).toBe(100 - 12);
  });
  it('Interest Imp: each miss adds +2 damage for good', () => {
    const r = run(start('mon_interest_imp'), M('mon_interest_imp'), [false, false, false]);
    expect(r.s.playerHp).toBe(100 - 6 - 8 - 10);
  });
  it('Late Fee Troll: +5 if slower than 15 s (Adventurer only)', () => {
    const m = M('mon_late_fee_troll');
    expect(run(start('mon_late_fee_troll'), m, [false], [], [20]).s.playerHp).toBe(85);
    expect(run(start('mon_late_fee_troll'), m, [false], [], [5]).s.playerHp).toBe(90);
    expect(run(start('mon_late_fee_troll', { band: 'K-5' }), m, [false], [], [20]).s.playerHp).toBe(92);
  });
  it('Loan Shark Lord: chains an answer next turn, then bites 3 times', () => {
    const m = M('boss_loan_shark_lord');
    const a = run(start('boss_loan_shark_lord'), m, [false]);
    expect(beginTurn(a.s, m).state.now.lock).toBe(true);
    const b = run(a.s, m, [false]);
    expect(b.events.filter((e) => e.type === 'attack')).toHaveLength(3);
  });
});

describe('Guildworks effects', () => {
  it('Tax Gremlin takes 20% of the pot', () => {
    const r = run(start('mon_tax_gremlin'), M('mon_tax_gremlin'), [true, true, true, true, false], ['paycheck_strike', 'paycheck_strike', 'paycheck_strike', 'paycheck_strike']);
    expect(r.s.pot).toBe(20 - 4);
  });
  it('Slacker Golem: next right answer only wakes you', () => {
    const m = M('mon_slacker_golem');
    const r = run(start('mon_slacker_golem'), m, [false, true]);
    expect(r.events.some((e) => e.type === 'woke')).toBe(true);
    expect(r.s.hp).toBe(r.s.maxHp);
    expect(run(r.s, m, [true]).s.hp).toBe(r.s.maxHp - 10);
  });
  it('Gig Goblin hits for 4–14', () => {
    for (let seed = 1; seed < 40; seed++) {
      const hp = run(start('mon_gig_goblin'), M('mon_gig_goblin'), [false], [], [], seed).s.playerHp;
      expect(100 - hp).toBeGreaterThanOrEqual(4);
      expect(100 - hp).toBeLessThanOrEqual(14);
    }
  });
  it('Burnout Blaze gets +3 stronger and loses 3 HP each turn', () => {
    const m = M('boss_burnout_blaze');
    const r = run(start('boss_burnout_blaze'), m, [true, true, false]); // turn 3: blaze +6
    expect(r.s.hp).toBe(70 - 20 - 6);
    expect(r.s.playerHp).toBe(100 - 16 - 6);
  });
});

describe('Compound Orchard effects', () => {
  it('Hype Hornet strikes first; others don’t', () => {
    expect(opening(start('mon_hype_hornet'), M('mon_hype_hornet')).state.playerHp).toBe(91);
    expect(opening(start('mon_spendling'), M('mon_spendling')).events).toEqual([]);
  });
  it('Bubble Beetle: a miss grows the bubble, the second pops for 14; a right answer shrinks it', () => {
    const m = M('mon_bubble_beetle');
    const one = run(start('mon_bubble_beetle'), m, [false]);
    expect([one.s.playerHp, one.s.bubble]).toEqual([100, 1]);
    expect(run(one.s, m, [false]).s.playerHp).toBe(86);
    expect(run(one.s, m, [true, false]).s.playerHp).toBe(100);
  });
  it('Panic Bear halves your next spell', () => {
    const r = run(start('mon_panic_bear'), M('mon_panic_bear'), [false, true, true]);
    expect(r.events.filter((e) => e.type === 'cast').map((e) => (e as { damage: number }).damage)).toEqual([5, 10]);
  });
  it('Crash Treant knocks out your pet (or hits +4), then slows you for 2 turns', () => {
    const m = M('boss_crash_treant');
    const pet = run(start('boss_crash_treant', { petBonus: 2 }), m, [false]);
    expect([pet.s.petOut, pet.s.playerHp]).toEqual([true, 83]);
    expect(run(start('boss_crash_treant'), m, [false]).s.playerHp).toBe(79);
    const slowed = run(pet.s, m, [false, true, true, true]);
    expect(slowed.events.filter((e) => e.type === 'cast').map((e) => (e as { damage: number }).damage)).toEqual([8, 8, 10]);
  });
});

describe('Stormwatch Coast effects', () => {
  it('Risk Squall double-hits about 25% of the time', () => {
    let doubles = 0;
    for (let seed = 1; seed <= 400; seed++) if (run(start('mon_risk_squall'), M('mon_risk_squall'), [false], [], [], seed).events.filter((e) => e.type === 'attack').length === 2) doubles++;
    expect(doubles / 400).toBeGreaterThan(0.18);
    expect(doubles / 400).toBeLessThan(0.32);
  });
  it('Mishap Crab breaks your shield and hits +3, unless insured', () => {
    const m = M('mon_mishap_crab');
    const bare = run(start('mon_mishap_crab'), m, [true, false], ['save_shield']);
    expect(bare.s.playerHp).toBe(88);
    const insured = run(start('mon_mishap_crab', { insured: true }), m, [true, false], ['save_shield']);
    expect(insured.s.playerHp).toBe(99);
  });
  it('Flood Eel washes away a buff', () => {
    const r = run(start('mon_flood_eel'), M('mon_flood_eel'), [true, false], ['insurance_barrier']);
    expect(r.s.barrier).toBe(false);
  });
  it('Catastrophe Leviathan: 22, or the 6-point deductible if insured (scroll used up); then shuffles answers', () => {
    const m = M('boss_catastrophe_leviathan');
    expect(run(start('boss_catastrophe_leviathan'), m, [false]).s.playerHp).toBe(78);
    const scroll = run(start('boss_catastrophe_leviathan', { insured: true }), m, [false]);
    expect([scroll.s.playerHp, scroll.s.insured, scroll.s.scrollUsed]).toEqual([94, false, true]);
    const barrier = run(start('boss_catastrophe_leviathan'), m, [true, false], ['insurance_barrier']);
    expect(barrier.s.playerHp).toBe(94);
    expect(beginTurn(run(scroll.s, m, [false]).s, m).state.now.shuffle).toBe(true);
  });
});

describe('Crossroads Observatory effects', () => {
  it('Scam Serpent: a fake tip next turn', () => {
    const r = run(start('mon_scam_serpent'), M('mon_scam_serpent'), [false]);
    expect(beginTurn(r.s, M('mon_scam_serpent')).state.now.fakeHint).toBe(true);
  });
  it('Inflation Balloon: each miss shrinks the pot’s worth 10%, to no less than half', () => {
    const r = run(start('mon_inflation_balloon'), M('mon_inflation_balloon'), Array(8).fill(false));
    expect(r.s.potRate).toBe(0.5);
    const win = run(start('mon_inflation_balloon'), M('mon_inflation_balloon'), [false, false, true, true, true, true, true]);
    expect(win.events.find((e) => e.type === 'won')).toEqual({ type: 'won', coins: Math.round(10 * 0.8) + 10, xp: 20 });
  });
  it('Doubt Wraith: fogs an answer next turn', () => {
    expect(beginTurn(run(start('mon_doubt_wraith'), M('mon_doubt_wraith'), [false]).s, M('mon_doubt_wraith')).state.now.fog).toBe(true);
  });
  it('Chaos Sphinx: a riddle (wrong = double damage), then balances health bars', () => {
    const m = M('boss_chaos_sphinx');
    const a = run(start('boss_chaos_sphinx'), m, [false]); // 18, riddle set
    expect(a.s.playerHp).toBe(82);
    const b = run(a.s, m, [false]); // riddle turn: Scale Smash 12 × 2, then balance
    const hit = 82 - 24;
    const p = hit / 100, q = 1, avg = (p + q) / 2;
    expect(b.s.playerHp).toBe(Math.round((p + (avg - p) / 2) * 100));
    expect(b.s.hp).toBe(Math.round((q + (avg - q) / 2) * 70));
  });
});

describe('bonus-zone effects', () => {
  it('Ember Jackal and Solar Wyrm burn for 2 turns (never below 1 HP); Credit Cleanse puts it out', () => {
    const m = M('mon_ember_jackal');
    const a = run(start('mon_ember_jackal'), m, [false]); // 9
    const b = run(a.s, m, [true, true]); // burns 3 + 3
    expect(b.s.playerHp).toBe(100 - 9 - 6);
    expect(run(a.s, m, [true, true], ['credit_cleanse']).s.playerHp).toBe(100 - 9 - 3);
    expect(run(start('boss_solar_wyrm'), M('boss_solar_wyrm'), [false, true]).s.playerHp).toBe(100 - 20 - 5);
  });
  it('Sunscale Basilisk glares (answers late next turn); Moonbat scrambles an answer', () => {
    expect(beginTurn(run(start('mon_sunscale_basilisk'), M('mon_sunscale_basilisk'), [false]).s, M('mon_sunscale_basilisk')).state.now.glare).toBe(true);
    expect(beginTurn(run(start('mon_moonbat'), M('mon_moonbat'), [false]).s, M('mon_moonbat')).state.now.scramble).toBe(true);
  });
  it('Cinder Scarab takes half spell damage', () => {
    expect(run(start('mon_cinder_scarab'), M('mon_cinder_scarab'), [true]).s.hp).toBe(50 - 5);
  });
  it('Starmoth puts you to sleep about 30% of the time', () => {
    let naps = 0;
    for (let seed = 1; seed <= 400; seed++) if (run(start('mon_starmoth'), M('mon_starmoth'), [false], [], [], seed).s.next.nap) naps++;
    expect(naps / 400).toBeGreaterThan(0.22);
    expect(naps / 400).toBeLessThan(0.38);
  });
  it('Nebula Lynx sometimes lands a ×1.5 critical hit', () => {
    const hits = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) hits.add(100 - run(start('mon_nebula_lynx'), M('mon_nebula_lynx'), [false], [], [], seed).s.playerHp);
    expect([...hits].sort()).toEqual([11, 17]);
  });
  it('Galaxy Stag hits +4 harder each charge', () => {
    expect(run(start('boss_galaxy_stag'), M('boss_galaxy_stag'), [false, false]).s.playerHp).toBe(100 - 19 - 23);
  });
  it('Rune Golem halves your next spell; Relic Wraith blocks it', () => {
    const g = run(start('mon_rune_golem'), M('mon_rune_golem'), [false, true]);
    expect(g.events.filter((e) => e.type === 'cast').map((e) => (e as { damage: number }).damage)).toEqual([5]);
    const w = run(start('mon_relic_wraith'), M('mon_relic_wraith'), [false, true, true]);
    expect(w.events.filter((e) => e.type === 'cast').map((e) => (e as { damage: number }).damage)).toEqual([0, 10]);
  });
  it('Comet Hound attacks first', () => {
    expect(opening(start('mon_comet_hound'), M('mon_comet_hound')).state.playerHp).toBe(91);
  });
  it('Astral Colossus doubles its hit every 3rd turn', () => {
    const m = M('boss_astral_colossus');
    expect(run(start('boss_astral_colossus'), m, [false]).s.playerHp).toBe(76);
    expect(run(start('boss_astral_colossus'), m, [true, true, false]).s.playerHp).toBe(100 - 48);
  });
  it('Crystal Crawler hits 3 times; Tide Specter heals 6', () => {
    expect(run(start('mon_crystal_crawler'), M('mon_crystal_crawler'), [false]).s.playerHp).toBe(88);
    const t = run(start('mon_tide_specter'), M('mon_tide_specter'), [true, false]);
    expect(t.s.hp).toBe(46);
  });
  it('Lunar Hydra: 7 hits; heads fall after 2, 4 and 7; each living head bites for 7', () => {
    const m = M('boss_lunar_hydra');
    const bites = (rights: number) => run(run(start('boss_lunar_hydra'), m, Array(rights).fill(true)).s, m, [false]).events.filter((e) => e.type === 'attack').length;
    expect([bites(0), bites(1), bites(2), bites(3), bites(4), bites(6)]).toEqual([3, 3, 2, 2, 1, 1]);
    expect(run(start('boss_lunar_hydra'), m, [false]).s.playerHp).toBe(100 - 21);
    expect(run(start('boss_lunar_hydra'), m, Array(7).fill(true)).s.outcome).toBe('won');
    const downs = run(start('boss_lunar_hydra'), m, Array(7).fill(true)).events.filter((e) => e.type === 'headDown');
    expect(downs.map((e) => (e as { left: number }).left)).toEqual([2, 1]);
  });
  it('every bonus-zone attack has a rule', () => {
    for (const z of ['sunfire_pass', 'nebula_grove', 'astral_ruins', 'moonwell_cavern'])
      for (const mm of Object.values(MONSTERS).filter((x) => x.zone === z)) for (const a of mm.attacks) expect(a.rule.kind, mm.id).not.toBe('plain');
  });
});
