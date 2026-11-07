import { describe, expect, it } from 'vitest';
import manifest from '../assets/manifest.json';
import { MENTORS } from '../data/dialogue.ts';
import { ITEMS } from '../data/items.ts';
import { ROOMS } from '../data/rooms.ts';
import { ZONES } from '../data/zones.ts';
import { REWARD_ONLY_ITEMS } from '../rewards/redeem.ts';
import { MONSTERS } from './monsters.ts';
import { TOPIC_ZONE_ORDER } from './progression.ts';
import { newQuestionState, pickTopic } from './questions.ts';
import { seeded } from './rng.ts';
import { TOPICS } from './types.ts';
import { bonusOpen, canEnter } from './unlocks.ts';

const chars = (manifest as { characters: Record<string, unknown> }).characters;

describe('the world', () => {
  it('has all 11 locations connected: every exit leads to a real screen', () => {
    expect(Object.keys(ROOMS).sort()).toEqual([...ZONES.map((z) => z.id), 'coin_academy'].sort());
    for (const r of Object.values(ROOMS))
      for (const [name, sc] of Object.entries(r.screens))
        for (const e of sc.exits) {
          if (e.to === 'world_map') continue;
          const [zone, screen] = e.to.includes('/') ? e.to.split('/') : [r.zone, e.to];
          expect(ROOMS[zone!]?.screens[screen!], `${r.zone}/${name} → ${e.to}`).toBeTruthy();
        }
  });
  it('places every one of the 40 monsters exactly once, in its own zone', () => {
    const placed = Object.values(ROOMS).flatMap((r) => Object.values(r.screens).flatMap((s) => s.monsters.map((m) => ({ id: m.id, zone: r.zone }))));
    expect(placed.map((p) => p.id).sort()).toEqual(Object.keys(MONSTERS).sort());
    for (const p of placed) expect(MONSTERS[p.id]!.zone).toBe(p.zone);
  });
  it('has four portals on the portal ring, one per bonus zone', () => {
    const portals = ROOMS.crossroads_observatory!.screens.portal_ring!.portals!;
    expect(portals.map((p) => p.to).sort()).toEqual(ZONES.filter((z) => z.bonus).map((z) => z.id).sort());
  });
  it('every topic zone has a mentor with art and 2–3 tips; every NPC sprite exists', () => {
    for (const z of TOPIC_ZONE_ORDER) {
      const m = MENTORS[z]!;
      expect(chars[m.speaker.sprite], z).toBeTruthy();
      expect(m.tips.length).toBeGreaterThanOrEqual(2);
      expect(m.tips.length).toBeLessThanOrEqual(3);
    }
    for (const r of Object.values(ROOMS)) for (const s of Object.values(r.screens)) for (const n of s.npcs) expect(chars[n.sprite], n.sprite).toBeTruthy();
  });
});

describe('unlocks', () => {
  it('topic zones open in order; bonus zones after all six bosses and Money Check 2', () => {
    expect(canEnter('borrowers_bridges', [], false)).toBe(false);
    expect(canEnter('borrowers_bridges', ['piggybank_village'], false)).toBe(true);
    expect(bonusOpen(TOPIC_ZONE_ORDER.slice(0, 5), true)).toBe(false);
    expect(bonusOpen([...TOPIC_ZONE_ORDER], false)).toBe(false);
    expect(bonusOpen([...TOPIC_ZONE_ORDER], true)).toBe(true);
  });
});

describe('bonus-zone questions', () => {
  it('lean toward the weakest topic (about 3× a perfect one)', () => {
    const acc = Object.fromEntries(TOPICS.map((t) => [t, { answered: 10, correct: 10 }]));
    acc['Investing'] = { answered: 10, correct: 0 };
    const rng = seeded(6);
    const n: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) {
      const t = pickTopic(acc, TOPICS, rng);
      n[t] = (n[t] ?? 0) + 1;
    }
    const ratio = n['Investing']! / n['Spending and Saving']!;
    expect(ratio).toBeGreaterThan(2.6);
    expect(ratio).toBeLessThan(3.4);
  });
  it('treat untried topics as 50%', () => {
    const rng = seeded(1);
    const seen = new Set(Array.from({ length: 500 }, () => pickTopic(newQuestionState().accuracy, TOPICS, rng)));
    expect(seen.size).toBe(6);
  });
});

describe('items', () => {
  it('the reward prizes exist, have art, and have no price', () => {
    for (const id of REWARD_ONLY_ITEMS) {
      const it = ITEMS.find((i) => i.id === id)!;
      expect(it, id).toBeTruthy();
      expect(it.price).toBeNull();
    }
    const v1px = (manifest as { v1px: Record<string, { frames: string[] }> }).v1px;
    for (const p of ITEMS.filter((i) => i.kind === 'pet' && i.id !== 'pet-bull')) expect(v1px.pets!.frames).toContain(p.art);
  });
});
