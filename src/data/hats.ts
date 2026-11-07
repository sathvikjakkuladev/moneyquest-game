// Hats as tiny pixel maps, drawn in code (the pack has no hat art). Each map is rows of palette
// characters ('.' is transparent). `sink` is how many pixels the hat sits down over the top of the
// head; the Laurel Wreath sits lower, as a band across the forehead.

export interface HatArt { rows: string[]; palette: Record<string, string>; sink: number }

const INK = '#2b1a10';

export const HAT_ART: Record<string, HatArt> = {
  // The reward hat from the printed Winner cards.
  laurel: {
    sink: 8,
    palette: { k: INK, g: '#2f9e44', G: '#69db7c', y: '#fcc419', Y: '#fff3bf' },
    rows: [
      '...k.k.k.k...k.k.k.k...',
      '..kGkGkGkGkkkGkGkGkGk..',
      '.kgGgGgGgGkYkGgGgGgGgk.',
      'kgGkgGkgGgkykgGgkGgkGgk',
      'kgk.kgk.kkk.kkk.kgk.kgk',
      '.k...k.............k.k.',
    ],
  },
  wizard: {
    sink: 4,
    palette: { k: INK, b: '#3b5bdb', B: '#748ffc', y: '#fcc419' },
    rows: [
      '.......kk.......',
      '......kBbk......',
      '......kBbk......',
      '.....kBbbbk.....',
      '.....kBbybk.....',
      '....kBbyyybk....',
      '....kBbbybbk....',
      '...kBbbbbbbbk...',
      '...kBbbbbbbbk...',
      '.kkkkkkkkkkkkkk.',
      'kbbbbbbbbbbbbbbk',
      '.kkkkkkkkkkkkkk.',
    ],
  },
  crown: {
    sink: 3,
    palette: { k: INK, y: '#fcc419', Y: '#fff3bf', r: '#e03131', c: '#4dabf7' },
    rows: [
      'k...k...k...k...k',
      'kk.kyk.kYk.kyk.kk',
      'kykyyykyyykyyykyk',
      'kyyyyyyyryyyyyyyk',
      'kyycyyyyyyyyycyyk',
      'kkkkkkkkkkkkkkkkk',
    ],
  },
  top: {
    sink: 3,
    palette: { k: INK, d: '#343a40', D: '#495057', r: '#c92a2a' },
    rows: [
      '...kkkkkkkkkk...',
      '...kDddddddddk..',
      '...kDddddddddk..',
      '...kDddddddddk..',
      '...kDddddddddk..',
      '...krrrrrrrrrk..',
      '.kkkkkkkkkkkkkk.',
      'kddddddddddddddk',
      '.kkkkkkkkkkkkkk.',
    ],
  },
};
