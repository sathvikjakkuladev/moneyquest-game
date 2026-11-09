// Classmates on this screen: name tags (tap one for Mute and Report), speech bubbles for emotes and
// phrases, and the 💬 picker to say something. All of it is real text, as all game text is, and
// nothing here lets a student type: they pick from the lists in src/net/says.ts. React re-renders
// only when people or bubbles change; positions are set every frame directly.
// Only built when VITE_MP_URL is set.
import { useEffect, useRef, useState } from 'react';
import { bridge, ME, useNet } from '../net/bridge.ts';
import type { Said } from '../net/bridge.ts';
import { BUBBLE_MS, EMOTES, PHRASE_GROUPS, PHRASES, SAY_COOLDOWN_MS, sayText } from '../net/says.ts';
import { sfx } from '../audio.ts';
import { useSession } from '../state/session.ts';
import type { Stage } from './useStage.ts';

export default function OnlineLayer({ stage }: { stage: Stage }) {
  const people = useNet((s) => s.people);
  const says = useNet((s) => s.says);
  const hidden = useNet((s) => s.hidden);
  const open = useNet((s) => s.open);
  const status = useNet((s) => s.status);
  const blocked = useSession((s) => s.dialogue !== null || s.panel !== null || s.celebrate !== null);
  const refs = useRef(new Map<number, HTMLDivElement>());
  const k = stage.width / 640;
  const now = useClock(says);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      for (const [id, el] of refs.current) {
        const at = id === ME ? bridge.me : bridge.labels.get(id);
        el.style.visibility = at ? 'visible' : 'hidden';
        if (at) el.style.transform = `translate(${at.x * k}px, ${at.y * k}px) translate(-50%, -100%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [k]);

  useEffect(() => {
    if (open === null) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && useNet.setState({ open: null });
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const bubble = (s: Said | undefined) => (s && now - s.at < BUBBLE_MS ? s : null);
  const place = (id: number) => (el: HTMLDivElement | null) => void (el ? refs.current.set(id, el) : refs.current.delete(id));
  const mine = bubble(says[ME]);
  const menuFor = typeof open === 'number' ? people.find((p) => p.id === open) : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div role="list" aria-label="Classmates here">
        {people.map((p) => {
          const said = hidden.includes(p.name) ? null : bubble(says[p.id]);
          return (
            <div key={p.id} ref={place(p.id)} role="listitem" className="absolute left-0 top-0 flex flex-col items-center" style={{ visibility: 'hidden' }}>
              {said && <Bubble said={said} who={p.name} />}
              <button
                className={`${blocked || open !== null ? '' : 'pointer-events-auto'} whitespace-nowrap rounded-md border-2 border-[#5a3620] bg-[#f2c14e] px-2 text-lg font-semibold leading-tight text-[#2a1c12] shadow-[0_2px_0_#1b1410] focus-visible:outline-4 focus-visible:outline-[#1d5fd1]`}
                aria-label={`${p.name}${p.busy ? ', in a battle' : ''}: open menu`}
                tabIndex={blocked ? -1 : 0}
                onClick={() => useNet.setState({ open: p.id })}
              >
                {p.busy && <span aria-hidden>⚔️ </span>}
                {hidden.includes(p.name) && <span aria-hidden>🔇 </span>}
                {p.name}
              </button>
            </div>
          );
        })}
      </div>
      <GoalBar />
      <div ref={place(ME)} className="absolute left-0 top-0 pb-1" style={{ visibility: 'hidden' }}>
        {mine && <Bubble said={mine} who="You" />}
      </div>

      {status === 'online' && !blocked && open === null && (
        <button className="btn pointer-events-auto absolute bottom-3 right-3" onClick={() => useNet.setState({ open: 'say' })} aria-label="Say something to classmates"><span className="text-3xl leading-none">💬</span></button>
      )}
      {open === 'say' && !blocked && <Picker />}
      {menuFor && !blocked && <PlayerMenu id={menuFor.id} name={menuFor.name} />}
    </div>
  );
}

const CELEBRATE_MS = 6000;

/** This week's class goal under the player's stats, and a celebration when the class reaches it. */
function GoalBar() {
  const goal = useNet((s) => s.goal);
  const hit = useNet((s) => s.goalHit);
  useEffect(() => {
    if (!hit) return;
    sfx('victory');
    const t = setTimeout(() => useNet.setState({ goalHit: false }), CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [hit]);
  if (!goal) return null;
  const pct = Math.min(100, Math.round((goal.n / goal.of) * 100));
  return (
    <>
      <div className="panel absolute left-2 top-[4.25rem] flex items-center gap-2 px-3 py-1 text-lg">
        <span>🎯 Class goal</span>
        <span role="progressbar" aria-label="Class goal this week" aria-valuenow={goal.n} aria-valuemin={0} aria-valuemax={goal.of} className="inline-block h-4 w-24 overflow-hidden rounded-sm border-2 border-frame bg-white">
          <span className="block h-full bg-[#2f9e44]" style={{ width: `${pct}%` }} />
        </span>
        <span className="font-semibold">{goal.n}/{goal.of}</span>
      </div>
      {hit && (
        <div className="panel absolute inset-x-0 top-24 mx-auto w-fit max-w-[90%] px-5 py-3 text-center text-2xl font-bold" role="status">
          🎉 Your class reached this week’s goal! 🎉
        </div>
      )}
    </>
  );
}

/** Re-render when a bubble should disappear. */
function useClock(says: Record<number, Said>): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = Date.now();
    setNow(t);
    const next = Math.min(...Object.values(says).map((s) => s.at + BUBBLE_MS).filter((e) => e > t));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(Date.now()), next - t + 20);
    return () => clearTimeout(timer);
  }, [says]);
  return now;
}

function Bubble({ said, who }: { said: Said; who: string }) {
  const emote = said.k === 'e';
  return (
    <div
      className={`relative mb-2 max-w-48 rounded-lg border-2 border-[#2a1c12] bg-white px-2 py-0.5 text-center font-semibold leading-tight text-[#2a1c12] shadow-[0_2px_0_#1b1410] ${emote ? 'text-3xl' : 'text-lg'}`}
      role="status"
      aria-label={`${who} said ${emote ? EMOTES[said.i]!.label : PHRASES[said.i]}`}
    >
      {sayText(said.k, said.i)}
      <span className="absolute -bottom-[9px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[8px] border-x-transparent border-t-[#2a1c12]" aria-hidden />
    </div>
  );
}

/** Pick an emote or a phrase. Nothing can be typed. One every few seconds. */
function Picker() {
  const muted = useNet((s) => s.muted);
  const close = () => useNet.setState({ open: null });
  const send = (k: 'e' | 'p', i: number) => (bridge.say(k, i), close());
  // Reopening the picker right after saying something shows the wait (the server allows one every 3 s).
  const recent = useNet((s) => s.says[ME]);
  const cooling = !!recent && Date.now() - recent.at < SAY_COOLDOWN_MS;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!cooling || !recent) return;
    const t = setTimeout(() => tick((n) => n + 1), Math.max(50, recent.at + SAY_COOLDOWN_MS - Date.now()));
    return () => clearTimeout(t);
  }, [cooling, recent]);

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-label="Say something" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel flex max-h-full w-[min(36rem,100%)] flex-col gap-3 overflow-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-2xl font-bold">Say something</h2>
          <button className="btn btn-quiet" onClick={close} aria-label="Close">✕</button>
        </div>
        {muted ? (
          <p className="text-lg">Your teacher turned off emotes and phrases for you. You can still play and explore with your class.</p>
        ) : (
          <>
            {cooling && <p className="text-lg" role="status">Wait a moment before saying something else.</p>}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Emotes">
              {EMOTES.map((e, i) => (
                <button key={e.label} className="btn min-w-14" disabled={cooling} onClick={() => send('e', i)} aria-label={e.label} title={e.label}><span className="text-3xl leading-none">{e.e}</span></button>
              ))}
            </div>
            {PHRASE_GROUPS.map((g) => (
              <section key={g.name} className="flex flex-col gap-1" aria-label={g.name}>
                <h3 className="text-lg font-bold">{g.name}</h3>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((i) => (
                    <button key={i} className="btn btn-quiet text-lg" disabled={cooling} onClick={() => send('p', i)}>{PHRASES[i]}</button>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Tap a classmate: mute them on this device, or report them to the teacher. */
function PlayerMenu({ id, name }: { id: number; name: string }) {
  const hidden = useNet((s) => s.hidden.includes(name));
  const reported = useNet((s) => s.reported.includes(id));
  const [confirm, setConfirm] = useState(false);
  const close = () => useNet.setState({ open: null });
  const setHidden = (on: boolean) => useNet.setState((n) => ({ hidden: on ? [...n.hidden, name] : n.hidden.filter((x) => x !== name) }));
  const report = () => {
    bridge.flag(id);
    setHidden(true); // reporting also mutes them here
    setConfirm(false);
  };
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-label={name} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel flex w-[min(26rem,100%)] flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-2xl font-bold">{name}</h2>
          <button className="btn btn-quiet" onClick={close} aria-label="Close">✕</button>
        </div>
        {reported ? (
          <p className="text-lg" role="status">Thanks for telling us. Your teacher will see your report. You won’t see {name}’s emotes or phrases any more.</p>
        ) : confirm ? (
          <>
            <p className="text-lg">Report {name} to your teacher? Your teacher will see what {name} said recently.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-danger" onClick={report}>Report</button>
              <button className="btn btn-quiet" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setHidden(!hidden)} aria-pressed={hidden}>
              {hidden ? `🔈 Unmute ${name}` : `🔇 Mute ${name}`}
            </button>
            <p className="text-lg">Muting hides {name}’s emotes and phrases on this device until you close the game.</p>
            <button className="btn btn-danger" onClick={() => setConfirm(true)}>🚩 Report to your teacher</button>
          </>
        )}
      </div>
    </div>
  );
}
