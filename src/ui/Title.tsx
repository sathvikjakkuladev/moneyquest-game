import { lazy, Suspense, useState } from 'react';
import { useSave } from '../state/save.ts';
import { useSession } from '../state/session.ts';

// Loading a save code needs the server, so it's only built when VITE_MP_URL is set.
const RestoreSave = import.meta.env.VITE_MP_URL ? lazy(() => import('./RestoreSave.tsx')) : null;

/** Title: Continue for whoever played last, then three save slots (shared iPads). */
export function Title({ onNew }: { onNew: (slot: number) => void }) {
  const slots = useSave((s) => s.slots);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const last = slots.reduce<number | null>((b, s, i) => (s && (b === null || s.playedAt > slots[b]!.playedAt) ? i : b), null);
  const play = (i: number) => {
    useSave.getState().open(i);
    const s = useSession.getState();
    s.setScreen('play');
    s.go({ kind: 'room', zone: 'ledgerhold', entry: 'arrival' });
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-4">
      <div className="panel px-8 py-4 text-center">
        <h1 className="m-0">
          <img src={`${import.meta.env.BASE_URL}brand/make-bank-logo.webp`} alt="Make Bank" width={800} height={349} className="mx-auto h-auto w-[min(26rem,80vw)]" />
        </h1>
        <p className="mt-1 text-xl font-semibold">A money magic adventure</p>
      </div>
      {last !== null && (
        <button className="btn px-10 text-2xl" autoFocus onClick={() => play(last)}>
          ▶ Continue as {slots[last]!.nickname}
        </button>
      )}
      <ul className="flex flex-wrap justify-center gap-4" aria-label="Save slots">
        {slots.map((s, i) => (
          <li key={i} className="panel flex w-56 flex-col items-center gap-2 p-3 text-center">
            <p className="text-lg font-semibold">Save {i + 1}</p>
            {s ? (
              <>
                <p className="text-2xl font-bold">{s.nickname}</p>
                <p className="text-lg">Level {s.progress.level} · {s.progress.coins} coins</p>
                <button className="btn w-full" onClick={() => play(i)}>Play</button>
                {confirm === i ? (
                  <div className="flex w-full gap-2">
                    <button className="btn btn-danger flex-1" onClick={() => (useSave.getState().remove(i), setConfirm(null))}>Delete</button>
                    <button className="btn btn-quiet flex-1" onClick={() => setConfirm(null)}>Keep</button>
                  </div>
                ) : (
                  <button className="btn btn-quiet w-full" onClick={() => setConfirm(i)} aria-label={`Delete save ${i + 1}`}>Delete…</button>
                )}
              </>
            ) : (
              <>
                <p className="text-lg">Empty</p>
                <button className="btn w-full" onClick={() => onNew(i)}>New game</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {RestoreSave && (
        <>
          <button className="btn btn-quiet" onClick={() => setRestoring(true)}>Have a save code?</button>
          {restoring && (
            <Suspense fallback={null}>
              <RestoreSave onClose={() => setRestoring(false)} onDone={(i) => (setRestoring(false), play(i))} />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
