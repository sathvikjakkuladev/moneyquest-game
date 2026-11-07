import { useEffect, useState } from 'react';
import { newSlot, randomNickname, validNickname } from '../core/save.ts';
import type { Band } from '../core/types.ts';
import { HEADMASTER, WELCOME } from '../data/dialogue.ts';
import { useSave } from '../state/save.ts';
import { useSession } from '../state/session.ts';
import { Portrait } from './Portrait.tsx';

type Step = 'welcome' | 'name' | 'level' | 'check';

/** New game: Headmaster's welcome → nickname → level → Money Check (Phase 5) → hub. */
export function Onboarding({ slotIndex, onCancel }: { slotIndex: number; onCancel: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [band, setBand] = useState<Band>('K-5');

  useEffect(() => {
    if (step === 'welcome') useSession.getState().say(HEADMASTER, WELCOME, () => setStep('name'));
  }, [step]);

  const start = () => {
    // Which Money Check form comes first is picked at random, so pre/post forms are counterbalanced.
    useSave.getState().create(slotIndex, newSlot(name, band, Math.random() < 0.5 ? 'A' : 'B'));
    const s = useSession.getState();
    s.setScreen('play');
    s.go({ kind: 'room', zone: 'coin_academy', entry: 'from_world_map' });
    s.say(HEADMASTER, [`Welcome to Coin Academy, ${name}!`, 'Walk with the arrow keys or WASD, tap where you want to go, or use the arrow pad on a touch screen.', 'Come and find me in the library, up through the big door. Press Space or tap someone to talk.']);
  };

  if (step === 'welcome') return null; // the dialogue box shows the welcome
  return (
    <div className="flex h-full items-center justify-center p-3">
      <div className="panel flex max-h-full w-[min(42rem,100%)] flex-col gap-4 overflow-auto p-5">
        {step === 'name' && (
          <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), validNickname(name) && setStep('level'))}>
            <h2 className="text-3xl font-bold">What should we call you?</h2>
            <p className="text-lg">Pick a fun name, <strong>not your real name</strong>. Letters and numbers only, 2 to 12 characters.</p>
            <div className="flex flex-wrap gap-3">
              <input autoFocus aria-label="Nickname" maxLength={12} value={name} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} className="min-h-12 flex-1 rounded-md border-4 border-frame bg-white px-3 text-2xl" />
              <button type="button" className="btn btn-quiet" onClick={() => setName(randomNickname(Math.random))}>🎲 Random name</button>
            </div>
            <div className="flex justify-between">
              <button type="button" className="btn btn-quiet" onClick={onCancel}>Back</button>
              <button type="submit" className="btn" disabled={!validNickname(name)}>Next</button>
            </div>
          </form>
        )}
        {step === 'level' && (
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-bold">Pick your quest level</h2>
            <p className="text-lg">You can change this later in Settings.</p>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Quest level">
              {([['K-5', 'Explorer', 'Grades K–5. No timers, gentler monsters.'], ['6-8', 'Adventurer', 'Grades 6–8. Tougher questions and some timed monster tricks.']] as const).map(([b, title, text]) => (
                <button key={b} role="radio" aria-checked={band === b} className={`btn flex flex-col items-start p-4 text-left ${band === b ? '' : 'btn-quiet'}`} onClick={() => setBand(b)}>
                  <span className="text-2xl font-bold">{band === b ? '✓ ' : ''}{title}</span>
                  <span className="text-lg font-normal">{text}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <button className="btn btn-quiet" onClick={() => setStep('name')}>Back</button>
              <button className="btn" onClick={() => setStep('check')}>Next</button>
            </div>
          </div>
        )}
        {step === 'check' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Portrait id="headmaster" scale={2} alt={HEADMASTER.name} />
            <h2 className="text-3xl font-bold">Money Check</h2>
            <p className="text-lg">Soon you'll start with a quick 12-question Money Check, so you can see how much you learn by the end. It's coming in a later version of the game.</p>
            <button className="btn" autoFocus onClick={start}>Start the adventure</button>
          </div>
        )}
      </div>
    </div>
  );
}
