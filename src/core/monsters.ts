// Monster definitions built from src/data/monster_attacks.json (the only source of monster data)
// plus the effect rules in src/data/effectRules.ts.

import attacks from '../data/monster_attacks.json';
import type { EffectRule } from '../data/effectRules.ts';
import { EFFECT_RULES } from '../data/effectRules.ts';

interface RawAttack { attack: string; does: string; effect: string; damage: number }
interface RawMonster extends RawAttack { monster: string; type: 'regular' | 'boss'; lesson?: string; second_attack?: RawAttack }

export interface Attack { name: string; does: string; effectText: string; damage: number; rule: EffectRule }
export interface MonsterDef { id: string; name: string; zone: string; boss: boolean; lesson?: string; attacks: Attack[] }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(
  Object.entries(attacks as unknown as Record<string, RawMonster[]>).flatMap(([zone, list]) =>
    list.map((m) => {
      const boss = m.type === 'boss';
      const id = `${boss ? 'boss' : 'mon'}_${slug(m.monster)}`;
      const raw = m.second_attack ? [m, m.second_attack] : [m];
      const rules = EFFECT_RULES[id] ?? [];
      const def: MonsterDef = { id, name: m.monster, zone, boss, lesson: m.lesson, attacks: raw.map((a, i) => ({ name: a.attack, does: a.does, effectText: a.effect, damage: a.damage, rule: rules[i] ?? { kind: 'plain' } })) };
      return [id, def] as const;
    }),
  ),
);

export function monster(id: string): MonsterDef {
  const m = MONSTERS[id];
  if (!m) throw new Error(`Unknown monster ${id}`);
  return m;
}
export const zoneMonsters = (zone: string) => Object.values(MONSTERS).filter((m) => m.zone === zone);
export const zoneRegulars = (zone: string) => zoneMonsters(zone).filter((m) => !m.boss).map((m) => m.id);
