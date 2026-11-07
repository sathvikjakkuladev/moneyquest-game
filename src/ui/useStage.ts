import { useEffect, useState } from 'react';

export const W = 640;
export const H = 360;

export interface Stage { left: number; top: number; width: number; height: number; zoom: number; portrait: boolean }

/**
 * Where the 640×360 canvas sits. Whole-number zoom (2× = 1280×720, 3× = 1920×1080), centred and
 * letterboxed. If even 2× doesn't fit (e.g. 1024×768), scale to fit and let CSS keep pixels sharp.
 * In portrait (iPad upright) the canvas goes to the top so menus can sit below it.
 */
export function measure(winW: number, winH: number): Stage {
  const portrait = winW / winH < 1.2;
  const room = portrait ? Math.min(winH * 0.55, (winW * H) / W) : winH; // leave space below in portrait
  const fit = Math.min(winW / W, room / H);
  const zoom = fit >= 2 ? Math.floor(fit) : fit;
  const width = Math.round(W * zoom), height = Math.round(H * zoom);
  return { left: Math.round((winW - width) / 2), top: portrait ? 0 : Math.round((winH - height) / 2), width, height, zoom, portrait };
}

export function useStage(): Stage {
  const [s, setS] = useState(() => measure(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const on = () => setS(measure(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return s;
}
