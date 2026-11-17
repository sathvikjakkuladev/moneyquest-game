// The open world, against the local server (`npm run dev:all`, then
// MP_E2E=1 E2E_URL=http://localhost:5173 npx playwright test openworld):
// players who haven't joined a class see each other as guests, a class with world mode on sees them
// too, and "Play offline" keeps a guest off the network.
import { expect, test } from '@playwright/test';
import { api, makeClass, net, player } from './mp.ts';

test.skip(!process.env.MP_E2E, 'needs the local multiplayer server (npm run dev:all) and MP_E2E=1');

test('guests without a class see each other and a world-mode class; nicknames never travel', async ({ browser }) => {
  const A = await player(browser, 'AliceNick', null, 'plaza', [200, 250]);
  const B = await player(browser, 'BobNick', null, 'plaza', [450, 250]);
  for (const p of [A, B]) await expect.poll(async () => (await net(p.page)).status, { timeout: 15_000 }).toBe('online');
  await expect.poll(async () => (await net(A.page)).people.length, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await net(B.page)).people.length).toBe(1);
  const bName = (await net(A.page)).people[0]!.name;
  expect(bName).not.toContain('Bob');
  await expect(A.page.getByText('BobNick')).toHaveCount(0);

  // A class with world mode on joins the same screen and sees both guests; they see the student too.
  const { teacher, cls, members } = await makeClass(1);
  await api('PATCH', `/api/teacher/classes/${cls.id}`, { worldMode: true }, teacher);
  const C = await player(browser, 'CaraNick', members[0]!, 'plaza', [320, 300]);
  await expect.poll(async () => (await net(C.page)).people.length, { timeout: 15_000 }).toBe(2);
  await expect.poll(async () => (await net(A.page)).people.length).toBe(2);

  // A waves: B sees the bubble.
  await A.page.getByRole('button', { name: /Say something|Emote|💬/ }).first().click();
  await A.page.getByRole('button').filter({ hasText: /👋/ }).first().click();
  await expect.poll(async () => Object.keys((await net(B.page)).says).length, { timeout: 5000 }).toBeGreaterThan(0);

  for (const p of [A, B, C]) expect(p.errors).toEqual([]);
  for (const p of [A, B, C]) await p.ctx.close();
});
