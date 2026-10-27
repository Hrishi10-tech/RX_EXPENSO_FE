/**
 * The console frame (prototype shell()): sidebar by role, breadcrumb top bar, global search, the Live
 * indicator, the notification bell, toasts, and the idle-session warning and sign-out.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, queryClient, session, setAppNavigate, useMe, useSession } from './core';
import { useLive, retryRealtime } from './realtime';
import { useIdleSession } from './idle';
import { XMark } from '../components/Brand';
import { Icon, type IconName } from '../components/Icon';
import { Toasts, toast } from '../components/Toasts';
import { Avatar, Banner, Btn, Spinner, TripStatusPill } from '../components/ui';
import { Modal } from '../components/Overlay';
import { fetchTrips, useClaims, useNotifications, useTripCount } from '../api/hooks';
import { keys } from '../api/keys';
import type { AdminUser, NotificationItem } from '../api/types';
import { useDebounced } from '../lib/hooks';
import { fmtTime, relativeDay } from '../lib/format';
import { notificationLook } from '../lib/labels';
import { notificationTarget, tripPath } from '../lib/links';
import { draftsFor } from '../lib/drafts';

/* ---------------- breadcrumbs ---------------- */

export interface Crumb { label: string; to?: string }
const CrumbCtx = createContext<(c: Crumb[]) => void>(() => undefined);
/** Pages declare their breadcrumb trail. */
export function useCrumbs(c: Crumb[]) {
  const set = useContext(CrumbCtx);
  const k = JSON.stringify(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { set(c); }, [k, set]);
}

/* ---------------- sidebar ---------------- */

type NavItem = { h: string } | { to: string; icon: IconName; label: string; count?: number | null; hot?: boolean; end?: boolean };

function Sidebar({ onSignOut }: { onSignOut: () => void }) {
  const me = useMe();
  const live = useSession().status === 'signedIn';
  const fin = me.isFinance, adm = me.isAdmin;
  const trips = useTripCount({}, fin && live);
  const ready = useClaims({ status: 'ready' }, fin && live);
  const notes = useNotifications();
  const unread = notes.data?.unread ?? 0;
  const items: NavItem[] = [];
  if (fin) {
    items.push({ h: 'Overview' }, { to: '/', icon: 'dashboard', label: 'Dashboard', end: true });
    items.push({ h: 'Work' }, { to: '/trips', icon: 'trip', label: 'Trips', count: trips.data ?? null }, { to: '/claims', icon: 'inbox', label: 'Claims', count: ready.data?.length ?? null, hot: true }, { to: '/exports', icon: 'download', label: 'Exports' });
  }
  if (adm) {
    items.push({ h: 'Administration' }, { to: '/admin/users', icon: 'users', label: 'Users' }, { to: '/admin/departments', icon: 'building', label: 'Departments' });
    if (!fin) items.push({ to: '/audit', icon: 'history', label: 'Audit log' });
  }
  items.push({ h: fin ? 'Records' : 'You' }, { to: '/notifications', icon: 'bell', label: 'Notifications', count: unread || null });
  if (fin) items.push({ to: '/audit', icon: 'history', label: 'Audit log' });
  items.push({ to: '/settings', icon: 'settings', label: 'Settings' });
  const role = [fin && 'Finance', adm && 'Administrator'].filter(Boolean).join(' · ') || 'Employee';
  return (
    <aside className="w-side">
      <Link to="/" className="w-brand" aria-label="Expenso home">
        <XMark />
        <div><b>Expenso</b><small>{fin ? 'Finance console' : 'Admin console'}</small></div>
      </Link>
      <nav className="w-nav" aria-label="Console">
        {items.map((n, i) => 'h' in n ? <div className="nh" key={`h${i}`}>{n.h}</div> : (
          <NavLink key={n.to + n.label} to={n.to} end={n.end}>
            <Icon name={n.icon} size={18} />
            <span>{n.label}</span>
            {n.count != null && n.count > 0 && <span className={`cnt ${n.hot ? 'hot' : ''}`} aria-label={`${n.count}`}>{n.count}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="w-me">
        <Avatar name={me.name} />
        <div style={{ flex: 1, minWidth: 0 }}><b>{me.name}</b><small>{role}</small></div>
        <button type="button" className="w-icb" onClick={onSignOut} aria-label="Sign out" title="Sign out" style={{ border: 0, width: 30, height: 30 }}><Icon name="logOut" size={16} /></button>
      </div>
    </aside>
  );
}

/* ---------------- global search ---------------- */

interface Hit { key: string; to: string; title: string; sub: ReactNode }

function GlobalSearch() {
  const me = useMe();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dq = useDebounced(q.trim(), 200);
  const fin = me.isFinance;
  const res = useQuery({
    queryKey: ['search', fin ? 'trips' : 'users', dq],
    enabled: dq.length >= 2,
    queryFn: async ({ signal }): Promise<Hit[]> => {
      if (fin) {
        const r = await fetchTrips({ q: dq, pageSize: 8 }, signal);
        return r.items.map(t => ({ key: t.id, to: tripPath(t), title: t.name, sub: <><span className="mono">{t.ref}</span> · {t.departmentName} · {t.clientEvent ?? t.primaryCity} <TripStatusPill status={t.status} /></> }));
      }
      const r = await api.get<AdminUser[]>('/admin/users', { q: dq }, signal);
      return r.slice(0, 8).map(u => ({ key: u.id, to: `/admin/users?focus=${u.id}`, title: u.name, sub: <><span className="mono">{u.employeeCode}</span> · {u.departmentName} · {u.email}</> }));
    },
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('.w-ovl')) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  const hits = dq.length >= 2 ? res.data ?? [] : [];
  const all: Hit[] = fin && dq.length >= 2 ? [...hits, { key: 'all', to: `/trips?q=${encodeURIComponent(dq)}`, title: `See every trip matching “${dq}”`, sub: 'Opens the trips list with this search' }] : hits;
  const go = (h: Hit) => { setOpen(false); setQ(''); input.current?.blur(); nav(h.to); };
  const placeholder = fin ? 'Search trips, people, references' : 'Search people by name, email or ID';
  return (
    <div className="w-search-wrap">
      <div className="w-search" role="search">
        <Icon name="search" size={16} />
        <input
          ref={input}
          value={q}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open && all.length > 0}
          aria-controls="gsearch-list"
          aria-activedescendant={open && all[idx] ? `gs-${all[idx].key}` : undefined}
          onChange={e => { setQ(e.target.value); setOpen(true); setIdx(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, all.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter' && all[idx]) { e.preventDefault(); go(all[idx]); }
            else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
          }}
        />
        {res.isFetching && dq.length >= 2 ? <Spinner size={14} /> : <span className="kbd">/</span>}
      </div>
      {open && dq.length >= 2 && (
        <div className="search-drop" id="gsearch-list" role="listbox" aria-label="Search results">
          {res.isLoading && <div className="sd-empty">Searching…</div>}
          {!res.isLoading && hits.length === 0 && <div className="sd-empty">No {fin ? 'trip' : 'person'} matches “{dq}”.{fin ? ' Search covers trip names, references and client or event names.' : ''}</div>}
          {all.map((h, i) => (
            <button type="button" key={h.key} id={`gs-${h.key}`} role="option" aria-selected={i === idx} className={`sd-item ${i === idx ? 'on' : ''} ${h.key === 'all' ? 'all' : ''}`}
              onMouseDown={e => e.preventDefault()} onMouseEnter={() => setIdx(i)} onClick={() => go(h)}>
              <b>{h.title}</b><small>{h.sub}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- live indicator ---------------- */

function LiveIndicator() {
  const l = useLive();
  const signedIn = useSession().status === 'signedIn';
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force(x => x + 1), 1000); return () => clearInterval(t); }, []);
  // A timed-out page stays on screen dimmed; it isn't trying to reconnect, so it claims neither state.
  if (!signedIn) return null;
  const off = !l.connected && (l.everConnected || Date.now() - l.startedAt > 4000);
  if (off) return <button type="button" className="w-live off" role="status" onClick={retryRealtime} title="Live updates are paused. Select to retry now.">
    <i />Reconnecting…</button>;
  return <span className="w-live" title="Updates arrive within 5 seconds" role="status"><i />Live</span>;
}

/* ---------------- notification bell ---------------- */

export function useMarkRead() {
  return useMutation({
    mutationFn: (b: { ids?: string[]; all?: boolean }) => api.post('/notifications/read', b),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notificationsAll }),
  });
}

function BellDropdown({ onClose, anchor }: { onClose: () => void; anchor: HTMLElement | null }) {
  const notes = useNotifications();
  const mark = useMarkRead();
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); anchor?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose, anchor]);
  const items = (notes.data?.items ?? []).slice(0, 6);
  const unread = notes.data?.unread ?? 0;
  const open = (n: NotificationItem) => {
    if (!n.readAt) mark.mutate({ ids: [n.id] });
    onClose();
    nav(notificationTarget(n));
  };
  return (
    <div className="dropdown" role="dialog" aria-label="Notifications" ref={ref}>
      <div className="card-h">
        <h2>Notifications</h2>
        {unread > 0 && <span className="pill acc">{unread} unread</span>}
        <div className="r">{unread > 0 && <button type="button" className="wl" onClick={() => mark.mutate({ all: true }, { onSuccess: () => toast('All marked as read') })}>Mark all read</button>}</div>
      </div>
      <div className="nlist">
        {notes.isLoading && <div className="sd-empty">Loading…</div>}
        {!notes.isLoading && items.length === 0 && <div className="sd-empty">Nothing yet. New claims, replies, budget alerts and exports appear here as they happen.</div>}
        {items.map(n => {
          const look = notificationLook(n.type);
          return (
            <button type="button" key={n.id} className={`nitem ${n.readAt ? '' : 'unread'}`} onClick={() => open(n)}>
              <span className={`ni ${look.tone}`}><Icon name={look.icon} size={17} /></span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{n.title}</b><small>{n.body} · {relativeDay(n.createdAt).replace(/^Today /, '')}</small></span>
            </button>
          );
        })}
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
        <Btn kind="ghost" size="sm" to="/notifications" onClick={onClose}>Open notification centre</Btn>
        <Btn kind="ghost" size="sm" icon="settings" to="/settings" onClick={onClose}>Settings</Btn>
      </div>
    </div>
  );
}

/* ---------------- idle warning and timeout ---------------- */

function IdleWarning({ remaining, stay, signOut }: { remaining: number; stay: () => void; signOut: () => void }) {
  const s = Math.max(0, Math.ceil(remaining / 1000));
  const mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
  return (
    <Modal icon="clock" tone="warn" title="Your session is about to end" dimClose={false}
      lead={<>For security, Expenso signs you out after 30 minutes without activity. Signing out in <b className="num">{mm}:{ss}</b>.</>}
      footer={<><Btn kind="sec" onClick={signOut}>Sign out now</Btn><Btn kind="pri" icon="check" onClick={stay} className="stay-btn">Stay signed in</Btn></>}
      initialFocus=".stay-btn" />
  );
}

function TimeoutModal() {
  const nav = useNavigate();
  const loc = useLocation();
  const s = useSession();
  const drafts = s.lastUser ? draftsFor(s.lastUser.id) : [];
  return (
    <Modal icon="lock" title="You were signed out after 30 minutes idle" dimClose={false}
      lead="For security, Expenso ends a console session nobody has used for 30 minutes. Nothing you decided was lost."
      footer={<Btn kind="pri" icon="logIn" onClick={() => nav(`/sign-in?ended=timeout&next=${encodeURIComponent(loc.pathname + loc.search)}`, { replace: true })}>Sign in again</Btn>}>
      {drafts.length > 0 && (
        <Banner tone="neutral" icon="pencil" title={drafts.length === 1 ? 'Your unsent note was kept' : `Your ${drafts.length} unsent notes were kept`}>
          {drafts.slice(0, 2).map(d => `“${d.text.length > 90 ? d.text.slice(0, 90) + '…' : d.text}” on ${d.label}`).join(' · ')}. {drafts.length === 1 ? 'It comes' : 'They come'} back when you sign in again on this computer.
        </Banner>
      )}
    </Modal>
  );
}

/* ---------------- the frame ---------------- */

export function Shell() {
  const s = useSession();
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [bell, setBell] = useState(false);
  const bellBtn = useRef<HTMLButtonElement>(null);
  const notes = useNotifications();
  const unread = notes.data?.unread ?? 0;
  const loc = useLocation();
  const signedIn = s.status === 'signedIn';
  const onTimeout = useCallback(() => { void session.signOut('timeout'); }, []);
  const idle = useIdleSession(signedIn, onTimeout);
  const signOut = useCallback(() => { void session.signOut('signed_out'); toast('Signed out'); }, []);
  const setC = useCallback((c: Crumb[]) => setCrumbs(c), []);
  useEffect(() => { setBell(false); }, [loc.pathname]);
  const navigate = useNavigate();
  useEffect(() => {
    setAppNavigate(to => { void navigate(to); });
    return () => setAppNavigate(null);
  }, [navigate]);

  return (
    <div className="web-app">
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar onSignOut={signOut} />
      <div className="w-main">
        <header className="w-top">
          <nav className="w-crumb" aria-label="Breadcrumb">
            {crumbs.map((c, i) => i === crumbs.length - 1
              ? <b key={i} aria-current="page">{c.label}</b>
              : <span key={i} style={{ display: 'contents' }}><Link to={c.to ?? '#'}>{c.label}</Link><Icon name="chevronRight" size={14} /></span>)}
          </nav>
          <GlobalSearch />
          <LiveIndicator />
          <button type="button" ref={bellBtn} className="w-icb" aria-label={`Notifications, ${unread} unread`} aria-expanded={bell} onClick={() => setBell(b => !b)}>
            <Icon name="bell" size={18} />
            {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
          </button>
        </header>
        <CrumbCtx.Provider value={setC}>
          <Outlet />
        </CrumbCtx.Provider>
        {bell && <BellDropdown onClose={() => setBell(false)} anchor={bellBtn.current} />}
      </div>
      <Toasts />
      {signedIn && idle.remaining != null && <IdleWarning remaining={idle.remaining} stay={idle.stay} signOut={() => void session.signOut('signed_out')} />}
      {s.status === 'signedOut' && s.reason === 'timeout' && <TimeoutModal />}
    </div>
  );
}

/** "as of 14:18" suffix while live updates are paused. */
export function useStaleNote(): string {
  const l = useLive();
  return !l.connected && l.everConnected && l.offlineSince ? ` · as of ${fmtTime(l.offlineSince)}` : '';
}

