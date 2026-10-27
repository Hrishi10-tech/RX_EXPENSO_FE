/**
 * The signed-in session (NFR-06). The access token lives only in memory; the refresh token is kept in
 * sessionStorage so a reload of the tab stays signed in, and nothing survives closing the tab.
 * Refreshing is single-flight: however many requests see `401 token_expired` at once, one refresh runs
 * and every caller waits for it, because the API rotates refresh tokens and a second use would be refused.
 */
import type { LoginResult, Me } from '../api/types';

export type SessionStatus = 'booting' | 'signedOut' | 'signedIn';
/** Why a session ended, so the sign-in page can say so. */
export type EndReason = 'signed_out' | 'timeout' | 'session_ended' | 'deactivated' | null;

export interface SessionState {
  status: SessionStatus;
  user: Me | null;
  reason: EndReason;
  /** Who was signed in before the session ended: the timeout dialog still shows their page and name. */
  lastUser: Me | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SessionError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const REFRESH_KEY = 'expenso.refresh';

export interface SessionOptions {
  fetch: typeof fetch;
  storage: StorageLike | null;
  /** e.g. "/api/v1" or "https://api.example.com/api/v1" */
  apiRoot: string;
  now?: () => number;
}

type Listener = () => void;

export class Session {
  private state: SessionState = { status: 'booting', user: null, reason: null, lastUser: null };
  private listeners = new Set<Listener>();
  private token: string | null = null;
  private refreshing: Promise<string> | null = null;
  /** When the current access token was issued (ms since epoch). */
  issuedAt = 0;
  /** Count of refresh calls made, for diagnostics and tests. */
  refreshCount = 0;

  constructor(private o: SessionOptions) {}

  get accessToken(): string | null { return this.token; }
  get user(): Me | null { return this.state.user; }
  private now() { return this.o.now ? this.o.now() : Date.now(); }

  getState = (): SessionState => this.state;
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(l => l());
  }

  private readRefresh(): string | null {
    try { return this.o.storage?.getItem(REFRESH_KEY) ?? null; } catch { return null; }
  }
  private writeRefresh(v: string | null) {
    try {
      if (v) this.o.storage?.setItem(REFRESH_KEY, v);
      else this.o.storage?.removeItem(REFRESH_KEY);
    } catch { /* storage may be unavailable (private mode); the session then lasts for this page only */ }
  }

  /** Signed in from a login, code or refresh response. */
  apply(r: LoginResult) {
    this.token = r.accessToken;
    this.issuedAt = this.now();
    this.writeRefresh(r.refreshToken);
    this.set({ status: 'signedIn', user: r.user, reason: null, lastUser: r.user });
  }

  /** Replaces the profile after a settings change, without touching tokens. */
  setUser(u: Me) { this.set({ user: u }); }

  /** On page load: resume from the stored refresh token, or show sign-in. */
  async boot(): Promise<void> {
    if (!this.readRefresh()) { this.set({ status: 'signedOut' }); return; }
    try { await this.refresh(); } catch { if (this.state.status !== 'signedOut') this.set({ status: 'signedOut' }); }
  }

  /** Single-flight refresh; resolves with the new access token. Ends the session when the server refuses. */
  refresh(): Promise<string> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<string> {
    const rt = this.readRefresh();
    if (!rt) {
      this.end('session_ended');
      throw new SessionError(401, 'session_ended', 'Your session ended. Sign in again.');
    }
    this.refreshCount++;
    let res: Response;
    try {
      res = await this.o.fetch(`${this.o.apiRoot}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }),
      });
    } catch {
      throw new SessionError(0, 'network', 'Can’t reach Expenso. Check the connection.');
    }
    if (!res.ok) {
      let code = 'session_ended', message = 'Your session ended. Sign in again.';
      try { const j = await res.json(); code = j?.error?.code ?? code; message = j?.error?.message ?? message; } catch { /* not JSON */ }
      if (res.status === 401 || res.status === 403) this.end(code === 'deactivated' ? 'deactivated' : 'session_ended');
      throw new SessionError(res.status, code, message);
    }
    const r = (await res.json()) as LoginResult;
    this.apply(r);
    return r.accessToken;
  }

  /** Ends the session locally (and on the server when we still hold the refresh token). */
  async signOut(reason: EndReason = 'signed_out'): Promise<void> {
    const rt = this.readRefresh();
    this.end(reason);
    if (rt) {
      try {
        await this.o.fetch(`${this.o.apiRoot}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
      } catch { /* already signed out locally */ }
    }
  }

  /** Forget tokens without calling the server (the server already ended the session). */
  end(reason: EndReason) {
    this.token = null;
    this.issuedAt = 0;
    this.writeRefresh(null);
    this.set({ status: 'signedOut', user: null, reason, lastUser: this.state.user ?? this.state.lastUser });
  }

  /** Clears the "why you were signed out" note once the sign-in page has shown it. */
  clearReason() { if (this.state.reason) this.set({ reason: null }); }
}
