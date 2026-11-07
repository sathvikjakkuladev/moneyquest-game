import { useEffect, useState } from 'react';
import { xpToReach } from '../core/progression.ts';
import type { Band } from '../core/types.ts';
import { pad, roomActions } from '../game/input.ts';
import { useSave, useSlot } from '../state/save.ts';
import { useSession } from '../state/session.ts';

/** Top bar while exploring: nickname, level and XP, coins, settings. */
export function Hud() {
  const s = useSlot();
  const [open, setOpen] = useState(false);
  if (!s) return null;
  const p = s.progress;
  const pct = Math.round(((p.xp - xpToReach(p.level)) / (xpToReach(p.level + 1) - xpToReach(p.level))) * 100);
  return (
    <>
      <div className="panel pointer-events-auto absolute left-2 top-2 flex items-center gap-3 px-3 py-1.5">
        <span className="text-xl font-bold">{s.nickname}</span>
        <span className="flex items-center gap-2 text-lg">
          Lv {p.level}
          <span role="progressbar" aria-label="XP to next level" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="inline-block h-4 w-20 overflow-hidden rounded-sm border-2 border-frame bg-white">
            <span className="block h-full bg-[#3b6fd4]" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span className="text-lg font-semibold" aria-label={`${p.coins} coins`}>🪙 {p.coins}</span>
      </div>
      <div className="pointer-events-auto absolute right-2 top-2 flex gap-2">
        <button className="btn" onClick={() => useSession.getState().setPanel('progress')} aria-label="Progress and Money Check">📊</button>
        <button className="btn" onClick={() => useSession.getState().setPanel('bag')} aria-label="Your bag: hats and pets">🎒</button>
        <button className="btn" onClick={() => useSession.getState().setPanel('redeem')} aria-label="Redeem a card">🎁</button>
        <button className="btn" onClick={() => setOpen(true)} aria-label="Settings">⚙</button>
      </div>
      {open && <Settings onClose={() => setOpen(false)} />}
    </>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const s = useSlot()!;
  const set = (patch: Partial<typeof s.settings>) => useSave.getState().edit((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const setBand = (band: Band) => useSave.getState().edit((x) => ({ ...x, band }));
  const rm = s.settings.reducedMotion;
  const [full, setFull] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/50 p-3" role="dialog" aria-label="Settings">
      <div className="panel flex max-h-full w-[min(32rem,100%)] flex-col gap-3 overflow-auto p-5">
        <h2 className="text-3xl font-bold">Settings</h2>
        <label className="flex min-h-12 items-center gap-3 text-xl">
          <input type="checkbox" className="h-7 w-7" checked={s.settings.readAloud} onChange={(e) => set({ readAloud: e.target.checked })} />
          Read questions and talk aloud automatically
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xl">Quest level</legend>
          <div className="flex flex-wrap gap-2">
            {([['K-5', 'Explorer (K–5)'], ['6-8', 'Adventurer (6–8)']] as const).map(([b, label]) => (
              <button key={b} className={`btn ${s.band === b ? '' : 'btn-quiet'}`} aria-pressed={s.band === b} onClick={() => setBand(b)}>{s.band === b ? '✓ ' : ''}{label}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xl">Motion</legend>
          <div className="flex flex-wrap gap-2">
            {([[null, 'Like my device'], [true, 'Less motion'], [false, 'Full motion']] as const).map(([v, label]) => (
              <button key={label} className={`btn ${rm === v ? '' : 'btn-quiet'}`} aria-pressed={rm === v} onClick={() => set({ reducedMotion: v })}>{rm === v ? '✓ ' : ''}{label}</button>
            ))}
          </div>
        </fieldset>
        {document.fullscreenEnabled && (
          <button className="btn btn-quiet self-start" aria-pressed={full} onClick={() => void (full ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
            {full ? 'Leave full screen' : 'Full screen'}
          </button>
        )}
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <button className="btn btn-quiet" onClick={() => { useSave.getState().open(null); const ss = useSession.getState(); ss.setScreen('title'); ss.go({ kind: 'room', zone: 'coin_academy', attract: true }); }}>Save and quit</button>
          <button className="btn" autoFocus onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/** "Space: Talk to …" hint, which is also a tap target. */
export function Prompt() {
  const prompt = useSession((s) => s.prompt);
  const dialogue = useSession((s) => s.dialogue);
  if (!prompt || dialogue) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
      <button className="btn pointer-events-auto flex items-center gap-2" onClick={() => roomActions.interact()}>
        <kbd className="rounded border-2 border-frame bg-white px-1.5 text-lg">Space</kbd>{prompt}
      </button>
    </div>
  );
}

/** On-screen arrow pad, shown on touch screens. */
export function DPad() {
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const dialogue = useSession((s) => s.dialogue);
  if (!touch || dialogue) return null;
  const hold = (dx: number, dy: number) => ({
    onPointerDown: (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); pad.dx = dx; pad.dy = dy; },
    onPointerUp: () => { pad.dx = 0; pad.dy = 0; },
    onPointerCancel: () => { pad.dx = 0; pad.dy = 0; },
  });
  const b = 'btn pointer-events-auto absolute flex h-14 w-14 items-center justify-center p-0 text-2xl opacity-90';
  return (
    <div className="absolute bottom-3 left-3 h-44 w-44" aria-hidden>
      <button className={`${b} left-[60px] top-0`} {...hold(0, -1)}>▲</button>
      <button className={`${b} left-0 top-[60px]`} {...hold(-1, 0)}>◀</button>
      <button className={`${b} left-[120px] top-[60px]`} {...hold(1, 0)}>▶</button>
      <button className={`${b} left-[60px] top-[120px]`} {...hold(0, 1)}>▼</button>
    </div>
  );
}
