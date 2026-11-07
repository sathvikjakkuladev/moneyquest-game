// Hooks for the Playwright smoke test, installed only with `?e2e` in the URL.
import type * as Phaser from 'phaser';
import type { RoomScene } from './game/scenes/RoomScene.ts';
import { useSave } from './state/save.ts';
import { useSession } from './state/session.ts';

export function installTestHooks(game: Phaser.Game): void {
  if (!new URLSearchParams(location.search).has('e2e')) return;
  const room = () => (game.scene.isActive('room') ? (game.scene.getScene('room') as RoomScene) : null);
  (window as unknown as Record<string, unknown>).__mq = {
    session: () => useSession.getState(),
    save: () => useSave.getState(),
    correct: () => useSession.getState().battle?.q.correct ?? -1,
    where: () => room()?.where() ?? { screen: useSession.getState().scene?.kind ?? null, at: null },
    teleport: (x: number, y: number) => room()?.teleport(x, y),
  };
}
