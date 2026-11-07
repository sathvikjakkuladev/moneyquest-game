import { useEffect, useMemo, useState } from 'react';
import type { Which } from '../core/moneyCheck.ts';
import { checkIds, formFor, improvement, scoreCheck } from '../core/moneyCheck.ts';
import { seeded, freshSeed, shuffle } from '../core/rng.ts';
import type { CheckResult } from '../core/save.ts';
import type { Question, QuestionFile } from '../core/types.ts';
import { TOPICS } from '../core/types.ts';
import questionFile from '../data/questions.json';
import { useSave, useSlot } from '../state/save.ts';
import { canSpeak, hush, speak } from './speech.ts';

const BANK = new Map((questionFile as unknown as QuestionFile).questions.map((q) => [q.id, q]));
const L = ['A', 'B', 'C', 'D'];

/** A Money Check: 12 questions, no right/wrong shown while taking it, then the scores. */
export function MoneyCheck({ which, onDone }: { which: Which; onDone: () => void }) {
  const s = useSlot()!;
  const form = formFor(s.moneyCheck.firstForm, which);
  const qs = useMemo(() => checkIds(s.band, form).map((id) => BANK.get(id)!) as Question[], [s.band, form]);
  // Options are shuffled here too (the bank leans toward D).
  const orders = useMemo(() => {
    const rng = seeded(freshSeed());
    return qs.map(() => shuffle([0, 1, 2, 3], rng));
  }, [qs]);
  const [step, setStep] = useState<'intro' | number | 'done'>('intro');
  const [right, setRight] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<CheckResult | null>(null);

  const pick = (pos: number) => {
    if (typeof step !== 'number') return;
    const q = qs[step]!;
    const next = { ...right, [q.id]: orders[step]![pos] === q.correct };
    setRight(next);
    if (step + 1 < qs.length) return setStep(step + 1);
    const r = scoreCheck(qs, next, s.band, form);
    useSave.getState().edit((x) => ({ ...x, moneyCheck: { ...x.moneyCheck, [which]: r } }));
    setResult(r);
    setStep('done');
  };

  const q = typeof step === 'number' ? qs[step]! : null;
  const opts = typeof step === 'number' ? orders[step]!.map((i) => q!.options[i]!) : [];
  const reading = q ? `${q.question} ${opts.map((o, i) => `${L[i]}: ${o}.`).join(' ')}` : '';
  useEffect(() => {
    if (q && s.settings.readAloud) speak(reading);
    return hush;
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (typeof step !== 'number' || e.repeat) return;
      const key = e.key.toLowerCase();
      const pos = key.length === 1 ? ('1234'.includes(key) ? '1234'.indexOf(key) : 'abcd'.indexOf(key)) : -1;
      if (pos >= 0) (e.preventDefault(), pick(pos));
      if (key === 'r') speak(reading);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const title = which === 'pre' ? 'Money Check' : 'Money Check 2';
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#1b1410]/85 p-3" role="dialog" aria-label={title}>
      <div className="panel flex max-h-full w-[min(46rem,100%)] flex-col gap-3 overflow-auto p-5">
        {step === 'intro' && (
          <>
            <h2 className="text-3xl font-bold">{title}</h2>
            <p className="text-xl">
              {which === 'pre'
                ? '12 quick questions to see what you already know about money. You won’t see right or wrong until the end: just do your best!'
                : 'You beat all six zone bosses! Take the Money Check again to see how much you’ve learned. 12 questions, and your score at the end.'}
            </p>
            <button className="btn self-start" autoFocus onClick={() => setStep(0)}>Start</button>
          </>
        )}
        {q && typeof step === 'number' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold">Question {step + 1} of {qs.length}</p>
              <div className="h-3 w-40 overflow-hidden rounded-sm border-2 border-frame bg-white" role="progressbar" aria-valuenow={step} aria-valuemin={0} aria-valuemax={qs.length} aria-label="Progress">
                <div className="h-full bg-[#3b6fd4]" style={{ width: `${(step / qs.length) * 100}%` }} />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <p className="flex-1 text-2xl font-semibold leading-snug" aria-live="polite">{q.question}</p>
              {canSpeak() && <button className="btn btn-quiet" onClick={() => speak(reading)} aria-label="Read aloud (R)">🔊</button>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {opts.map((o, i) => (
                <button key={`${step}-${i}`} className="opt" onClick={() => pick(i)} aria-label={`${L[i]}: ${o}`}>
                  <span className="opt-letter">{L[i]}</span>
                  <span className="flex-1 text-left">{o}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 'done' && result && <CheckResults which={which} result={result} pre={s.moneyCheck.pre} onDone={onDone} />}
      </div>
    </div>
  );
}

function CheckResults({ which, result, pre, onDone }: { which: Which; result: CheckResult; pre: CheckResult | null; onDone: () => void }) {
  const imp = which === 'post' && pre ? improvement(pre, result) : null;
  return (
    <div className="flex flex-col gap-3" role="status">
      <h2 className="text-3xl font-bold">You got {result.total} of 12!</h2>
      {imp && <p className="text-2xl font-bold text-[#1f7a3a]">{imp.total > 0 ? `That’s ${imp.total} more than your first Money Check (${pre!.total}). Great learning!` : imp.total === 0 ? `The same as your first Money Check (${pre!.total}).` : `Your first Money Check was ${pre!.total}. Keep practising in the bonus zones!`}</p>}
      {!imp && <p className="text-xl">Now you know where you’re starting. Your adventure will help with every topic.</p>}
      <ul className="flex flex-col gap-1">
        {TOPICS.map((t) => (
          <li key={t} className="flex items-center gap-2 text-lg">
            <span className="w-52 shrink-0">{t}</span>
            <span aria-hidden>{'★'.repeat(result.perTopic[t])}{'☆'.repeat(2 - result.perTopic[t])}</span>
            <span>{result.perTopic[t]} of 2{imp ? ` (${imp.perTopic[t] >= 0 ? '+' : ''}${imp.perTopic[t]})` : ''}</span>
          </li>
        ))}
      </ul>
      <button className="btn self-start" autoFocus onClick={onDone}>{which === 'pre' ? 'Start the adventure' : 'Continue'}</button>
    </div>
  );
}
