// Where the game and the (optional, lazily loaded) multiplayer code meet. This file has no network
// code: with multiplayer off, `bridge.on` stays false, `report` does nothing and nobody is drawn.
import { create } from 'zustand';
import type { Sample } from './interp.ts';
import type { Face } from './protocol.ts';

export interface Remote { id: number; name: string; s: string; x: number; y: number; f: Face; h: string | null; p: string | null; b: boolean; samples: Sample[] }
export interface Report { s: string; x: number; y: number; f: Face; moving: boolean }

export const bridge = {
  /** Multiplayer is active for this save (connected or trying to connect). */
  on: false,
  /** Other players on the same screen, by id. Written by the network code, drawn by RoomScene. */
  remotes: new Map<number, Remote>(),
  /** Where each remote player's head is drawn (canvas px). Written by RoomScene, read by the labels. */
  labels: new Map<number, { x: number; y: number }>(),
  /** RoomScene calls this every frame with the player's screen and position. */
  report: (_r: Report): void => {},
};

export type NetStatus = 'off' | 'connecting' | 'online' | 'offline';

/** For React: connection status and who's on screen (re-renders only when that list changes). */
export const useNet = create<{ status: NetStatus; people: { id: number; name: string; busy: boolean }[] }>(() => ({ status: 'off', people: [] }));

export function publishPeople(): void {
  useNet.setState({ people: [...bridge.remotes.values()].map((r) => ({ id: r.id, name: r.name, busy: r.b })) });
}
