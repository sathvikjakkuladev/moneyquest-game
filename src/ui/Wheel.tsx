// The Daily Wheel (Headmaster Goldwhisker by the fountain): one spin a day for coins.
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../audio.ts';
import { reducedMotion } from '../game/motion.ts';
import { canSpin, SEGMENTS, spin, today } from '../core/wheel.ts';
import { useSave, useSlot } from '../state/save.ts';

const N = SEGMENTS.length, SLICE = 360 / N, R = 140, SPIN_MS = 4200;

function slicePath(i: number): string {
  const a0 = ((i * SLICE - 90 - SLICE / 2) * Math.PI) / 180, a1 = (((i + 1) * SLICE - 90 - SLICE / 2) * Math.PI) / 180;
  return `M0,0 L${R * Math.cos(a0)},${R * Math.sin(a0)} A${R},${R} 0 0 1 ${R * Math.cos(a1)},${R * Math.sin(a1)} Z`;
}

export function Wheel() {
  const s = useSlot()!;
  const calm = reducedMotion(s.settings.reducedMotion);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const ready = canSpin(s, today());

  const go = () => {
    const r = spin(s, today(), Math.random);
    if (!r.ok) return;
    useSave.getState().edit(() => r.slot); // saved now: closing mid-spin keeps the prize, no re-roll
    // Land the chosen slice under the pointer at the top, after several turns, a little off-centre.
    const wobble = (Math.random() - 0.5) * SLICE * 0.6;
    const target = 360 * 6 - r.index * SLICE + wobble;
    setAngle((a) => a - (a % 360) + target);
    setSpinning(true);
    timer.current = setTimeout(() => (setSpinning(false), setResult(r.coins), sfx('coins')), calm ? 0 : SPIN_MS);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-lg">One free spin every day. Every slice wins coins!</p>
      <div className="relative" style={{ width: 2 * R + 20, height: 2 * R + 30 }}>
        {/* the pointer */}
        <svg className="absolute left-1/2 top-0 z-10 -translate-x-1/2" width="36" height="40" viewBox="0 0 36 40" aria-hidden="true">
          <path d="M18 38 L4 6 Q18 -2 32 6 Z" fill="#fff6dc" stroke="#1d1530" strokeWidth="4" strokeLinejoin="round" />
        </svg>
        <svg className="absolute left-0 top-[22px]" width={2 * R + 20} height={2 * R + 20} viewBox={`${-R - 10} ${-R - 10} ${2 * R + 20} ${2 * R + 20}`} role="img" aria-label={`A wheel with prizes of ${SEGMENTS.map((x) => x.coins).join(', ')} coins`}>
          <circle r={R + 8} fill="#1d1530" />
          <g style={{ transform: `rotate(${angle}deg)`, transition: spinning && !calm ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.12, 1)` : 'none' }}>
            {SEGMENTS.map((x, i) => (
              <g key={i}>
                <path d={slicePath(i)} fill={x.colour} stroke="#1d1530" strokeWidth="4" strokeLinejoin="round" />
                <g transform={`rotate(${i * SLICE}) translate(0 ${-R * 0.66})`}>
                  <text textAnchor="middle" dominantBaseline="middle" fontSize={x.coins >= 100 ? 26 : 30} fontWeight="700" fill="#1d1530" stroke="#fff6dc" strokeWidth="5" paintOrder="stroke" fontFamily="Fredoka, sans-serif">
                    {x.coins}
                  </text>
                </g>
              </g>
            ))}
            <circle r="26" fill="#ffd43b" stroke="#1d1530" strokeWidth="5" />
            <text textAnchor="middle" dominantBaseline="central" fontSize="24" aria-hidden="true">🪙</text>
          </g>
        </svg>
      </div>
      <p className="min-h-8 text-2xl font-bold" role="status" aria-live="polite">
        {spinning ? 'Spinning…' : result !== null ? <span className="t-good">You won {result} coins!</span> : ready ? '' : 'You’ve had today’s spin. Come back tomorrow!'}
      </p>
      <button className="btn px-10 text-2xl" onClick={go} disabled={!ready || spinning} autoFocus>
        {ready ? 'Spin!' : spinning ? 'Spinning…' : 'Come back tomorrow'}
      </button>
    </div>
  );
}
