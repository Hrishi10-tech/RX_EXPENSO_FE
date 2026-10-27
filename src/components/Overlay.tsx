/**
 * Dialogs and drawers over the console (prototype .w-ovl, .modal, .drawer), and small popovers for filters.
 * Focus moves into the dialog, Tab stays inside, Escape closes it, and focus returns to what opened it.
 */
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Where overlays render: a layer inside the console so they cover the sidebar too. */
function layer(): HTMLElement {
  return document.getElementById('ovl-root') ?? document.body;
}

let openCount = 0;
/** True while any dialog is open: page keyboard shortcuts stand down. */
export const dialogOpen = () => openCount > 0;

function useDialog(onClose: (() => void) | undefined, ref: React.RefObject<HTMLElement | null>, initialFocus?: string) {
  useEffect(() => {
    openCount++;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // Prefer the first field in the body over the header's close button.
    const first = (initialFocus && el?.querySelector<HTMLElement>(initialFocus)) || el?.querySelector<HTMLElement>('[data-autofocus]')
      || el?.querySelector<HTMLElement>('.drawer-b input:not([type=file]):not([readonly]), .drawer-b textarea, .drawer-b select')
      || el?.querySelector<HTMLElement>('.drawer-f .btn.pri, .drawer-f .btn.dangerfill') || el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(x => x.offsetParent !== null || x === document.activeElement);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      openCount--;
      document.removeEventListener('keydown', onKey, true);
      if (prev && document.contains(prev)) prev.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export interface ModalProps {
  title: ReactNode;
  lead?: ReactNode;
  icon?: IconName;
  tone?: 'warn' | 'bad' | 'ok' | '';
  width?: number;
  onClose?: () => void;
  footer?: ReactNode;
  children?: ReactNode;
  label?: string;
  initialFocus?: string;
  dimClose?: boolean;
}

export function Modal({ title, lead, icon, tone = '', width, onClose, footer, children, label, initialFocus, dimClose = true }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(onClose, ref, initialFocus);
  return createPortal(
    <div className="w-ovl">
      <div className="dim" onClick={dimClose ? onClose : undefined} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} ref={ref} tabIndex={-1} style={width ? { width } : undefined}>
        <div className="drawer-h">
          {icon && <span className={`mico ${tone}`}><Icon name={icon} size={22} /></span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {lead && <p>{lead}</p>}
          </div>
        </div>
        <div className="drawer-b">{children}</div>
        {footer && <div className="drawer-f">{footer}</div>}
      </div>
    </div>,
    layer(),
  );
}

export interface DrawerProps {
  title: ReactNode;
  sub?: ReactNode;
  pre?: ReactNode;
  width?: number;
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
  label?: string;
  initialFocus?: string;
}

export function Drawer({ title, sub, pre, width, onClose, footer, children, label, initialFocus }: DrawerProps) {
  const ref = useRef<HTMLElement>(null);
  useDialog(onClose, ref, initialFocus);
  return createPortal(
    <div className="w-ovl">
      <div className="dim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} ref={ref} tabIndex={-1} style={width ? { width } : undefined}>
        <div className="drawer-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            {pre && <div className="pre-h">{pre}</div>}
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="w-icb" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <div className="drawer-b">{children}</div>
        {footer && <div className="drawer-f">{footer}</div>}
      </aside>
    </div>,
    layer(),
  );
}

/**
 * A small panel under a button (filter chips, the bell). Closes on outside click and Escape,
 * and hands focus back to the button.
 */
export function Popover({ anchor, onClose, children, align = 'left', width, className, label }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode; align?: 'left' | 'right'; width?: number; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = width ?? ref.current?.offsetWidth ?? 260;
      let left = align === 'right' ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ top: r.bottom + 6, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, align, width]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className={`popover ${className ?? ''}`} role="dialog" aria-label={label} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}>
      {children}
    </div>,
    document.body,
  );
}
