import { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { connectDirector } from './game/director.ts';
import { BattleScene } from './game/scenes/BattleScene.ts';
import { BootScene } from './game/scenes/BootScene.ts';
import { RoomScene } from './game/scenes/RoomScene.ts';
import { WorldScene } from './game/scenes/WorldScene.ts';
import { useSession } from './state/session.ts';
import { installTestHooks } from './testHooks.ts';
import { BattleUI } from './ui/BattleUI.tsx';
import { Dialogue } from './ui/Dialogue.tsx';
import { Floats } from './ui/Floats.tsx';
import { DPad, Hud, Prompt } from './ui/Hud.tsx';
import { Onboarding } from './ui/Onboarding.tsx';
import { Title } from './ui/Title.tsx';
import { H, useStage, W } from './ui/useStage.ts';
import { WorldButtons } from './ui/WorldButtons.tsx';
import { devMode } from './core/unlocks.ts';
import { DevPanel } from './dev/DevPanel.tsx';
import { MapEditor } from './dev/MapEditor.tsx';

// import.meta.env.DEV is false in the production build, so the dev tools are dropped from it entirely.
const DEV = import.meta.env.DEV && devMode();

/** Phaser draws the 640×360 pixel world; React draws all text and buttons on top in real CSS pixels. */
export function App() {
  const host = useRef<HTMLDivElement>(null);
  const stage = useStage();
  const screen = useSession((s) => s.screen);
  const kind = useSession((s) => s.scene?.kind);
  const [newSlot, setNewSlot] = useState<number | null>(null);

  useEffect(() => {
    if (screen === 'play') setNewSlot(null);
  }, [screen]);

  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: W,
      height: H,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#1b1410',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [BootScene, RoomScene, WorldScene, BattleScene],
    });
    const off = connectDirector(game);
    installTestHooks(game);
    return () => {
      off();
      game.destroy(true);
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={host} className="absolute" style={{ left: stage.left, top: stage.top, width: stage.width, height: stage.height }} />
      <div className="pointer-events-none absolute" style={{ left: stage.left, top: stage.top, width: stage.width, bottom: 0 }}>
        <div className="absolute inset-x-0 top-0" style={{ height: stage.height }}>
          {screen === 'boot' && <p className="title-text absolute inset-x-0 top-[58%] text-center text-3xl">Loading…</p>}
          {screen === 'title' && newSlot === null && (
            <div className="pointer-events-auto h-full">
              <Title onNew={(i) => (useSession.getState().setScreen('onboarding'), setNewSlot(i))} />
            </div>
          )}
          {screen === 'onboarding' && newSlot !== null && (
            <div className="pointer-events-auto h-full">
              <Onboarding slotIndex={newSlot} onCancel={() => (useSession.getState().setScreen('title'), setNewSlot(null))} />
            </div>
          )}
          {screen === 'play' && kind === 'room' && (
            <>
              <Hud />
              <Prompt />
              <DPad />
              {DEV && <DevPanel />}
              {DEV && <MapEditor stage={stage} />}
            </>
          )}
          {screen === 'play' && kind === 'world' && <WorldButtons />}
          <Dialogue />
        </div>
        <Floats stage={stage} />
        {screen === 'play' && kind === 'battle' && <BattleUI stage={stage} />}
      </div>
    </div>
  );
}
