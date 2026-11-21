// Bix's gear: armor, wands and potions in the shop's second tab.
import { expect, test } from '@playwright/test';
import { saveWith } from './mp.ts';

type W = { __mq: { session: () => { setPanel: (p: string) => void }; save: () => { slots: { progress: { coins: number }; gear: { armor: string | null; potions: number } }[] } } };

test('armor and a potion can be bought in Bix’s shop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), saveWith('Knight', null));
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const d = page.getByRole('dialog', { name: /says/ });
  await d.waitFor({ timeout: 4000 }).catch(() => {});
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
  await page.evaluate(() => (window as unknown as W).__mq.session().setPanel('shop'));
  const shop = page.getByRole('dialog', { name: /Hats & Gear/ });
  await shop.getByRole('tab', { name: /Armor, wands/ }).click();
  await shop.getByRole('listitem').filter({ hasText: 'Leather Vest' }).getByRole('button', { name: '🪙 50' }).click();
  await expect(shop.getByRole('status')).toContainText('You bought the Leather Vest');
  await page.screenshot({ path: 'test-results/gear-shop.png' });
  // 50 coins spent on the vest: not enough left for a potion (30)? 0 left, so the potion button is disabled.
  await expect(shop.getByRole('button', { name: '🪙 30' })).toBeDisabled();
  const save = await page.evaluate(() => (window as unknown as W).__mq.save().slots[0]!);
  expect(save.progress.coins).toBe(0);
  expect(save.gear.armor).toBe('armor-leather');
  expect(errors).toEqual([]);
});
