// Progress panel → Your class: the weekly goal and the class leaderboard (coins earned, all-time).
// Spending coins doesn't lower your rank. Only built when VITE_MP_URL is set.
import { useEffect, useState } from 'react';
import { api } from '../net/api.ts';
import { MP_URL } from '../net/config.ts';
import type { Goal } from '../net/bridge.ts';
import { useSlot } from '../state/save.ts';

interface Board { top: { name: string; coins: number }[]; me: { rank: number; coins: number } | null }

export default function ClassBoard() {
  const s = useSlot()!;
  const m = s.online;
  const offline = s.settings.playOffline;
  const [data, setData] = useState<{ goal: Goal; board: Board | null } | 'error' | null>(null);
  const token = m?.url === MP_URL && !offline ? m.token : null;
  useEffect(() => {
    if (!token) return;
    let live = true;
    api<{ goal: Goal; board: Board | null }>('/api/class', { token }).then((r) => live && setData(r)).catch(() => live && setData('error'));
    return () => void (live = false);
  }, [token]);
  if (!m || m.url !== MP_URL) return null;
  return (
    <section>
      <h3 className="text-2xl font-bold">{m.className}</h3>
      {offline ? <p className="text-lg">Play offline is on. Turn it off in Settings to see your class.</p>
        : data === null ? <p className="text-lg">Loading…</p>
        : data === 'error' ? <p className="text-lg">Your class can’t be reached right now. Your progress is safe on this device.</p>
        : (
          <>
            <p className="text-lg">This week’s class goal: <strong>{data.goal.n} of {data.goal.of}</strong> correct answers.</p>
            {data.board === null ? <p className="text-lg">Your teacher turned the leaderboard off.</p> : (
              <>
                <h4 className="mt-1 text-xl font-bold">Most coins earned</h4>
                <ol className="flex flex-col gap-0.5 text-lg">
                  {data.board.top.map((r, i) => (
                    <li key={r.name} className={`flex justify-between rounded-sm px-2 ${r.name === m.publicName ? 'bg-[#f2c14e] font-bold' : ''}`}>
                      <span>{i + 1}. {r.name}</span><span>🪙 {r.coins}</span>
                    </li>
                  ))}
                </ol>
                {data.board.me && data.board.me.rank > data.board.top.length && <p className="mt-1 px-2 text-lg font-bold">{data.board.me.rank}. You ({m.publicName}): 🪙 {data.board.me.coins}</p>}
                <p className="text-lg">Coins you spend still count here: it ranks what you’ve earned.</p>
              </>
            )}
          </>
        )}
    </section>
  );
}
