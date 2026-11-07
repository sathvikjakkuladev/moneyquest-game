import { describe, expect, it } from 'vitest';
import { measure } from './useStage.ts';

describe('canvas zoom', () => {
  it('uses whole-number zoom when 2× or more fits', () => {
    expect(measure(1280, 720)).toMatchObject({ zoom: 2, width: 1280, height: 720, left: 0, top: 0 });
    expect(measure(1920, 1080)).toMatchObject({ zoom: 3, width: 1920, height: 1080 });
    expect(measure(1600, 900).zoom).toBe(2);
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
