// Where the game and the (optional, lazily loaded) multiplayer code meet. This file has no network
// code: with multiplayer off, `bridge.on` stays false, `report` does nothing and nobody is drawn.
import { create } from 'zustand';
import type { Sample } from './interp.ts';
import type { Face } from './protocol.ts';
import type { SayKind } from './says.ts';

export interface Remote { id: number; name: string; s: string; x: number; y: number; f: Face; h: string | null; p: string | null; b: boolean; samples: Sample[] }
export interface Report { s: string; x: number; y: number; f: Face; moving: boolean }

export const bridge = {
  /** Multiplayer is active for this save (connected or trying to connect). */
  on: false,
  /** Other players on the same screen, by id. Written by the network code, drawn by RoomScene. */
  remotes: new Map<number, Remote>(),
  /** Where each remote player's head is drawn (canvas px). Written by RoomScene, read by the labels. */
  labels: new Map<number, { x: number; y: number }>(),
  /** Where the player's own head is drawn (canvas px), for their own speech bubble. Written by RoomScene. */
  me: null as { x: number; y: number } | null,
  /** RoomScene calls this every frame with the player's screen and position. */
  report: (_r: Report): void => {},
  /** Send an emote or phrase (set by the network code). */
  say: (_k: SayKind, _i: number): void => {},
  /** Report a player to the teacher (set by the network code). */
  flag: (_id: number): void => {},
};

/** id 0 is the player themself (the server's ids start at 1). */
export const ME = 0;
export interface Said { k: SayKind; i: number; at: number }
export interface Goal { n: number; of: number }

export type NetStatus = 'off' | 'connecting' | 'online' | 'offline';

export interface NetState {
  status: NetStatus;
  /** Who's on this screen (re-renders only when that list changes). */
  people: { id: number; name: string; busy: boolean }[];
  /** The latest thing each player said (ME for yourself); bubbles show it for BUBBLE_MS. */
  says: Record<number, Said>;
  /** The teacher turned this player's emotes and phrases off. */
  muted: boolean;
  /** Public names this player muted on this device (until the game is closed). */
  hidden: string[];
  /** What's open: the emote and phrase picker, or the menu for one player. The player can't move meanwhile. */
  open: 'say' | number | null;
  /** Players whose report reached the teacher. */
  reported: number[];
  /** The server said this save is no longer in the class (the teacher removed it, or deleted the class). */
  removed: boolean;
  /** This week's class goal: correct answers so far, of the teacher's target. */
  goal: Goal | null;
  /** The class just reached its goal (cleared once the celebration has shown). */
  goalHit: boolean;
}

export const useNet = create<NetState>(() => ({ status: 'off', people: [], says: {}, muted: false, hidden: [], open: null, reported: [], removed: false, goal: null, goalHit: false }));

/** A new goal figure, from the server. Crossing the target sets off the celebration. */
export function publishGoal(goal: Goal): void {
  useNet.setState((n) => ({ goal, goalHit: n.goalHit || (!!n.goal && n.goal.n < n.goal.of && goal.n >= goal.of) }));
}

export function publishPeople(): void {
  useNet.setState({ people: [...bridge.remotes.values()].map((r) => ({ id: r.id, name: r.name, busy: r.b })) });
}
