// Name labels over classmates on this screen (real text, as all game text is). React re-renders
// only when people arrive, leave or start/stop a battle; positions are set every frame directly.
// Only built when VITE_MP_URL is set.
import { useEffect, useRef } from 'react';
import { bridge, useNet } from '../net/bridge.ts';
import type { Stage } from './useStage.ts';

export default function OnlineLayer({ stage }: { stage: Stage }) {
  const people = useNet((s) => s.people);
  const refs = useRef(new Map<number, HTMLDivElement>());
  const k = stage.width / 640;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      for (const [id, el] of refs.current) {
        const at = bridge.labels.get(id);
        el.style.visibility = at ? 'visible' : 'hidden';
        if (at) el.style.transform = `translate(${at.x * k}px, ${at.y * k}px) translate(-50%, -100%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [k]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: stage.height }} aria-label="Classmates here" role="list">
      {people.map((p) => (
        <div
          key={p.id}
          ref={(el) => void (el ? refs.current.set(p.id, el) : refs.current.delete(p.id))}
          role="listitem"
          className="absolute left-0 top-0 whitespace-nowrap rounded-md border-2 border-[#5a3620] bg-[#f2c14e] px-2 text-lg font-semibold leading-tight text-[#2a1c12] shadow-[0_2px_0_#1b1410]"
          style={{ visibility: 'hidden' }}
        >
          {p.busy && <span aria-label="in a battle">⚔️ </span>}
          {p.name}
        </div>
      ))}
    </div>
  );
}
