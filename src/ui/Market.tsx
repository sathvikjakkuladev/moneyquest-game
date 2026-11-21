// The Stock Board (Ledgerhold plaza, the notice board): buy and sell pretend stocks with game coins.
// Prices move once a minute (src/core/market.ts). Tips are DRAFT learning text for review.
import { useEffect, useState } from 'react';
import { buy, history, portfolio, priceAt, sell, STOCKS, TICK_MS, type Stock } from '../core/market.ts';
import { sfx } from '../audio.ts';
import { useSave, useSlot } from '../state/save.ts';

/** DRAFT: one tip shows at a time, changing each visit. */
const TIPS = [
  'Prices go up and down every minute. Nobody knows for sure where they’ll go next.',
  'Owning a few different companies (or the Vault 6 Fund) means one bad day hurts less. That’s called diversifying.',
  'Risky stocks can grow fast, but they can fall fast too. Only use coins you won’t need for a while.',
  'Buying low and selling high is the goal, but even grown-up investors guess wrong a lot.',
  'Waiting matters: steady companies often do better over a long time than quick buy-and-sell guessing.',
];
let tipIndex = Math.floor(Math.random() * TIPS.length);

function Spark({ data, colour, w = 120, h = 36 }: { data: number[]; colour: string; w?: number; h?: number }) {
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - lo) / span) * (h - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke={colour} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const pct = (now: number, then: number) => (then ? Math.round(((now - then) / then) * 1000) / 10 : 0);
function Change({ now, then }: { now: number; then: number }) {
  const p = pct(now, then);
  return <span className={p > 0 ? 't-good' : p < 0 ? 't-bad' : ''}>{p > 0 ? '▲' : p < 0 ? '▼' : '•'} {Math.abs(p)}%</span>;
}

export function Market() {
  const s = useSlot()!;
  const [now, setNow] = useState(Date.now());
  const [pick, setPick] = useState<Stock>(STOCKS[0]!);
  const [n, setN] = useState(1);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    tipIndex = (tipIndex + 1) % TIPS.length;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.ceil((TICK_MS - (now % TICK_MS)) / 1000);
  const price = priceAt(pick, now);
  const held = s.market.holdings[pick.id];
  const hour = history(pick, now, 60);
  const { value, cost } = portfolio(s, now);
  const trade = (kind: 'buy' | 'sell') => {
    const r = kind === 'buy' ? buy(s, pick.id, n, Date.now()) : sell(s, pick.id, n, Date.now());
    if (!r.ok) return setMsg(r.reason);
    sfx('coins');
    useSave.getState().edit(() => r.slot);
    setMsg(kind === 'buy' ? `You bought ${n} ${pick.ticker} for ${r.price * n} coins.` : `You sold ${n} ${pick.ticker} for ${r.price * n} coins.`);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg">Pretend stocks, bought with your game coins. Prices change every minute: next change in <strong>{secs}s</strong>.</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-paper-dark px-3 py-2 text-lg">
        <span>🪙 <strong>{s.progress.coins}</strong> coins</span>
        <span>📈 Stocks worth <strong>{value}</strong>{cost > 0 && <> (<span className={value >= cost ? 't-good' : 't-bad'}>{value >= cost ? '+' : ''}{value - cost}</span> since you bought)</>}</span>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <ul className="flex flex-col gap-1 md:w-[22rem]" aria-label="Stocks">
          {STOCKS.map((st) => {
            const p = priceAt(st, now), h = history(st, now, 60), mine = s.market.holdings[st.id]?.shares ?? 0;
            return (
              <li key={st.id}>
                <button className={`flex w-full items-center gap-2 rounded-sm border-2 card px-2 py-1 text-left ${pick.id === st.id ? 'border-[#7DF3FF]' : 'border-frame'}`} aria-pressed={pick.id === st.id} onClick={() => (setPick(st), setMsg(''), setN(1))}>
                  <span className="w-14 font-mono text-lg font-bold" style={{ color: st.colour }}>{st.ticker}</span>
                  <Spark data={h} colour={st.colour} w={70} h={28} />
                  <span className="ml-auto text-right text-lg leading-tight">
                    <strong>🪙 {p}</strong>
                    <br />
                    <span className="text-base"><Change now={p} then={Math.max(1, Math.round(h[0]!))} /></span>
                  </span>
                  {mine > 0 && <span className="rounded-sm bg-paper-dark px-1.5 text-base" title="Shares you own">×{mine}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <section className="flex flex-1 flex-col gap-2 rounded-md bg-paper-dark p-3" aria-label={pick.name}>
          <h3 className="text-2xl font-bold" style={{ color: pick.colour }}>{pick.name} <span className="font-mono text-lg">{pick.ticker}</span></h3>
          <p className="text-lg">{pick.blurb}</p>
          <Spark data={hour} colour={pick.colour} w={300} h={90} />
          <p className="text-lg">
            Now <strong>🪙 {price}</strong> · last hour <Change now={price} then={Math.max(1, Math.round(hour[0]!))} /> · low {Math.round(Math.min(...hour))}, high {Math.round(Math.max(...hour))}
          </p>
          <p className="text-lg">{held ? <>You own <strong>{held.shares}</strong> {held.shares === 1 ? 'share' : 'shares'}, worth {held.shares * price} (paid {held.cost}).</> : 'You don’t own any yet.'}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg">Shares:</span>
            {[1, 5, 10].map((k) => (
              <button key={k} className={`btn ${n === k ? '' : 'btn-quiet'}`} aria-pressed={n === k} onClick={() => setN(k)}>{k}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={price * n > s.progress.coins} onClick={() => trade('buy')}>Buy {n} for 🪙 {price * n}</button>
            <button className="btn btn-quiet" disabled={!held || held.shares < n} onClick={() => trade('sell')}>Sell {n} for 🪙 {price * n}</button>
          </div>
          {msg && <p className="text-lg font-semibold" role="status">{msg}</p>}
        </section>
      </div>
      <p className="text-lg">💡 {TIPS[tipIndex]}</p>
    </div>
  );
}
