/** One session, one API client and one query cache for the whole console. */
import { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Api, ApiError, apiBase } from '../lib/api';
import { Session, type SessionState } from '../lib/session';

const storage = (() => { try { return window.sessionStorage; } catch { return null; } })();

export const base = apiBase(import.meta.env.VITE_API_BASE as string | undefined);
export const session = new Session({ fetch: (...a) => fetch(...a), storage, apiRoot: base.root });
export const api = new Api(session, base);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => {
        if (err instanceof ApiError && (err.status === 0 ? count >= 2 : err.status < 500)) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}

/** The signed-in user; pages under the shell can rely on it. */
export function useMe() {
  const s = useSession();
  return (s.user ?? s.lastUser)!;
}

/**
 * Navigation from outside React (a toast's "Open" button raised by a socket event). The shell registers
 * the router's navigate function; before that, links fall back to a full page load.
 */
let navigateFn: ((to: string) => void) | null = null;
export function setAppNavigate(fn: ((to: string) => void) | null) { navigateFn = fn; }
export function appNavigate(to: string) {
  if (navigateFn) navigateFn(to);
  else window.location.assign(to);
}

/** The signed-in user's console preferences (W09·b), with defaults for keys never saved. */
export function consolePref(key: 'budgetCrossings' | 'everyExpense' | 'digestOverBudget'): boolean {
  const prefs = session.user?.settings.notificationPrefs ?? {};
  const v = prefs[key];
  if (typeof v === 'boolean') return v;
  return key !== 'everyExpense';
}
