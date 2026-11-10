// World mode on the Worker side: switching it on or off live, the world leaderboard, and the
// once-across-all-devices check for printed reward cards.
import { MAX_SHARDS, worldName } from '../../src/net/world.ts';
import { normalize } from '../../src/rewards/redeem.ts';
import { parseCode } from '../../src/rewards/rewardCodes.ts';
import { roomAdmin } from './classes.ts';
import type { Env } from './env.ts';
import { clientIp, HttpError, readJson, str } from './http.ts';
import { hit, limitFor, LIMITS, lockedFor } from './limits.ts';
import type { WorldAdmin } from './WorldScreen.ts';

/**
 * World mode changed for a whole class (memberId null) or one student. The class room tells the
 * games at once; when it's switched off, their world sockets on the screens they're on are closed too.
 */
export async function setWorld(env: Env, classId: string, memberId: string | null, on: boolean): Promise<void> {
  const r = (await roomAdmin(env, classId, { kind: 'world', memberId, on })) as { screens?: string[] } | null;
  if (on || !env.WORLD) return;
  const cmd: WorldAdmin = memberId ? { kind: 'kick', memberId } : { kind: 'kick', classId };
  await Promise.all((r?.screens ?? []).flatMap((s) => Array.from({ length: MAX_SHARDS }, (_, i) => worldAdmin(env, `${s}#${i}`, cmd))));
}

async function worldAdmin(env: Env, name: string, cmd: WorldAdmin): Promise<void> {
  try {
    await env.WORLD.get(env.WORLD.idFromName(name)).fetch('https://world/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  } catch (e) {
    console.error('world admin', e);
  }
}

export const WORLD_BOARD_SIZE = 10;

/** Top 10 by coins earned across every class with world mode on, by world name, plus your rank. */
export async function worldBoardFor(env: Env, member: { id: string; class_id: string }) {
  const on = await env.DB.prepare('SELECT c.world_mode, m.world_muted FROM members m JOIN classes c ON c.id = m.class_id WHERE m.id = ?').bind(member.id).first<{ world_mode: number; world_muted: number }>();
  if (!on?.world_mode || on.world_muted) return null;
  const eligible = `FROM members m JOIN classes c ON c.id = m.class_id LEFT JOIN progress p ON p.member_id = m.id WHERE c.world_mode = 1 AND m.world_muted = 0`;
  const { results } = await env.DB.prepare(`SELECT m.id, m.public_name, COALESCE(p.coins_earned, 0) AS coins ${eligible} ORDER BY coins DESC, m.id LIMIT ?`)
    .bind(WORLD_BOARD_SIZE).all<{ id: string; public_name: string; coins: number }>();
  const mine = await env.DB.prepare('SELECT COALESCE(coins_earned, 0) AS coins FROM progress WHERE member_id = ?').bind(member.id).first<{ coins: number }>();
  const coins = mine?.coins ?? 0;
  const ahead = await env.DB.prepare(`SELECT COUNT(*) AS n ${eligible} AND COALESCE(p.coins_earned, 0) > ?`).bind(coins).first<{ n: number }>();
  return { top: results.map((r) => ({ name: worldName(r.id, r.public_name), coins: r.coins })), me: { rank: (ahead?.n ?? 0) + 1, coins } };
}

/**
 * A printed reward card, checked once across all devices. The code is checked with the same
 * (unchanged) checker the game uses, so made-up codes can't fill the table; only the code and the
 * time are stored. Wrong codes count toward the same per-IP limit as wrong class codes.
 */
export async function redeemCode(req: Request, env: Env, now: number) {
  const key = `join:${clientIp(req)}`;
  if (await lockedFor(env.DB, key, now)) throw new HttpError(429, 'slow-down', 'Too many tries. Wait a few minutes and try again.');
  const p = parseCode(normalize(str(await readJson(req), 'code', 40)));
  if (!p.ok) {
    await hit(env.DB, key, now, limitFor(env, LIMITS.join));
    throw new HttpError(400, p.reason, 'That isn’t a MoneyQuest card code.');
  }
  try {
    await env.DB.prepare('INSERT INTO redemptions (code, redeemed_at) VALUES (?, ?)').bind(p.code, now).run();
  } catch {
    throw new HttpError(409, 'used', 'This card has already been used.');
  }
  return { ok: true, code: p.code, reward: p.reward };
}
