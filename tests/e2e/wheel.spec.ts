// The Daily Wheel: talk to Headmaster Goldwhisker by the fountain, spin once, win coins; a second
// talk the same day says to come back tomorrow.
import { expect, test } from '@playwright/test';
import { saveWith } from './mp.ts';

type W = { __mq: { session: () => { go: (r: object) => void }; save: () => { slots: { progress: { coins: number }; daily: { spun: string | null } }[] } } };

test('the Headmaster’s Daily Wheel gives coins once a day', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), saveWith('Spinner', null));
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.evaluate(() => (window as unknown as W).__mq.session().go({ kind: 'room', zone: 'ledgerhold', screen: '1-1', at: [392, 262] }));
  const d = page.getByRole('dialog', { name: /says/ });
  await d.waitFor({ timeout: 4000 }).catch(() => {});
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
  await expect(page.getByText(/Talk to Headmaster/)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Space');
  while (!(await d.getByRole('button', { name: 'Spin the wheel!' }).isVisible())) await d.getByRole('button', { name: /Next/ }).click();
  await d.getByRole('button', { name: 'Spin the wheel!' }).click();
  const wheel = page.getByRole('dialog', { name: 'Daily Wheel' });
  await wheel.getByRole('button', { name: 'Spin!' }).click();
  await expect(wheel.getByRole('status')).toContainText(/You won \d+ coins!/, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/daily-wheel.png' });
  const won = Number((await wheel.getByRole('status').textContent())!.match(/\d+/)![0]);
  const save = await page.evaluate(() => (window as unknown as W).__mq.save().slots[0]!);
  expect(save.progress.coins).toBe(50 + won);
  expect(save.daily.spun).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(wheel.getByRole('button', { name: 'Come back tomorrow' })).toBeDisabled();
  await wheel.getByRole('button', { name: 'Close' }).click();
  // Talking again today: no wheel offered.
  await page.keyboard.press('Space');
  while (await d.getByRole('button', { name: /Next/ }).isVisible()) {
    if (await d.getByText('Come back tomorrow for another').isVisible()) break;
    await d.getByRole('button', { name: /Next/ }).click();
  }
  await expect(d.getByText(/had your spin on the Daily Wheel today/)).toBeVisible();
  expect(errors).toEqual([]);
});
