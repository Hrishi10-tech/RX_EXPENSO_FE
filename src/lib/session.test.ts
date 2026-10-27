/**
 * Session refresh is single-flight (the API rotates refresh tokens, so a second concurrent use would be
 * refused), and the API client refreshes once on `401 token_expired`, then retries with the new token.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LoginResult, Me } from '../api/types';
import { Api, ApiError, apiBase, filenameFrom, qs } from './api';
import { REFRESH_KEY, Session } from './session';

const me: Me = { id: 'u1', name: 'Meera Krishnan', email: 'meera@x.test', phone: null, employeeCode: 'X1', departmentId: 'd1', departmentName: 'Finance', roles: ['employee', 'finance'], isFinance: true, isAdmin: false, settings: { dailyDigest: false, theme: 'system', notificationPrefs: {} } };

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const login = (n: number): LoginResult => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}-xxxxxxxxxxxxxxxxxxxx`, expiresIn: 900, user: me });

describe('Session', () => {
  it('runs one refresh however many callers ask at once, and rotates the stored token', async () => {
    const storage = memoryStorage({ [REFRESH_KEY]: 'refresh-0-xxxxxxxxxxxxxxxxxxxx' });
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      expect(JSON.parse(String(init?.body)).refreshToken).toBe('refresh-0-xxxxxxxxxxxxxxxxxxxx');
      await new Promise(r => setTimeout(r, 20));
      return json(200, login(1));
    });
    const s = new Session({ fetch: fetchImpl as unknown as typeof fetch, storage, apiRoot: '/api/v1' });
    const tokens = await Promise.all([s.refresh(), s.refresh(), s.refresh(), s.refresh()]);
    expect(calls).toBe(1);
    expect(tokens).toEqual(['access-1', 'access-1', 'access-1', 'access-1']);
    expect(storage.map.get(REFRESH_KEY)).toBe('refresh-1-xxxxxxxxxxxxxxxxxxxx');
    expect(s.getState().status).toBe('signedIn');
    // A later expiry refreshes again (the in-flight promise was cleared).
    fetchImpl.mockImplementationOnce(async () => json(200, login(2)));
    storage.map.set(REFRESH_KEY, 'refresh-0-xxxxxxxxxxxxxxxxxxxx');
    await expect(s.refresh()).resolves.toBe('access-2');
  });

  it('ends the session when the server refuses the refresh token', async () => {
    const storage = memoryStorage({ [REFRESH_KEY]: 'refresh-0-xxxxxxxxxxxxxxxxxxxx' });
    const s = new Session({ fetch: (async () => json(401, { error: { code: 'session_ended', message: 'Sign in again.' } })) as unknown as typeof fetch, storage, apiRoot: '/api/v1' });
    await expect(s.refresh()).rejects.toMatchObject({ code: 'session_ended' });
    expect(s.getState()).toMatchObject({ status: 'signedOut', reason: 'session_ended' });
    expect(storage.map.has(REFRESH_KEY)).toBe(false);
  });

  it('marks a deactivated account', async () => {
    const storage = memoryStorage({ [REFRESH_KEY]: 'refresh-0-xxxxxxxxxxxxxxxxxxxx' });
    const s = new Session({ fetch: (async () => json(403, { error: { code: 'deactivated', message: 'Your account was deactivated.' } })) as unknown as typeof fetch, storage, apiRoot: '/api/v1' });
    await expect(s.refresh()).rejects.toMatchObject({ code: 'deactivated' });
    expect(s.getState().reason).toBe('deactivated');
  });

  it('boots signed out without a stored token, and keeps the token out of storage after sign-out', async () => {
    const storage = memoryStorage();
    const s = new Session({ fetch: vi.fn() as unknown as typeof fetch, storage, apiRoot: '/api/v1' });
    await s.boot();
    expect(s.getState().status).toBe('signedOut');
    s.apply(login(5));
    expect(s.accessToken).toBe('access-5');
    expect(storage.map.get(REFRESH_KEY)).toBe('refresh-5-xxxxxxxxxxxxxxxxxxxx');
    s.end('timeout');
    expect(s.accessToken).toBeNull();
    expect(storage.map.has(REFRESH_KEY)).toBe(false);
    expect(s.getState()).toMatchObject({ status: 'signedOut', reason: 'timeout', lastUser: me });
  });
});

describe('Api client', () => {
  function setup(handler: (url: string, init: RequestInit) => Promise<Response>) {
    const storage = memoryStorage({ [REFRESH_KEY]: 'refresh-0-xxxxxxxxxxxxxxxxxxxx' });
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    const fetchImpl = (async (u: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(u);
      calls.push({ url, auth: (init.headers as Record<string, string> | undefined)?.Authorization });
      if (url.endsWith('/auth/refresh')) { await new Promise(r => setTimeout(r, 10)); return json(200, login(1)); }
      return handler(url, init);
    }) as unknown as typeof fetch;
    const session = new Session({ fetch: fetchImpl, storage, apiRoot: '/api/v1' });
    session.apply(login(0));
    const api = new Api(session, apiBase(undefined, { origin: 'http://console.test' }), fetchImpl);
    return { api, session, calls };
  }

  it('refreshes once on token_expired for parallel requests, then retries each with the new token', async () => {
    const { api, calls } = setup(async (_url, init) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer access-0') return json(401, { error: { code: 'token_expired', message: 'Expired' } });
      return json(200, { ok: true, auth });
    });
    const out = await Promise.all([api.get<{ auth: string }>('/finance/dashboard'), api.get<{ auth: string }>('/finance/trips'), api.get<{ auth: string }>('/notifications')]);
    expect(out.map(o => o.auth)).toEqual(['Bearer access-1', 'Bearer access-1', 'Bearer access-1']);
    expect(calls.filter(c => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('does not loop when the retried request is refused again', async () => {
    const { api, session, calls } = setup(async () => json(401, { error: { code: 'token_expired', message: 'Expired' } }));
    await expect(api.get('/finance/dashboard')).rejects.toBeInstanceOf(ApiError);
    expect(calls.filter(c => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(session.getState().status).toBe('signedOut');
  });

  it('ends the session on session_ended and maps field errors', async () => {
    const { api, session } = setup(async url => (url.includes('/me/password')
      ? json(400, { error: { code: 'validation', message: 'Check the form.', details: [{ field: 'newPassword', message: 'Use at least 8 characters.' }] } })
      : json(401, { error: { code: 'session_ended', message: 'Signed out elsewhere.' } })));
    const v = await api.post('/me/password', {}).catch(e => e as ApiError);
    expect(v).toBeInstanceOf(ApiError);
    expect((v as ApiError).fields).toEqual({ newPassword: 'Use at least 8 characters.' });
    await expect(api.get('/finance/dashboard')).rejects.toMatchObject({ code: 'session_ended' });
    expect(session.getState().reason).toBe('session_ended');
  });

  it('builds URLs, query strings and download names', () => {
    expect(qs({ a: 1, b: '', c: null, d: ['x', 'y'], e: true })).toBe('?a=1&d=x%2Cy&e=true');
    const same = apiBase(undefined, { origin: 'http://console.test' });
    expect(same).toMatchObject({ root: '/api/v1', sameOrigin: true });
    const other = apiBase('https://api.xelements.in/expenso', { origin: 'http://console.test' });
    expect(other.root).toBe('https://api.xelements.in/expenso/api/v1');
    expect(filenameFrom('attachment; filename="expenso-audit.csv"')).toBe('expenso-audit.csv');
    expect(filenameFrom("attachment; filename=\"a.zip\"; filename*=UTF-8''EXP-2026-00106_%E2%82%B9.zip")).toBe('EXP-2026-00106_₹.zip');
    expect(filenameFrom(null, 'x.pdf')).toBe('x.pdf');
  });
});
