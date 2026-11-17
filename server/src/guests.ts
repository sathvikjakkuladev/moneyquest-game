// The open world: a player who hasn't joined a class gets a guest token and a generated name, and
// can see and be seen by everyone in the world (other guests and classes with world mode on). Guests
// can only send emotes and preset phrases, like everyone else; reports about them go to the NHSQA
// admin view, which can block a guest from the open world.
import { SCREENS } from '../../src/net/protocol.ts';
import { makeName } from '../../src/net/names.ts';
import { MAX_SHARDS } from '../../src/net/world.ts';
import { cryptoRandom, newToken, sha256 } from './crypto.ts';
import type { Env } from './env.ts';
import { clientIp, HttpError } from './http.ts';
import { hit, limitFor, LIMITS } from './limits.ts';
import type { WorldAdmin } from './WorldScreen.ts';

/** Guests are told apart from class members by this prefix on their id inside world rooms. */
export const GUEST = 'g:';
export const isGuest = (memberId: string) => memberId.startsWith(GUEST);

/** POST /api/guest: a new guest token and name (a few per IP per hour, so nobody can fill the table). */
export async function createGuest(req: Request, env: Env, now: number) {
  if (!(await hit(env.DB, `guest:${clientIp(req)}`, now, limitFor(env, LIMITS.guest)))) throw new HttpError(429, 'slow-down', 'Too many tries. Wait a few minutes and try again.');
  const id = crypto.randomUUID();
  const token = newToken('m');
  const name = makeName(cryptoRandom);
  await env.DB.prepare('INSERT INTO guests (id, token_hash, public_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)').bind(id, await sha256(token), name, now, now).run();
  return { token, name };
}

/** The admin blocked a guest: close their world sockets on every screen at once. */
export async function kickGuest(env: Env, guestId: string): Promise<void> {
  if (!env.WORLD) return;
  const cmd: WorldAdmin = { kind: 'kick', memberId: GUEST + guestId };
  await Promise.all(
    SCREENS.flatMap((s) =>
      Array.from({ length: MAX_SHARDS }, async (_, i) => {
        try {
          await env.WORLD.get(env.WORLD.idFromName(`${s}#${i}`)).fetch('https://world/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
        } catch (e) {
          console.error('guest kick', e);
        }
      }),
    ),
  );
}
