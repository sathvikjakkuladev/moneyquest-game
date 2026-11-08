// Session state (not saved): screen, scene, dialogue and the live battle. Phaser scenes and React
// components both read and call this store.

import { create } from 'zustand';
import type { BattleEvent, BattleState, Timer } from '../core/battle.ts';
import * as engine from '../core/battle.ts';
import type { MonsterDef } from '../core/monsters.ts';
import { monster } from '../core/monsters.ts';
import { levelFor } from '../core/progression.ts';
import type { Pool, Shown } from '../core/questions.ts';
import { battlePool, draw, pickTopic, poolOf, record, show } from '../core/questions.ts';
import { freshSeed, seeded } from '../core/rng.ts';
import type { SpellId } from '../core/spells.ts';
import { ZONE_SPELL } from '../core/spells.ts';
import type { Question, QuestionFile, Topic } from '../core/types.ts';
import { TOPICS } from '../core/types.ts';
import type { Speaker } from '../data/dialogue.ts';
import { HELD_OUT } from '../data/moneyCheckForms.ts';
import questionFile from '../data/questions.json';
import { zoneById } from '../data/zones.ts';
import { item, tameId } from '../data/items.ts';
import { SCROLL } from '../core/shop.ts';
import { sfx } from '../audio.ts';
import { slot, useSave } from './save.ts';

const BANK = (questionFile as unknown as QuestionFile).questions;
const dropOne = (list: string[], id: string) => {
  const i = list.indexOf(id);
  return i < 0 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
};
const BY_ID = new Map<string, Question>(BANK.map((q) => [q.id, q]));
const rng = seeded(freshSeed());

export type Pt = [number, number];
export type SceneReq =
  | { kind: 'room'; zone: string; screen?: string; at?: Pt; entry?: string; attract?: boolean }
  | { kind: 'world' }
  | { kind: 'battle'; monsterId: string; back: SceneReq };

export interface Choice { label: string; run: () => void }
export interface Dialogue { speaker: Speaker; lines: string[]; i: number; then?: () => void; choices?: Choice[] }

export type Phase = 'intro' | 'ask' | 'resolving' | 'right' | 'explain' | 'won' | 'lost';
export interface Result { coins: number; xp: number; levelUp: number | null; newSpell: SpellId | null; rematch: boolean; coinsTaken: number; scrollUsed: boolean; tamed: boolean }

/** This question's tricks, made concrete: which answer is chained, fogged, hinted or removed. */
export interface Mods { lock: number | null; lockTaps: number; fog: number | null; fakeHint: number | null; removed: number | null; shuffle: boolean; riddle: boolean; nap: boolean; glare: boolean; scramble: number | null }
const NO_MODS: Mods = { lock: null, lockTaps: 0, fog: null, fakeHint: null, removed: null, shuffle: false, riddle: false, nap: false, glare: false, scramble: null };

export interface Battle {
  monster: MonsterDef;
  mods: Mods;
  order: number[]; // option index shown at each button position (the Whirlpool swaps two)
  askedAt: number;
  pool: Pool;
  state: BattleState;
  q: Shown;
  phase: Phase;
  picked: number | null; // -1 = time ran out
  last: 'right' | 'wrong' | 'slow' | 'opening' | null;
  spell: SpellId;
  timer: (Timer & { since: number }) | null;
  events: BattleEvent[];
  seq: number; // bumps when there are new events to animate
  warning: string | null;
  result: Result | null;
  back: SceneReq;
}

/** Floating text over the canvas (damage numbers, coins), drawn by React in canvas coordinates. */
export interface Float { id: number; x: number; y: number; text: string; tone: 'damage' | 'hurt' | 'coin' | 'info' }

interface Session {
  screen: 'boot' | 'title' | 'onboarding' | 'play';
  editing: boolean; // the ?dev=1 map editor is open (the player can't move)
  setEditing: (on: boolean) => void;
  floats: Float[];
  float: (x: number, y: number, text: string, tone: Float['tone']) => void;
  scene: SceneReq | null;
  dialogue: Dialogue | null;
  panel: 'shop' | 'bag' | 'redeem' | 'progress' | 'check' | null;
  setPanel: (p: Session['panel']) => void;
  celebrate: string[] | null; // prizes just unlocked by a reward card
  setCelebrate: (items: string[] | null) => void;
  redeemCode: string | null; // a code from a #/redeem/ link, waiting for the redeem panel
  setRedeemCode: (c: string | null) => void;
  prompt: string | null;
  battle: Battle | null;
  setScreen: (s: Session['screen']) => void;
  go: (s: SceneReq) => void;
  say: (speaker: Speaker, lines: string[], then?: () => void, choices?: Choice[]) => void;
  next: () => void;
  setPrompt: (p: string | null) => void;

  fight: (monsterId: string, back: SceneReq) => void;
  introDone: () => void;
  pickSpell: (s: SpellId) => void;
  answer: (i: number) => void;
  shuffleNow: () => void;
  timeUp: () => void;
  animated: () => void;
  gotIt: () => void;
  leave: () => void;
}

/** Next question for a zone: its topic, or for bonus zones a mix weighted toward the weakest topic. */
function nextQuestion(zone: string): { q: Shown; pool: Pool } {
  const s = slot();
  const zt = zoneById(zone).topic;
  const topic: Topic = zt === 'mixed' ? pickTopic(s.questions.accuracy, TOPICS, rng) : zt;
  const pool = poolOf(topic, s.band);
  const r = draw(s.questions, pool, battlePool(BANK, topic, s.band, HELD_OUT), rng);
  useSave.getState().edit((x) => ({ ...x, questions: r.state }));
  return { q: show(BY_ID.get(r.id)!, rng), pool };
}


/** Pick concrete answers for this turn's tricks. Fake hints and Wise Choice only ever point at wrong answers. */
function makeMods(fx: engine.TurnFx, q: Shown): Mods {
  const any = () => Math.floor(rng() * 4);
  const wrongs = [0, 1, 2, 3].filter((i) => i !== q.correct);
  const wrong = () => wrongs[Math.floor(rng() * wrongs.length)]!;
  const removed = fx.removeOption ? wrong() : null;
  const pick = (avoid: (number | null)[]) => {
    for (let k = 0; k < 20; k++) {
      const i = any();
      if (!avoid.includes(i)) return i;
    }
    return any();
  };
  const lock = fx.lock ? pick([removed]) : null;
  const fog = fx.fog ? pick([removed, lock]) : null;
  return { lock, lockTaps: lock === null ? 0 : 3, fog, fakeHint: fx.fakeHint ? wrong() : null, removed, shuffle: !!fx.shuffle, riddle: !!fx.riddle, nap: !!fx.nap, glare: !!fx.glare, scramble: fx.scramble ? pick([removed, lock, fog]) : null };
}

export const useSession = create<Session>()((set, get) => {
  /** Start a turn on the current question: tricks, timer, per-turn monster effects. */
  const begin = (b: Battle): Battle => {
    const t = engine.beginTurn(b.state, b.monster);
    const grows = t.events.find((e): e is Extract<BattleEvent, { type: 'monsterGrows' }> => e.type === 'monsterGrows');
    const now = performance.now();
    return {
      ...b, state: t.state, phase: 'ask', picked: null, last: null, mods: makeMods(t.state.now, b.q), order: [0, 1, 2, 3], askedAt: now,
      timer: t.timer ? { ...t.timer, since: now } : null,
      warning: grows?.text ?? null,
      ...(t.events.length ? { events: t.events, seq: b.seq + 1 } : {}),
    };
  };
  /** Next turn: fresh question, then begin. */
  const ask = (b: Battle): Battle => {
    const { q, pool } = nextQuestion(b.monster.zone);
    return begin({ ...b, q, pool });
  };
  const play = (b: Battle, state: BattleState, events: BattleEvent[], last: Battle['last'], picked: number | null) => {
    const warning = events.find((e): e is Extract<BattleEvent, { type: 'warning' }> => e.type === 'warning')?.text ?? b.warning;
    set({ battle: { ...b, state, events, seq: b.seq + 1, phase: 'resolving', last, picked, timer: null, warning } });
  };

  return {
    screen: 'boot', scene: null, dialogue: null, prompt: null, battle: null, floats: [], editing: false, panel: null, celebrate: null, redeemCode: null,
    setPanel: (panel) => set({ panel }),
    setCelebrate: (celebrate) => set({ celebrate }),
    setRedeemCode: (redeemCode) => set({ redeemCode }),
    setEditing: (editing) => set({ editing }),
    float: (x, y, text, tone) => {
      const f: Float = { id: Math.random(), x, y, text, tone };
      set({ floats: [...get().floats, f] });
      setTimeout(() => set({ floats: get().floats.filter((o) => o !== f) }), 1100);
    },
    setScreen: (screen) => set({ screen }),
    go: (scene) => set({ scene, prompt: null, dialogue: null }),
    say: (speaker, lines, then, choices) => set({ dialogue: { speaker, lines, i: 0, then, choices }, prompt: null }),
    next: () => {
      const d = get().dialogue;
      if (!d) return;
      if (d.i + 1 < d.lines.length) set({ dialogue: { ...d, i: d.i + 1 } });
      else if (d.choices) return; // the player picks a choice button
      else {
        set({ dialogue: null });
        d.then?.();
      }
    },
    setPrompt: (prompt) => get().prompt !== prompt && set({ prompt }),

    fight: (monsterId, back) => {
      const s = slot();
      const m = monster(monsterId);
      const first = nextQuestion(m.zone);
      const pet = s.inventory.pet ? item(s.inventory.pet) : undefined;
      const state = engine.startBattle({
        monster: m, band: s.band, level: s.progress.level, wallet: s.progress.coins, rematch: s.progress.defeated.includes(m.id),
        petBonus: pet ? (pet.legendary ? 4 : 2) : 0, insured: s.inventory.owned.includes(SCROLL),
      });
      const spell = s.progress.spells.includes(s.progress.spell) ? s.progress.spell : 'budget_beam';
      sfx('battle-start');
      set({
        battle: { monster: m, mods: NO_MODS, order: [0, 1, 2, 3], askedAt: 0, pool: first.pool, state, q: first.q, phase: 'intro', picked: null, last: null, spell, timer: null, events: [], seq: 0, warning: null, result: null, back },
        scene: { kind: 'battle', monsterId, back }, prompt: null, dialogue: null,
      });
    },
    introDone: () => {
      const b = get().battle;
      if (!b || b.phase !== 'intro') return;
      const o = engine.opening(b.state, b.monster);
      if (o.events.length) return play(b, o.state, o.events, 'opening', null); // e.g. Hype Hornet strikes first
      set({ battle: begin(b) });
    },
    pickSpell: (spell) => {
      const b = get().battle;
      if (!b || b.phase !== 'ask' || !slot().progress.spells.includes(spell)) return;
      set({ battle: { ...b, spell } });
      useSave.getState().edit((x) => ({ ...x, progress: { ...x.progress, spell } }));
    },
    answer: (i) => {
      const b = get().battle;
      if (!b || b.phase !== 'ask') return;
      const m = b.mods;
      if (i >= 0) {
        if (m.removed === i) return;
        if (m.lock === i && m.lockTaps > 0) return set({ battle: { ...b, mods: { ...m, lockTaps: m.lockTaps - 1 } } }); // breaking the chain
        if (m.fog === i) return set({ battle: { ...b, mods: { ...m, fog: null } } }); // clearing the fog
      }
      const right = i === b.q.correct;
      useSave.getState().edit((x) => ({ ...x, questions: record(x.questions, b.pool, BY_ID.get(b.q.id)!, right, rng) }));
      sfx(right ? 'right' : 'wrong');
      const r = engine.answer(b.state, b.monster, right, b.spell, { rng, seconds: (performance.now() - b.askedAt) / 1000 });
      play(b, r.state, r.events, right ? 'right' : 'wrong', i);
    },
    shuffleNow: () => {
      const b = get().battle;
      if (!b || b.phase !== 'ask' || !b.mods.shuffle) return;
      const order = [...b.order];
      const a = Math.floor(rng() * 4), c = (a + 1 + Math.floor(rng() * 3)) % 4;
      [order[a], order[c]] = [order[c]!, order[a]!];
      set({ battle: { ...b, order, mods: { ...b.mods, shuffle: false } } });
    },
    timeUp: () => {
      const b = get().battle;
      if (!b || b.phase !== 'ask' || !b.timer) return;
      if (b.timer.kind === 'rush') return get().answer(-1);
      const r = engine.slowStrike(b.state, b.monster);
      play(b, r.state, r.events, 'slow', null);
    },
    animated: () => {
      const b = get().battle;
      if (!b || b.phase !== 'resolving') return;
      const st = b.state;
      if (st.outcome === 'won') {
        const won = b.events.find((e): e is Extract<BattleEvent, { type: 'won' }> => e.type === 'won')!;
        let result: Result = { coins: won.coins, xp: won.xp, levelUp: null, newSpell: null, rematch: st.rematch, coinsTaken: st.coinsTaken, scrollUsed: st.scrollUsed, tamed: false };
        useSave.getState().edit((x) => {
          const p = x.progress;
          const first = !p.defeated.includes(b.monster.id);
          const clears = b.monster.boss && first;
          const spell = clears ? ZONE_SPELL[b.monster.zone] : undefined;
          const newSpell = spell && !p.spells.includes(spell) ? spell : null;
          const xp = p.xp + won.xp;
          const level = levelFor(xp);
          // Bonus zones: the first win over a monster tames it as a pet.
          const tames = first && zoneById(b.monster.zone).bonus;
          result = { ...result, levelUp: level > p.level ? level : null, newSpell, tamed: tames };
          let owned = st.scrollUsed ? dropOne(x.inventory.owned, SCROLL) : x.inventory.owned;
          if (tames && !owned.includes(tameId(b.monster.id))) owned = [...owned, tameId(b.monster.id)];
          return {
            ...x,
            inventory: { ...x.inventory, owned },
            progress: {
              ...p, xp, level, coins: st.wallet + won.coins, coinsEarned: p.coinsEarned + won.coins,
              defeated: first ? [...p.defeated, b.monster.id] : p.defeated,
              zonesCleared: clears && !p.zonesCleared.includes(b.monster.zone) ? [...p.zonesCleared, b.monster.zone] : p.zonesCleared,
              spells: newSpell ? [...p.spells, newSpell] : p.spells,
              tamed: tames ? [...p.tamed, b.monster.id] : p.tamed,
            },
          };
        });
        sfx('victory');
        set({ battle: { ...b, phase: 'won', result } });
      } else if (st.outcome === 'lost') {
        // Fainting is gentle: nothing is lost (coins a monster took during the fight stay taken).
        useSave.getState().edit((x) => ({ ...x, progress: { ...x.progress, coins: st.wallet }, inventory: st.scrollUsed ? { ...x.inventory, owned: dropOne(x.inventory.owned, SCROLL) } : x.inventory }));
        set({ battle: { ...b, phase: 'lost' } });
      } else if (b.last === 'opening') set({ battle: begin(b) });
      else if (b.last === 'slow') set({ battle: { ...b, phase: 'ask', timer: null } });
      else if (b.last === 'wrong') set({ battle: { ...b, phase: 'explain' } });
      else set({ battle: { ...b, phase: 'right' } });
    },
    gotIt: () => {
      const b = get().battle;
      if (!b || (b.phase !== 'explain' && b.phase !== 'right')) return;
      set({ battle: ask(b) });
    },
    leave: () => {
      const b = get().battle;
      if (!b || (b.phase !== 'won' && b.phase !== 'lost')) return;
      // After fainting you rest at the zone's first screen, with full HP.
      const back: SceneReq = b.phase === 'lost' && b.back.kind === 'room' ? { kind: 'room', zone: b.back.zone, entry: 'from_world_map' } : b.back;
      set({ battle: null, scene: back });
    },
  };
});
