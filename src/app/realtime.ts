/**
 * Live updates over Socket.IO (FR-WEB-03, NFR-13): trip changes refetch what is on screen, notifications
 * update the bell with a toast, and export events drive the building dialog and the export centre.
 */
import { io, type Socket } from 'socket.io-client';
import { useSyncExternalStore } from 'react';
import { api, appNavigate, base, consolePref, queryClient, session } from './core';
import { keys } from '../api/keys';
import { toast } from '../components/Toasts';
import type { ExportProgress, ExportRow, NotificationItem, TripChanged } from '../api/types';
import { notificationLook } from '../lib/labels';
import { notificationTarget, tripPath } from '../lib/links';

export interface LiveState {
  /** Socket connected right now. */
  connected: boolean;
  /** Connected at least once since sign-in. */
  everConnected: boolean;
  /** When the connection dropped (ms), for "paused since 14:18". */
  offlineSince: number | null;
  startedAt: number;
}

type Listener = () => void;
function store<T>(initial: T) {
  let v = initial;
  const ls = new Set<Listener>();
  return {
    get: () => v,
    set: (next: T) => { v = next; ls.forEach(l => l()); },
    subscribe: (l: Listener) => { ls.add(l); return () => { ls.delete(l); }; },
  };
}

export const live = store<LiveState>({ connected: false, everConnected: false, offlineSince: null, startedAt: Date.now() });
export const exportProgress = store<Record<string, ExportProgress>>({});

export function useLive() { return useSyncExternalStore(live.subscribe, live.get, live.get); }

/** Exports whose build dialog is open: their "ready" notification lands in the bell without a toast. */
export const watchedExports = new Set<string>();
export function useExportProgress(id: string | null | undefined): ExportProgress | null {
  const all = useSyncExternalStore(exportProgress.subscribe, exportProgress.get, exportProgress.get);
  return id ? all[id] ?? null : null;
}

/* ---------------- trip changes, batched so a burst of events refetches once ---------------- */

const pendingTrips = new Set<string>();
let exportsDirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function flush() {
  flushTimer = null;
  const trips = [...pendingTrips];
  pendingTrips.clear();
  void queryClient.invalidateQueries({ queryKey: keys.tripsAll });
  void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  void queryClient.invalidateQueries({ queryKey: keys.claimsAll });
  void queryClient.invalidateQueries({ queryKey: keys.auditAll });
  for (const t of trips) {
    void queryClient.invalidateQueries({ queryKey: keys.trip(t) });
    void queryClient.invalidateQueries({ queryKey: keys.timeline(t) });
    void queryClient.invalidateQueries({ queryKey: keys.budgetLog(t) });
    void queryClient.invalidateQueries({ queryKey: keys.claimOfTrip(t) });
    void queryClient.invalidateQueries({ queryKey: keys.exportPreviewOfTrip(t) });
  }
  if (exportsDirty) { exportsDirty = false; void queryClient.invalidateQueries({ queryKey: keys.exportsAll }); }
}
function queueTrip(tripId: string, kind?: string) {
  pendingTrips.add(tripId);
  if (kind === 'export') exportsDirty = true;
  if (!flushTimer) flushTimer = setTimeout(flush, 250);
}

/** Recently seen trip changes, so screens can mark rows that just changed. */
export const recentChanges = store<Array<TripChanged & { receivedAt: number }>>([]);

/* ---------------- the socket ---------------- */

let socket: Socket | null = null;
let offlineTimer: ReturnType<typeof setTimeout> | null = null;

function setLive(patch: Partial<LiveState>) { live.set({ ...live.get(), ...patch }); }

export function startRealtime() {
  if (socket) return;
  setLive({ connected: false, everConnected: false, offlineSince: null, startedAt: Date.now() });
  const opts = {
    path: `${base.prefix}/api/v1/socket.io`,
    auth: (cb: (d: object) => void) => cb({ token: session.accessToken ?? '' }),
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  };
  socket = base.sameOrigin ? io(opts) : io(base.origin, opts);
  const s = socket;
  s.on('connect', () => {
    const wasOffline = live.get().everConnected && !live.get().connected;
    if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
    setLive({ connected: true, everConnected: true, offlineSince: null });
    // Coming back: refresh every figure before the "paused" banner clears.
    if (wasOffline) void queryClient.invalidateQueries();
  });
  s.on('disconnect', reason => {
    setLive({ connected: false, offlineSince: live.get().offlineSince ?? Date.now() });
    if (reason === 'io server disconnect') {
      // The server dropped us (for example a deactivated account); check the session before reconnecting.
      void session.refresh().then(() => s.connect()).catch(() => undefined);
    }
  });
  s.on('connect_error', err => {
    if (!live.get().offlineSince) setLive({ offlineSince: Date.now() });
    if (err.message === 'deactivated') { session.end('deactivated'); return; }
    if (err.message === 'unauthorized') {
      // The access token expired: refresh once, then reconnect with the new one.
      session.refresh().then(() => { if (socket === s) s.connect(); }).catch(() => undefined);
    }
  });
  s.on('trip.changed', (p: TripChanged) => {
    recentChanges.set([...recentChanges.get().slice(-40), { ...p, receivedAt: Date.now() }]);
    queueTrip(p.tripId, p.kind);
    // "Every new expense" (W09·b, off by default): a new expense carries its budget privacy flag.
    if (p.kind === 'expense' && 'private' in p && !p.deleted && consolePref('everyExpense') && session.user?.isFinance) {
      toast('New expense added', { tone: 'info', icon: 'receipt', sub: 'Open the trip to see it', action: { label: 'Open', run: () => appNavigate(tripPath(p.tripId, 'expenses')) } });
    }
  });
  s.on('notification', (n: NotificationItem) => {
    // Finance who travel also get their phone notifications on this socket; the console shows only its own.
    if (n.channel && n.channel !== 'web' && n.channel !== 'both') return;
    void queryClient.invalidateQueries({ queryKey: keys.notificationsAll });
    if (n.data?.exportId && watchedExports.has(n.data.exportId)) return;
    // Budget crossings can be kept out of pop-ups (W09·b); they always stay in the notification list.
    if ((n.type === 'budget.warn' || n.type === 'budget.over') && !consolePref('budgetCrossings')) return;
    const look = notificationLook(n.type);
    toast(n.title, {
      tone: n.type === 'export.failed' || n.type === 'budget.over' ? 'warn' : 'info', icon: look.icon, sub: n.body,
      action: {
        label: 'Open',
        run: () => {
          void api.post('/notifications/read', { ids: [n.id] }).then(() => queryClient.invalidateQueries({ queryKey: keys.notificationsAll })).catch(() => undefined);
          appNavigate(notificationTarget(n));
        },
      },
    });
  });
  s.on('export.progress', (p: ExportProgress) => {
    exportProgress.set({ ...exportProgress.get(), [p.id]: p });
  });
  s.on('export.updated', (x: ExportRow) => {
    queryClient.setQueryData(keys.export(x.id), x);
    if (x.status !== 'building') {
      const next = { ...exportProgress.get() };
      delete next[x.id];
      exportProgress.set(next);
    }
    void queryClient.invalidateQueries({ queryKey: keys.exportsAll });
    void queryClient.invalidateQueries({ queryKey: keys.trip(x.tripId) });
  });
  s.on('export.removed', (x: { id: string }) => {
    const next = { ...exportProgress.get() };
    delete next[x.id];
    exportProgress.set(next);
    void queryClient.invalidateQueries({ queryKey: keys.exportsAll });
  });
}

export function stopRealtime() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  setLive({ connected: false, everConnected: false, offlineSince: null });
}

/** "Retry now" on the paused banner. */
export function retryRealtime() {
  if (!socket) { startRealtime(); return; }
  if (!socket.connected) socket.connect();
  void queryClient.invalidateQueries();
}

/** Asks the server to include one trip's member-level events (finance already receives every trip). */
export function watchTrip(tripId: string) {
  socket?.emit('trip:watch', tripId);
  return () => { socket?.emit('trip:unwatch', tripId); };
}

