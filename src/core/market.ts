// The Stock Board: pretend stocks bought with game coins. No real companies and no real money.
// Prices move by themselves once a minute. They come from a fixed formula of the clock (layered
// smooth noise), so every player sees the same price at the same moment, a chart of the last hour
// costs nothing to draw, and prices keep moving while the game is closed. They wander within a range
// rather than crashing to zero or climbing for ever, and each stock has its own personality:
// steady ones barely move, risky ones swing hard. Company names and blurbs are DRAFTS for review.
import type { Slot } from './save.ts';

export const TICK_MS = 60_000; // prices change once a minute
const EPOCH = Date.UTC(2026, 0, 1);

export interface Stock {
  id: string;
  ticker: string;
  name: string;
  blurb: string;
  /** Typical price in coins. */
  base: number;
  /** How hard it swings (0.1 steady … 0.6 wild). */
  risk: number;
  /** A fund holds a bit of every company, so it moves like their average. */
  fund?: boolean;
  colour: string;
}

/** DRAFT: the made-up companies on the board. */
export const STOCKS: Stock[] = [
  { id: 'pizza', ticker: 'PIZZ', name: 'Pixel Pizza Co.', blurb: 'Pizza shops in every district. People always get hungry, so it’s fairly steady.', base: 24, risk: 0.16, colour: '#ff922b' },
  { id: 'books', ticker: 'BOOK', name: 'Bookworm Books', blurb: 'A cozy bookshop chain. Slow and steady: small ups, small downs.', base: 14, risk: 0.1, colour: '#69db7c' },
  { id: 'snack', ticker: 'SNAK', name: 'Snack Stack', blurb: 'Crunchy snacks and fizzy drinks. Sales jump around with the seasons.', base: 18, risk: 0.24, colour: '#f783ac' },
  { id: 'solar', ticker: 'SUNY', name: 'Sunny Solar', blurb: 'Solar panels for Vaultspire’s rooftops. A growing business with big swings.', base: 32, risk: 0.34, colour: '#ffd43b' },
  { id: 'games', ticker: 'GLCH', name: 'Glitch Games', blurb: 'Makes video games. A hit game sends it soaring; a flop sends it tumbling.', base: 40, risk: 0.48, colour: '#9775fa' },
  { id: 'rocket', ticker: 'RKTR', name: 'Rocket Rides', blurb: 'Promises trips to the moon. Very exciting, very risky: it can double or halve.', base: 22, risk: 0.62, colour: '#4dabf7' },
  { id: 'fund', ticker: 'VLT6', name: 'Vault 6 Fund', blurb: 'One share holds a little of all six companies, so a bad day for one hurts less.', base: 25, risk: 0, fund: true, colour: '#66d9e8' },
];
export const stock = (id: string) => STOCKS.find((s) => s.id === id);

// ── Prices ──
/** A repeatable pseudo-random number in [-1, 1] for (seed, n). */
function hash(seed: number, n: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}
/** Smooth noise: random values at whole numbers, eased in between. */
function smooth(seed: number, x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(seed, i) * (1 - u) + hash(seed, i + 1) * u;
}
const seedOf = (id: string) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

/** Wander in about [-1, 1]: big slow waves (days) plus smaller faster ones (hours, minutes). */
function wander(seed: number, n: number): number {
  let v = 0, amp = 1, total = 0;
  for (let k = 11; k >= 0; k--) {
    v += smooth(seed + k * 101, n / 2 ** k) * amp;
    total += amp;
    amp *= 0.86; // slow waves matter most, but the faster ones still show
  }
  // A little minute-to-minute jitter, so the board is always ticking.
  return (v / total) * 0.95 + hash(seed + 7777, n) * 0.05;
}

export const tickAt = (t: number) => Math.floor((t - EPOCH) / TICK_MS);

/** The exact (unrounded) value at tick `n`: charts use it, so they're smooth lines, not steps. */
export function valueAtTick(s: Stock, n: number): number {
  if (s.fund) {
    const cos = STOCKS.filter((x) => !x.fund);
    return (cos.reduce((a, x) => a + valueAtTick(x, n) / x.base, 0) / cos.length) * s.base;
  }
  return s.base * Math.exp(s.risk * 3 * wander(seedOf(s.id), n));
}
/** A stock's price (whole coins, at least 1) at tick `n`: what you buy and sell at. */
export const priceAtTick = (s: Stock, n: number) => Math.max(1, Math.round(valueAtTick(s, n)));
export const priceAt = (s: Stock, t: number) => priceAtTick(s, tickAt(t));

/** Values for the last `count` ticks up to `t` (oldest first), for charts. */
export const history = (s: Stock, t: number, count = 60) => Array.from({ length: count }, (_, i) => valueAtTick(s, tickAt(t) - count + 1 + i));

// ── Trading ──
export interface Holding { shares: number; /** coins paid for the shares still held */ cost: number }
export interface Market { holdings: Record<string, Holding>; /** time of the last trade (the clock can't go back past it) */ lastTrade: number }
export const emptyMarket = (): Market => ({ holdings: {}, lastTrade: 0 });

export type Trade = { ok: true; slot: Slot; price: number } | { ok: false; reason: string };

/** Trades use the later of the device clock and the last trade, so moving the clock back gains nothing. */
const when = (s: Slot, now: number) => Math.max(now, s.market.lastTrade);

export function buy(s: Slot, id: string, shares: number, now: number): Trade {
  const st = stock(id);
  if (!st || !Number.isInteger(shares) || shares < 1) return { ok: false, reason: 'Pick how many shares.' };
  const t = when(s, now), price = priceAt(st, t), total = price * shares;
  if (total > s.progress.coins) return { ok: false, reason: `That costs ${total} coins. You have ${s.progress.coins}.` };
  const h = s.market.holdings[id] ?? { shares: 0, cost: 0 };
  return {
    ok: true, price,
    slot: { ...s, progress: { ...s.progress, coins: s.progress.coins - total }, market: { holdings: { ...s.market.holdings, [id]: { shares: h.shares + shares, cost: h.cost + total } }, lastTrade: t } },
  };
}

export function sell(s: Slot, id: string, shares: number, now: number): Trade {
  const st = stock(id), h = s.market.holdings[id];
  if (!st || !h || !Number.isInteger(shares) || shares < 1 || shares > h.shares) return { ok: false, reason: 'You don’t have that many shares.' };
  const t = when(s, now), price = priceAt(st, t);
  const left = h.shares - shares, holdings = { ...s.market.holdings };
  if (left) holdings[id] = { shares: left, cost: Math.round((h.cost * left) / h.shares) };
  else delete holdings[id];
  return { ok: true, price, slot: { ...s, progress: { ...s.progress, coins: s.progress.coins + price * shares }, market: { holdings, lastTrade: t } } };
}

/** What everything is worth right now, and what it cost. */
export function portfolio(s: Slot, now: number): { value: number; cost: number } {
  let value = 0, cost = 0;
  for (const [id, h] of Object.entries(s.market.holdings)) {
    const st = stock(id);
    if (!st) continue;
    value += priceAt(st, now) * h.shares;
    cost += h.cost;
  }
  return { value, cost };
}
