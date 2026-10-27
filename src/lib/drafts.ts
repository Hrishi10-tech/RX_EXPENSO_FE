/**
 * Unsent notes (queries, reasons) are kept on this computer while typed, so a session that times out
 * loses nothing (W01·b). Drafts belong to the person who wrote them; another person's sign-in discards them.
 */
const KEY = 'expenso.drafts';

export interface Draft { key: string; label: string; text: string; at: number }
type Store = Record<string, Record<string, Draft>>;

function read(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store; } catch { return {}; }
}
function write(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: drafts live only on the page */ }
}

export function saveDraft(userId: string, key: string, label: string, text: string) {
  const s = read();
  const mine = s[userId] ?? {};
  if (text.trim()) mine[key] = { key, label, text, at: Date.now() };
  else delete mine[key];
  s[userId] = mine;
  write(s);
}

export function getDraft(userId: string | undefined, key: string): string {
  if (!userId) return '';
  return read()[userId]?.[key]?.text ?? '';
}

export function clearDraft(userId: string | undefined, key: string) {
  if (!userId) return;
  const s = read();
  if (s[userId]?.[key]) { delete s[userId][key]; write(s); }
}

export function draftsFor(userId: string): Draft[] {
  return Object.values(read()[userId] ?? {}).sort((a, b) => b.at - a.at);
}

/** On sign-in: drafts from anyone else on this computer are discarded, never shown. */
export function keepOnlyDraftsOf(userId: string) {
  const s = read();
  const mine = s[userId];
  write(mine ? { [userId]: mine } : {});
}
