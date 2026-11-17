// Boss-fight demo (built only with VITE_BOSS_DEMO=1, for the shared preview page): pick any boss or
// monster and fight it straight away, with every spell unlocked. Never part of the real game build.
import { MONSTERS } from '../core/monsters.ts';
import { newSlot } from '../core/save.ts';
import type { SpellId } from '../core/spells.ts';
import { SPELLS } from '../core/spells.ts';
import { DEFAULT_LOOK } from '../core/look.ts';
import { useSave } from '../state/save.ts';
import { useSession } from '../state/session.ts';

export const BOSS_DEMO = import.meta.env.VITE_BOSS_DEMO === '1';
const ALL = Object.keys(SPELLS) as SpellId[];

function fight(id: string) {
  const save = useSave.getState();
  if (!save.slots[0]) {
    const s = newSlot('You', '6-8', 'A', new Date(), DEFAULT_LOOK);
    save.create(0, { ...s, progress: { ...s.progress, level: 5, xp: 0, spells: ALL, spell: 'budget_beam' } });
  } else if (save.active !== 0) useSave.setState({ active: 0 });
  const ses = useSession.getState();
  ses.setScreen('play');
  ses.fight(id, { kind: 'room', zone: 'ledgerhold', screen: '2-1' });
}

export function BossDemo() {
  const bosses = Object.values(MONSTERS).filter((m) => m.boss);
  const others = Object.values(MONSTERS).filter((m) => !m.boss);
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="panel flex max-h-full w-[min(56rem,100%)] flex-col gap-3 overflow-auto p-4">
        <h1 className="text-3xl font-bold">Boss fights</h1>
        <p className="text-lg">Every attack has its own effect. All spells are unlocked: switch with ◂ ▸ (or Q / E). Big spells need 2–3 right answers, and the monster hits you while you charge. A wrong answer keeps your charge.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {bosses.map((m) => (
            <button key={m.id} className="btn flex flex-col items-start p-2 text-left" onClick={() => fight(m.id)}>
              <strong className="text-lg">{m.name}</strong>
              <span className="text-sm opacity-80">{m.attacks.map((a) => a.name).join(' · ')}</span>
            </button>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-lg">Regular monsters</summary>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {others.map((m) => (
              <button key={m.id} className="btn btn-quiet flex flex-col items-start p-2 text-left" onClick={() => fight(m.id)}>
                <strong>{m.name}</strong>
                <span className="text-sm opacity-80">{m.attacks[0]?.name}</span>
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
