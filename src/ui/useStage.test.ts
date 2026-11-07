import { describe, expect, it } from 'vitest';
import { measure } from './useStage.ts';

describe('canvas zoom', () => {
  it('fills the window, keeping 16:9', () => {
    expect(measure(1280, 720)).toMatchObject({ zoom: 2, width: 1280, height: 720, left: 0, top: 0 });
    expect(measure(1920, 1080)).toMatchObject({ zoom: 3, width: 1920, height: 1080 });
    expect(measure(1600, 900)).toMatchObject({ width: 1600, height: 900, left: 0, top: 0 });
    // A window a bit wider than 16:9 (a laptop browser): full height, thin bars at the sides.
    expect(measure(1440, 774)).toMatchObject({ width: 1376, height: 774, left: 32, top: 0 });
  });
  it('scales to fit below 2× (1024×768)', () => {
    const s = measure(1024, 768);
    expect(s.width).toBe(1024);
    expect(s.zoom).toBeCloseTo(1.6);
  });
  it('puts the canvas at the top in portrait', () => {
    const s = measure(768, 1024);
    expect(s.portrait).toBe(true);
    expect(s.top).toBe(0);
    expect(s.width).toBe(768);
  });
});
