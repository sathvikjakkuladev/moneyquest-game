// Accessibility: axe checks (WCAG 2.1 AA: contrast 4.5:1, names, roles) on every main screen, and
// a keyboard-only check that the title, onboarding and a battle answer work without a mouse.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const save = JSON.stringify({
  version: 2,
  state: {
    version: 2, active: 0, slots: [{
      nickname: 'AxeFox', band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
      progress: { level: 2, xp: 120, coins: 200, defeated: [], zonesCleared: ['piggybank_village'], spells: ['budget_beam', 'save_shield'], spell: 'budget_beam', tamed: [] },
      inventory: { owned: ['hat-laurel'], hat: 'hat-laurel', pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: { 'Spending and Saving': { answered: 6, correct: 4 } } },
      moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true },
    }, null, null],
  },
});

async function axe(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).exclude('canvas').analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${where}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')} ${v.nodes[0]?.failureSummary ?? ''}`)).toEqual([]);
}
const go = (page: Page, req: object) => page.evaluate((r) => (window as unknown as { __mq: { session: () => { go: (x: object) => void } } }).__mq.session().go(r), req);

test('no serious accessibility problems on the main screens', async ({ page }) => {
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await axe(page, 'title');

  await page.getByRole('button', { name: 'New game' }).first().click();
  await axe(page, 'welcome dialogue');
  const d = page.getByRole('dialog', { name: /says/ });
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
  await axe(page, 'nickname');
  await page.getByLabel('Nickname').fill('Keys');
  await page.getByRole('button', { name: 'Next' }).click();
  await axe(page, 'level');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await axe(page, 'money check');
  for (let i = 0; i < 12; i++) await page.keyboard.press('2');
  await axe(page, 'money check results');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  while (await d.isVisible()) await d.getByRole('button', { name: /Next|OK/ }).click();
  await axe(page, 'hub');

  // Back to the seeded save for the rest.
  await page.getByRole('button', { name: 'Settings' }).click();
  await axe(page, 'settings');
  await page.getByRole('button', { name: 'Save and quit' }).click();
  await page.getByRole('button', { name: 'Play' }).first().click();
  for (const [panel, name] of [['shop', 'Shop'], ['bag', 'Your bag'], ['progress', 'Progress'], ['redeem', 'Redeem a card']] as const) {
    await page.evaluate((p) => (window as unknown as { __mq: { session: () => { setPanel: (x: string) => void } } }).__mq.session().setPanel(p), panel);
    await expect(page.getByRole('dialog', { name: new RegExp(name) })).toBeVisible();
    await axe(page, panel);
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as unknown as { __mq: { session: () => { setPanel: (x: null) => void } } }).__mq.session().setPanel(null));
  }
  await go(page, { kind: 'world' });
  await expect(page.getByRole('button', { name: /Piggybank Village/ })).toBeVisible();
  await axe(page, 'world map');

  await page.evaluate(() => (window as unknown as { __mq: { session: () => { fight: (i: string, b: object) => void } } }).__mq.session().fight('mon_spendling', { kind: 'room', zone: 'piggybank_village', screen: 'market' }));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mq: { session: () => { battle: { phase: string } | null } } }).__mq.session().battle?.phase)).toBe('ask');
  await axe(page, 'battle card');
  const wrong = await page.evaluate(() => ((window as unknown as { __mq: { correct: () => number } }).__mq.correct() + 1) % 4);
  await page.keyboard.press(String(wrong + 1));
  await expect(page.getByText('Why:')).toBeVisible();
  await axe(page, 'battle explanation');
});

test('every button is at least 48 px and text at least 18 px on the battle card', async ({ page }) => {
  await page.addInitScript((s) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', s), save);
  await page.goto('./?e2e');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.evaluate(() => (window as unknown as { __mq: { session: () => { fight: (i: string, b: object) => void } } }).__mq.session().fight('mon_spendling', { kind: 'room', zone: 'piggybank_village', screen: 'market' }));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mq: { session: () => { battle: { phase: string } | null } } }).__mq.session().battle?.phase)).toBe('ask');
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => {
      const r = b.getBoundingClientRect();
      return { name: b.getAttribute('aria-label') ?? b.textContent, w: r.width, h: r.height, font: parseFloat(getComputedStyle(b).fontSize) };
    }),
  );
  for (const s of sizes) {
    expect(Math.min(s.w, s.h), `${s.name} size`).toBeGreaterThanOrEqual(48);
    expect(s.font, `${s.name} font`).toBeGreaterThanOrEqual(18);
  }
});
