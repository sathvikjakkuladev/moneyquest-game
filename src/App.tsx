import { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { CheckScene } from './game/CheckScene.ts';
import { H, useStage, W } from './ui/useStage.ts';

/** Phaser draws the 640×360 pixel world; React draws all text on top in real CSS pixels. */
export function App() {
  const host = useRef<HTMLDivElement>(null);
  const stage = useStage();
  const [label, setLabel] = useState('Loading…');

  useEffect(() => {
    if (!host.current) return;
    const scene = new CheckScene();
    scene.onLabel = setLabel;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: W,
      height: H,
      pixelArt: true, // nearest-neighbour filtering and whole-pixel positions everywhere
      backgroundColor: '#1b1410',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [scene],
    });
    return () => game.destroy(true);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={host} className="absolute" style={{ left: stage.left, top: stage.top, width: stage.width, height: stage.height }} />
      <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: stage.top + 12 }}>
        <div className="panel px-4 py-2 text-center">
          <p className="text-xl font-bold">MoneyQuest · Phase 1 asset check</p>
          <p className="text-lg">{label}</p>
          <p className="text-base">zoom {Number.isInteger(stage.zoom) ? `${stage.zoom}×` : `${stage.zoom.toFixed(2)}× (fit)`}</p>
        </div>
      </div>
    </div>
  );
}
