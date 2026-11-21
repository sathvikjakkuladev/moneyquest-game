import { useEffect, useRef, useState } from 'react';
import { postCheckReady } from '../core/moneyCheck.ts';
import { TOPIC_ZONE_ORDER } from '../core/progression.ts';
import { AVATAR } from '../data/v2.ts';
import { zoneById } from '../data/zones.ts';
import { SPELLS } from '../core/spells.ts';
import { spellDamage } from '../core/battle.ts';
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
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="h-4 w-full overflow-hidden track">
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
        <span>❤ {s.playerHp}/{s.playerMaxHp}{s.shield > 0 && <span className="ml-2 t-info">🛡 {s.shield}</span>}{s.armor > 0 && <span className="ml-2" title="Armor blocks this much from every hit">Armor −{s.armor}</span>}{s.wand > 0 && <span className="ml-2" title="Your wand adds this much to every spell">🪄 +{s.wand}</span>}{s.potions > 0 && <span className="ml-2" title="Healing potions">🧪 {s.potionUsed ? s.potions - 1 : s.potions}</span>}</span>
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
        <span>{b.monster.name}{b.monster.boss && <span className="ml-2 rounded-md bg-[#FF8A1E] px-1.5 text-lg text-[#070F22]">BOSS</span>}</span>
        <span>{s.hp}/{s.maxHp}</span>
      </div>
      <Bar value={s.hp} max={s.maxHp} color="#d9480f" label={`${b.monster.name} health`} />
      <p className="mt-0.5 text-lg leading-tight">Next attack: <strong>{a.name}</strong>. {a.effectText}</p>
    </div>
  );
}

function Card({ b, compact }: { b: Battle; compact: boolean }) {
  const slot = useSlot();
  const { answer, pickSpell, gotIt, timeUp, shuffleNow } = useSession.getState();
  const spells = slot?.progress.spells ?? ['budget_beam'];
  const q = b.q;
  const m = b.mods;
  const asking = b.phase === 'ask';
  const showWhy = b.phase === 'explain' || b.phase === 'right';
  // Read-aloud follows the buttons as shown (after a Whirlpool swap), and always reads the real text.
  const reading = `${q.question} ${b.order.map((oi, pos) => `${L[pos]}: ${q.options[oi]}.`).join(' ')}`;
  const nextRef = useRef<HTMLButtonElement>(null);
  const cycle = (dir: 1 | -1) => pickSpell(spells[(spells.indexOf(b.spell) + spells.length + dir) % spells.length]!);

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
  // Solar Glare: the answers appear 2 seconds late. Moonbat: one answer is scrambled for 3 seconds.
  const [glaring, setGlaring] = useState(false);
  const [scrambling, setScrambling] = useState(false);
  useEffect(() => {
    if (!asking) return;
    setGlaring(m.glare);
    setScrambling(m.scramble !== null);
    const t1 = m.glare ? setTimeout(() => setGlaring(false), 2000) : undefined;
    const t2 = m.scramble !== null ? setTimeout(() => setScrambling(false), 3000) : undefined;
    return () => (clearTimeout(t1), clearTimeout(t2));
  }, [asking, q.id, m.glare, m.scramble]);
  // Whirlpool: the buttons swap places once, 2 seconds into the question.
  useEffect(() => {
    if (!asking || !m.shuffle) return;
    const t = setTimeout(shuffleNow, 2000);
    return () => clearTimeout(t);
  }, [asking, m.shuffle, q.id, shuffleNow]);

  // Keys: 1–4 or A–D press the button in that position, ←/→ or Q/E switch spells, R reads aloud, Enter/Space continues.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (asking) {
        const pos = k.length === 1 ? ('1234'.includes(k) ? '1234'.indexOf(k) : 'abcd'.indexOf(k)) : -1;
        if (pos >= 0) return (e.preventDefault(), !glaring && answer(b.order[pos]!));
        if ((k === 'arrowleft' || k === 'q') && spells.length > 1) cycle(-1);
        if ((k === 'arrowright' || k === 'e') && spells.length > 1) cycle(1);
        if (k === 'r') speak(reading);
      } else if (showWhy && (k === 'enter' || k === ' ') && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        gotIt();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (b.phase === 'intro') return <div className="panel w-[min(60rem,100%)] p-3 text-center text-2xl font-bold" aria-live="polite">{b.monster.name} appears!</div>;

  const dmg = spellDamage(b.state, b.spell, b.monster);
  const cost = SPELLS[b.spell].cost;
  const charge = Math.min(b.state.charge, cost - 1);
  const charging = b.events.find((e): e is Extract<typeof e, { type: 'charging' }> => e.type === 'charging');
  return (
    <div className={`panel card-in flex w-[min(62rem,100%)] flex-col gap-2 ${compact ? 'p-2' : 'p-3'}`}>
      {spells.length > 1 && (
        <div className="flex items-center gap-2" role="group" aria-label="Spell">
          <button className="btn btn-quiet px-3" onClick={() => cycle(-1)} disabled={!asking} aria-label="Previous spell (Q)">◂</button>
          <div className="flex-1 text-center text-lg leading-tight" aria-live="polite">
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <strong>{SPELLS[b.spell].name}</strong> · {dmg} damage · {cost === 1 ? '1 right answer' : `${cost} right answers`}
              {cost > 1 && (
                <span className="flex items-center gap-1" role="img" aria-label={`Charged ${charge} of ${cost}`}>
                  {Array.from({ length: cost }, (_, i) => (
                    <span key={i} className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: hex(SPELLS[b.spell].color), background: i < charge ? hex(SPELLS[b.spell].color) : 'transparent', boxShadow: i < charge ? `0 0 8px ${hex(SPELLS[b.spell].color)}` : undefined }} />
                  ))}
                </span>
              )}
            </p>
            <p className="hidden sm:block">{SPELLS[b.spell].blurb}{cost > 1 && (charge > 0 ? ` Charged ${charge}/${cost}.` : ' The monster hits you while you charge.')}</p>
          </div>
          <button className="btn btn-quiet px-3" onClick={() => cycle(1)} disabled={!asking} aria-label="Next spell (E)">▸</button>
        </div>
      )}
      {b.timer && asking && <TimerBar key={b.timer.since} seconds={b.timer.seconds} since={b.timer.since} kind={b.timer.kind} onDone={timeUp} />}
      {asking && (b.warning || m.riddle || m.nap) && (
        <div className="flex flex-col gap-1">
          {m.riddle && <p className="rounded-sm bg-[#e5dbff] px-2 py-0.5 text-lg font-bold text-[#3b1d8f]">❓ RIDDLE: a wrong answer does double damage!</p>}
          {m.nap && <p className="rounded-sm bg-[#D6F4FF] px-2 py-0.5 text-lg font-semibold text-[#0B1630]">💤 You're sleepy: a right answer only wakes you up.</p>}
          {b.warning && !m.riddle && <p className="rounded-sm bg-[#FFC83C] px-2 py-0.5 text-lg font-semibold text-[#070F22]">⚠ {b.warning}</p>}
        </div>
      )}
      {asking && m.fakeHint !== null && (
        <p className="scam-tip rounded-sm px-2 py-1 text-lg font-bold">
          ✨ FREE TIP: pick {L[b.order.indexOf(m.fakeHint)]}! ✨ <span className="font-normal">(Too good to be true? Scam Serpent wrote this.)</span>
        </p>
      )}
      <div className="flex items-start gap-2">
        <p className={`flex-1 font-semibold leading-snug ${compact ? 'text-xl' : 'text-2xl'}`} aria-live="polite">{q.question}</p>
        {canSpeak() && <button className="btn btn-quiet shrink-0" onClick={() => speak(reading)} aria-label="Read the question aloud (R)">🔊</button>}
      </div>
      {glaring && <p className="rounded-sm bg-[#FFC83C] px-2 py-1 text-xl font-bold text-[#070F22]" aria-live="assertive">☀ Solar Glare! The answers will appear in a moment…</p>}
      <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${glaring ? 'invisible' : ''}`}>
        {b.order.map((oi, pos) => {
          const o = q.options[oi]!;
          const picked = b.picked === oi, isRight = oi === q.correct;
          let cls = '', mark = '';
          if (b.phase === 'resolving' && picked) [cls, mark] = b.last === 'right' ? ['opt-right', '✓'] : ['opt-wrong', '✗'];
          if (showWhy && isRight) [cls, mark] = ['opt-right', '✓'];
          if (showWhy && picked && !isRight) [cls, mark] = ['opt-wrong', '✗'];
          const removed = asking && m.removed === oi;
          const locked = asking && m.lock === oi && m.lockTaps > 0;
          const fogged = asking && m.fog === oi;
          const label = removed ? `${L[pos]}: removed by Wise Choice` : locked ? `${L[pos]}: chained, tap ${m.lockTaps} more times to free it` : fogged ? `${L[pos]}: hidden in fog, tap to clear` : `${L[pos]}: ${o}${mark === '✓' ? ', correct' : mark === '✗' ? ', wrong' : ''}`;
          return (
            <button key={oi} className={`opt ${cls} ${removed ? 'opt-removed' : ''} ${locked ? 'opt-locked' : ''} ${fogged ? 'opt-fog' : ''}`} disabled={!asking || removed} onClick={() => answer(oi)} aria-label={label}>
              <span className="opt-letter">{L[pos]}</span>
              <span className="flex-1 text-left">
                {removed ? <s>{o}</s> : locked ? `⛓ Chained! Tap ${m.lockTaps}× to free` : fogged ? '☁ Foggy… tap to clear' : scrambling && m.scramble === oi ? <span aria-hidden>{scrambleText(o)}</span> : o}
              </span>
              {mark && <span className="text-2xl font-bold" aria-hidden>{mark}</span>}
            </button>
          );
        })}
      </div>
      {b.phase === 'resolving' && b.last === 'right' && !charging && <p className="text-xl font-bold t-good" aria-live="assertive">✓ Right! {SPELLS[b.spell].name}!</p>}
      {b.phase === 'resolving' && b.last === 'right' && charging && (
        <p className="text-xl font-bold t-good" aria-live="assertive">✓ Right! Charging {SPELLS[charging.spell].name} ({charging.charge}/{charging.cost})… {b.monster.name} strikes while you charge!</p>
      )}
      {b.phase === 'resolving' && b.last === 'wrong' && <p className="text-xl font-bold t-bad" aria-live="assertive">{b.picked === -1 ? '⏱ Time is up!' : '✗ Not quite.'} {b.monster.name} attacks!</p>}
      {b.phase === 'resolving' && (b.last === 'slow' || b.last === 'opening') && <p className="text-xl font-bold t-bad" aria-live="assertive">⏱ {b.monster.name} struck first! Keep going.</p>}
      {showWhy && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm card p-2" aria-live="polite">
          <p className="flex-1 text-xl"><strong>{b.phase === 'right' ? '✓ ' : 'Why: '}</strong>{q.explanation}</p>
          {canSpeak() && <button className="btn btn-quiet" onClick={() => speak(`The answer is ${q.options[q.correct]}. ${q.explanation}`)} aria-label="Read the explanation aloud">🔊</button>}
          <button ref={nextRef} className="btn" onClick={gotIt}>{b.phase === 'right' ? 'Next' : 'Got it'}</button>
        </div>
      )}
    </div>
  );
}

/** Letters of each word shuffled (a fixed pattern, so it doesn't flicker), for Moonbat's screech. */
function scrambleText(s: string): string {
  return s.split(' ').map((w) => (w.length < 4 ? w : w[0] + [...w.slice(1, -1)].reverse().join('') + w.slice(-1))).join(' ');
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
      <div className="h-3 flex-1 overflow-hidden track"><div className="h-full bg-[#e8590c]" style={{ width: `${(left / seconds) * 100}%` }} /></div>
      <span className="text-lg">{kind === 'slowStrike' ? 'Answer before it swoops!' : 'Answer before time runs out!'}</span>
    </div>
  );
}

function Result({ b }: { b: Battle }) {
  const leave = useSession((s) => s.leave);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const r = b.result;
  const s = useSlot();
  const zone = zoneById(b.monster.zone);
  const costume = r?.cleared && zone.costume ? AVATAR.costume.sets.find((c) => c.id === zone.costume)?.name : null;
  const sixDone = !!r?.cleared && !!s && postCheckReady(s, TOPIC_ZONE_ORDER) && zone.id === TOPIC_ZONE_ORDER[TOPIC_ZONE_ORDER.length - 1];
  if (b.phase === 'lost')
    return (
      <div className="panel flex w-[min(42rem,100%)] flex-col items-center gap-2 p-4 text-center" role="status">
        <h2 className="text-3xl font-bold">Your wizard needs a rest!</h2>
        <p className="text-xl">No coins or progress lost. Rest up and try again when you're ready.</p>
        <button ref={ref} className="btn" onClick={leave}>Back to the waystone</button>
      </div>
    );
  return (
    <div className="panel flex w-[min(42rem,100%)] flex-col items-center gap-1.5 p-4 text-center" role="status">
      <h2 className="text-3xl font-bold">You beat {b.monster.name}!</h2>
      {r && <p className="text-2xl font-semibold">🪙 +{r.coins} coins · ⭐ +{r.xp} XP</p>}
      {r?.coinsTaken ? <p className="text-lg">({b.monster.name} grabbed {r.coinsTaken} of your coins during the fight.)</p> : null}
      {r?.rematch && <p className="text-lg">Rematches pay half.</p>}
      {r?.levelUp && <p className="text-2xl font-bold t-good">Level up! You're now level {r.levelUp}.</p>}
      {sixDone && <p className="text-xl font-bold">All six topic districts are clear! Visit the Headmaster in Ledgerhold’s plaza to take Money Check 2 and open Phish Fens.</p>}
      {r?.tamed && <p className="text-2xl font-bold t-special">🐾 {b.monster.name} joins you! Find it in your bag (🎒) to bring it along as a pet.</p>}
      {costume && <p className="text-xl font-bold t-info">New costume colours: {costume}! Visit the Stylist in Ledgerhold to wear them.</p>}
      {r?.scrollUsed && <p className="text-lg">Your Insurance Scroll paid out and is used up.</p>}
      {r?.newSpell && <p className="text-2xl font-bold t-info">New spell: {SPELLS[r.newSpell].name}! <span className="font-normal">{SPELLS[r.newSpell].blurb}</span></p>}
      {b.monster.lesson && <p className="text-xl"><strong>Lesson:</strong> {b.monster.lesson}</p>}
      <button ref={ref} className="btn mt-1" onClick={leave}>Carry on</button>
    </div>
  );
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
