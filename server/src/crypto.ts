// Tokens and password hashing with WebCrypto (works the same in Workers and in Node for tests).

/** Cloudflare Workers' PBKDF2 refuses more than 100,000 iterations, so the pepper adds strength. */
export const PBKDF2_ITERATIONS = 100_000;

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A random secret token with a kind prefix: t_ for teacher sessions, m_ for student memberships. */
export const newToken = (kind: 't' | 'm') => `${kind}_${b64url(randomBytes(32))}`;

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** PBKDF2-SHA256, then (if a pepper is set) HMAC-SHA256 with the pepper. Returns hex. */
export async function hashPassword(password: string, saltB64: string, iterations: number, pepper = ''): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64url(saltB64) as BufferSource, iterations }, key, 256);
  if (!pepper) return hex(bits);
  const hk = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', hk, bits));
}

export const newSalt = () => b64url(randomBytes(16));

/** Compare without leaking where the strings differ. */
export function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** A random number in [0, 1) from crypto (for name choices). */
export const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
