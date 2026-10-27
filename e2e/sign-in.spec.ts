/** W01: roles, wrong passwords, one-time codes and the 30-minute idle sign-out. */
import { expect, test } from '@playwright/test';
import { PASSWORD, USERS, signIn } from './helpers';

test.describe('W01 sign in', () => {
  test('Arjun, an employee, is refused with a pointer to the mobile app', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('#email', USERS.arjun);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('This console is for finance and administrators')).toBeVisible();
    await expect(page.getByText(`${USERS.arjun} is an employee account.`, { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('a wrong password is refused and says how many tries are left', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('#email', USERS.vikram);
    await page.fill('#password', 'not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Email or password doesn’t match')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('Meera signs in with a one-time code', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('#email', USERS.meera);
    await page.getByRole('button', { name: 'Email me a one-time code' }).click();
    const code = ((await page.getByTestId('dev-code').locator('b').textContent()) ?? '').trim();
    expect(code).toMatch(/^\d{6}$/);
    await page.fill('#code', code);
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Meera');
  });

  test('an idle session warns first, then signs out and keeps the page dimmed', async ({ page }) => {
    // Development builds accept a shorter idle limit so the 30-minute rule can be exercised quickly.
    await page.addInitScript(() => localStorage.setItem('expenso.idleMs', '9000'));
    await signIn(page, USERS.meera, '/trips');
    await expect(page.getByRole('dialog', { name: 'Your session is about to end' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog', { name: 'You were signed out after 30 minutes idle' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.w-side')).toBeVisible();
    await page.getByRole('button', { name: 'Sign in again' }).click();
    await expect(page).toHaveURL(/\/sign-in\?ended=timeout&next=%2Ftrips/);
  });
});
