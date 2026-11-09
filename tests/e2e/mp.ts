// Helpers for the multiplayer tests, which run against the local server (`npm run dev:all`, then
// MP_E2E=1 E2E_URL=http://localhost:5173 npx playwright test class-join presence safety).
import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

export const MP = 'http://localhost:8787';
export const ORIGIN = 'http://localhost:5173';
export type Net = {
  on: boolean; status: string; muted: boolean;
  people: { id: number; name: string; busy: boolean }[];
  remotes: { id: number; name: string; x: number; y: number; busy: boolean }[];
  says: Record<number, { k: string; i: number; at: number }>;
};

export async function api(method: string, path: string, body?: object, token?: string) {
  const r = await fetch(MP + path, {
    method,
    headers: { Origin: ORIGIN, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  expect(r.status, path).toBe(200);
  return r.json() as Promise<Record<string, unknown>>;
}

/** A teacher and a class with `n` students; returns the teacher's token, the class and the memberships. */
export async function makeClass(n: number) {
  const t = await api('POST', '/api/teacher/signup', { email: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}@school.test`, password: 'correct horse battery' });
  const teacher = t.token as string;
  const cls = (await api('POST', '/api/teacher/classes', { name: 'Room 7' }, teacher)).class as { id: string; code: string };
  const members = [];
  for (let i = 0; i < n; i++) {
    const o = await api('POST', '/api/join', { code: cls.code });
    const j = await api('POST', '/api/join/confirm', { code: cls.code, name: (o.choices as string[])[0] });
    members.push({ url: MP, classCode: cls.code, className: 'Room 7', token: j.token as string, publicName: j.publicName as string });
  }
  return { teacher, cls, members };
}

export function saveWith(nickname: string, online: object | null) {
  return JSON.stringify({
    version: 3,
    state: {
      version: 3, active: 0, slots: [{
        nickname, band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
        progress: { level: 2, xp: 120, coins: 50, coinsEarned: 50, defeated: [], zonesCleared: ['piggybank_village'], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
        inventory: { owned: ['hat-wizard'], hat: 'hat-wizard', pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
        moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true, playOffline: false }, online,
      }, null, null],
    },
  });
}

export const net = (p: Page) => p.evaluate(() => (window as unknown as { __mq: { net: () => Net } }).__mq.net());

/** A player in their own browser context, standing on a Piggybank Village screen with dialogue closed. */
export async function player(browser: Browser, nickname: string, online: object | null, screen: string, at: [number, number]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), saveWith(nickname, online));
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.evaluate(([screen, at]) => (window as unknown as { __mq: { session: () => { go: (r: object) => void } } }).__mq.session().go({ kind: 'room', zone: 'piggybank_village', screen, at }), [screen, at] as const);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mq: { where: () => { at: unknown } } }).__mq.where().at !== null)).toBe(true);
  const d = page.getByRole('dialog', { name: /says/ });
  await d.waitFor({ timeout: 4000 }).catch(() => {}); // the mentor's hello runs on the game's clock, so it can be late
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
  return { ctx, page, errors };
}
