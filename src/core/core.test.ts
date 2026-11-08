import { describe, expect, it } from 'vitest';
import questionFile from '../data/questions.json';
import { HELD_OUT, MONEY_CHECK_FORMS } from '../data/moneyCheckForms.ts';
import { exitAt, exitTarget, ROOMS, standable } from '../data/rooms.ts';
import { inPoly, step } from './geometry.ts';
import type { Poly, Pt } from './geometry.ts';
import { bossReady, levelFor, zoneOpen } from './progression.ts';
import { battlePool, draw, newQuestionState, poolOf, record, show } from './questions.ts';
import { seeded, shuffle } from './rng.ts';
import { emptySave, migrate, newSlot, randomNickname, SAVE_VERSION, validNickname } from './save.ts';
import type { QuestionFile } from './types.ts';
import { BANDS, TOPICS } from './types.ts';

const BANK = (questionFile as unknown as QuestionFile).questions;
const byId = new Map(BANK.map((q) => [q.id, q]));

describe('rng', () => {
  it('is repeatable and shuffles without losing items', () => {
    const a = seeded(1), b = seeded(1);
    expect([a(), a()]).toEqual([b(), b()]);
    expect(shuffle([1, 2, 3, 4], seeded(2)).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('Money Check forms', () => {
  it('12 per form, 2 per topic, right band, real questions; 11 left per topic and band for battles', () => {
    for (const band of BANDS) {
      for (const f of ['A', 'B'] as const) {
        const qs = MONEY_CHECK_FORMS[band][f].map((id) => byId.get(id)!);
        expect(qs.every((q) => q && q.band === band)).toBe(true);
        for (const t of TOPICS) expect(qs.filter((q) => q.topic === t)).toHaveLength(2);
      }
      for (const t of TOPICS) expect(battlePool(BANK, t, band, HELD_OUT)).toHaveLength(11);
    }
    expect(HELD_OUT.size).toBe(48);
  });
});

describe('question selection', () => {
  const ids = battlePool(BANK, 'Spending and Saving', 'K-5', HELD_OUT);
  const pool = poolOf('Spending and Saving', 'K-5');
  it('no repeats until the bag is empty; a new round never starts with the last question', () => {
    const rng = seeded(4);
    let s = newQuestionState();
    for (let round = 0; round < 15; round++) {
      const seen = new Set<string>();
      for (let i = 0; i < ids.length; i++) {
        const r = draw(s, pool, ids, rng);
        if (i === 0 && round) expect(r.id).not.toBe(s.last[pool]);
        s = record(r.state, pool, byId.get(r.id)!, true, rng);
        seen.add(r.id);
      }
      expect(seen.size).toBe(ids.length);
    }
  });
  it('a miss returns 3–5 questions later, until answered right', () => {
    const rng = seeded(8);
    let s = newQuestionState();
    const first = draw(s, pool, ids, rng);
    s = record(first.state, pool, byId.get(first.id)!, false, rng);
    let gap = 0;
    for (;;) {
      const r = draw(s, pool, ids, rng);
      gap++;
      s = r.state;
      if (r.id === first.id) break;
      s = record(s, pool, byId.get(r.id)!, true, rng);
    }
    expect(gap).toBeGreaterThanOrEqual(3);
    expect(gap).toBeLessThanOrEqual(5);
    expect(record(s, pool, byId.get(first.id)!, true, rng).misses).toHaveLength(0);
  });
  it('tracks accuracy per topic and never asks a held-out question', () => {
    const rng = seeded(3);
    let s = newQuestionState();
    for (let i = 0; i < 100; i++) {
      const r = draw(s, pool, ids, rng);
      expect(HELD_OUT.has(r.id)).toBe(false);
      s = record(r.state, pool, byId.get(r.id)!, i % 2 === 0, rng);
    }
    expect(s.accuracy['Spending and Saving']).toEqual({ answered: 100, correct: 50 });
  });
  it('shuffled options keep the right answer, and it lands evenly on A–D', () => {
    const rng = seeded(5);
    for (const q of BANK) {
      const v = show(q, rng);
      expect(v.options[v.correct]).toBe(q.options[q.correct]);
    }
    const n = [0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) n[show(BANK[0]!, rng).correct]!++;
    for (const c of n) expect(Math.abs(c - 2500)).toBeLessThan(200);
  });
});

describe('progression', () => {
  it('levels at 100, 300, 600 XP; zones open in order; bosses wait for regulars', () => {
    expect([0, 99, 100, 299, 300, 600].map(levelFor)).toEqual([1, 1, 2, 2, 3, 4]);
    expect(zoneOpen('piggybank_village', [])).toBe(true);
    expect(zoneOpen('borrowers_bridges', [])).toBe(false);
    expect(zoneOpen('borrowers_bridges', ['piggybank_village'])).toBe(true);
    expect(bossReady(['a', 'b'], ['a'])).toBe(false);
    expect(bossReady(['a', 'b'], ['b', 'a'])).toBe(true);
  });
});

describe('save', () => {
  it('nicknames: 2–12 letters and numbers; random names always valid', () => {
    expect(['Al', 'Fox99'].every(validNickname)).toBe(true);
    expect(['A', 'Bob Smith', 'abcdefghijklm', 'émile'].some(validNickname)).toBe(false);
    const r = seeded(1);
    for (let i = 0; i < 50; i++) expect(validNickname(randomNickname(r))).toBe(true);
  });
  it('round-trips through migrate; broken saves start fresh', () => {
    const s = { ...emptySave(), slots: [newSlot('Fox', 'K-5', 'A'), null, null], active: 0 };
    expect(migrate(JSON.parse(JSON.stringify(s)), SAVE_VERSION)).toEqual(s);
    expect(migrate(null, 1)).toEqual(emptySave());
    expect(migrate({ slots: 'x' }, 1)).toEqual(emptySave());
    expect(migrate({ slots: [] }, 0)).toEqual(emptySave());
  });
});

describe('geometry and rooms', () => {
  it('point-in-polygon and sliding along walls', () => {
    const sq: Poly = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect([inPoly([5, 5], sq), inPoly([15, 5], sq)]).toEqual([true, false]);
    expect(step([9, 5], 3, 3, (p) => inPoly(p, sq))).toEqual([9, 8]);
  });
  it('every entry and arrival is standable and not inside an exit; every exit can be reached', () => {
    for (const rooms of Object.values(ROOMS)) {
      for (const [name, sc] of Object.entries(rooms.screens)) {
        for (const [k, p] of Object.entries(sc.entries)) expect(standable(sc, p), `${rooms.zone}/${name} ${k}`).toBe(true);
        for (const e of sc.exits) {
          const mid = (e.range[0] + e.range[1]) / 2;
          const edge: Pt = e.edge === 'left' ? [4, mid] : e.edge === 'right' ? [636, mid] : e.edge === 'top' ? [mid, 4] : [mid, 356];
          expect(standable(sc, edge), `${rooms.zone}/${name} ${e.edge} exit`).toBe(true);
          const t = exitTarget(rooms.zone, e);
          if (t.kind === 'room' && t.zone === rooms.zone) {
            const target = rooms.screens[t.screen]!;
            expect(standable(target, e.enterAt!), `${name} → ${t.screen}`).toBe(true);
            expect(exitAt(target, e.enterAt!)).toBeNull();
          }
        }
        for (const n of [...sc.npcs, ...sc.monsters]) expect(n.x >= 0 && n.x <= 640 && n.y >= 0 && n.y <= 360).toBe(true);
      }
    }
  });
  it('places all four Piggybank monsters', () => {
    const ids = Object.values(ROOMS.piggybank_village!.screens).flatMap((s) => s.monsters.map((m) => m.id));
    expect(ids.sort()).toEqual(['boss_king_splurge', 'mon_impulse_magpie', 'mon_jar_muncher', 'mon_spendling']);
  });
});

describe('save migrations', () => {
  it('upgrades a v1 save (Phases 2–4) through v2 to v3, keeping everything', () => {
    const v1 = {
      version: 1, active: 0,
      slots: [{ nickname: 'Old', band: 'K-5', createdAt: '2026-11-07T00:00:00Z', progress: { level: 3, xp: 320, coins: 42, defeated: ['mon_spendling'], zonesCleared: [], spells: ['budget_beam'], spell: 'budget_beam' }, inventory: { owned: ['hat-laurel'], hat: 'hat-laurel', pet: null }, questions: newQuestionState(), moneyCheck: { firstForm: 'B', pre: null, post: null }, redeemed: ['x'], settings: { readAloud: false, reducedMotion: null } }, null, null],
    };
    const v3 = migrate(v1, 1);
    expect(v3.version).toBe(3);
    expect(v3.active).toBe(0);
    // v2 added tamed; v3 added coinsEarned (seeded from the wallet), playOffline and online.
    expect(v3.slots[0]!.progress).toEqual({ ...v1.slots[0]!.progress, tamed: [], coinsEarned: 42 });
    expect(v3.slots[0]!.settings).toEqual({ readAloud: false, reducedMotion: null, playOffline: false });
    expect(v3.slots[0]!.online).toBeNull();
    expect(v3.slots[0]!.inventory.hat).toBe('hat-laurel');
  });
  it('upgrades a v2 save to v3 without touching the rest', () => {
    const s2 = { ...newSlot('Two', '6-8', 'A'), progress: { ...newSlot('Two', '6-8', 'A').progress, coins: 7 } } as Record<string, unknown>;
    delete (s2.progress as Record<string, unknown>).coinsEarned;
    delete s2.online;
    s2.settings = { readAloud: true, reducedMotion: true };
    const v3 = migrate({ version: 2, active: 0, slots: [s2, null, null] }, 2);
    expect(v3.slots[0]!.progress.coinsEarned).toBe(7);
    expect(v3.slots[0]!.settings).toEqual({ readAloud: true, reducedMotion: true, playOffline: false });
    expect(v3.slots[0]!.online).toBeNull();
    expect(v3.slots[0]!.nickname).toBe('Two');
  });
});
