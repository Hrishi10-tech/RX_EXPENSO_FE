/**
 * Web sessions end after 30 idle minutes (NFR-06). Activity keeps the session sliding: the refresh token
 * is renewed while someone is working, and a warning appears two minutes before an idle session ends.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { session } from './core';

export const IDLE_MS = 30 * 60_000;
export const WARN_MS = 2 * 60_000;
/** Renew the tokens while active once they are this old (access tokens last 10 minutes). */
const RENEW_AFTER_MS = 7 * 60_000;

/** Development only: `localStorage['expenso.idleMs']` shortens the timeout to test the warning and sign-out. */
export function idleTimeout(): number {
  if (import.meta.env.DEV) {
    try { const v = Number(localStorage.getItem('expenso.idleMs')); if (v > 0) return v; } catch { /* ignore */ }
  }
  return IDLE_MS;
}

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll'] as const;

export function useIdleSession(active: boolean, onTimeout: () => void) {
  const last = useRef(Date.now());
  /** The warning is showing: only "Stay signed in" keeps the session now, not a stray mouse move. */
  const warning = useRef(false);
  const ended = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const [remaining, setRemaining] = useState<number | null>(null);
  const timeout = idleTimeout();
  const warnAt = Math.min(WARN_MS, Math.round(timeout / 3));

  // Each sign-in starts the clock again.
  useEffect(() => {
    if (!active) return;
    last.current = Date.now();
    warning.current = false;
    ended.current = false;
    setRemaining(null);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let lastMove = 0;
    const onAct = (e: Event) => {
      if (e.type === 'mousemove' || e.type === 'scroll') {
        const now = Date.now();
        if (now - lastMove < 1000) return;
        lastMove = now;
      }
      if (warning.current) return;
      last.current = Date.now();
      // Working keeps the session sliding: renew the tokens once they are getting old.
      if (session.getState().status === 'signedIn' && session.issuedAt && Date.now() - session.issuedAt > Math.min(RENEW_AFTER_MS, timeout / 2)) {
        void session.refresh().catch(() => undefined);
      }
    };
    EVENTS.forEach(ev => window.addEventListener(ev, onAct, { passive: true, capture: true }));
    // Timestamps, not counted ticks: a throttled background tab or a sleeping laptop still ends on time.
    const tick = setInterval(() => {
      if (ended.current) return;
      const idle = Date.now() - last.current;
      if (idle >= timeout) {
        ended.current = true;
        warning.current = false;
        setRemaining(null);
        onTimeoutRef.current();
        return;
      }
      warning.current = idle >= timeout - warnAt;
      setRemaining(warning.current ? timeout - idle : null);
    }, 1000);
    return () => {
      EVENTS.forEach(ev => window.removeEventListener(ev, onAct, { capture: true }));
      clearInterval(tick);
    };
  }, [active, timeout, warnAt]);

  /** "Stay signed in" on the warning: counts as activity and renews the tokens now. */
  const stay = useCallback(() => {
    last.current = Date.now();
    warning.current = false;
    setRemaining(null);
    void session.refresh().catch(() => undefined);
  }, []);

  return { remaining, stay };
}
