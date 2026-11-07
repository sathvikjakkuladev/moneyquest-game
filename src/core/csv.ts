// Money Check results as CSV, for the DECA impact report. Only nicknames: no personal data.
import type { Slot } from './save.ts';
import { TOPICS } from './types.ts';

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

export const CSV_HEADER = ['nickname', 'test', 'date', 'band', 'form', ...TOPICS, 'total', 'improvement'];

/** One row per Money Check taken, for every save slot on this device. */
export function resultsCsv(slots: readonly (Slot | null)[]): string {
  const rows: (string | number)[][] = [CSV_HEADER];
  for (const s of slots) {
    if (!s) continue;
    const { pre, post } = s.moneyCheck;
    for (const [test, r] of [['pre', pre], ['post', post]] as const) {
      if (!r) continue;
      const imp = test === 'post' && pre ? r.total - pre.total : '';
      rows.push([s.nickname, test, r.date, r.band, r.form, ...TOPICS.map((t) => r.perTopic[t]), r.total, imp]);
    }
  }
  return toCsv(rows);
}
