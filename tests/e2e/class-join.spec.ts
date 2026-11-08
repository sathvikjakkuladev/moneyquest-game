// Multiplayer Phase 1, end to end against a local server (`npm run dev:all`, then
// MP_E2E=1 E2E_URL=http://localhost:5173 npx playwright test class-join):
// a teacher signs up on /teacher and makes a class; a student joins it in Settings with a picked
// name; the nickname is never sent; leaving works.
import { expect, test } from '@playwright/test';

test.skip(!process.env.MP_E2E, 'needs the local multiplayer server (npm run dev:all) and MP_E2E=1');

const save = JSON.stringify({
  version: 3,
  state: {
    version: 3, active: 0, slots: [{
      nickname: 'SecretNick', band: 'K-5', createdAt: '2026-11-07T00:00:00Z',
      progress: { level: 2, xp: 120, coins: 50, coinsEarned: 50, defeated: [], zonesCleared: ['piggybank_village'], spells: ['budget_beam'], spell: 'budget_beam', tamed: [] },
      inventory: { owned: [], hat: null, pet: null }, questions: { bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} },
      moneyCheck: { firstForm: 'A', pre: null, post: null }, redeemed: [], settings: { readAloud: false, reducedMotion: true, playOffline: false }, online: null,
    }, null, null],
  },
});

test('teacher makes a class; a student joins with a picked name and leaves', async ({ browser }) => {
  // Teacher, in their own browser.
  const tctx = await browser.newContext();
  const t = await tctx.newPage();
  await t.goto('./teacher/');
  await t.getByRole('button', { name: /Create an account/ }).click();
  await t.getByLabel('Email').fill(`teacher${Date.now()}@school.test`);
  await t.getByLabel(/Password/).fill('correct horse battery');
  await t.getByRole('button', { name: 'Create account' }).click();
  await t.getByLabel(/Class name/).fill('Room 12');
  await t.getByRole('button', { name: 'Create class' }).click();
  const codeEl = t.getByLabel(/^Class code/);
  await expect(codeEl).toBeVisible();
  const code = (await codeEl.textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  // Student, in another browser.
  const sctx = await browser.newContext();
  const s = await sctx.newPage();
  const sent: string[] = [];
  s.on('request', (r) => r.url().includes(':8787') && sent.push(`${r.url()} ${r.postData() ?? ''}`));
  await s.addInitScript((v) => localStorage.getItem('moneyquest-save') || localStorage.setItem('moneyquest-save', v), save);
  await s.goto('./?e2e');
  await s.getByRole('button', { name: 'Play' }).click();
  await s.getByRole('button', { name: 'Settings' }).click();
  await s.getByRole('button', { name: 'Join a class' }).click();
  await s.getByLabel('Class code').fill(code.toLowerCase().slice(0, 3) + ' ' + code.slice(3));
  await s.getByRole('button', { name: 'Next' }).click();
  await expect(s.getByText('Joining Room 12')).toBeVisible();
  const choice = s.getByRole('dialog', { name: 'Settings' }).locator('fieldset').filter({ hasText: 'Class' }).getByRole('button').first();
  const name = (await choice.textContent())!.trim();
  await choice.click();
  await expect(s.getByText(`Classmates see you as ${name}`)).toBeVisible();

  // Saved with the slot; survives a reload.
  const online = await s.evaluate(() => JSON.parse(localStorage.getItem('moneyquest-save')!).state.slots[0].online);
  expect(online).toMatchObject({ className: 'Room 12', classCode: code, publicName: name });
  expect(online.token).toMatch(/^m_/);
  expect(sent.join('\n')).not.toContain('SecretNick');

  // The teacher sees the student counted.
  await t.reload();
  await expect(t.getByText('1 student')).toBeVisible();

  // Leaving clears it on the device and on the server.
  await s.getByRole('button', { name: 'Leave class' }).click();
  await expect(s.getByRole('button', { name: 'Join a class' })).toBeVisible();
  await t.reload();
  await expect(t.getByText('0 students')).toBeVisible();
  await tctx.close();
  await sctx.close();
});
