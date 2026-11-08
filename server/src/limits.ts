// Rate limits kept in D1 (`attempts`): login failures, sign-ups and class-code guesses.

export interface Limit { max: number; windowMs: number; lockMs: number }

export const LIMITS = {
  /** 5 wrong passwords in 15 minutes locks that email (and that IP) for 15 minutes. */
  login: { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  /** 5 teacher sign-ups per IP per hour. */
  signup: { max: 5, windowMs: 60 * 60_000, lockMs: 60 * 60_000 },
  /** 20 class-code tries per IP per 10 minutes (codes have 729 million combinations). */
  join: { max: 20, windowMs: 10 * 60_000, lockMs: 10 * 60_000 },
} satisfies Record<string, Limit>;

interface Row { count: number; window_start: number; locked_until: number }

/** Milliseconds until the key unlocks, or 0 if it isn't locked. */
export async function lockedFor(db: D1Database, key: string, now: number): Promise<number> {
  const r = await db.prepare('SELECT count, window_start, locked_until FROM attempts WHERE key = ?').bind(key).first<Row>();
  return r && r.locked_until > now ? r.locked_until - now : 0;
}

/** Count one attempt. Reaching `max` locks the key for `lockMs`; returns false if the attempt was over the limit. */
export async function hit(db: D1Database, key: string, now: number, limit: Limit): Promise<boolean> {
  const r = await db.prepare('SELECT count, window_start, locked_until FROM attempts WHERE key = ?').bind(key).first<Row>();
  if (r && r.locked_until > now) return false;
  const fresh = !r || now - r.window_start > limit.windowMs;
  const count = fresh ? 1 : r!.count + 1;
  const locked = count >= limit.max ? now + limit.lockMs : 0; // the attempt that reaches the limit still counts as allowed
  await db
    .prepare('INSERT INTO attempts (key, count, window_start, locked_until) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET count = ?2, window_start = ?3, locked_until = ?4')
    .bind(key, count, fresh ? now : r!.window_start, locked)
    .run();
  return count <= limit.max;
}

export async function clear(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM attempts WHERE key = ?').bind(key).run();
}
