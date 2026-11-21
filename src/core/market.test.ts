import { describe, expect, it } from 'vitest';
import { buy, history, portfolio, priceAt, sell, STOCKS, stock, TICK_MS } from './market.ts';
import { newSlot } from './save.ts';

const T = Date.UTC(2026, 10, 21, 12);
const rich = () => ({ ...newSlot('Ann', 'K-5', 'A'), progress: { ...newSlot('Ann', 'K-5', 'A').progress, coins: 500 } });

describe('Stock Board prices', () => {
  it('are the same for everyone at the same moment, change each minute, and stay sensible', () => {
    for (const s of STOCKS) {
      expect(priceAt(s, T)).toBe(priceAt(s, T + 1000)); // same minute
      const week = Array.from({ length: 7 * 24 * 60 }, (_, i) => priceAt(s, T + i * TICK_MS));
      expect(Math.min(...week)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...week)).toBeLessThan(s.base * 5);
      expect(new Set(week).size).toBeGreaterThan(3); // it moves
    }
  });
  it('risky stocks swing more than steady ones; the fund is calmer than its companies', () => {
    const spread = (id: string) => {
      const xs = Array.from({ length: 30 * 24 * 6 }, (_, i) => priceAt(stock(id)!, T + i * 10 * TICK_MS) / stock(id)!.base);
      return Math.max(...xs) / Math.min(...xs);
    };
    expect(spread('rocket')).toBeGreaterThan(spread('books') * 2);
    expect(spread('fund')).toBeLessThan(spread('rocket'));
    expect(history(stock('pizza')!, T, 60)).toHaveLength(60);
  });
});

describe('Stock Board trading', () => {
  it('buys with coins and sells back at the price of the moment', () => {
    const p = priceAt(stock('pizza')!, T);
    const b = buy(rich(), 'pizza', 3, T);
    if (!b.ok) throw new Error(b.reason);
    expect(b.slot.progress.coins).toBe(500 - 3 * p);
    expect(b.slot.market.holdings.pizza).toEqual({ shares: 3, cost: 3 * p });
    expect(portfolio(b.slot, T)).toEqual({ value: 3 * p, cost: 3 * p });
    const later = T + 90 * TICK_MS, q = priceAt(stock('pizza')!, later);
    const s = sell(b.slot, 'pizza', 2, later);
    if (!s.ok) throw new Error(s.reason);
    expect(s.slot.progress.coins).toBe(500 - 3 * p + 2 * q);
    expect(s.slot.market.holdings.pizza!.shares).toBe(1);
    expect(s.slot.progress.coinsEarned).toBe(0); // trading isn't counted as earning coins in battle
  });
  it('refuses what you can’t afford or don’t own', () => {
    expect(buy({ ...rich(), progress: { ...rich().progress, coins: 1 } }, 'games', 1, T).ok).toBe(false);
    expect(sell(rich(), 'games', 1, T).ok).toBe(false);
    expect(buy(rich(), 'nope', 1, T).ok).toBe(false);
    expect(buy(rich(), 'pizza', 0, T).ok).toBe(false);
  });
  it('moving the device clock back trades at the last trade’s time instead', () => {
    const b = buy(rich(), 'rocket', 1, T);
    if (!b.ok) throw new Error(b.reason);
    const s = sell(b.slot, 'rocket', 1, T - 3 * 24 * 60 * TICK_MS);
    if (!s.ok) throw new Error(s.reason);
    expect(s.price).toBe(priceAt(stock('rocket')!, T));
  });
});
