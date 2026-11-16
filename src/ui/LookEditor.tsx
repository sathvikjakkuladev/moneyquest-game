import type { Look } from '../core/look.ts';
import { costumeSource, costumeUnlocked, LOOK_KEYS } from '../core/look.ts';
import { AVATAR } from '../data/v2.ts';
import { AvatarView } from './AvatarView.tsx';

const title = (s: string) => s.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
/** A swatch colour for each costume set (the cape colour it turns into). */
const COSTUME_SWATCH: Record<string, string> = { 'arcane-blue': '#3f51c7', 'ember-knight': '#d9480f', 'frost-guard': '#74c0fc', 'forest-ranger': '#2f9e44', 'royal-amethyst': '#7048e8', sunburst: '#f59f00', 'shadow-rogue': '#343a40', 'coral-tide': '#f06595' };

function Swatches({ label, value, options, onPick }: { label: string; value: number; options: { name: string; colour?: string; locked?: string }[]; onPick: (i: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-lg font-bold">{label}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o, i) => (
          <button key={o.name} type="button" role="radio" aria-checked={value === i} disabled={!!o.locked} title={o.locked ?? o.name}
            aria-label={`${o.name}${o.locked ? `, locked: ${o.locked}` : ''}`}
            className={`btn flex min-w-12 items-center justify-center gap-1 px-2 py-1 ${value === i ? '' : 'btn-quiet'} ${o.locked ? 'btn-locked' : ''}`}
            onClick={() => onPick(i)}>
            {o.colour && <span aria-hidden className="inline-block h-7 w-7 rounded-full border-2 border-frame" style={{ background: o.colour }} />}
            {(!o.colour || o.locked) && <span className="text-lg">{o.locked ? '🔒' : o.name}</span>}
            {value === i && <span aria-hidden>✓</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** The character creator: skin, eyes, hair, face and costume colour. `cleared` decides which costume sets are earned. */
export function LookEditor({ look, hat, cleared, onChange }: { look: Look; hat: string | null; cleared: readonly string[]; onChange: (l: Look) => void }) {
  const set = (k: (typeof LOOK_KEYS)[number]) => (i: number) => onChange({ ...look, [k]: i });
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex shrink-0 flex-col items-center justify-end self-center rounded-md bg-paper-dark px-4 pt-2 sm:self-start">
        <AvatarView look={look} hat={hat} tall={120} label="Your character" />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <Swatches label="Skin" value={look.skin} onPick={set('skin')} options={AVATAR.skin.map((c, i) => ({ name: `Skin tone ${i + 1}`, colour: c }))} />
        <Swatches label="Hair" value={look.hair} onPick={set('hair')} options={AVATAR.hairStyles.map((n) => ({ name: title(n) }))} />
        <Swatches label="Hair colour" value={look.hairColour} onPick={set('hairColour')} options={AVATAR.hairColours.map((c) => ({ name: title(c.name), colour: c.hex }))} />
        <Swatches label="Eyes" value={look.eyes} onPick={set('eyes')} options={AVATAR.eyes.map((c) => ({ name: title(c.name), colour: c.hex }))} />
        <Swatches label="Face" value={look.face} onPick={set('face')} options={AVATAR.faces.map((n) => ({ name: title(n) }))} />
        <Swatches label="Costume colours" value={look.costume} onPick={set('costume')}
          options={AVATAR.costume.sets.map((s, i) => ({ name: s.name, colour: COSTUME_SWATCH[s.id], locked: costumeUnlocked(i, cleared) ? undefined : `beat the boss of ${costumeSource(i)?.name ?? 'a district'}` }))} />
      </div>
    </div>
  );
}
