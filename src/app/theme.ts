/** Light, dark or match the device (prototype data-theme switch), saved per user via PATCH /me/settings. */
export type Theme = 'light' | 'dark' | 'system';
const KEY = 'expenso-theme';

export function storedTheme(): Theme {
  try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark' || t === 'system') return t; } catch { /* ignore */ }
  return 'system';
}

export function applyTheme(t: Theme) {
  const r = document.documentElement;
  if (t === 'system') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}
