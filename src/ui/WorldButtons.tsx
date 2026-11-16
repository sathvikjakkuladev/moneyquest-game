import { canEnter } from '../core/unlocks.ts';
import { HUB, ZONES } from '../data/zones.ts';
import { useSlot } from '../state/save.ts';
import { useSession } from '../state/session.ts';

/** World map: a real button on each place (Tab/Enter and screen readers work). Choosing one
 *  teleports you to its waystone. */
export function WorldButtons() {
  const s = useSlot();
  const go = useSession((x) => x.go);
  if (!s) return null;
  const cleared = s.progress.zonesCleared;
  const pos = ([x, y]: [number, number]) => ({ left: `${(x / 640) * 100}%`, top: `${(y / 360) * 100}%` });
  return (
    <nav aria-label="World map" className="absolute inset-0">
      <button className="btn pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2" style={pos(HUB.at)} onClick={() => go({ kind: 'room', zone: HUB.id, entry: 'arrival' })}>🏰 {HUB.name}</button>
      {ZONES.map((z) => {
        const done = cleared.includes(z.id);
        const open = canEnter(z.id, cleared, z.bonus, s.moneyCheck.post !== null);
        const label = open ? (z.topic === 'mixed' ? 'Every topic' : z.topic) : z.bonus ? 'opens after six bosses and Money Check 2' : 'locked';
        return (
          <button key={z.id} disabled={!open} style={pos(z.at)} aria-label={`${z.name}, ${done ? 'cleared, ' : ''}${label}`}
            className={`btn pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center px-2 py-1 leading-tight ${open ? '' : 'btn-locked'}`}
            onClick={() => go({ kind: 'room', zone: z.id, entry: 'arrival' })}>
            <span className="text-lg">{open ? (done ? '✓ ' : '★ ') : '🔒 '}{z.name}</span>
            <span className="text-lg font-normal">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
