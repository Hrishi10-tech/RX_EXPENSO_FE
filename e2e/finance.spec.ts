/**
 * Meera's day in the console: the dashboard, MedTech Expo, a budget change with its preview, Suresh's claim,
 * Imran's payment with a proof PDF, a whole-trip-and-each export downloaded as a ZIP, a member's expense
 * arriving live while the trip is open, and her answer to Rohan's question about a rejected expense.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { USERS, apiCall, apiToken, signIn, toast } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Kolkata', acceptDownloads: true });
  await signIn(page, USERS.meera);
});
test.afterAll(async () => { await page.close(); });

test('the dashboard opens live and switches the department spend to last month', async () => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Meera');
  await expect(page.locator('.kpi').first()).toBeVisible();
  await expect(page.locator('.w-live')).toHaveText('Live', { timeout: 15_000 });
  const card = page.locator('.card').filter({ hasText: 'Spend by department' });
  await expect(card).toContainText('September so far');
  await card.getByRole('button', { name: 'August' }).click();
  await expect(card).toContainText('August · whole month');
  await expect(card.getByText(/Nothing spent in August|Total/)).toBeVisible();
  await card.getByRole('button', { name: 'September' }).click();
  await expect(card).toContainText('September so far');
});

test('finds MedTech Expo on the trips list and opens it by reference', async () => {
  await page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: /^Trips/ }).click();
  await page.getByPlaceholder('Search name, reference, client or event').fill('MedTech');
  await page.getByRole('link', { name: /MedTech Expo/ }).first().click();
  await expect(page).toHaveURL(/\/trips\/EXP-2026-00106$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('MedTech Expo');
});

test('raises the trip pool after previewing what it changes', async () => {
  await page.getByRole('link', { name: 'Budgets' }).first().click();
  await expect(page.getByRole('dialog', { name: /Budgets · MedTech Expo/ })).toBeVisible();
  await page.locator('#poolAmt').fill('60,000');
  const impact = page.locator('.impact').filter({ hasText: 'When you save' });
  await expect(impact).toContainText('Used goes from', { timeout: 15_000 });
  await expect(impact).toContainText('told the new amount');
  await page.getByRole('button', { name: 'Save budgets' }).click();
  await expect(toast(page, /Budgets saved · 4 members told about the pool/)).toBeVisible();
  await expect(page).toHaveURL(/\/trips\/EXP-2026-00106$/);
  await expect(page.getByText(/Budgets saved at/)).toBeVisible();
  await page.getByRole('link', { name: 'Budgets' }).first().click();
  await expect(page.getByRole('table', { name: 'Budget change log' })).toContainText('₹50,000 → ₹60,000');
  await page.keyboard.press('Escape');
});

test('sets a pool and an individual budget in one save; the member holding both is asked to choose (FR-BUD-03)', async () => {
  await page.goto('/trips/EXP-2026-00104/budgets');
  const drawer = page.getByRole('dialog', { name: /Budgets · Clinical training/ });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('switch', { name: 'Trip pool' }).click();
  await drawer.locator('#poolAmt').fill('30,000');
  await drawer.getByRole('switch', { name: 'Individual budget for Lakshmi Menon' }).click();
  await drawer.getByRole('textbox', { name: 'Individual budget for Lakshmi Menon' }).fill('10,000');
  const impact = drawer.locator('.impact').filter({ hasText: 'When you save' });
  await expect(impact).toContainText('Lakshmi will hold both budgets', { timeout: 15_000 });
  await expect(impact).toContainText('Farhan’s earlier expenses');
  await drawer.getByRole('button', { name: 'Save budgets' }).click();
  await expect(toast(page, /Budgets saved/)).toContainText('Lakshmi is asked to choose a budget for earlier expenses');
  await expect(page.getByText('Lakshmi Menon was asked to choose.')).toBeVisible();

  // Exactly as previewed: Farhan's earlier expenses went to the pool, Lakshmi's stay Unbudgeted until she chooses.
  const meera = await apiToken(USERS.meera, 'web');
  const trips = await apiCall<{ items: Array<{ id: string; ref: string }> }>(meera, 'GET', '/finance/trips?q=EXP-2026-00104');
  const trip = await apiCall<{ expenses: Array<{ userName: string; paidBy: string; budgetSource: string | null }> }>(meera, 'GET', `/finance/trips/${trips.items.find(t => t.ref === 'EXP-2026-00104')!.id}`);
  const selfPaid = trip.expenses.filter(e => e.paidBy === 'self');
  expect(selfPaid.filter(e => e.userName === 'Farhan Qureshi').every(e => e.budgetSource === 'pool')).toBe(true);
  expect(selfPaid.filter(e => e.userName === 'Lakshmi Menon').every(e => e.budgetSource === 'unbudgeted')).toBe(true);
});

test('queries one of Suresh’s expenses and verifies another', async () => {
  await page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: /^Claims/ }).click();
  await page.getByRole('row', { name: /Suresh Babu/ }).first().click();
  await expect(page).toHaveURL(/\/claims\/EXP-2026-00103\/suresh-babu/);
  await page.getByRole('option', { name: /Toll and parking/ }).click();
  await page.getByRole('button', { name: 'Query', exact: true }).click();
  const q = page.getByRole('dialog', { name: /Query “Toll and parking”/ });
  await q.locator('#qText').fill('Please attach the parking receipt for the second day.');
  await q.getByRole('button', { name: 'Send query' }).click();
  await expect(toast(page, 'Query sent · Suresh told')).toBeVisible();
  await expect(page.getByRole('option', { name: /Toll and parking/ }).locator('[aria-label="Query"]')).toBeVisible();

  await page.getByRole('option', { name: /Spare parts courier from Chennai/ }).click();
  await page.keyboard.press('v');
  await expect(toast(page, 'Verified · Spare parts courier from Chennai')).toBeVisible();
});

test('records Imran’s payment with a proof PDF and the claim is reimbursed', async () => {
  await page.goto('/claims/EXP-2026-00103/imran-khan/payments');
  await page.getByRole('button', { name: 'Record payment' }).first().click();
  const d = page.getByRole('dialog', { name: 'Record a payment' });
  await d.locator('#payRef').fill('HDFC/NEFT/E2E/0001');
  await d.locator('input[type=file]').setInputFiles(fileURLToPath(new URL('./fixtures/payment-proof.pdf', import.meta.url)));
  await expect(d.getByText(/uploaded$/)).toBeVisible({ timeout: 20_000 });
  await d.getByRole('button', { name: /^Record ₹/ }).click();
  await expect(toast(page, /Payment of ₹[\d,]+ recorded · Imran told/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Payments' })).toContainText('HDFC/NEFT/E2E/0001');
  await expect(page.getByRole('table', { name: 'Payments' }).getByRole('button', { name: 'PDF' })).toBeVisible();
  await expect(page.locator('.pill').filter({ hasText: 'Reimbursed' }).first()).toBeVisible();
});

test('exports the whole trip and each member and downloads the ZIP', async () => {
  await page.goto('/trips/EXP-2026-00106/export');
  await expect(page.getByRole('radio', { name: /Whole trip and each member/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('tree', { name: 'ZIP contents' })).toContainText('Members/');
  await page.getByRole('button', { name: 'Generate export' }).click();
  const ready = page.getByRole('dialog', { name: 'Your export is ready' });
  await expect(ready).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), ready.getByRole('button', { name: /Download/ }).first().click()]);
  expect(dl.suggestedFilename()).toMatch(/^EXP-2026-00106_.+_PROVISIONAL\.zip$/);
  const file = await dl.path();
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.length).toBeGreaterThan(10_000);
  await ready.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: /^Exports/ }).click();
  const row = page.getByRole('row', { name: /MedTech Expo.*Whole trip and each member/ }).first();
  await expect(row).toContainText('Ready');
  await expect(row).toContainText('Meera Krishnan');
});

test('a member’s new expense appears on the open trip within 5 seconds', async () => {
  await page.goto('/trips/EXP-2026-00106/expenses');
  await expect(page.locator('.w-live')).toHaveText('Live', { timeout: 15_000 });
  const meera = await apiToken(USERS.meera, 'web');
  const trips = await apiCall<{ items: Array<{ id: string; ref: string }> }>(meera, 'GET', '/finance/trips?q=EXP-2026-00106');
  const tripId = trips.items.find(t => t.ref === 'EXP-2026-00106')!.id;
  const arjun = await apiToken(USERS.arjun, 'mobile');
  const description = `Water for the stall ${Date.now().toString().slice(-5)}`;
  const t0 = Date.now();
  await apiCall(arjun, 'POST', `/trips/${tripId}/expenses`, { spentAt: new Date().toISOString(), category: 'meals', description, amountPaise: 45000, paymentMode: 'company', paidBy: 'company' });
  await expect(page.getByText(description)).toBeVisible({ timeout: 5_000 });
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'live update', description: `${ms} ms` });
  console.log(`live update: the new expense appeared ${ms} ms after the API call`);
});

test('answers Rohan’s question about a rejected expense and the decision stays', async () => {
  const meera = await apiToken(USERS.meera, 'web');
  const rohan = await apiToken('rohan@xelements.test', 'mobile');
  const trips = await apiCall<{ items: Array<{ id: string; ref: string }> }>(meera, 'GET', '/finance/trips?q=EXP-2026-00106');
  const tripId = trips.items.find(t => t.ref === 'EXP-2026-00106')!.id;
  const trip = await apiCall<{ members: Array<{ userId: string; name: string }> }>(meera, 'GET', `/finance/trips/${tripId}`);
  const rohanId = trip.members.find(m => m.name === 'Rohan Das')!.userId;
  type Claim = { expenses: Array<{ id: string; description: string; version: number; verification: string; thread: Array<{ side: string; kind: string; body: string }> }> };
  const dinner = (await apiCall<Claim>(meera, 'GET', `/finance/trips/${tripId}/claims/${rohanId}`)).expenses.find(e => e.description === 'Dinner')!;
  // Rejected earlier; Rohan asks about it from his phone ("Ask finance", M10·b).
  await apiCall(meera, 'POST', `/finance/expenses/${dinner.id}/reject`, { version: dinner.version, remark: 'Dinner on expo days is covered by the stall catering.' });
  await apiCall(rohan, 'POST', `/expenses/${dinner.id}/replies`, { body: 'The catering closed at 6 pm and I was at the stall until 8. Can this be paid?', attachments: [] });

  await page.goto(`/claims/EXP-2026-00106/rohan-das?expense=${dinner.id}`);
  const item = page.getByRole('option', { name: /Dinner/ });
  await expect(item).toContainText('asked about it');
  await expect(page.getByText('Rohan asked about this decision')).toBeVisible();
  await page.getByRole('button', { name: 'Answer Rohan' }).click();
  const box = page.getByRole('textbox', { name: 'Answer Rohan' });
  await expect(box).toBeFocused();
  await box.fill('Catering runs until 9 pm on expo days, so this stays rejected. Keep the bill in case the sales head approves an exception.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(toast(page, 'Sent to Rohan')).toContainText('the decision is unchanged');
  const mine = page.locator('.wthread .wmsg.me').last();
  await expect(mine).toContainText('Keep the bill in case the sales head approves an exception.');
  await expect(mine).toContainText(/^You · .* · note/);
  await expect(item).not.toContainText('asked about it');
  await expect(page.getByText('Rohan asked about this decision')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Write to Rohan' })).toBeVisible();

  // Checked against the API: still rejected, the answer is a finance note, and Rohan's phone was told.
  const after = (await apiCall<Claim>(meera, 'GET', `/finance/trips/${tripId}/claims/${rohanId}`)).expenses.find(e => e.id === dinner.id)!;
  expect(after.verification).toBe('rejected');
  expect(after.thread.at(-1)).toMatchObject({ side: 'finance', kind: 'note' });
  const notes = await apiCall<{ items: Array<{ type: string; body: string }> }>(rohan, 'GET', '/notifications?limit=5');
  expect(notes.items.find(n => n.type === 'expense.message')?.body).toContain('stays rejected');
});
