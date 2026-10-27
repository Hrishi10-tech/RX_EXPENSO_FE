/** Small React helpers shared by pages. */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Ticks every `ms` so relative times ("18 h", "Day 2 of 4") stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * Ids seen on first load; anything that appears later is "new" (the live highlight on lists). A change of
 * `resetKey` (other filters or page) starts over, so a different page never lights up as new. Pass
 * `undefined` while the list shows placeholder data from the previous query.
 */
export function useNewSince<T>(items: T[] | undefined, keyOf: (x: T) => string, resetKey = ''): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const seenFor = useRef(resetKey);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!items) return;
    if (seenFor.current !== resetKey) {
      seenFor.current = resetKey;
      seen.current = null;
      setFresh(new Set());
    }
    if (!seen.current) { seen.current = new Set(items.map(keyOf)); return; }
    const added = items.map(keyOf).filter(k => !seen.current!.has(k));
    if (added.length) {
      added.forEach(k => seen.current!.add(k));
      setFresh(prev => new Set([...prev, ...added]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, resetKey]);
  return seenFor.current === resetKey ? fresh : new Set();
}

/** A URL search param as state, so filtered views can be linked and survive reloads. */
export function useParam(name: string, fallback = ''): [string, (v: string | null) => void] {
  const [sp, setSp] = useSearchParams();
  const v = sp.get(name) ?? fallback;
  const set = (next: string | null) => {
    setSp(prev => {
      const p = new URLSearchParams(prev);
      if (next == null || next === '' || next === fallback) p.delete(name);
      else p.set(name, next);
      if (name !== 'page') p.delete('page');
      return p;
    }, { replace: true });
  };
  return [v, set];
}

/** Keyboard shortcut that stands down while typing or while a dialog is open. */
export function useKey(key: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('.w-ovl')) return;
      if (e.key.toLowerCase() === key.toLowerCase()) h.current(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [key, enabled]);
}
