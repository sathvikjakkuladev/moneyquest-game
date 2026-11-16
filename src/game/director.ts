// Starts the Phaser scene matching `session.scene`, so React and Phaser never disagree about it.
import type * as Phaser from 'phaser';
import type { SceneReq } from '../state/session.ts';
import { useSession } from '../state/session.ts';

const KEY: Record<SceneReq['kind'], string> = { room: 'room', world: 'world', battle: 'battle' };

export function connectDirector(game: Phaser.Game): () => void {
  // A scene that is still starting (queued, loading or being created) can't be restarted cleanly,
  // so a request that arrives meanwhile (a quick tap on the title, say) waits until that scene has
  // been created. Only the newest request counts.
  let starting = false;
  let waiting: SceneReq | null = null;
  const show = (req: SceneReq) => {
    if (starting) return void (waiting = req);
    const key = KEY[req.kind];
    starting = true;
    game.scene.getScene(key)?.events.once('create', () => {
      starting = false;
      const next = waiting;
      waiting = null;
      if (next) show(next);
    });
    for (const s of game.scene.getScenes(true)) if (s.scene.key !== key) game.scene.stop(s.scene.key);
    game.scene.start(key, req);
  };
  const now = useSession.getState().scene;
  if (now) show(now);
  return useSession.subscribe((s, prev) => {
    if (s.scene && s.scene !== prev.scene) show(s.scene);
  });
}
