import { expect, test } from '@playwright/test';
import { openApp, signIn, signUp, uniqueEmail } from './helpers.mjs';

const status = (page) => page.locator('#status');

test('a guest can solve Case 001 from first message to ending', async ({ page }) => {
  await page.goto('/');
  await expect(status(page)).toHaveText('0 / 5 TRACES | 0 / 3 DEDUCTIONS | INVESTIGATION ACTIVE');

  await openApp(page, 'messages');
  await expect(page.getByRole('heading', { name: 'The last message' })).toBeVisible();
  await openApp(page, 'files');
  await expect(page.getByRole('heading', { name: 'Unsent draft' })).toBeVisible();

  await openApp(page, 'archive');
  await page.fill('input[type=password]', '2000');
  await page.getByRole('button', { name: 'Decrypt' }).click();
  await expect(page.getByText('Incorrect key. Check the recovered files.')).toBeVisible();
  await page.fill('input[type=password]', '1998');
  await page.getByRole('button', { name: 'Decrypt' }).click();
  await expect(page.getByRole('heading', { name: 'The payment ledger' })).toBeVisible();
  await expect(status(page)).toHaveText(/^5 \/ 5 TRACES/);

  await openApp(page, 'deductions');
  const solve = async (answer, documents) => {
    const form = page.locator('form.deduction', { has: page.locator('select') }).first();
    await form.locator('select').selectOption(answer);
    for (const doc of documents) await form.getByLabel(doc).check();
    await form.getByRole('button', { name: 'Verify deduction' }).click();
    await expect(page.getByText(`VERIFIED · ${answer}`)).toBeVisible();
  };
  // A wrong conclusion is refused without saying which part was wrong.
  const first = page.locator('form.deduction').first();
  await first.locator('select').selectOption('Company headquarters');
  await first.getByRole('button', { name: 'Verify deduction' }).click();
  await expect(first.getByText(/Not established yet/)).toBeVisible();

  await solve('North lighthouse service tunnel', ['The last message', 'Lighthouse inspection', 'A private channel']);
  await solve('No, his credentials were reset by Daniel', ['The payment ledger']);
  await solve('The maintenance tunnel to Pier 4', ['Lighthouse inspection', 'A private channel']);
  await expect(status(page)).toHaveText('5 / 5 TRACES | 3 / 3 DEDUCTIONS | INVESTIGATION ACTIVE');

  await openApp(page, 'resolve');
  await page.getByRole('button', { name: 'Send privately to Nia' }).click();
  await expect(page.getByText('SIGNAL RECEIVED / MAYA IS SAFE')).toBeVisible();
  await expect(status(page)).toHaveText(/CASE CLOSED$/);
});

test('progress survives a reload, and notes are saved', async ({ page }) => {
  await page.goto('/');
  await openApp(page, 'messages');
  await expect(page.getByRole('heading', { name: 'A private channel' })).toBeVisible();
  await openApp(page, 'notes');
  await page.fill('textarea', 'Nia is the only one Maya trusts.');
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect(status(page)).toHaveText(/^2 \/ 5 TRACES/);
  await openApp(page, 'notes');
  await expect(page.locator('textarea')).toHaveValue('Nia is the only one Maya trusts.');
});

test('signing up keeps guest progress, and it follows the account to another browser', async ({ page, browser }) => {
  const account = { name: 'Lungelo', email: uniqueEmail('carry'), password: 'a long passphrase' };
  await page.goto('/');
  await openApp(page, 'files');
  await expect(page.getByRole('heading', { name: 'Lighthouse inspection' })).toBeVisible();
  await signUp(page, account);
  await expect(status(page)).toHaveText(/^2 \/ 5 TRACES/);

  const other = await (await browser.newContext()).newPage();
  await other.goto('/');
  await signIn(other, account);
  await expect(status(other)).toHaveText(/^2 \/ 5 TRACES/);
});

test('one device can sign another out', async ({ page, browser }) => {
  const account = { name: 'Devices', email: uniqueEmail('devices'), password: 'a long passphrase' };
  await page.goto('/');
  await signUp(page, account);

  const phone = await (await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })).newPage();
  await phone.goto('/');
  await signIn(phone, account);

  await openApp(page, 'account');
  await page.getByRole('button', { name: 'Sign out Safari on iOS' }).click();
  await expect(page.locator('.device')).toHaveCount(1);

  await phone.reload();
  await expect(phone.locator('#identity')).toHaveText('GUEST');
});

test('the page never downloads the answers', async ({ page }) => {
  const bodies = [];
  page.on('response', async (res) => {
    if (res.request().resourceType() === 'script' || res.url().endsWith('/')) bodies.push(await res.text());
  });
  await page.goto('/');
  await expect(status(page)).toHaveText(/TRACES/);
  const everything = bodies.join('\n');
  for (const secret of ['1998', 'North lighthouse service tunnel', 'reset Eli’s password']) expect(everything).not.toContain(secret);
});
