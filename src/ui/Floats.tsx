import { useSession } from '../state/session.ts';
import type { Stage } from './useStage.ts';

const TONE = { damage: 'text-[#ffe066]', hurt: 'text-[#ff8f80]', coin: 'text-[#ffd43b]', info: 'text-white' } as const;

/** Floating numbers and words over the canvas, drawn as real text (canvas coordinates → CSS). */
export function Floats({ stage }: { stage: Stage }) {
  const floats = useSession((s) => s.floats);
  const k = stage.width / 640;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: stage.height }} aria-hidden>
      {floats.map((f) => (
        <span key={f.id} className={`float-up title-text absolute -translate-x-1/2 text-2xl font-bold ${TONE[f.tone]}`} style={{ left: f.x * k, top: f.y * k }}>{f.text}</span>
      ))}
    </div>
  );
}
