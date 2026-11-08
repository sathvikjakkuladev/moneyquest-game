// Public names for multiplayer. Shared by the game and the server (no browser APIs here).
// Students never type a name others can see: it's built from these lists ("BraveOtter42") or picked
// from a list the teacher wrote. Every adjective + animal pair is friendly (none can be read as mean).

export const NAME_ADJECTIVES = [
  'Brave', 'Bright', 'Calm', 'Cheerful', 'Clever', 'Cozy', 'Eager', 'Friendly', 'Gentle', 'Glowing', 'Golden',
  'Happy', 'Jolly', 'Kind', 'Lucky', 'Merry', 'Mighty', 'Noble', 'Patient', 'Proud', 'Quick', 'Shiny', 'Silver',
  'Starry', 'Steady', 'Sunny', 'Swift', 'Thrifty', 'Witty', 'Wise',
] as const;

export const NAME_ANIMALS = [
  'Badger', 'Beaver', 'Bison', 'Bunny', 'Camel', 'Dolphin', 'Falcon', 'Fox', 'Gecko', 'Hedgehog', 'Heron', 'Koala',
  'Lemur', 'Llama', 'Lynx', 'Moose', 'Otter', 'Owl', 'Panda', 'Penguin', 'Puffin', 'Raccoon', 'Robin', 'Seal',
  'Sparrow', 'Squirrel', 'Tiger', 'Turtle', 'Walrus', 'Whale', 'Yak', 'Zebra',
] as const;

const ADJ = new Set<string>(NAME_ADJECTIVES);
const ANIMAL = new Set<string>(NAME_ANIMALS);
const pick = <T,>(xs: readonly T[], r: number) => xs[Math.min(xs.length - 1, Math.floor(r * xs.length))]!;

/** `rng` returns numbers in [0, 1). Numbers run 1–99. */
export function makeName(rng: () => number): string {
  return `${pick(NAME_ADJECTIVES, rng())}${pick(NAME_ANIMALS, rng())}${1 + Math.floor(rng() * 99)}`;
}

/** Is this exactly a generator name (an adjective, an animal and 1–99, nothing else)? */
export function isGeneratedName(s: string): boolean {
  const m = /^([A-Z][a-z]+)([A-Z][a-z]+)([1-9][0-9]?)$/.exec(s);
  return !!m && ADJ.has(m[1]!) && ANIMAL.has(m[2]!);
}

/** `n` different generated names that aren't taken yet. */
export function nameChoices(rng: () => number, taken: ReadonlySet<string>, n = 4): string[] {
  const out = new Set<string>();
  for (let tries = 0; out.size < n && tries < 500; tries++) {
    const name = makeName(rng);
    if (!taken.has(name)) out.add(name);
  }
  return [...out];
}

/**
 * Names on a teacher's list: letters, digits and single spaces, 2–16 characters (for example
 * "Owl 07"). Teachers write these; students only pick one.
 */
export const isListName = (s: string) => /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/.test(s) && s.length >= 2 && s.length <= 16;
