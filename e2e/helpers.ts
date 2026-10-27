/** Shared steps for the journeys: sign in through the form, and act as a member through the API (like the phone). */
import { expect, type Page } from '@playwright/test';

export const API = process.env.E2E_API ?? 'http://localhost:4101/api/v1';
export const PASSWORD = 'Expenso@2026';
export const USERS = {
  meera: 'meera@xelements.test',
  vikram: 'vikram@xelements.test',
  farah: 'farah@xelements.test',
  arjun: 'arjun@xelements.test',
} as const;

export async function signIn(page: Page, email: string, next = '/') {
  await page.goto(`/sign-in${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`);
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/sign-in'));
  await expect(page.getByRole('navigation', { name: 'Console' })).toBeVisible();
}

/** Sign in through the API as the mobile app would, returning a bearer token. */
export async function apiToken(email: string, client: 'mobile' | 'web' = 'mobile'): Promise<string> {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, client }) });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

export async function apiCall<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return (r.status === 204 ? undefined : await r.json()) as T;
}

/** A toast in the corner with this text. */
export const toast = (page: Page, text: string | RegExp) => page.locator('.toasts .toast').filter({ hasText: text });
