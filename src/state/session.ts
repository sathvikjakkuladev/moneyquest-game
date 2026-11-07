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
import { sfx } from '../audio.ts';
import { slot, useSave } from './save.ts';

const BANK = (questionFile as unknown as QuestionFile).questions;
const BY_ID = new Map<string, Question>(BANK.map((q) => [q.id, q]));
const rng = seeded(freshSeed());

export type Pt = [number, number];
export type SceneReq =
  | { kind: 'room'; zone: string; screen?: string; at?: Pt; entry?: string; attract?: boolean }
  | { kind: 'world' }
  | { kind: 'battle'; monsterId: string; back: SceneReq };

export interface Dialogue { speaker: Speaker; lines: string[]; i: number; then?: () => void }

export type Phase = 'intro' | 'ask' | 'resolving' | 'right' | 'explain' | 'won' | 'lost';
export interface Result { coins: number; xp: number; levelUp: number | null; newSpell: SpellId | null; rematch: boolean; coinsTaken: number }

export interface Battle {
  monster: MonsterDef;
  pool: Pool;
  state: BattleState;
  q: Shown;
  phase: Phase;
  picked: number | null; // -1 = time ran out
  last: 'right' | 'wrong' | 'slow' | null;
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
  prompt: string | null;
  battle: Battle | null;
  setScreen: (s: Session['screen']) => void;
  go: (s: SceneReq) => void;
  say: (speaker: Speaker, lines: string[], then?: () => void) => void;
  next: () => void;
  setPrompt: (p: string | null) => void;

  fight: (monsterId: string, back: SceneReq) => void;
  introDone: () => void;
  pickSpell: (s: SpellId) => void;
  answer: (i: number) => void;
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

export const useSession = create<Session>()((set, get) => {
  /** Next turn: fresh question, effect timers, card ready. */
  const ask = (b: Battle): Battle => {
    const pending = Boolean(b.state.pending.timer || b.state.pending.extraDamage);
    const { q, pool } = nextQuestion(b.monster.zone);
    const t = engine.beginTurn(b.state, b.monster);
    return { ...b, q, pool, state: t.state, phase: 'ask', picked: null, last: null, warning: pending ? b.warning : null, timer: t.timer ? { ...t.timer, since: performance.now() } : null };
  };
  const play = (b: Battle, state: BattleState, events: BattleEvent[], last: Battle['last'], picked: number | null) => {
    const warning = events.find((e): e is Extract<BattleEvent, { type: 'warning' }> => e.type === 'warning')?.text ?? b.warning;
    set({ battle: { ...b, state, events, seq: b.seq + 1, phase: 'resolving', last, picked, timer: null, warning } });
  };

  return {
    screen: 'boot', scene: null, dialogue: null, prompt: null, battle: null, floats: [], editing: false,
    setEditing: (editing) => set({ editing }),
    float: (x, y, text, tone) => {
      const f: Float = { id: Math.random(), x, y, text, tone };
      set({ floats: [...get().floats, f] });
      setTimeout(() => set({ floats: get().floats.filter((o) => o !== f) }), 1100);
    },
    setScreen: (screen) => set({ screen }),
    go: (scene) => set({ scene, prompt: null, dialogue: null }),
    say: (speaker, lines, then) => set({ dialogue: { speaker, lines, i: 0, then }, prompt: null }),
    next: () => {
      const d = get().dialogue;
      if (!d) return;
      if (d.i + 1 < d.lines.length) set({ dialogue: { ...d, i: d.i + 1 } });
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
      const state = engine.startBattle({ monster: m, band: s.band, level: s.progress.level, wallet: s.progress.coins, rematch: s.progress.defeated.includes(m.id) });
      const spell = s.progress.spells.includes(s.progress.spell) ? s.progress.spell : 'budget_beam';
      sfx('battle-start');
      set({
        battle: { monster: m, pool: first.pool, state, q: first.q, phase: 'intro', picked: null, last: null, spell, timer: null, events: [], seq: 0, warning: null, result: null, back },
        scene: { kind: 'battle', monsterId, back }, prompt: null, dialogue: null,
      });
    },
    introDone: () => {
      const b = get().battle;
      if (!b || b.phase !== 'intro') return;
      const t = engine.beginTurn(b.state, b.monster);
      set({ battle: { ...b, state: t.state, phase: 'ask', timer: t.timer ? { ...t.timer, since: performance.now() } : null } });
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
      const right = i === b.q.correct;
      useSave.getState().edit((x) => ({ ...x, questions: record(x.questions, b.pool, BY_ID.get(b.q.id)!, right, rng) }));
      sfx(right ? 'right' : 'wrong');
      const r = engine.answer(b.state, b.monster, right, b.spell);
      play(b, r.state, r.events, right ? 'right' : 'wrong', i);
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
        let result: Result = { coins: won.coins, xp: won.xp, levelUp: null, newSpell: null, rematch: st.rematch, coinsTaken: st.coinsTaken };
        useSave.getState().edit((x) => {
          const p = x.progress;
          const first = !p.defeated.includes(b.monster.id);
          const clears = b.monster.boss && first;
          const spell = clears ? ZONE_SPELL[b.monster.zone] : undefined;
          const newSpell = spell && !p.spells.includes(spell) ? spell : null;
          const xp = p.xp + won.xp;
          const level = levelFor(xp);
          result = { ...result, levelUp: level > p.level ? level : null, newSpell };
          return {
            ...x,
            progress: {
              ...p, xp, level, coins: st.wallet + won.coins,
              defeated: first ? [...p.defeated, b.monster.id] : p.defeated,
              zonesCleared: clears && !p.zonesCleared.includes(b.monster.zone) ? [...p.zonesCleared, b.monster.zone] : p.zonesCleared,
              spells: newSpell ? [...p.spells, newSpell] : p.spells,
            },
          };
        });
        sfx('victory');
        set({ battle: { ...b, phase: 'won', result } });
      } else if (st.outcome === 'lost') {
        // Fainting is gentle: nothing is lost (coins a monster took during the fight stay taken).
        useSave.getState().edit((x) => ({ ...x, progress: { ...x.progress, coins: st.wallet } }));
        set({ battle: { ...b, phase: 'lost' } });
      } else if (b.last === 'slow') set({ battle: { ...b, phase: 'ask', timer: null } });
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
