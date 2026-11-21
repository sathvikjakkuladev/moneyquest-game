// Save codes, against the local server (`npm run dev:all`, then
// MP_E2E=1 E2E_URL=http://localhost:5173 npx playwright test savecode):
// get a code in Settings on one device, load it on another, and carry on with the same progress.
import { expect, test } from '@playwright/test';
import { player } from './mp.ts';

test.skip(!process.env.MP_E2E, 'needs the local multiplayer server (npm run dev:all) and MP_E2E=1');

test('a save code carries progress to another device, without the nickname', async ({ browser }) => {
  const A = await player(browser, 'SecretNick', null, 'plaza', [320, 250]);
  await A.page.getByRole('button', { name: 'Settings' }).click();
  const box = A.page.getByRole('dialog', { name: 'Settings' }).locator('fieldset').filter({ hasText: 'Save code' });
  await box.getByRole('button', { name: 'Get a save code' }).click();
  const shown = box.locator('.font-mono');
  await expect(shown).toHaveText(/^[A-Z]+-[A-Z]+-\d{6}$/, { timeout: 10_000 });
  const code = (await shown.textContent())!;

  // Another device: an empty game. Load the code from the title screen under a new nickname.
  const ctx = await browser.newContext();
  const B = await ctx.newPage();
  const errors: string[] = [];
  B.on('pageerror', (e) => errors.push(e.message));
  await B.goto('./?e2e');
  await B.getByRole('button', { name: 'Have a save code?' }).click();
  const dlg = B.getByRole('dialog', { name: 'Load a save code' });
  await dlg.getByLabel('Save code').fill(code.toLowerCase().replace(/-/g, ' '));
  await dlg.getByLabel('Your nickname on this device').fill('NewNick');
  await dlg.getByRole('button', { name: 'Load my save' }).click();
  await expect(dlg).toHaveCount(0, { timeout: 10_000 });
  const saved = await B.evaluate(() => JSON.parse(localStorage.getItem('moneyquest-save')!).state.slots[0]);
  expect(saved).toMatchObject({ nickname: 'NewNick', progress: { level: 2, coins: 50 }, online: null, backup: { code } });
  // Back on the title screen, Continue picks this save.
  await B.reload();
  await expect(B.getByRole('button', { name: /Continue as NewNick/ })).toBeVisible();

  expect([...A.errors, ...errors]).toEqual([]);
  await A.ctx.close();
  await ctx.close();
});
