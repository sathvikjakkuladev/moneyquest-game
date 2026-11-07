import { zoneOpen } from '../core/progression.ts';
import { ACADEMY_AT, ZONES } from '../data/zones.ts';
import { useSlot } from '../state/save.ts';
import { useSession } from '../state/session.ts';

/** Island buttons on the world map (real buttons: Tab/Enter and screen readers work). */
export function WorldButtons() {
  const s = useSlot();
  const go = useSession((x) => x.go);
  if (!s) return null;
  const pos = ([x, y]: [number, number]) => ({ left: `${(x / 640) * 100}%`, top: `${(y / 360) * 100}%` });
  return (
    <nav aria-label="World map" className="absolute inset-0">
      <button className="btn pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2" style={pos(ACADEMY_AT)} onClick={() => go({ kind: 'room', zone: 'coin_academy', entry: 'from_world_map' })}>🏰 Coin Academy</button>
      {ZONES.map((z) => {
        const open = z.ready && zoneOpen(z.id, s.progress.zonesCleared);
        const done = s.progress.zonesCleared.includes(z.id);
        return (
          <button key={z.id} disabled={!open} style={pos(z.at)} className={`btn pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 text-lg ${open ? '' : 'btn-locked'}`} onClick={() => go({ kind: 'room', zone: z.id, entry: 'from_world_map' })} aria-label={open ? `${z.name}${done ? ', cleared' : ''}` : `${z.name}, ${z.ready ? 'locked' : 'coming soon'}`}>
            {open ? (done ? '✓ ' : '★ ') : '🔒 '}{z.name}
          </button>
        );
      })}
    </nav>
  );
}
