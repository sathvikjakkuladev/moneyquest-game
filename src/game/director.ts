// Starts the Phaser scene matching `session.scene`, so React and Phaser never disagree about it.
import type * as Phaser from 'phaser';
import type { SceneReq } from '../state/session.ts';
import { useSession } from '../state/session.ts';

const KEY: Record<SceneReq['kind'], string> = { room: 'room', world: 'world', battle: 'battle' };

export function connectDirector(game: Phaser.Game): () => void {
  const show = (req: SceneReq) => {
    for (const s of game.scene.getScenes(true)) if (s.scene.key !== KEY[req.kind]) game.scene.stop(s.scene.key);
    game.scene.start(KEY[req.kind], req);
  };
  const now = useSession.getState().scene;
  if (now) show(now);
  return useSession.subscribe((s, prev) => {
    if (s.scene && s.scene !== prev.scene) show(s.scene);
  });
}
