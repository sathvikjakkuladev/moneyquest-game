import { useEffect } from 'react';
import { useSlot } from '../state/save.ts';
import { useSession } from '../state/session.ts';
import { Portrait } from './Portrait.tsx';
import { canSpeak, hush, speak } from './speech.ts';

/** NPC dialogue: pixel portrait, name, one line at a time. Space, Enter or a tap moves on. */
export function Dialogue() {
  const d = useSession((s) => s.dialogue);
  const next = useSession((s) => s.next);
  const auto = useSlot()?.settings.readAloud ?? false;
  const line = d ? d.lines[d.i]! : '';
  useEffect(() => {
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return; // focused controls handle their own keys
      if (e.key === ' ' || e.key === 'Enter') (e.preventDefault(), next());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d, next]);
  useEffect(() => {
    if (line && auto) speak(line);
    return hush;
  }, [line, auto]);
  if (!d) return null;
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-3 flex justify-center px-3" role="dialog" aria-label={`${d.speaker.name} says`}>
      <div className="panel flex w-[min(54rem,100%)] items-end gap-4 p-3">
        <div className="shrink-0 rounded bg-paper-dark p-1"><Portrait id={d.speaker.sprite} scale={2} alt={d.speaker.name} /></div>
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-lg font-bold text-frame">{d.speaker.name}</p>
          <p className="text-[1.35rem] leading-snug" aria-live="polite">{line}</p>
          <div className="flex justify-end gap-2">
            {canSpeak() && <button className="btn btn-quiet" onClick={() => speak(line)} aria-label="Read aloud">🔊</button>}
            <button className="btn" onClick={next}>{d.i === d.lines.length - 1 ? 'OK' : 'Next ▸'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
