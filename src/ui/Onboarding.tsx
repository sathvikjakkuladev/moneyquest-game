import { useEffect, useState } from 'react';
import { newSlot, randomNickname, validNickname } from '../core/save.ts';
import { randomLook } from '../core/look.ts';
import type { Band } from '../core/types.ts';
import { HEADMASTER, WELCOME } from '../data/dialogue.ts';
import { useSave } from '../state/save.ts';
import { useSession } from '../state/session.ts';
import { LookEditor } from './LookEditor.tsx';
import { MoneyCheck } from './MoneyCheck.tsx';

type Step = 'welcome' | 'name' | 'look' | 'level' | 'check';

/** New game: Headmaster's welcome → nickname → your look → level → Money Check → hub. */
export function Onboarding({ slotIndex, onCancel }: { slotIndex: number; onCancel: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [band, setBand] = useState<Band>('K-5');
  const [look, setLook] = useState(() => randomLook(Math.random));

  useEffect(() => {
    if (step === 'welcome') useSession.getState().say(HEADMASTER, WELCOME, () => setStep('name'));
  }, [step]);

  // The save is made before Money Check 1 so its result can be stored. Which form comes first is
  // picked at random, so the pre/post forms are counterbalanced across players.
  const toCheck = () => {
    useSave.getState().create(slotIndex, newSlot(name, band, Math.random() < 0.5 ? 'A' : 'B', new Date(), look));
    setStep('check');
  };
  const start = () => {
    const s = useSession.getState();
    s.setScreen('play');
    s.go({ kind: 'room', zone: 'ledgerhold', entry: 'arrival' });
    s.say(HEADMASTER, [`Welcome to Ledgerhold, ${name}!`, 'Walk with the arrow keys or WASD, tap where you want to go, or use the arrow pad on a touch screen.', 'Come and find me in the plaza, just north of here. Press Space or tap someone to talk. The waystone behind you opens the world map.']);
  };

  if (step === 'welcome') return null; // the dialogue box shows the welcome
  if (step === 'check') return <MoneyCheck which="pre" onDone={start} />;
  return (
    <div className="flex h-full items-center justify-center p-3">
      <div className="panel flex max-h-full w-[min(52rem,100%)] flex-col gap-4 overflow-auto p-5">
        {step === 'name' && (
          <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), validNickname(name) && setStep('look'))}>
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
        {step === 'look' && (
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-bold">Make your wizard</h2>
            <LookEditor look={look} hat={null} cleared={[]} onChange={setLook} />
            <p className="text-lg">You can change all of this later, for free, at the Stylist in Ledgerhold.</p>
            <div className="flex flex-wrap justify-between gap-2">
              <button className="btn btn-quiet" onClick={() => setStep('name')}>Back</button>
              <button className="btn btn-quiet" onClick={() => setLook(randomLook(Math.random))}>🎲 Surprise me</button>
              <button className="btn" onClick={() => setStep('level')}>Next</button>
            </div>
          </div>
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
              <button className="btn btn-quiet" onClick={() => setStep('look')}>Back</button>
              <button className="btn" onClick={toCheck}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
