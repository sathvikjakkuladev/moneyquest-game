import { lazy, Suspense } from 'react';
import { resultsCsv } from '../core/csv.ts';
import { improvement, postCheckReady } from '../core/moneyCheck.ts';
import { MONSTERS } from '../core/monsters.ts';
import { TOPIC_ZONE_ORDER } from '../core/progression.ts';
import { TOPICS } from '../core/types.ts';
import { useSave, useSlot } from '../state/save.ts';
import { useSession } from '../state/session.ts';

// Only built when VITE_MP_URL is set (see Hud.tsx).
const ClassBoard = import.meta.env.VITE_MP_URL ? lazy(() => import('./ClassBoard.tsx')) : null;

/** Save a file on this device (no network). */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Progress: accuracy by topic, Money Check results and the CSV export. */
export function Progress({ onClose }: { onClose: () => void }) {
  const s = useSlot()!;
  const { pre, post } = s.moneyCheck;
  const imp = pre && post ? improvement(pre, post) : null;
  const ready = postCheckReady(s, TOPIC_ZONE_ORDER);
  const exportAll = () => download(`moneyquest-money-check-${new Date().toISOString().slice(0, 10)}.csv`, resultsCsv(useSave.getState().slots));
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 p-3" role="dialog" aria-label="Progress">
      <div className="panel flex max-h-full w-[min(48rem,100%)] flex-col gap-3 overflow-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold">{s.nickname}’s progress</h2>
          <button className="btn btn-quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="text-lg">
          Level {s.progress.level} · 🪙 {s.progress.coins} · {s.progress.zonesCleared.filter((z) => (TOPIC_ZONE_ORDER as readonly string[]).includes(z)).length} of 6 zones cleared · {s.progress.defeated.length} of {Object.keys(MONSTERS).length} monsters beaten · {s.progress.tamed.length} tamed
        </p>
        <section>
          <h3 className="text-2xl font-bold">Accuracy by topic</h3>
          <ul className="mt-1 flex flex-col gap-1.5">
            {TOPICS.map((t) => {
              const a = s.questions.accuracy[t];
              const pct = a && a.answered ? Math.round((a.correct / a.answered) * 100) : null;
              return (
                <li key={t} className="grid grid-cols-[minmax(9rem,13rem)_1fr_auto] items-center gap-2 text-lg">
                  <span>{t}</span>
                  <span className="h-5 overflow-hidden rounded-sm border-2 border-frame bg-white" role="progressbar" aria-label={`${t} accuracy`} aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
                    <span className="block h-full bg-[#2f9e44]" style={{ width: `${pct ?? 0}%` }} />
                  </span>
                  <span className="w-36 text-right">{pct === null ? 'not tried yet' : `${pct}% of ${a!.answered}`}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h3 className="text-2xl font-bold">Money Check</h3>
          {!pre ? (
            <p className="text-lg">Not taken yet.</p>
          ) : (
            <table className="mt-1 w-full text-left text-lg">
              <thead>
                <tr><th className="font-semibold">Topic</th><th>First</th><th>Second</th><th>Change</th></tr>
              </thead>
              <tbody>
                {TOPICS.map((t) => (
                  <tr key={t}><td>{t}</td><td>{pre.perTopic[t]}/2</td><td>{post ? `${post.perTopic[t]}/2` : '–'}</td><td>{imp ? `${imp.perTopic[t] >= 0 ? '+' : ''}${imp.perTopic[t]}` : '–'}</td></tr>
                ))}
                <tr className="font-bold"><td>Total</td><td>{pre.total}/12</td><td>{post ? `${post.total}/12` : '–'}</td><td>{imp ? `${imp.total >= 0 ? '+' : ''}${imp.total}` : '–'}</td></tr>
              </tbody>
            </table>
          )}
          {!post && <p className="mt-1 text-lg">{ready ? 'You’ve beaten all six bosses: Money Check 2 is ready!' : 'Money Check 2 opens after you beat all six zone bosses.'}</p>}
        </section>
        {ClassBoard && s.online && <Suspense fallback={null}><ClassBoard /></Suspense>}
        <div className="flex flex-wrap gap-2">
          {ready && <button className="btn" onClick={() => useSession.getState().setPanel('check')}>Take Money Check 2</button>}
          <button className="btn btn-quiet" onClick={exportAll}>⬇ Export results (CSV)</button>
        </div>
        <p className="text-lg">The CSV has every save on this device: nickname, date, level, form, score per topic, total and improvement. It’s saved to this device only.</p>
      </div>
    </div>
  );
}
