// Monster data importer. The game reads monster data only from src/data/monster_attacks.json,
// and that file is generated here from two inputs:
//   ../MoneyQuest Assets/monsters/monster_attacks.json   (read-only) battle rules: effect text and damage
//   src/data/monster-roster.json                          the Vaultspire roster: names, which old monster
//                                                         each one takes its rules from, and draft text
// It fails loudly and writes nothing if the roster names an unknown monster.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, '..', 'MoneyQuest Assets', 'monsters', 'monster_attacks.json');
if (!existsSync(SOURCE)) {
  console.error(`Not found: ${SOURCE}. The asset pack sits next to the game folder on Sathvik's Mac and is not in the repo.`);
  process.exit(1);
}

interface Attack { attack: string; does: string; effect: string; damage: number }
interface Old extends Attack { monster: string; type: 'regular' | 'boss'; lesson?: string; second_attack?: Attack }
interface New { name: string; type: 'regular' | 'boss'; from: string; attack: string; does: string; lesson: string; second_attack?: { attack: string; does: string } }

const old = new Map((Object.values(JSON.parse(readFileSync(SOURCE, 'utf8')) as Record<string, Old[]>).flat()).map((m) => [m.monster, m]));
const roster = JSON.parse(readFileSync(join(root, 'src', 'data', 'monster-roster.json'), 'utf8')) as { districts: Record<string, New[]> };

const out: Record<string, unknown[]> = {};
const errors: string[] = [];
for (const [district, list] of Object.entries(roster.districts)) {
  out[district] = list.map((m) => {
    const src = old.get(m.from);
    if (!src) return void errors.push(`${m.name}: no monster called "${m.from}" in the asset pack`);
    if (src.type !== m.type) errors.push(`${m.name} is a ${m.type} but takes its rules from ${m.from}, a ${src.type}`);
    if (Boolean(src.second_attack) !== Boolean(m.second_attack)) errors.push(`${m.name}: ${m.from} has ${src.second_attack ? 'a' : 'no'} second attack, so the roster entry must ${src.second_attack ? '' : 'not '}have one`);
    return {
      monster: m.name, type: m.type, attack: m.attack, does: m.does, effect: src.effect, lesson: m.lesson, damage: src.damage, rules_from: m.from,
      ...(src.second_attack && m.second_attack ? { second_attack: { attack: m.second_attack.attack, does: m.second_attack.does, effect: src.second_attack.effect, damage: src.second_attack.damage } } : {}),
    };
  });
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
writeFileSync(join(root, 'src', 'data', 'monster_attacks.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`monsters: ${Object.values(out).flat().length} in ${Object.keys(out).length} places`);
