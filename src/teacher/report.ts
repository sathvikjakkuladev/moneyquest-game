// The class's Money Check data: the CSV export (the DECA impact data) and the averages on the
// dashboard. One CSV row per test taken, the same columns as the game's own export, with the
// student's public name: no real names exist anywhere in the system.
import { toCsv } from '../core/csv.ts';
import { TOPICS } from '../core/types.ts';
import type { CheckSummary } from '../net/progress.ts';

export interface StudentChecks { name: string; progress: { mcPre: CheckSummary | null; mcPost: CheckSummary | null } | null }

export const CLASS_CSV_HEADER = ['public_name', 'test', 'date', 'band', 'form', ...TOPICS, 'total', 'improvement'];

export function classCsv(students: readonly StudentChecks[]): string {
  const rows: (string | number)[][] = [CLASS_CSV_HEADER];
  for (const s of students) {
    const pre = s.progress?.mcPre ?? null, post = s.progress?.mcPost ?? null;
    for (const [test, r] of [['pre', pre], ['post', post]] as const) {
      if (!r) continue;
      rows.push([s.name, test, r.date, r.band, r.form, ...TOPICS.map((t) => r.perTopic[t]), r.total, test === 'post' && pre ? r.total - pre.total : '']);
    }
  }
  return toCsv(rows);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface ClassAverages {
  preCount: number; preAvg: number | null;
  postCount: number; postAvg: number | null;
  /** Students with both tests, and their average change: the fair before-and-after comparison. */
  matchedCount: number; matchedChange: number | null;
}

export function averages(students: readonly StudentChecks[]): ClassAverages {
  const pre = students.flatMap((s) => (s.progress?.mcPre ? [s.progress.mcPre.total] : []));
  const post = students.flatMap((s) => (s.progress?.mcPost ? [s.progress.mcPost.total] : []));
  const change = students.flatMap((s) => (s.progress?.mcPre && s.progress.mcPost ? [s.progress.mcPost.total - s.progress.mcPre.total] : []));
  return { preCount: pre.length, preAvg: mean(pre), postCount: post.length, postAvg: mean(post), matchedCount: change.length, matchedChange: mean(change) };
}
