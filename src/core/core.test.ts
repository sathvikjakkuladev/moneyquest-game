import { describe, expect, it } from 'vitest';
import questionFile from '../data/questions.json';
import { HELD_OUT, MONEY_CHECK_FORMS } from '../data/moneyCheckForms.ts';
import v2 from '../assets/v2.json';
import { exitAt, exitTarget, ROOMS, standable } from '../data/rooms.ts';
import { art, LOCATIONS } from '../data/v2.ts';
import { MONSTERS } from './monsters.ts';
import { item } from '../data/items.ts';
import { AVATAR, HATS } from '../data/v2.ts';
import { cleanLook, costumeSource, costumeUnlocked, DEFAULT_LOOK, lookFromList, lookToList, randomLook } from './look.ts';
import { fill, hexRgb, isSkin, paintBody, tint } from './recolor.ts';
import { inPoly, step } from './geometry.ts';
import type { Poly, Pt } from './geometry.ts';
import { ALL_DISTRICTS, bossReady, levelFor, zoneOpen } from './progression.ts';
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
    expect(zoneOpen('coinfall-docks', [])).toBe(true);
    expect(zoneOpen('the-sprawl', [])).toBe(false);
    expect(zoneOpen('the-sprawl', ['coinfall-docks'])).toBe(true);
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
  it('every arrival point is standable and clear of the exits; every exit leads to a screen that leads back', () => {
    for (const rooms of Object.values(ROOMS)) {
      for (const [name, sc] of Object.entries(rooms.screens)) {
        for (const [k, p] of Object.entries(sc.entries)) {
          expect(standable(sc, p), `${rooms.zone}/${name} ${k}`).toBe(true);
          expect(exitAt(sc, p), `${rooms.zone}/${name} ${k} is inside an exit`).toBeNull();
        }
        for (const e of sc.exits) {
          const mid = (e.range[0] + e.range[1]) / 2;
          const edge: Pt = e.edge === 'left' ? [4, mid] : e.edge === 'right' ? [636, mid] : e.edge === 'top' ? [mid, 4] : [mid, 356];
          expect(standable(sc, edge), `${rooms.zone}/${name} ${e.edge} exit`).toBe(true);
          const t = exitTarget(rooms.zone, e);
          expect(t.kind === 'room' && t.zone === rooms.zone, `${rooms.zone}/${name}: places are joined only by the world map`).toBe(true);
          if (t.kind !== 'room') continue;
          const target = rooms.screens[t.screen]!;
          expect(target, `${name} → ${t.screen}`).toBeTruthy();
          expect(target.entries[`from_${name}`], `${t.screen} has no arrival point from ${name}`).toBeTruthy();
          expect(target.exits.some((x) => x.to === name), `${t.screen} has no exit back to ${name}`).toBe(true);
        }
        for (const n of [...sc.npcs, ...sc.monsters]) expect(n.x >= 0 && n.x <= 640 && n.y >= 0 && n.y <= 360).toBe(true);
      }
      expect(rooms.screens[rooms.start]!.entries.arrival, `${rooms.zone} has a waystone arrival`).toBeTruthy();
      expect(rooms.screens[rooms.start]!.waystone, `${rooms.zone} has a waystone`).toBeTruthy();
    }
  });
  it('nothing is walled off: from where you arrive you can walk to every exit, person, monster and waystone', () => {
    const STEP = 4;
    for (const rooms of Object.values(ROOMS)) {
      for (const [name, sc] of Object.entries(rooms.screens)) {
        // Flood-fill the standable area from the first arrival point.
        const key = (x: number, y: number) => `${x},${y}`;
        const start = Object.values(sc.entries)[0]!;
        const seen = new Set<string>();
        const queue: Pt[] = [[Math.round(start[0] / STEP) * STEP, Math.round(start[1] / STEP) * STEP]];
        seen.add(key(queue[0]![0], queue[0]![1]));
        while (queue.length) {
          const [x, y] = queue.pop()!;
          for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]] as const) {
            const q: Pt = [x + dx, y + dy];
            if (q[0] < 0 || q[0] > 640 || q[1] < 0 || q[1] > 360 || seen.has(key(q[0], q[1])) || !standable(sc, q)) continue;
            seen.add(key(q[0], q[1]));
            queue.push(q);
          }
        }
        const near = (p: Pt, r: number) => [...seen].some((k) => { const [x, y] = k.split(',').map(Number) as [number, number]; return Math.hypot(x - p[0], (y - p[1]) * 1.4) < r; });
        for (const [k, p] of Object.entries(sc.entries)) expect(near(p, 8), `${rooms.zone}/${name}: arrival ${k} is cut off`).toBe(true);
        for (const e of sc.exits) {
          const mid = (e.range[0] + e.range[1]) / 2;
          expect(near(e.edge === 'left' ? [4, mid] : e.edge === 'right' ? [636, mid] : e.edge === 'top' ? [mid, 4] : [mid, 356], 12), `${rooms.zone}/${name}: the ${e.edge} exit is cut off`).toBe(true);
        }
        // You only have to get within talking (or battle) range.
        for (const n of sc.npcs) expect(near([n.x, n.y], 50), `${rooms.zone}/${name}: ${n.id} can't be reached`).toBe(true);
        for (const m of sc.monsters) expect(near([m.x, m.y], 44), `${rooms.zone}/${name}: ${m.id} can't be reached`).toBe(true);
        if (sc.waystone) expect(near(sc.waystone, 40), `${rooms.zone}/${name}: the waystone can't be reached`).toBe(true);
      }
    }
  });
  it('places every monster once: two and the boss in each district, the Debt Dragon in Ledgerhold', () => {
    const placed = Object.values(ROOMS).flatMap((r) => Object.values(r.screens).flatMap((s) => s.monsters.map((m) => [r.zone, m.id] as const)));
    expect(placed.map(([, id]) => id).sort()).toEqual(Object.keys(MONSTERS).sort());
    for (const [zone, id] of placed) expect(MONSTERS[id]!.zone, id).toBe(zone);
  });
  it('every screen has its art, and every prop it places was exported', () => {
    const files = (v2 as unknown as { files: Record<string, unknown> }).files;
    for (const rooms of Object.values(ROOMS)) {
      const artOf = LOCATIONS[rooms.zone]!;
      expect(Object.keys(artOf.screens).sort()).toEqual(Object.keys(rooms.screens).sort());
      for (const [name, a] of Object.entries(artOf.screens)) {
        expect(files[art.ground(rooms.zone, name)], `${rooms.zone}/${name} ground`).toBeTruthy();
        if (a.over) expect(files[art.over(rooms.zone, name)], `${rooms.zone}/${name} overhang`).toBeTruthy();
        for (const p of a.props) expect(files[art.prop(rooms.zone, p.p)], `${rooms.zone}/${name} prop ${p.p}`).toBeTruthy();
      }
    }
  });
});

describe('save migrations', () => {
  it('upgrades a v1 save (Phases 2–4) all the way up, keeping everything', () => {
    const v1 = {
      version: 1, active: 0,
      slots: [{ nickname: 'Old', band: 'K-5', createdAt: '2026-11-07T00:00:00Z', progress: { level: 3, xp: 320, coins: 42, defeated: ['mon_spendling'], zonesCleared: [], spells: ['budget_beam'], spell: 'budget_beam' }, inventory: { owned: ['hat-laurel'], hat: 'hat-laurel', pet: null }, questions: newQuestionState(), moneyCheck: { firstForm: 'B', pre: null, post: null }, redeemed: ['x'], settings: { readAloud: false, reducedMotion: null } }, null, null],
    };
    const v3 = migrate(v1, 1);
    expect(v3.version).toBe(SAVE_VERSION);
    expect(v3.active).toBe(0);
    // v2 added tamed; v3 added coinsEarned (seeded from the wallet), playOffline and online; v4 moved
    // to Vaultspire: one old monster beaten in the first zone is one new monster beaten and captured.
    expect(v3.slots[0]!.progress).toEqual({ ...v1.slots[0]!.progress, defeated: ['mon_budget_breaker'], tamed: ['mon_budget_breaker'], coinsEarned: 42 });
    expect(v3.slots[0]!.settings).toEqual({ readAloud: false, reducedMotion: null, playOffline: false });
    expect(v3.slots[0]!.online).toBeNull();
    expect(v3.slots[0]!.inventory.hat).toBe('hat-laurel');
  });
  it('upgrades a v7 save to v8: no gear yet', () => {
    const s7 = { ...newSlot('Seven', 'K-5', 'A') } as unknown as Record<string, unknown>;
    delete s7.gear;
    const v8 = migrate({ version: 7, active: 0, slots: [s7, null, null] }, 7);
    expect(v8.version).toBe(SAVE_VERSION);
    expect(v8.slots[0]!.gear).toEqual({ owned: [], armor: null, wand: null, potions: 0 });
    expect(v8.slots[0]!.daily).toEqual({ spun: null });
  });
  it('upgrades a v6 save to v7: the Daily Wheel not spun yet', () => {
    const s6 = { ...newSlot('Six', 'K-5', 'A') } as unknown as Record<string, unknown>;
    delete s6.daily;
    delete s6.gear;
    delete s6.gear;
    const v7 = migrate({ version: 6, active: 0, slots: [s6, null, null] }, 6);
    expect(v7.version).toBe(SAVE_VERSION);
    expect(v7.slots[0]!.daily).toEqual({ spun: null });
    expect(v7.slots[0]!.market).toEqual({ holdings: {}, lastTrade: 0 });
  });
  it('upgrades a v5 save to v6: an empty Stock Board portfolio, everything else kept', () => {
    const s5 = { ...newSlot('Five', 'K-5', 'B') } as unknown as Record<string, unknown>;
    delete s5.market;
    delete s5.daily;
    delete s5.gear;
    const v6 = migrate({ version: 5, active: 0, slots: [s5, null, null] }, 5);
    expect(v6.slots[0]!.market).toEqual({ holdings: {}, lastTrade: 0 });
    expect(v6.slots[0]!.nickname).toBe('Five');
  });
  it('upgrades a v4 save to v5: last played starts as when it was made, no save code yet', () => {
    const s4 = newSlot('Four', '6-8', 'A', new Date('2026-11-12T10:00:00Z')) as unknown as Record<string, unknown>;
    delete s4.playedAt;
    delete s4.backup;
    delete s4.market;
    delete s4.daily;
    delete s4.gear;
    const v5 = migrate({ version: 4, active: 0, slots: [s4, null, null] }, 4);
    expect(v5.version).toBe(SAVE_VERSION);
    expect(v5.slots[0]!.playedAt).toBe('2026-11-12T10:00:00.000Z');
    expect(v5.slots[0]!.backup).toBeNull();
    expect(v5.slots[0]!.nickname).toBe('Four');
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
  it('upgrades a v3 save (the pixel-art world) to v4 (Vaultspire): progress by count, hats and pets mapped', () => {
    const base = newSlot('Three', '6-8', 'A') as unknown as Record<string, unknown>;
    delete base.look;
    const v3slot = {
      ...base,
      progress: { level: 9, xp: 4200, coins: 77, coinsEarned: 900, spells: ['budget_beam', 'save_shield', 'credit_cleanse'], spell: 'save_shield', tamed: [],
        // Two zones cleared, and two of the third zone's three monsters beaten.
        defeated: ['mon_spendling', 'mon_impulse_magpie', 'mon_jar_muncher', 'boss_king_splurge', 'mon_debt_slime', 'mon_interest_imp', 'mon_late_fee_troll', 'boss_loan_shark_lord', 'mon_tax_gremlin', 'mon_gig_goblin'],
        zonesCleared: ['piggybank_village', 'borrowers_bridges'] },
      inventory: { owned: ['hat-wizard', 'hat-laurel', 'pet-star-kitten', 'pet-professor-owl', 'pet-bull', 'insurance-scroll'], hat: 'hat-wizard', pet: 'pet-professor-owl' },
      redeemed: ['MB-W0000-AAAAA'],
    };
    const s = migrate({ version: 3, active: 0, slots: [v3slot, null, null] }, 3).slots[0]!;
    // The first two districts are cleared, with their monsters beaten; two more in the third.
    expect(s.progress.zonesCleared).toEqual(['coinfall-docks', 'the-sprawl']);
    expect(s.progress.defeated).toEqual(['mon_budget_breaker', 'mon_subscription_swarm', 'boss_overspend_kraken', 'mon_impulse_wisp', 'mon_splurge_hound', 'boss_splurge_peacock', 'mon_inflation_shade', 'mon_overdraft_golem']);
    expect(zoneOpen('frostvault', s.progress.zonesCleared)).toBe(true);
    // Everything else about progress is untouched.
    expect([s.progress.level, s.progress.xp, s.progress.coins, s.progress.coinsEarned, s.progress.spells, s.progress.spell]).toEqual([9, 4200, 77, 900, ['budget_beam', 'save_shield', 'credit_cleanse'], 'save_shield']);
    expect(s.redeemed).toEqual(['MB-W0000-AAAAA']);
    // Hats map to the new hats; the reward prizes and the scroll stay.
    expect(s.inventory.hat).toBe('hat-wizard-hat');
    for (const id of ['hat-wizard-hat', 'hat-laurel', 'pet-bull', 'insurance-scroll']) expect(s.inventory.owned, id).toContain(id);
    // Every monster beaten is captured; bought pets become captured monsters, and the Owl a legendary boss.
    for (const m of s.progress.defeated) expect(s.inventory.owned, m).toContain(`tame:${m}`);
    expect(s.inventory.pet).toBe('tame:boss_volatility_roc');
    expect(s.progress.tamed).toEqual(expect.arrayContaining([...s.progress.defeated, 'boss_volatility_roc']));
    // Every id the save now holds is one the game knows.
    for (const id of s.inventory.owned) expect(id === 'insurance-scroll' || item(id), id).toBeTruthy();
    for (const m of [...s.progress.defeated, ...s.progress.tamed]) expect(MONSTERS[m], m).toBeTruthy();
    expect(s.look).toEqual(DEFAULT_LOOK);
    expect(s.inventory.petLook).toBeNull();
  });
  it('a v3 save that finished everything keeps all seven districts, and a tamed monster stays a pet', () => {
    const base = newSlot('Done', 'K-5', 'B') as unknown as Record<string, unknown>;
    delete base.look;
    const old = ['piggybank_village', 'borrowers_bridges', 'guildworks', 'compound_orchard', 'stormwatch_coast', 'crossroads_observatory', 'sunfire_pass'];
    const s = migrate({ version: 3, active: 0, slots: [{ ...base, progress: { ...(base.progress as object), zonesCleared: old, defeated: [], tamed: ['mon_ember_jackal'] }, inventory: { owned: ['tame:mon_ember_jackal'], hat: null, pet: 'tame:mon_ember_jackal' } }, null, null] }, 3).slots[0]!;
    expect(s.progress.zonesCleared).toEqual([...ALL_DISTRICTS]);
    expect(s.progress.defeated).toHaveLength(21);
    expect(item(s.inventory.pet!)?.kind).toBe('pet');
    expect(s.inventory.owned).toContain(s.inventory.pet);
  });
});

describe('the look', () => {
  it('cleans bad values, round-trips through its list form, and refuses out-of-range lists', () => {
    expect(cleanLook(undefined)).toEqual(DEFAULT_LOOK);
    expect(cleanLook({ skin: 99, eyes: -1, hair: 2.5, hairColour: '3', face: 1, costume: 0 })).toEqual({ ...DEFAULT_LOOK, face: 1 });
    const l = { skin: 7, eyes: 3, hair: 5, hairColour: 0, face: 4, costume: 2 };
    expect(lookFromList(lookToList(l))).toEqual(l);
    expect(lookFromList([0, 0, 0, 0, 0])).toBeNull();
    expect(lookFromList([0, 0, 99, 0, 0, 0])).toBeNull();
    expect(lookFromList('x')).toBeNull();
    const r = seeded(3);
    for (let i = 0; i < 40; i++) { const x = randomLook(r); expect(cleanLook(x)).toEqual(x); expect(x.hair).not.toBe(AVATAR.neat); expect(x.costume).toBe(0); }
  });
  it('costume colour sets are earned: the first from the start, one per district boss', () => {
    const sets = AVATAR.costume.sets;
    expect(sets.filter((_, i) => costumeUnlocked(i, []))).toHaveLength(1);
    expect(sets.filter((_, i) => costumeUnlocked(i, [...ALL_DISTRICTS]))).toHaveLength(sets.length);
    // Seven districts, seven extra sets, each from a different boss.
    expect(new Set(sets.map((_, i) => costumeSource(i)?.id).filter(Boolean)).size).toBe(7);
  });
  it('every clip has a head position for each of its frames, and every layer and hat image was exported', () => {
    const files = (v2 as unknown as { files: Record<string, unknown> }).files;
    for (const [name, c] of Object.entries(AVATAR.clips)) {
      expect(c.head, name).toHaveLength(c.frames);
      expect(files[c.image], name).toBeTruthy();
    }
    for (const view of ['front', 'back'] as const) for (const list of Object.values(AVATAR.layers[view])) for (const l of list) expect(files[l.image], l.image).toBeTruthy();
    // Every hairstyle has a front layer in both views; every face has its lines and its iris.
    AVATAR.hairStyles.forEach((_, i) => { for (const view of ['front', 'back'] as const) expect(AVATAR.layers[view]['hair-front']!.some((l) => l.i === i), `hair ${i} ${view}`).toBe(true); });
    AVATAR.faces.forEach((_, i) => { for (const k of ['face', 'iris']) expect(AVATAR.layers.front[k]!.some((l) => l.i === i), `${k} ${i}`).toBe(true); });
    for (const h of HATS) for (const v of ['front', 'back'] as const) expect(files[h.views[v].image], `${h.id} ${v}`).toBeTruthy();
    expect(HATS).toHaveLength(25);
  });
});

describe('avatar colours (ported from the art set\'s recolor.py and overlay.py)', () => {
  const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);
  const spec = AVATAR.costume;
  it('moves skin pixels to the chosen tone and leaves everything else alone', () => {
    const base = AVATAR.skinBase;
    const d = px(...base, 255, 40, 60, 200, 255, 0, 0, 0, 0);
    paintBody(d, 3, 1, { skin: hexRgb(AVATAR.skin[9]!), skinBase: base, set: null, spec, protectAbove: () => false });
    expect([...d.slice(0, 3)]).toEqual(hexRgb(AVATAR.skin[9]!)); // the base tone lands exactly on the target
    expect([...d.slice(4, 8)]).toEqual([40, 60, 200, 255]);
    expect(isSkin(base[0], base[1], base[2], 255)).toBe(true);
    expect(isSkin(40, 60, 200, 255)).toBe(false);
  });
  it('shifts each costume group to the set\'s colours, keeps unmapped groups, and protects the head', () => {
    const ember = spec.sets.find((s) => s.id === 'ember-knight')!;
    const cape = [40, 50, 190]; // a deep blue inside the cape group
    const d = px(...cape, 255, ...cape, 255);
    paintBody(d, 2, 1, { skin: null, skinBase: AVATAR.skinBase, set: ember, spec, protectAbove: (x) => x === 1 });
    expect([...d.slice(4, 7)]).toEqual(cape); // above the neck: untouched
    const [r, g, b] = [...d.slice(0, 3)] as [number, number, number];
    expect(r > b && r > g, `cape became ${[r, g, b]}`).toBe(true); // blue became a warm colour
    // The default set changes nothing.
    const same = px(...cape, 255);
    paintBody(same, 1, 1, { skin: null, skinBase: AVATAR.skinBase, set: null, spec, protectAbove: () => false });
    expect([...same.slice(0, 3)]).toEqual(cape);
  });
  it('tints grey hair layers and fills irises', () => {
    const d = px(215, 215, 215, 255, 107, 107, 107, 128, 9, 9, 9, 0);
    tint(d, [200, 100, 50], AVATAR.hairTintBase);
    expect([...d]).toEqual([200, 100, 50, 255, 100, 50, 25, 128, 9, 9, 9, 0]);
    const e = px(1, 2, 3, 255, 1, 2, 3, 0);
    fill(e, [10, 20, 30]);
    expect([...e]).toEqual([10, 20, 30, 255, 1, 2, 3, 0]);
  });
});
