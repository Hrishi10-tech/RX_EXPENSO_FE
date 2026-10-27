/** Short confirmations in the bottom-right corner, like the prototype's toast; callable from anywhere. */
import { useSyncExternalStore } from 'react';
import { Icon, type IconName } from './Icon';

export interface ToastItem { id: number; text: string; icon: IconName; tone: 'ok' | 'bad' | 'warn' | 'info'; sub?: string; action?: { label: string; run: () => void } }

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function toast(text: string, o: Partial<Omit<ToastItem, 'id' | 'text'>> & { ms?: number } = {}) {
  const t: ToastItem = { id: ++seq, text, icon: o.icon ?? (o.tone === 'bad' ? 'alert' : o.tone === 'warn' ? 'alert' : o.tone === 'info' ? 'bell' : 'checkCircle'), tone: o.tone ?? 'ok', sub: o.sub, action: o.action };
  items = [...items.slice(-3), t];
  emit();
  setTimeout(() => dismiss(t.id), o.ms ?? (o.action ? 7000 : 3800));
  return t.id;
}
export function dismiss(id: number) {
  items = items.filter(t => t.id !== id);
  emit();
}

export function Toasts() {
  const list = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => items, () => items);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className={`toast t-${t.tone}`}>
          <Icon name={t.icon} size={18} />
          <span className="tt">
            <span>{t.text}</span>
            {t.sub && <small>{t.sub}</small>}
          </span>
          {t.action && <button className="tact" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button className="tx" aria-label="Dismiss" onClick={() => dismiss(t.id)}><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  );
}
