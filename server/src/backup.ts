// Save codes. A player can back up their save slot without an account: the server makes a code from
// friendly words and digits (SUNNY-OTTER-482173), keeps the save under a keyed hash of that code, and
// gives the save back to whoever types the code. The game never sends the nickname or the class
// membership; this file strips them again in case it ever did.
import { NAME_ADJECTIVES, NAME_ANIMALS } from '../../src/net/names.ts';
import { cryptoRandom, sha256 } from './crypto.ts';
import type { Env } from './env.ts';
import { clientIp, HttpError, readJson } from './http.ts';
import { hit, limitFor, LIMITS } from './limits.ts';

/** A backed-up save (a whole slot as JSON) may be up to this size. */
export const MAX_SAVE = 96 * 1024;

const pick = (xs: readonly string[]) => xs[Math.floor(cryptoRandom() * xs.length)]!;
export const newCode = () => `${pick(NAME_ADJECTIVES)}-${pick(NAME_ANIMALS)}-${String(Math.floor(cryptoRandom() * 1_000_000)).padStart(6, '0')}`.toUpperCase();
/** Codes are typed by kids: ignore case, spaces and dashes. */
export const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeHash = (env: Env, code: string) => sha256(`save:${env.PEPPER ?? ''}:${normCode(code)}`);

function cleanSave(body: Record<string, unknown>): string {
  const version = body.version, slot = body.slot as Record<string, unknown> | null;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > 99) throw new HttpError(400, 'bad-request', 'Bad request.');
  if (!slot || typeof slot !== 'object' || Array.isArray(slot) || typeof slot.progress !== 'object') throw new HttpError(400, 'bad-request', 'Bad request.');
  const data = JSON.stringify({ version, slot: { ...slot, nickname: '', online: null, backup: null } });
  if (data.length > MAX_SAVE) throw new HttpError(413, 'too-large', 'That save is too big to back up.');
  return data;
}

/** POST /api/backup { version, slot } → { code }: a new save code for this save. */
export async function createBackup(req: Request, env: Env, now: number) {
  if (!(await hit(env.DB, `backup:${clientIp(req)}`, now, limitFor(env, LIMITS.backup)))) throw new HttpError(429, 'slow-down', 'Too many tries. Wait a few minutes and try again.');
  const data = cleanSave(await readJson(req, MAX_SAVE + 1024));
  for (let tries = 0; tries < 5; tries++) {
    const code = newCode();
    try {
      await env.DB.prepare('INSERT INTO save_codes (id, code_hash, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), await codeHash(env, code), data, now, now).run();
      return { code };
    } catch (e) {
      if (!String(e).includes('UNIQUE')) throw e; // the same code twice: pick another
    }
  }
  throw new HttpError(503, 'busy', 'Try again in a moment.');
}

/** PUT /api/backup { code, version, slot }: update the backup (the game does this as you play). */
export async function updateBackup(req: Request, env: Env, now: number) {
  if (!(await hit(env.DB, `backup-put:${clientIp(req)}`, now, limitFor(env, LIMITS.backupPut)))) throw new HttpError(429, 'slow-down', 'Too many tries. Wait a few minutes and try again.');
  const body = await readJson(req, MAX_SAVE + 1024);
  if (typeof body.code !== 'string' || body.code.length > 40) throw new HttpError(400, 'bad-request', 'Bad request.');
  const r = await env.DB.prepare('UPDATE save_codes SET data = ?, updated_at = ? WHERE code_hash = ?').bind(cleanSave(body), now, await codeHash(env, body.code)).run();
  if (!r.meta.changes) throw new HttpError(404, 'no-code', 'That save code doesn’t exist any more.');
  return { ok: true };
}

/** POST /api/backup/restore { code } → { version, slot }. Few tries per IP, so codes can't be guessed. */
export async function restoreBackup(req: Request, env: Env, now: number) {
  const body = await readJson(req);
  if (typeof body.code !== 'string' || body.code.length > 40) throw new HttpError(400, 'bad-request', 'Bad request.');
  if (!(await hit(env.DB, `restore:${clientIp(req)}`, now, limitFor(env, LIMITS.restore)))) throw new HttpError(429, 'slow-down', 'Too many tries. Wait an hour and try again.');
  const row = await env.DB.prepare('SELECT data FROM save_codes WHERE code_hash = ?').bind(await codeHash(env, body.code)).first<{ data: string }>();
  if (!row) throw new HttpError(404, 'no-code', 'We couldn’t find that save code. Check each word and number.');
  await env.DB.prepare('UPDATE save_codes SET updated_at = ? WHERE code_hash = ?').bind(now, await codeHash(env, body.code)).run();
  return JSON.parse(row.data) as { version: number; slot: unknown };
}
