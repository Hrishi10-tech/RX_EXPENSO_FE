/** FR-VER-10 for a finance user who is on a trip, and the administrator's user management (W10). */
import { expect, test } from '@playwright/test';
import { USERS, apiCall, apiToken, signIn, toast } from './helpers';

test('Vikram can’t set budgets on his own trip or decide his own claim', async ({ page }) => {
  await signIn(page, USERS.vikram);
  await page.goto('/trips/EXP-2026-00105');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Supplier audit');
  const budgets = page.getByRole('button', { name: 'Budgets' }).first();
  await expect(budgets).toHaveAttribute('aria-disabled', 'true');
  // Locked controls stay focusable and explain themselves when pressed.
  await budgets.focus();
  await page.keyboard.press('Enter');
  await expect(toast(page, /you’re a member of this trip.*FR-VER-10/)).toBeVisible();

  // Hand the budgets to a colleague who isn't on the trip (W05·d); Meera gets a notification that opens them.
  await page.getByRole('button', { name: 'Ask Meera Krishnan' }).first().click();
  const ask = page.getByRole('dialog', { name: /Ask another finance user to set the budgets/ });
  await ask.locator('#hoMsg').fill('The audit needs a pool before Friday.');
  await ask.getByRole('button', { name: 'Ask Meera' }).click();
  await expect(toast(page, 'Meera Krishnan was asked to set the budgets')).toBeVisible();
  const meera = await apiToken(USERS.meera, 'web');
  const notes = await apiCall<{ items: Array<{ type: string; body: string; data: { topic?: string } }> }>(meera, 'GET', '/notifications?limit=5');
  expect(notes.items.find(n => n.type === 'finance.handoff')).toMatchObject({ body: 'The audit needs a pool before Friday.', data: { topic: 'budgets' } });

  await page.goto('/claims/EXP-2026-00105/vikram-rao');
  await expect(page.getByText('This is your own claim')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask Meera Krishnan' })).toBeVisible();
  // Nor can he write on his own expenses' threads as finance (the API would refuse with own_claim).
  await expect(page.getByRole('button', { name: /^Write to / })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /^(Answer|Write to) / })).toHaveCount(0);
  const verify = page.locator('.rv-acts').getByRole('button', { name: /^Verify/ });
  await expect(verify).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('v');
  await expect(toast(page, /your own claim.*FR-VER-10/)).toBeVisible();
});

test('Farah sends an app link, deactivates a user with a reason, reactivates them and finds it in the audit log', async ({ page }) => {
  await signIn(page, USERS.farah);
  await expect(page).toHaveURL(/\/admin\/users/);
  await expect(page.getByRole('navigation', { name: 'Console' })).not.toContainText('Trips');
  const row = page.getByRole('row', { name: /Aditi Rao/ });
  await expect(row).toContainText('Sales Trainee');
  await expect(row).toContainText('Not yet');
  await row.getByRole('button', { name: 'Send the app link to Aditi Rao' }).click();
  await expect(toast(page, 'App link sent to aditi@xelements.test')).toBeVisible();

  await row.getByRole('button', { name: 'Edit Aditi Rao' }).click();
  await page.getByRole('dialog', { name: 'Edit Aditi Rao' }).getByRole('button', { name: 'Deactivate…' }).click();
  const confirm = page.getByRole('dialog', { name: 'Deactivate Aditi Rao?' });
  await expect(confirm).toContainText('Sign-in to the mobile app and the web console stops immediately');
  await confirm.locator('#deReason').fill('Contract ended on 30 Sep 2026');
  await confirm.getByRole('button', { name: 'Deactivate' }).click();
  await expect(toast(page, 'Aditi Rao deactivated')).toBeVisible();
  await expect(row).toContainText('Deactivated');

  await row.getByRole('button', { name: 'Reactivate Aditi Rao' }).click();
  await page.getByRole('dialog', { name: 'Reactivate Aditi Rao?' }).getByRole('button', { name: 'Reactivate' }).click();
  await expect(toast(page, 'Aditi Rao can sign in again')).toBeVisible();
  await expect(row).toContainText('Active');

  await page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: 'Audit log' }).click();
  // Newest first; .first() keeps the journey repeatable without a reseed (E2E_SKIP_SEED=1).
  const entry = page.getByRole('row', { name: /User deactivated/ }).filter({ hasText: 'Aditi Rao' }).first();
  await expect(entry).toContainText('“Contract ended on 30 Sep 2026”');
  await expect(page.getByRole('row', { name: /App link sent/ }).filter({ hasText: 'Aditi Rao' }).first()).toBeVisible();
});
