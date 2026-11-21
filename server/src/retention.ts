// Scheduled clean-up (cron, daily): data is kept only as long as it's needed (PLAN.md §10).

export const DAY = 24 * 60 * 60_000;
export const CLASS_IDLE_MS = 365 * DAY; // classes idle for 12 months (decided 2026-11-07)
export const REPORT_MS = 90 * DAY;      // reports after 90 days
export const GUEST_IDLE_MS = 90 * DAY;  // open-world guests not seen for 90 days
export const BACKUP_IDLE_MS = 400 * DAY; // save codes not used for 400 days (over a school year and a summer)

/** Delete idle classes (and with them their members, progress, goals and reports), old reports,
 *  expired sessions, stale rate-limit rows, and teacher accounts idle 12 months with no classes. */
export async function purge(db: D1Database, now: number): Promise<Record<string, number>> {
  const r = await db.batch([
    db.prepare('DELETE FROM classes WHERE last_active < ?').bind(now - CLASS_IDLE_MS),
    db.prepare('DELETE FROM reports WHERE created_at < ?').bind(now - REPORT_MS),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM attempts WHERE locked_until < ? AND window_start < ?').bind(now, now - DAY),
    db.prepare('DELETE FROM teachers WHERE COALESCE(last_login, created_at) < ? AND id NOT IN (SELECT teacher_id FROM classes)').bind(now - CLASS_IDLE_MS),
    db.prepare('DELETE FROM guests WHERE last_seen < ? AND blocked = 0').bind(now - GUEST_IDLE_MS),
    db.prepare('DELETE FROM save_codes WHERE updated_at < ?').bind(now - BACKUP_IDLE_MS),
  ]);
  const [classes, reports, sessions, attempts, teachers, guests, backups] = r.map((x) => x.meta.changes ?? 0);
  return { classes: classes!, reports: reports!, sessions: sessions!, attempts: attempts!, teachers: teachers!, guests: guests!, backups: backups! };
}
