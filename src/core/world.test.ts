import { describe, expect, it } from 'vitest';
import v2 from '../assets/v2.json';
import { MENTORS, TOWNSFOLK } from '../data/dialogue.ts';
import { BULL_CALF, item, ITEMS, tameId } from '../data/items.ts';
import { ROOMS } from '../data/rooms.ts';
import { AVATAR, BATTLE, CREATURES, hatArt, WORLD } from '../data/v2.ts';
import { FINALE, HUB_ID, ZONES } from '../data/zones.ts';
import { REWARD_ONLY_ITEMS } from '../rewards/redeem.ts';
import { MONSTERS } from './monsters.ts';
import { ALL_DISTRICTS, MIXED_ZONE, TOPIC_ZONE_ORDER } from './progression.ts';
import { petLooks } from './shop.ts';
import { ZONE_SPELL } from './spells.ts';
import { newQuestionState, pickTopic } from './questions.ts';
import { seeded } from './rng.ts';
import { TOPICS } from './types.ts';
import { bonusOpen, canEnter, finaleOpen } from './unlocks.ts';

const files = (v2 as unknown as { files: Record<string, unknown> }).files;

describe('the world', () => {
  it('is Ledgerhold and the seven districts, each with a pin on the world map', () => {
    expect(Object.keys(ROOMS).sort()).toEqual([...ZONES.map((z) => z.id), HUB_ID].sort());
    expect(ZONES.map((z) => z.id)).toEqual([...ALL_DISTRICTS]);
    for (const id of Object.keys(ROOMS)) expect(WORLD.pins[id], id).toBeTruthy();
    // The world map lists the districts in play order.
    expect(ZONES.map((z) => WORLD.pins[z.id]!.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(files[WORLD.image]).toBeTruthy();
  });
  it('every district names its boss, its topic and the costume colours its boss gives', () => {
    for (const z of ZONES) {
      expect(MONSTERS[z.boss!]?.zone, z.id).toBe(z.id);
      expect(AVATAR.costume.sets.some((c) => c.id === z.costume), `${z.id} costume`).toBe(true);
    }
    expect(ZONES.filter((z) => z.topic !== 'mixed').map((z) => z.topic).sort()).toEqual([...TOPICS].sort());
    expect(ZONES.filter((z) => z.bonus).map((z) => z.id)).toEqual([MIXED_ZONE]);
    expect(MONSTERS[FINALE]?.zone).toBe(HUB_ID);
    // One spell per topic district.
    expect(Object.keys(ZONE_SPELL).sort()).toEqual([...TOPIC_ZONE_ORDER].sort());
    expect(new Set(Object.values(ZONE_SPELL)).size).toBe(6);
  });
  it('every district has a guide with art and 2–3 tips; every NPC placed has art and a name', () => {
    for (const z of ALL_DISTRICTS) {
      const m = MENTORS[z]!;
      expect(CREATURES.npcs[m.speaker.sprite]?.talk, z).toBeTruthy();
      expect(m.tips.length).toBeGreaterThanOrEqual(2);
      expect(m.tips.length).toBeLessThanOrEqual(3);
      expect(Object.values(ROOMS[z]!.screens).flatMap((s) => s.npcs).map((n) => n.sprite), z).toEqual([m.speaker.sprite]);
    }
    for (const r of Object.values(ROOMS)) for (const s of Object.values(r.screens)) for (const n of s.npcs) {
      expect(CREATURES.npcs[n.sprite]?.talk, n.sprite).toBeTruthy();
      expect(files[`npc/${n.sprite}/portrait.webp`], n.sprite).toBeTruthy();
      if (r.zone === HUB_ID) expect(TOWNSFOLK[n.id], n.id).toBeTruthy();
    }
    // Ledgerhold has everyone the game needs: Headmaster, shop, stylist, pets, quests, bank, arena.
    expect(Object.values(ROOMS[HUB_ID]!.screens).flatMap((s) => s.npcs.map((n) => n.id)).sort()).toEqual(Object.keys(TOWNSFOLK).sort());
  });
  it('every place has a battle background', () => {
    for (const id of Object.keys(ROOMS)) expect(files[BATTLE.backgrounds[id]!], id).toBeTruthy();
  });
});

describe('unlocks', () => {
  it('topic districts open in order; Phish Fens after all six bosses and Money Check 2; the Debt Dragon after all seven', () => {
    expect(canEnter('the-sprawl', [], false)).toBe(false);
    expect(canEnter('the-sprawl', ['coinfall-docks'], false)).toBe(true);
    expect(bonusOpen(TOPIC_ZONE_ORDER.slice(0, 5), true)).toBe(false);
    expect(bonusOpen([...TOPIC_ZONE_ORDER], false)).toBe(false);
    expect(bonusOpen([...TOPIC_ZONE_ORDER], true)).toBe(true);
    expect(canEnter(MIXED_ZONE, [...TOPIC_ZONE_ORDER], true, false)).toBe(false);
    expect(canEnter(MIXED_ZONE, [...TOPIC_ZONE_ORDER], true, true)).toBe(true);
    expect(finaleOpen([...TOPIC_ZONE_ORDER])).toBe(false);
    expect(finaleOpen([...ALL_DISTRICTS])).toBe(true);
  });
});

describe('mixed-review questions (Phish Fens and the Debt Dragon)', () => {
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
    // The Laurel Wreath keeps its id and draws from the art set's laurel-wreath folder.
    expect(hatArt('hat-laurel')?.art).toBe('laurel-wreath');
    expect(hatArt('hat-laurel')?.rewardOnly).toBe(true);
    // The Bull Calf is the Hype Bull's fire look, which no other pet can wear.
    for (const v of ['front', 'back', 'left', 'right', 'portrait']) expect(files[`mon/${BULL_CALF.species}/${BULL_CALF.look}-${v}.webp`], v).toBeTruthy();
    expect(petLooks([...ALL_DISTRICTS])).not.toContain(BULL_CALF.look);
  });
  it('every monster can be a pet, with art for each look it can wear; bosses are legendary', () => {
    for (const m of Object.values(MONSTERS)) {
      const pet = item(tameId(m.id))!;
      expect([pet.kind, pet.price, pet.legendary], m.id).toEqual(['pet', null, m.boss]);
      if (m.boss) continue;
      for (const look of petLooks([...ALL_DISTRICTS])) for (const v of ['front', 'back', 'left', 'right', 'portrait']) expect(files[`mon/${m.art}/${look}-${v}.webp`], `${m.id} ${look} ${v}`).toBeTruthy();
    }
  });
});
