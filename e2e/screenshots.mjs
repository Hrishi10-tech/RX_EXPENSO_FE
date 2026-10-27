/**
 * Captures every console screen at 1440×900 in light and dark into docs/screenshots/, named by the
 * prototype's screen code (W04·a becomes W04a). Runs against the dev server with a freshly seeded API:
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node e2e/screenshots.mjs
 *
 * SHOTS_SKIP_SEED=1 keeps the current data; SHOTS_ONLY=W04,W08b captures a subset.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const PASSWORD = 'Expenso@2026';
const ONLY = process.env.SHOTS_ONLY ? new Set(process.env.SHOTS_ONLY.split(',')) : null;
const THEMES = ['light', 'dark'];

if (process.env.SHOTS_SKIP_SEED !== '1') {
  execSync('./scripts/instance.sh web 4101 seed', { cwd: fileURLToPath(new URL('../../server', import.meta.url)), stdio: 'inherit' });
}
fs.mkdirSync(OUT, { recursive: true });

const API = process.env.E2E_API ?? 'http://localhost:4101/api/v1';
async function token(email, client = 'mobile') {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, client }) });
  return (await r.json()).accessToken;
}
async function call(tok, method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${tok}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

const browser = await chromium.launch();
const shots = [];

/** Takes the page in both themes: the console follows the device theme ("Match device") by default. */
async function shoot(page, code, name) {
  if (ONLY && !ONLY.has(code)) return;
  // Confirmation toasts from the steps that led here would cover the page; hide them for the picture.
  const hide = await page.addStyleTag({ content: '.toasts { visibility: hidden !important; }' });
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await page.mouse.move(1439, 899);
    await page.waitForTimeout(250);
    const file = `${code}-${name}-${theme}.png`;
    await page.screenshot({ path: OUT + file });
    shots.push(file);
  }
  await hide.evaluate(el => el.remove());
  await page.emulateMedia({ colorScheme: 'light' });
}

async function settle(page, ms = 700) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(ms);
}

async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', timezoneId: 'Asia/Kolkata', locale: 'en-IN', acceptDownloads: true });
  const page = await ctx.newPage();
  if (email) {
    await page.goto(`${BASE}/sign-in`);
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(u => !u.pathname.startsWith('/sign-in'));
    await settle(page);
  }
  return { ctx, page };
}

async function go(page, path, ms) {
  await page.goto(BASE + path);
  await settle(page, ms);
}

async function closeOverlay(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/* ---------------- signed out ---------------- */
{
  const { ctx, page } = await session(null);
  await go(page, '/sign-in');
  await shoot(page, 'W01', 'sign-in');
  await page.fill('#email', 'arjun@xelements.test');
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('This console is for finance and administrators').waitFor();
  await shoot(page, 'W01a', 'employee-refused');
  await ctx.close();
}

/* ---------------- finance: Meera ---------------- */
{
  const { ctx, page } = await session('meera@xelements.test');
  await go(page, '/');
  await shoot(page, 'W02', 'dashboard');

  await page.locator('.w-top button[aria-label^="Notifications"]').click();
  await page.waitForTimeout(500);
  await shoot(page, 'W09', 'bell');
  await closeOverlay(page);

  await go(page, '/trips');
  await shoot(page, 'W03', 'trips');
  await go(page, '/trips?budget=over');
  await shoot(page, 'W03a', 'trips-over-budget');
  await go(page, '/trips?q=Guwahati');
  await shoot(page, 'W03b', 'trips-none-found');

  await go(page, '/trips/EXP-2026-00106');
  await shoot(page, 'W04', 'trip-overview');
  await go(page, '/trips/EXP-2026-00106/expenses');
  await shoot(page, 'W04a', 'trip-expenses');
  await go(page, '/trips/EXP-2026-00106/documents');
  await shoot(page, 'W04b', 'trip-documents');
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('#docNote').fill('Sales head approval for the extra night in Mysuru');
  await shoot(page, 'W04c', 'upload-document');
  await closeOverlay(page);
  await go(page, '/trips/EXP-2026-00106/timeline');
  await shoot(page, 'W04d', 'trip-timeline');
  await go(page, '/trips/EXP-2026-00106/exports');
  await shoot(page, 'W04e', 'trip-export-log');
  await go(page, '/trips/EXP-2026-00100');
  await shoot(page, 'W04f', 'trip-extended');
  const endBtn = page.getByRole('button', { name: 'End trip…' }).first();
  if (await endBtn.count()) {
    await endBtn.click();
    await page.waitForTimeout(500);
    await shoot(page, 'W04g', 'end-member-trip');
    await closeOverlay(page);
  }
  await go(page, '/trips/EXP-2026-00100?assign=owner');
  await shoot(page, 'W04h', 'assign-owner');
  await closeOverlay(page);
  await go(page, '/trips/EXP-2026-00103');
  await shoot(page, 'W04i', 'trip-closed-claims-waiting');
  await go(page, '/trips/EXP-2026-00102');
  await shoot(page, 'W04j', 'trip-cancelled');

  await go(page, '/trips/EXP-2026-00106/budgets');
  await shoot(page, 'W05', 'budgets');
  await page.locator('#poolAmt').fill('60,000');
  await page.waitForTimeout(1200);
  await shoot(page, 'W05b', 'budget-raise-preview');
  await page.getByRole('button', { name: 'Save budgets' }).click();
  await page.getByText(/Budgets saved at/).waitFor();
  await settle(page, 500);
  await shoot(page, 'W05a', 'budgets-saved');
  await go(page, '/trips/EXP-2026-00106/budgets');
  const divya = page.getByRole('switch', { name: 'Individual budget for Divya Raman' });
  if (await divya.count()) {
    await divya.click();
    await page.getByRole('button', { name: 'Save budgets' }).click();
    await page.waitForTimeout(600);
    await shoot(page, 'W05c', 'remove-individual-budget');
    await closeOverlay(page);
    await closeOverlay(page);
  }

  await go(page, '/claims');
  await shoot(page, 'W12', 'claims-queue');
  await go(page, '/claims/EXP-2026-00103/suresh-babu', 1500);
  // The first expense, like the prototype's W06 (the review opens on the replied courier, which is W06·b).
  await page.getByRole('option', { name: /Flight to Hyderabad/ }).click();
  await page.waitForTimeout(800);
  await shoot(page, 'W06', 'claim-review');
  await page.getByRole('option', { name: /Spare parts courier/ }).click();
  await page.waitForTimeout(800);
  await shoot(page, 'W06b', 'member-replied');
  await page.getByRole('option', { name: /Toll and parking/ }).click();
  await page.getByRole('button', { name: 'Query', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('#qText').fill('Please attach the parking receipt for the second day.');
  await shoot(page, 'W06a', 'raise-query');
  await page.getByRole('button', { name: 'Send query' }).click();
  await page.waitForTimeout(1200);
  {
    // Suresh edits the expense under query from his phone while Meera has it open (W06·f).
    const fin = await token('meera@xelements.test', 'web');
    const trip = (await call(fin, 'GET', '/finance/trips?q=EXP-2026-00103')).items[0];
    const t = await call(fin, 'GET', `/finance/trips/${trip.id}`);
    const suresh = t.members.find(m => m.name === 'Suresh Babu');
    const claim = await call(fin, 'GET', `/finance/trips/${trip.id}/claims/${suresh.userId}`);
    const toll = claim.expenses.find(e => e.description === 'Toll and parking');
    await call(await token('suresh@xelements.test'), 'PATCH', `/expenses/${toll.id}`, { amountPaise: toll.amountPaise - 30000, remarks: 'Second day parking was ₹300 less; receipt attached.' });
    await page.getByText(/Suresh changed this expense at/).waitFor({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await shoot(page, 'W06f', 'member-edited-during-review');
  }
  await page.getByRole('option', { name: /Hotel, three rooms/ }).click();
  await page.getByRole('button', { name: 'Approve lower' }).click();
  await page.waitForTimeout(500);
  await shoot(page, 'W06c', 'approve-lower');
  await closeOverlay(page);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.waitForTimeout(500);
  await shoot(page, 'W06d', 'reject');
  await closeOverlay(page);
  await go(page, '/claims/EXP-2026-00106/divya-raman', 1500);
  const flight = page.getByRole('option', { name: /Flight to Bengaluru/ });
  if (await flight.count()) { await flight.click(); await page.waitForTimeout(800); }
  await shoot(page, 'W06h', 'flags');
  await go(page, '/claims/EXP-2026-00106/karthik-iyer', 1500);
  const lunch = page.getByRole('option', { name: /no receipt yet/ }).first();
  if (await lunch.count()) { await lunch.click(); await page.waitForTimeout(800); }
  await shoot(page, 'W06i', 'receipt-on-the-phone');
  await go(page, '/trips/EXP-2026-00106/expenses');
  const boxes = page.getByRole('checkbox', { name: /^Select / });
  if ((await boxes.count()) >= 2) {
    await boxes.nth(0).click();
    await boxes.nth(1).click();
    await page.getByRole('button', { name: /Verify selected/ }).click();
    await page.waitForTimeout(500);
    await shoot(page, 'W06e', 'verify-several');
    await closeOverlay(page);
  }
  {
    // Rohan asks about a rejected dinner from his phone (M10·b); Meera answers without changing the decision.
    const fin = await token('meera@xelements.test', 'web');
    const trip = (await call(fin, 'GET', '/finance/trips?q=EXP-2026-00106')).items[0];
    const t = await call(fin, 'GET', `/finance/trips/${trip.id}`);
    const rohan = t.members.find(m => m.name === 'Rohan Das');
    const claim = await call(fin, 'GET', `/finance/trips/${trip.id}/claims/${rohan.userId}`);
    const dinner = claim.expenses.find(e => e.description === 'Dinner');
    await call(fin, 'POST', `/finance/expenses/${dinner.id}/reject`, { version: dinner.version, remark: 'Dinner on expo days is covered by the stall catering.' });
    await call(await token('rohan@xelements.test'), 'POST', `/expenses/${dinner.id}/replies`, { body: 'The catering closed at 6 pm and I was at the stall until 8. Can this be paid?', attachments: [] });
    await go(page, `/claims/EXP-2026-00106/rohan-das?expense=${dinner.id}`, 1500);
    await page.getByRole('button', { name: 'Answer Rohan' }).click();
    await page.getByRole('textbox', { name: 'Answer Rohan' }).fill('Catering runs until 9 pm on expo days, so this stays rejected. Keep the bill in case the sales head approves an exception.');
    await page.waitForTimeout(600);
    // The whole thread and the box: scroll the side panel to the thread's heading.
    await page.locator('.rv-scroll h3', { hasText: 'Thread with Rohan' }).evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await shoot(page, 'W06d', 'answer-member-question');
  }

  await go(page, '/claims/EXP-2026-00103/imran-khan/payments');
  await page.getByRole('button', { name: 'Record payment' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('#payRef').fill('UTR 5286 1140 9903');
  await shoot(page, 'W07', 'record-payment');
  await page.locator('#payAmt').fill('1,000');
  await page.getByRole('button', { name: /^Record ₹/ }).click();
  await page.waitForTimeout(1200);
  await settle(page, 500);
  await shoot(page, 'W07b', 'part-paid');
  await go(page, '/claims/EXP-2026-00103/deepa-srinivasan/payments');
  await shoot(page, 'W07a', 'reimbursed');
  await page.getByRole('button', { name: 'Reopen claim…' }).click();
  await page.waitForTimeout(500);
  await shoot(page, 'W07c', 'reopen');
  await closeOverlay(page);

  await go(page, '/trips/EXP-2026-00106/export', 1500);
  await shoot(page, 'W08', 'export');
  await go(page, '/trips/EXP-2026-00106/export?scope=member&member=divya-raman', 1500);
  await shoot(page, 'W08a', 'export-one-member');
  await go(page, '/trips/EXP-2026-00106/export', 1200);
  await page.getByRole('button', { name: 'Generate export' }).click();
  await page.getByRole('dialog', { name: 'Building your export' }).waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  if (await page.getByRole('dialog', { name: 'Building your export' }).count()) await shoot(page, 'W08b', 'export-building');
  await page.getByRole('dialog', { name: 'Your export is ready' }).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(400);
  await shoot(page, 'W08c', 'export-ready');
  await page.getByRole('button', { name: 'Done' }).click();
  await go(page, '/exports');
  await shoot(page, 'W08d', 'export-centre');

  await go(page, '/notifications');
  await shoot(page, 'W09a', 'notifications');
  await go(page, '/settings');
  await shoot(page, 'W09b', 'settings');
  await go(page, '/audit', 1200);
  await shoot(page, 'W11', 'audit-log');

  // Live updates paused: the socket drops after connecting and every reconnection attempt is refused,
  // while the page keeps its last figures (W02·a). Same tab, so the session carries over.
  {
    let dropped = false;
    const open = [];
    await page.routeWebSocket(/\/socket\.io\//, ws => {
      if (dropped) { void ws.close(); return; }
      ws.connectToServer();
      open.push(ws);
    });
    await page.route(/\/socket\.io\/.*transport=polling/, route => (dropped ? route.abort() : route.continue()));
    await go(page, '/', 1500);
    dropped = true;
    for (const ws of open) await ws.close();
    await page.waitForTimeout(6000);
    await shoot(page, 'W02a', 'live-updates-paused');
  }
  await ctx.close();
}

/* ---------------- a finance user who is on the trip: Vikram ---------------- */
{
  const { ctx, page } = await session('vikram@xelements.test');
  await go(page, '/trips/EXP-2026-00105/budgets');
  await shoot(page, 'W05d', 'budgets-locked-for-member');
  await page.getByRole('dialog', { name: /Budgets · Supplier audit/ }).getByRole('button', { name: 'Ask Meera Krishnan' }).click();
  await page.waitForTimeout(400);
  await page.locator('#hoMsg').fill('The audit needs a pool before Friday.');
  await shoot(page, 'W05d', 'ask-another-finance-user');
  await closeOverlay(page);
  await go(page, '/claims/EXP-2026-00105/vikram-rao', 1500);
  await shoot(page, 'W06g', 'own-claim-read-only');
  await ctx.close();
}

/* ---------------- administrator: Farah ---------------- */
{
  const { ctx, page } = await session('farah@xelements.test');
  await go(page, '/admin/users');
  await shoot(page, 'W10', 'users');
  await page.getByRole('button', { name: 'Edit Karthik Iyer' }).click();
  await page.waitForTimeout(400);
  await page.selectOption('#uDept', { label: 'Clinical Applications' });
  await page.waitForTimeout(300);
  await shoot(page, 'W10a', 'edit-user');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Edit Harish Kumar' }).click();
  await page.getByRole('button', { name: 'Deactivate…' }).click();
  await page.waitForTimeout(1200);
  await page.locator('#deReason').fill('Moved to the Pune office on 30 Sep 2026');
  await shoot(page, 'W10b', 'deactivate-user');
  await closeOverlay(page);
  await go(page, '/admin/departments');
  await shoot(page, 'W10c', 'departments');
  await go(page, '/audit', 1200);
  await shoot(page, 'W11', 'audit-log-administration');
  await ctx.close();
}

/* ---------------- the idle sign-out ---------------- */
{
  const { ctx, page } = await session(null);
  await page.addInitScript(() => localStorage.setItem('expenso.idleMs', '8000'));
  await page.goto(`${BASE}/sign-in?next=%2Ftrips`);
  await page.fill('#email', 'meera@xelements.test');
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog', { name: 'You were signed out after 30 minutes idle' }).waitFor({ timeout: 30_000 });
  await shoot(page, 'W01b', 'signed-out-after-30-minutes');
  await ctx.close();
}

await browser.close();
console.log(`${shots.length} screenshots in ${OUT}`);
