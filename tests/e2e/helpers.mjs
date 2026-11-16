import { expect } from '@playwright/test';

/** Closes any open window, then opens a desktop app (windows can cover the icons). */
export async function openApp(page, app) {
  const close = page.locator('.window .bar button');
  if (await close.count()) await close.click();
  await page.click(`[data-app=${app}]`);
}

export async function signUp(page, { name, email, password }) {
  await openApp(page, 'account');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.fill('input[name=displayName]', name);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('#identity')).toHaveText(`SIGNED IN AS ${name.toUpperCase()}`);
}

export async function signIn(page, { email, password }) {
  await openApp(page, 'account');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#identity')).toHaveText(/^SIGNED IN AS /);
}

/** A unique email per test, because the in-memory API lives for the whole run. */
export const uniqueEmail = (label) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
