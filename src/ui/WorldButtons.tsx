import { canEnter, devMode } from '../core/unlocks.ts';
import { ACADEMY_AT, ZONES } from '../data/zones.ts';
import { useSlot } from '../state/save.ts';
import { useSession } from '../state/session.ts';

/** World map: real buttons on each island (Tab/Enter and screen readers work). Bonus islands are
 *  reached through the Crossroads portal ring, so their buttons only explain that. */
export function WorldButtons() {
  const s = useSlot();
  const go = useSession((x) => x.go);
  if (!s) return null;
  const cleared = s.progress.zonesCleared;
  const pos = ([x, y]: [number, number]) => ({ left: `${(x / 640) * 100}%`, top: `${(y / 360) * 100}%` });
  return (
    <nav aria-label="World map" className="absolute inset-0">
      <button className="btn pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2" style={pos(ACADEMY_AT)} onClick={() => go({ kind: 'room', zone: 'coin_academy', entry: 'from_world_map' })}>🏰 Coin Academy</button>
      {ZONES.map((z) => {
        const done = cleared.includes(z.id);
        const viaPortal = z.bonus && !devMode();
        const open = !viaPortal && canEnter(z.id, cleared, z.bonus);
        const label = z.bonus ? (canEnter(z.id, cleared, true) ? 'through the Crossroads portals' : 'opens after all six bosses') : open ? z.topic : 'locked';
        return (
          <button key={z.id} disabled={!open} style={pos(z.at)} aria-label={`${z.name}, ${done ? 'cleared, ' : ''}${label}`}
            className={`btn pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center px-2 py-1 leading-tight ${open ? '' : 'btn-locked'}`}
            onClick={() => go({ kind: 'room', zone: z.id, entry: z.bonus ? 'from_crossroads_observatory/portal_ring' : 'from_world_map' })}>
            <span className="text-lg">{open ? (done ? '✓ ' : '★ ') : z.bonus ? '🌀 ' : '🔒 '}{z.name}</span>
            <span className="text-base font-normal">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
