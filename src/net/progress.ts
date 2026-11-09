// The progress summary a class member's game uploads (the full save never leaves the device), and
// the server's strict check of it. Shared by the game and the server. Nothing in it is personal:
// level, XP, coins earned, zones cleared, accuracy per topic and Money Check scores.
import type { Band, Topic } from '../core/types.ts';
import { BANDS, TOPICS } from '../core/types.ts';
import { ZONES } from '../data/zones.ts';

export interface Accuracy { answered: number; correct: number }
export interface CheckSummary { date: string; band: Band; form: 'A' | 'B'; perTopic: Record<Topic, number>; total: number }
export interface Summary {
  level: number;
  xp: number;
  coinsEarned: number;
  zones: string[];
  accuracy: Partial<Record<Topic, Accuracy>>;
  mcForm: 'A' | 'B';
  mcPre: CheckSummary | null;
  mcPost: CheckSummary | null;
}

/** What a save slot uploads. */
export function summarize(s: {
  progress: { level: number; xp: number; coinsEarned: number; zonesCleared: string[] };
  questions: { accuracy: Partial<Record<Topic, Accuracy>> };
  moneyCheck: { firstForm: 'A' | 'B'; pre: CheckSummary | null; post: CheckSummary | null };
}): Summary {
  const pick = (r: CheckSummary | null): CheckSummary | null => (r ? { date: r.date, band: r.band, form: r.form, perTopic: { ...r.perTopic }, total: r.total } : null);
  const accuracy: Partial<Record<Topic, Accuracy>> = {};
  for (const t of TOPICS) {
    const a = s.questions.accuracy[t];
    if (a) accuracy[t] = { answered: a.answered, correct: a.correct };
  }
  return {
    level: s.progress.level, xp: s.progress.xp, coinsEarned: s.progress.coinsEarned,
    zones: [...s.progress.zonesCleared].sort(), accuracy,
    mcForm: s.moneyCheck.firstForm, mcPre: pick(s.moneyCheck.pre), mcPost: pick(s.moneyCheck.post),
  };
}

/** All-time correct answers in a summary (the class goal counts the increase between uploads). */
export const totalCorrect = (s: Pick<Summary, 'accuracy'>) => TOPICS.reduce((n, t) => n + (s.accuracy[t]?.correct ?? 0), 0);

// ---------- validation (server side) ----------

const ZONE_IDS = new Set(ZONES.map((z) => z.id));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const form = (v: unknown): v is 'A' | 'B' => v === 'A' || v === 'B';

function check(v: unknown): CheckSummary | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isObj(v.perTopic)) return undefined;
  const per = v.perTopic;
  if (typeof v.date !== 'string' || v.date.length > 40 || !/^\d{4}-\d{2}-\d{2}[0-9T:.\-+Z ]*$/.test(v.date)) return undefined;
  if (!(BANDS as readonly unknown[]).includes(v.band) || !form(v.form)) return undefined;
  if (Object.keys(per).length !== TOPICS.length || !TOPICS.every((t) => int(per[t], 0, 2))) return undefined;
  const sum = TOPICS.reduce((n, t) => n + (per[t] as number), 0);
  if (v.total !== sum) return undefined;
  return { date: v.date, band: v.band as Band, form: v.form, perTopic: Object.fromEntries(TOPICS.map((t) => [t, per[t]])) as Record<Topic, number>, total: sum };
}

/** A summary from a game, or null if anything is off (unknown keys are dropped, numbers bounded). */
export function parseSummary(v: unknown): Summary | null {
  if (!isObj(v)) return null;
  if (!int(v.level, 1, 999) || !int(v.xp, 0, 10_000_000) || !int(v.coinsEarned, 0, 10_000_000) || !form(v.mcForm)) return null;
  if (!Array.isArray(v.zones) || v.zones.length > ZONE_IDS.size || !v.zones.every((z) => typeof z === 'string' && ZONE_IDS.has(z))) return null;
  if (!isObj(v.accuracy) || !Object.keys(v.accuracy).every((k) => (TOPICS as readonly string[]).includes(k))) return null;
  const accuracy: Partial<Record<Topic, Accuracy>> = {};
  for (const t of TOPICS) {
    const a = v.accuracy[t];
    if (a === undefined) continue;
    if (!isObj(a) || !int(a.answered, 0, 1_000_000) || !int(a.correct, 0, a.answered as number)) return null;
    accuracy[t] = { answered: a.answered as number, correct: a.correct as number };
  }
  const pre = check(v.mcPre), post = check(v.mcPost);
  if (pre === undefined || post === undefined) return null;
  return { level: v.level, xp: v.xp, coinsEarned: v.coinsEarned, zones: [...new Set(v.zones as string[])].sort(), accuracy, mcForm: v.mcForm, mcPre: pre, mcPost: post };
}

/** The week a class goal counts in: that week's Monday (UTC), as YYYY-MM-DD. */
export function weekOf(now: number): string {
  const d = new Date(now);
  const back = (d.getUTCDay() + 6) % 7; // days since Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

/** Correct answers counted toward the goal in one upload, at most (guards against a doctored save). */
export const MAX_GOAL_STEP = 100;
