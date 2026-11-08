// Class codes: 6 characters that are easy to read aloud and copy from a board. No 0/O, 1/I/L or U/V
// mix-ups: the alphabet leaves out I, L, O, U, 0 and 1. Shared by the game and the server.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const CODE_LENGTH = 6;

/** A class code from random bytes (rejection sampling keeps every character equally likely). */
export function makeClassCode(randomBytes: (n: number) => Uint8Array): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < CODE_LENGTH) for (const b of randomBytes(16)) if (b < limit && out.length < CODE_LENGTH) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** What a student typed, tidied: upper case, with spaces and dashes removed. */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');

export const isClassCode = (s: string) => s.length === CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c));
