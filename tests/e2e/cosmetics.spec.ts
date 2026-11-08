// Cosmetics show up as soon as they're equipped: buying in the Shop or switching in the Bag while
// standing in a room puts the hat on the wizard and brings the pet along, without changing screens.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Layer { key: string; depth: number; x: number; y: number; w: number; h: number }
interface Hooks {
  session: () => { go: (r: object) => void; setPanel: (p: string | null) => void };
  where: () => { screen: string | null; at: [number, number] | null };
  teleport: (x: number, y: number) => void;
  layers: () => Layer[];
}
type W = { __mq: Hooks };
const mq = <T,>(page: Page, fn: (h: Hooks) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__mq)`) as Promise<T>;

const save = JSON.stringify({
  version: 2,
  state: {
    version: 2, active: 0, slots: [{
      nickname: 'Style', band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
      progress: { level: 2, xp: 120, coins: 400, defeated: [], zonesCleared: ['piggybank_village'], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
      inventory: { owned: [], hat: null, pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
      moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true },
    }, null, null],
  },
});

/** What's drawn on the player: the hat texture and the pet's layer, if any. */
const look = (page: Page) =>
  mq(page, (h) => {
    const ls = h.layers();
    const hat = ls.find((l) => l.key.startsWith('hat:'));
    const pet = ls.find((l) => l.key === 'v1px:pets');
    return { hat: hat?.key ?? null, pet: pet ? { x: pet.x + pet.w / 2, y: pet.y + pet.h } : null };
  });

test('a hat and pet appear as soon as they are bought or equipped, and the pet follows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();

  await page.evaluate(() => (window as unknown as W).__mq.session().go({ kind: 'room', zone: 'piggybank_village', screen: 'plaza' }));
  await expect.poll(() => mq(page, (h) => h.where().at !== null)).toBe(true);
  const hello = page.getByRole('dialog', { name: /says/ });
  await page.waitForTimeout(500);
  while (await hello.isVisible()) await hello.getByRole('button', { name: /Next|OK/ }).click();
  expect(await look(page)).toEqual({ hat: null, pet: null });

  // Buy in the Shop: each purchase is equipped at once and shows up in the room behind the panel.
  await page.evaluate(() => (window as unknown as W).__mq.session().setPanel('shop'));
  const shop = page.getByRole('dialog', { name: /Shop/ });
  await shop.getByRole('button', { name: '🪙 70' }).click(); // Banker Top Hat
  await expect.poll(async () => (await look(page)).hat).toBe('hat:top');
  await shop.getByRole('button', { name: '🪙 60' }).click(); // Coin Sprite (its art isn't preloaded)
  await expect.poll(async () => (await look(page)).pet !== null).toBe(true);
  await shop.getByRole('button', { name: 'Close' }).click();

  // The pet trails the player when they walk.
  await page.evaluate(() => (window as unknown as W).__mq.teleport(200, 300));
  await page.waitForTimeout(100);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowRight');
  const at = (await mq(page, (h) => h.where().at))!;
  const pet = (await look(page)).pet!;
  expect(at[0]).toBeGreaterThan(260);
  expect(pet.x).toBeGreaterThan(210); // it came along
  expect(pet.x).toBeLessThan(at[0]); // a few steps behind

  // Switch in the Bag: take the hat off, then put it back on.
  await page.evaluate(() => (window as unknown as W).__mq.session().setPanel('bag'));
  const bag = page.getByRole('dialog', { name: 'Your bag' });
  await bag.getByRole('button', { name: /None/ }).first().click();
  await expect.poll(async () => (await look(page)).hat).toBe(null);
  await bag.getByRole('button', { name: /Banker Top Hat/ }).click();
  await expect.poll(async () => (await look(page)).hat).toBe('hat:top');
  await bag.getByRole('button', { name: /None/ }).nth(1).click();
  await expect.poll(async () => (await look(page)).pet).toBe(null);
  expect(errors).toEqual([]);
});
