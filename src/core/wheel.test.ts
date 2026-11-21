import { describe, expect, it } from 'vitest';
import { newSlot } from './save.ts';
import { canSpin, pickSegment, SEGMENTS, spin, today } from './wheel.ts';

describe('Daily Wheel', () => {
  it('spins once a day and adds the prize to the wallet (not to coins earned)', () => {
    const s = newSlot('Ann', 'K-5', 'A');
    const r = spin(s, '2026-11-21', () => 0.5);
    if (!r.ok) throw new Error('no spin');
    expect(r.slot.progress.coins).toBe(SEGMENTS[r.index]!.coins);
    expect(r.slot.progress.coinsEarned).toBe(0);
    expect(spin(r.slot, '2026-11-21', () => 0.5).ok).toBe(false); // again today: no
    expect(spin(r.slot, '2026-11-20', () => 0.5).ok).toBe(false); // clock set back: no
    expect(canSpin(r.slot, '2026-11-22')).toBe(true); // tomorrow: yes
  });
  it('small prizes are common and the 100-coin jackpot is rare', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const wins = Array.from({ length: 20_000 }, () => SEGMENTS[pickSegment(rng)]!.coins);
    const share = (c: number) => wins.filter((w) => w === c).length / wins.length;
    expect(share(5)).toBeGreaterThan(0.3);
    expect(share(100)).toBeLessThan(0.02);
    expect(share(100)).toBeGreaterThan(0);
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
