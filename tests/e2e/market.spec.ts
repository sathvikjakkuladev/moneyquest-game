// The Stock Board: walk to the notice board in Ledgerhold's plaza, press Space, buy and sell
// pretend stocks with coins.
import { expect, test } from '@playwright/test';
import { saveWith } from './mp.ts';

type W = { __mq: { session: () => { go: (r: object) => void; panel: string | null }; teleport: (x: number, y: number) => void; save: () => { slots: { progress: { coins: number }; market: { holdings: Record<string, { shares: number }> } }[] } } };

test('the notice board opens the Stock Board, and stocks can be bought and sold with coins', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), saveWith('Trader', null));
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.evaluate(() => (window as unknown as W).__mq.session().go({ kind: 'room', zone: 'ledgerhold', screen: '1-1', at: [200, 150] }));
  const d = page.getByRole('dialog', { name: /says/ });
  await d.waitFor({ timeout: 4000 }).catch(() => {});
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
  await expect(page.getByText('Open the Stock Board')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Space');
  const board = page.getByRole('dialog', { name: 'Stock Board' });
  await expect(board).toBeVisible();
  await board.getByRole('button', { name: /^BOOK/ }).click();
  await board.getByRole('button', { name: /^Buy 1 for/ }).click();
  await expect(board.getByRole('status')).toContainText('You bought 1 BOOK');
  let save = await page.evaluate(() => (window as unknown as W).__mq.save().slots[0]!);
  expect(save.market.holdings.books!.shares).toBe(1);
  expect(save.progress.coins).toBeLessThan(50);
  await board.getByRole('button', { name: /^Sell 1 for/ }).click();
  await expect(board.getByRole('status')).toContainText('You sold 1 BOOK');
  save = await page.evaluate(() => (window as unknown as W).__mq.save().slots[0]!);
  expect(save.market.holdings.books).toBeUndefined();
  await page.screenshot({ path: 'test-results/stock-board.png' });
  expect(errors).toEqual([]);
});
