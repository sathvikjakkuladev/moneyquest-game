// Progress summaries from students' games, the weekly class goal, and the class leaderboard
// (coins earned, all-time; decided 2026-11-07). See src/net/progress.ts for what's uploaded.
import type { Summary } from '../../src/net/progress.ts';
import { MAX_GOAL_STEP, parseSummary, totalCorrect, weekOf } from '../../src/net/progress.ts';
import type { Member } from './classes.ts';
import { requireMember, roomAdmin } from './classes.ts';
import type { Env } from './env.ts';
import { HttpError, readJson } from './http.ts';
import { hit, limitFor, LIMITS } from './limits.ts';
import { worldBoardFor } from './world.ts';

export interface Goal { n: number; of: number }
export interface Board { top: { name: string; coins: number }[]; me: { rank: number; coins: number } | null }

export const BOARD_SIZE = 10;

export async function goalFor(env: Env, classId: string, now: number): Promise<Goal> {
  const r = await env.DB.prepare('SELECT c.goal_target AS of, COALESCE(g.correct, 0) AS n FROM classes c LEFT JOIN goal_weeks g ON g.class_id = c.id AND g.week = ? WHERE c.id = ?')
    .bind(weekOf(now), classId).first<Goal>();
  return r ?? { n: 0, of: 1 };
}

/** Top 10 by coins earned (ties by name), plus your own rank. Null when the teacher hid it. */
export async function boardFor(env: Env, classId: string, memberId: string | null): Promise<Board | null> {
  const c = await env.DB.prepare('SELECT leaderboard_hidden FROM classes WHERE id = ?').bind(classId).first<{ leaderboard_hidden: number }>();
  if (!c || c.leaderboard_hidden) return null;
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.public_name AS name, COALESCE(p.coins_earned, 0) AS coins FROM members m LEFT JOIN progress p ON p.member_id = m.id
     WHERE m.class_id = ? ORDER BY coins DESC, name`,
  ).bind(classId).all<{ id: string; name: string; coins: number }>();
  const i = results.findIndex((r) => r.id === memberId);
  return { top: results.slice(0, BOARD_SIZE).map((r) => ({ name: r.name, coins: r.coins })), me: i < 0 ? null : { rank: i + 1, coins: results[i]!.coins } };
}

/**
 * Save a student's progress summary. The goal counts the increase in their all-time correct answers
 * since the last upload, at most MAX_GOAL_STEP at a time; the first upload only sets the baseline,
 * so joining with old progress doesn't flood this week's goal, and a retried upload counts nothing.
 */
export async function uploadProgress(req: Request, env: Env, now: number) {
  const m = await requireMember(req, env);
  if (!(await hit(env.DB, `progress:${m.id}`, now, limitFor(env, LIMITS.progress)))) throw new HttpError(429, 'slow-down', 'Too many uploads. Try again later.');
  const s = parseSummary((await readJson(req)).summary);
  if (!s) throw new HttpError(400, 'bad-summary', 'Bad progress summary.');
  const total = totalCorrect(s);
  const prev = await env.DB.prepare('SELECT correct_total FROM progress WHERE member_id = ?').bind(m.id).first<{ correct_total: number }>();
  const step = prev ? Math.min(MAX_GOAL_STEP, Math.max(0, total - prev.correct_total)) : 0;
  await env.DB.batch([
    upsert(env, m, s, total, now),
    ...(step ? [env.DB.prepare('INSERT INTO goal_weeks (class_id, week, correct) VALUES (?, ?, ?) ON CONFLICT (class_id, week) DO UPDATE SET correct = correct + excluded.correct').bind(m.class_id, weekOf(now), step)] : []),
    env.DB.prepare('UPDATE members SET last_seen = ? WHERE id = ?').bind(now, m.id),
    env.DB.prepare('UPDATE classes SET last_active = ? WHERE id = ?').bind(now, m.class_id),
  ]);
  const goal = await goalFor(env, m.class_id, now);
  if (step) await roomAdmin(env, m.class_id, { kind: 'goal', ...goal });
  return { goal, counted: step };
}

function upsert(env: Env, m: Member, s: Summary, total: number, now: number) {
  const j = (v: unknown) => (v === null ? null : JSON.stringify(v));
  return env.DB.prepare(
    `INSERT INTO progress (member_id, level, xp, coins_earned, zones, accuracy, mc_form, mc_pre, mc_post, correct_total, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (member_id) DO UPDATE SET level = excluded.level, xp = excluded.xp, coins_earned = excluded.coins_earned, zones = excluded.zones,
       accuracy = excluded.accuracy, mc_form = excluded.mc_form, mc_pre = excluded.mc_pre, mc_post = excluded.mc_post, correct_total = excluded.correct_total, updated_at = excluded.updated_at`,
  ).bind(m.id, s.level, s.xp, s.coinsEarned, JSON.stringify(s.zones), JSON.stringify(s.accuracy), s.mcForm, j(s.mcPre), j(s.mcPost), total, now);
}

/** The class's leaderboard and goal, for the game (GET /api/class). */
export async function classInfo(req: Request, env: Env, now: number) {
  const m = await requireMember(req, env);
  const [goal, board, world] = await Promise.all([goalFor(env, m.class_id, now), boardFor(env, m.class_id, m.id), worldBoardFor(env, m)]);
  return { goal, board, worldBoard: world };
}
