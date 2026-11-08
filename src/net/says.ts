// What players can "say" to classmates: emotes and preset phrases, built into the game. They travel
// as numbers (their index here) and reports store those numbers, so ONLY APPEND to these lists:
// never reorder, edit the meaning of, or remove an entry (retire one by leaving it out of PHRASE_GROUPS).
// DRAFT (AI-written, 2026-11-07): the user reviews the wording.

export interface Emote { e: string; label: string }

export const EMOTES: readonly Emote[] = [
  { e: '👋', label: 'Wave' },
  { e: '😀', label: 'Happy' },
  { e: '👍', label: 'Thumbs up' },
  { e: '🎉', label: 'Party' },
  { e: '😮', label: 'Wow' },
  { e: '🤔', label: 'Thinking' },
  { e: '💰', label: 'Money bag' },
  { e: '⭐', label: 'Star' },
];

export const PHRASES: readonly string[] = [
  'Hi!', // 0
  'Bye!',
  'Good luck!',
  'Good game!',
  'Thank you!',
  'You’re welcome!', // 5
  'Follow me!',
  'Wait for me!',
  'Over here!',
  'Let’s battle!',
  'I need help.', // 10
  'I can help!',
  'Yes',
  'No',
  'Maybe',
  'Nice!', // 15
  'Cool hat!',
  'Cool pet!',
  'Oops!',
  'Save before you spend!',
  'Needs before wants!', // 20
  'Make a budget!',
  'Interest makes money grow!',
  'I’m saving up for something!',
  'I beat a boss!',
  'Let’s go to the shop!', // 25
];

/** How the picker groups phrases (indexes into PHRASES). */
export const PHRASE_GROUPS: readonly { name: string; items: readonly number[] }[] = [
  { name: 'Hello', items: [0, 1, 2, 3, 4, 5] },
  { name: 'Play', items: [6, 7, 8, 9, 10, 11, 25] },
  { name: 'Answers', items: [12, 13, 14, 15, 16, 17, 18] },
  { name: 'Money', items: [19, 20, 21, 22, 23, 24] },
];

/** Seconds between says: the server allows one every 3 s (with a burst of 2). */
export const SAY_COOLDOWN_MS = 3000;
/** How long a speech bubble stays up. */
export const BUBBLE_MS = 4000;
/** The server remembers this many recent says per player, for reports. */
export const SAY_HISTORY = 10;

export type SayKind = 'e' | 'p';
export const sayValid = (k: unknown, i: unknown): boolean =>
  (k === 'e' || k === 'p') && typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < (k === 'e' ? EMOTES.length : PHRASES.length);
export const sayText = (k: SayKind, i: number): string => (k === 'e' ? EMOTES[i]?.e : PHRASES[i]) ?? '?';
