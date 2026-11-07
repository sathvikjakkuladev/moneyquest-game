import { useEffect, useRef, useState } from 'react';
import type { SpellId } from '../core/spells.ts';
import { SPELLS } from '../core/spells.ts';
import { useSlot } from '../state/save.ts';
import type { Battle } from '../state/session.ts';
import { useSession } from '../state/session.ts';
import { canSpeak, hush, speak } from './speech.ts';
import type { Stage } from './useStage.ts';

const L = ['A', 'B', 'C', 'D'];
const RIGHT_PAUSE_MS = 3500; // a right answer's explanation shows briefly, then the next question

/** Battle UI: health bars and the question card. Landscape: over the canvas. Portrait: below it. */
export function BattleUI({ stage }: { stage: Stage }) {
  const b = useSession((s) => s.battle);
  if (!b) return null;
  const card = b.phase === 'won' || b.phase === 'lost' ? <Result b={b} /> : <Card b={b} compact={!stage.portrait && stage.height < 600} />;
  const bars = (
    <>
      <PlayerBar b={b} />
      <FoeBar b={b} />
    </>
  );
  if (stage.portrait)
    return (
      <div className="pointer-events-auto absolute inset-x-0 flex flex-col items-center gap-2 px-2" style={{ top: stage.height + 6 }}>
        <div className="flex w-full gap-2">{bars}</div>
        {card}
      </div>
    );
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 flex w-[min(21rem,38%)] flex-col gap-1.5">{bars}</div>
      <div className="pointer-events-auto absolute inset-x-0 bottom-2 flex justify-center px-2">{card}</div>
    </>
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="h-4 w-full overflow-hidden rounded-sm border-2 border-[#1b1410] bg-[#3b2a20]">
      <div className="h-full transition-[width] duration-300" style={{ width: `${Math.max(0, (value / max) * 100)}%`, background: color }} />
    </div>
  );
}

function PlayerBar({ b }: { b: Battle }) {
  const nick = useSlot()?.nickname ?? 'You';
  const s = b.state;
  return (
    <div className="panel flex-1 px-2.5 py-1.5">
      <div className="flex justify-between text-lg font-bold">
        <span>{nick}</span>
        <span>❤ {s.playerHp}/{s.playerMaxHp}{s.shield > 0 && <span className="ml-2 text-[#1d5fd1]">🛡 {s.shield}</span>}</span>
      </div>
      <Bar value={s.playerHp} max={s.playerMaxHp} color="#2f9e44" label="Your health" />
    </div>
  );
}

function FoeBar({ b }: { b: Battle }) {
  const s = b.state;
  const a = b.monster.attacks[s.nextAttack % b.monster.attacks.length]!;
  return (
    <div className="panel flex-1 px-2.5 py-1.5">
      <div className="flex justify-between gap-2 text-lg font-bold">
        <span>{b.monster.name}{b.monster.boss && <span className="ml-2 rounded-sm bg-[#a3271f] px-1.5 text-base text-white">BOSS</span>}</span>
        <span>{s.hp}/{s.maxHp}</span>
      </div>
      <Bar value={s.hp} max={s.maxHp} color="#d9480f" label={`${b.monster.name} health`} />
      <p className="mt-0.5 text-base leading-tight">Next attack: <strong>{a.name}</strong>. {a.effectText}</p>
    </div>
  );
}

function Card({ b, compact }: { b: Battle; compact: boolean }) {
  const slot = useSlot();
  const { answer, pickSpell, gotIt, timeUp } = useSession.getState();
  const spells = slot?.progress.spells ?? ['budget_beam'];
  const q = b.q;
  const asking = b.phase === 'ask';
  const showWhy = b.phase === 'explain' || b.phase === 'right';
  const reading = `${q.question} ${q.options.map((o, i) => `${L[i]}: ${o}.`).join(' ')}`;
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (asking && slot?.settings.readAloud) speak(reading);
  }, [q.id, asking]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => hush, []);
  useEffect(() => {
    if (showWhy) nextRef.current?.focus();
    if (b.phase !== 'right') return;
    const t = setTimeout(() => useSession.getState().gotIt(), RIGHT_PAUSE_MS);
    return () => clearTimeout(t);
  }, [b.phase, showWhy]);

  // Keys: 1–4 or A–D answer, ←/→ or Q/E switch spells, R reads aloud, Enter/Space continues.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (asking) {
        const i = '1234'.indexOf(k) >= 0 && k.length === 1 ? '1234'.indexOf(k) : k.length === 1 ? 'abcd'.indexOf(k) : -1;
        if (i >= 0) return (e.preventDefault(), answer(i));
        if (['arrowleft', 'arrowright', 'q', 'e'].includes(k) && spells.length > 1) {
          const back = k === 'arrowleft' || k === 'q';
          pickSpell(spells[(spells.indexOf(b.spell) + (back ? spells.length - 1 : 1)) % spells.length]!);
        }
        if (k === 'r') speak(reading);
      } else if (showWhy && (k === 'enter' || k === ' ') && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        gotIt();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking, showWhy, b.spell, spells, reading, answer, pickSpell, gotIt]);

  if (b.phase === 'intro') return <div className="panel w-[min(60rem,100%)] p-3 text-center text-2xl font-bold" aria-live="polite">{b.monster.name} appears!</div>;

  return (
    <div className={`panel card-in flex w-[min(62rem,100%)] gap-3 ${compact ? 'p-2' : 'p-3'}`}>
      {spells.length > 1 && (
        <div className="flex w-32 shrink-0 flex-col gap-2" role="radiogroup" aria-label="Spell">
          {spells.map((id: SpellId) => (
            <button key={id} role="radio" aria-checked={b.spell === id} disabled={!asking} title={SPELLS[id].blurb} className={`btn px-2 text-base leading-tight ${b.spell === id ? '' : 'btn-quiet'}`} onClick={() => pickSpell(id)}>
              {b.spell === id ? '✓ ' : ''}{SPELLS[id].name}
            </button>
          ))}
          <p className="text-center text-base">◂ ▸ switch</p>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2">
        {b.timer && asking && <TimerBar key={b.timer.since} seconds={b.timer.seconds} since={b.timer.since} kind={b.timer.kind} onDone={timeUp} />}
        {b.warning && asking && <p className="rounded-sm bg-[#fff1c2] px-2 py-0.5 text-lg font-semibold">⚠ {b.warning}</p>}
        <div className="flex items-start gap-2">
          <p className={`flex-1 font-semibold leading-snug ${compact ? 'text-xl' : 'text-2xl'}`} aria-live="polite">{q.question}</p>
          {canSpeak() && <button className="btn btn-quiet shrink-0" onClick={() => speak(reading)} aria-label="Read the question aloud (R)">🔊</button>}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {q.options.map((o, i) => {
            const picked = b.picked === i, isRight = i === q.correct;
            let cls = '', mark = '';
            if (b.phase === 'resolving' && picked) [cls, mark] = b.last === 'right' ? ['opt-right', '✓'] : ['opt-wrong', '✗'];
            if (showWhy && isRight) [cls, mark] = ['opt-right', '✓'];
            if (showWhy && picked && !isRight) [cls, mark] = ['opt-wrong', '✗'];
            return (
              <button key={i} className={`opt ${cls}`} disabled={!asking} onClick={() => answer(i)} aria-label={`${L[i]}: ${o}${mark === '✓' ? ', correct' : mark === '✗' ? ', wrong' : ''}`}>
                <span className="opt-letter">{L[i]}</span>
                <span className="flex-1 text-left">{o}</span>
                {mark && <span className="text-2xl font-bold" aria-hidden>{mark}</span>}
              </button>
            );
          })}
        </div>
        {b.phase === 'resolving' && b.last === 'right' && <p className="text-xl font-bold text-[#1f7a3a]" aria-live="assertive">✓ Right! {SPELLS[b.spell].name}!</p>}
        {b.phase === 'resolving' && b.last === 'wrong' && <p className="text-xl font-bold text-[#a3271f]" aria-live="assertive">{b.picked === -1 ? '⏱ Time is up!' : '✗ Not quite.'} {b.monster.name} attacks!</p>}
        {b.phase === 'resolving' && b.last === 'slow' && <p className="text-xl font-bold text-[#a3271f]" aria-live="assertive">⏱ Too slow! {b.monster.name} struck first. Keep going!</p>}
        {showWhy && (
          <div className="flex flex-wrap items-center gap-2 rounded-sm bg-white/70 p-2" aria-live="polite">
            <p className="flex-1 text-xl"><strong>{b.phase === 'right' ? '✓ ' : 'Why: '}</strong>{q.explanation}</p>
            {canSpeak() && <button className="btn btn-quiet" onClick={() => speak(`The answer is ${q.options[q.correct]}. ${q.explanation}`)} aria-label="Read the explanation aloud">🔊</button>}
            <button ref={nextRef} className="btn" onClick={gotIt}>{b.phase === 'right' ? 'Next' : 'Got it'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TimerBar({ seconds, since, kind, onDone }: { seconds: number; since: number; kind: 'slowStrike' | 'rush'; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const l = Math.max(0, seconds - (performance.now() - since) / 1000);
      setLeft(l);
      if (l <= 0) onDone();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seconds, since, onDone]);
  return (
    <div className="flex items-center gap-2" role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
      <span className="text-lg font-bold">⏱ {Math.ceil(left)}s</span>
      <div className="h-3 flex-1 overflow-hidden rounded-sm border-2 border-[#1b1410] bg-white"><div className="h-full bg-[#e8590c]" style={{ width: `${(left / seconds) * 100}%` }} /></div>
      <span className="text-base">{kind === 'slowStrike' ? 'Answer before it swoops!' : 'Answer before time runs out!'}</span>
    </div>
  );
}

function Result({ b }: { b: Battle }) {
  const leave = useSession((s) => s.leave);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const r = b.result;
  if (b.phase === 'lost')
    return (
      <div className="panel flex w-[min(42rem,100%)] flex-col items-center gap-2 p-4 text-center" role="status">
        <h2 className="text-3xl font-bold">Your wizard needs a rest!</h2>
        <p className="text-xl">No coins or progress lost. Rest up and try again when you're ready.</p>
        <button ref={ref} className="btn" onClick={leave}>Back to the village</button>
      </div>
    );
  return (
    <div className="panel flex w-[min(42rem,100%)] flex-col items-center gap-1.5 p-4 text-center" role="status">
      <h2 className="text-3xl font-bold">You beat {b.monster.name}!</h2>
      {r && <p className="text-2xl font-semibold">🪙 +{r.coins} coins · ⭐ +{r.xp} XP</p>}
      {r?.coinsTaken ? <p className="text-lg">({b.monster.name} grabbed {r.coinsTaken} of your coins during the fight.)</p> : null}
      {r?.rematch && <p className="text-lg">Rematches pay half.</p>}
      {r?.levelUp && <p className="text-2xl font-bold text-[#1f7a3a]">Level up! You're now level {r.levelUp}.</p>}
      {r?.newSpell && <p className="text-2xl font-bold text-[#1d5fd1]">New spell: {SPELLS[r.newSpell].name}! <span className="font-normal">{SPELLS[r.newSpell].blurb}</span></p>}
      {b.monster.lesson && <p className="text-xl"><strong>Lesson:</strong> {b.monster.lesson}</p>}
      <button ref={ref} className="btn mt-1" onClick={leave}>Back to the village</button>
    </div>
  );
}
