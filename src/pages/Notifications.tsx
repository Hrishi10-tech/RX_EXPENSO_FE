/**
 * W09·a notification centre: everything the console was told, by kind and by day, unread marked "New".
 * Opening an item marks it read and lands on what it refers to (FR-NOT-02, FR-NOT-04). Updates live.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useCrumbs, useMarkRead } from '../app/Shell';
import { api, useMe } from '../app/core';
import { useNotifications, useSaveSettings } from '../api/hooks';
import type { NotificationItem, NotificationList } from '../api/types';
import { toast } from '../components/Toasts';
import { Btn, Card, EmptyState, ErrorState, Feed, Loading, PageHead, Tabs } from '../components/ui';
import { dayHeading, fmtTime, istDate, plural } from '../lib/format';
import { useParam } from '../lib/hooks';
import { notificationGroup, notificationLook } from '../lib/labels';
import { notificationTarget } from '../lib/links';

const PAGE = 100;
type TabKey = 'all' | 'unread' | 'claims' | 'trips' | 'budgets' | 'exports';
const TABS: Array<[TabKey, string]> = [['all', 'All'], ['unread', 'Unread'], ['claims', 'Claims and queries'], ['trips', 'Trips'], ['budgets', 'Budgets'], ['exports', 'Exports']];

function byDay(items: NotificationItem[]): Array<[string, NotificationItem[]]> {
  const m = new Map<string, NotificationItem[]>();
  for (const n of items) { const d = istDate(n.createdAt); m.set(d, [...(m.get(d) ?? []), n]); }
  return [...m.entries()];
}

function DigestCard() {
  const me = useMe();
  const save = useSaveSettings();
  const on = me.settings.dailyDigest;
  return (
    <Card title="Daily email digest" icon="mail">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <b>{on ? 'On' : 'Off'}</b>
          <div className="sm-note">{on ? `Every day at 09:00 to ${me.email}: claims ready for verification and Extended trips (FR-NOT-05)` : 'A 09:00 email of claims ready for verification and Extended trips (FR-NOT-05)'}</div>
        </div>
        <Btn kind={on ? 'sec' : 'pri'} size="sm" busy={save.isPending}
          onClick={() => save.mutate({ dailyDigest: !on }, { onSuccess: () => toast(on ? 'Digest off' : 'Digest on · the first one arrives at 09:00'), onError: e => toast((e as Error).message, { tone: 'bad' }) })}>
          {on ? 'Turn off' : 'Turn on'}
        </Btn>
      </div>
    </Card>
  );
}

export function Notifications() {
  useCrumbs([{ label: 'Notifications' }]);
  const me = useMe();
  const nav = useNavigate();
  const [tabParam, setTab] = useParam('tab', 'all');
  const tab = (TABS.some(t => t[0] === tabParam) ? tabParam : 'all') as TabKey;
  const first = useNotifications(PAGE);
  const mark = useMarkRead();
  // Older pages, fetched with ?before=; the first page stays live.
  const [older, setOlder] = useState<NotificationItem[]>([]);
  const [olderDone, setOlderDone] = useState(false);
  const [readLocally, setReadLocally] = useState<Set<string>>(new Set());
  const [allReadAt, setAllReadAt] = useState<string | null>(null);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const list: NotificationItem[] = [];
    for (const n of [...(first.data?.items ?? []), ...older]) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      const read = n.readAt ?? (readLocally.has(n.id) || (allReadAt && n.createdAt <= allReadAt) ? new Date().toISOString() : null);
      list.push(read === n.readAt ? n : { ...n, readAt: read });
    }
    return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [first.data, older, readLocally, allReadAt]);

  const loadOlder = useMutation({
    mutationFn: () => api.get<NotificationList>('/notifications', { limit: PAGE, before: items[items.length - 1]?.createdAt }),
    onSuccess: r => { setOlder(o => [...o, ...r.items]); if (r.items.length < PAGE) setOlderDone(true); },
    onError: e => toast((e as Error).message, { tone: 'bad' }),
  });

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: items.length, unread: 0, claims: 0, trips: 0, budgets: 0, exports: 0 };
    for (const n of items) { if (!n.readAt) c.unread++; c[notificationGroup(n.type, n.data)]++; }
    return c;
  }, [items]);
  const unread = first.data?.unread ?? counts.unread;
  const shown = items.filter(n => tab === 'all' || (tab === 'unread' ? !n.readAt : notificationGroup(n.type, n.data) === tab));
  const days = byDay(shown);
  const hasMore = !olderDone && (first.data?.items.length ?? 0) >= PAGE;

  const open = (n: NotificationItem) => {
    if (!n.readAt) {
      setReadLocally(s => new Set(s).add(n.id));
      mark.mutate({ ids: [n.id] });
    }
    void nav(notificationTarget(n));
  };
  const markAll = () => mark.mutate({ all: true }, {
    onSuccess: () => { setAllReadAt(new Date().toISOString()); toast('All marked as read'); },
    onError: e => toast((e as Error).message, { tone: 'bad' }),
  });

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead title="Notifications" sub={`${unread ? `${unread} unread` : 'All read'} · newest first · updates live`}
        actions={<>
          <Btn kind="sec" size="sm" onClick={markAll} busy={mark.isPending && !mark.variables?.ids} locked={unread ? null : 'Nothing unread'}>Mark all read</Btn>
          <Btn kind="ghost" size="sm" icon="settings" to="/settings">Settings</Btn>
        </>} />
      <Tabs label="Kinds of notification" active={tab} onSelect={k => setTab(k === 'all' ? null : k)}
        items={TABS.map(([k, l]) => ({ key: k, label: l, count: first.data ? (k === 'unread' ? unread : counts[k]) : null }))} />
      <div className="twocol">
        <div className="stack">
          {first.error ? <Card><ErrorState error={first.error} onRetry={() => void first.refetch()} /></Card> : !first.data ? <Card><Loading label="Loading notifications…" /></Card> : days.length === 0 ? (
            <Card>
              <EmptyState icon="bell" title={tab === 'unread' ? 'Nothing unread' : tab === 'all' ? 'Nothing yet' : 'Nothing of this kind yet'}>
                {tab === 'unread' ? 'You’re up to date. New items appear here the moment they happen.' : 'Claims ready, replies to queries, budget crossings and exports appear here as they happen.'}
              </EmptyState>
            </Card>
          ) : days.map(([day, list]) => (
            <Card key={day} title={dayHeading(day)} right={<span className="sm-note">{plural(list.length, 'item')}</span>}>
              <Feed items={list.map(n => {
                const look = notificationLook(n.type);
                return { key: n.id, icon: look.icon, tone: look.tone, title: n.title, sub: n.body, time: fmtTime(n.createdAt), isNew: !n.readAt, onClick: () => open(n) };
              })} />
            </Card>
          ))}
          {first.data && hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Btn kind="sec" size="sm" icon="history" busy={loadOlder.isPending} onClick={() => loadOlder.mutate()}>Load older notifications</Btn>
            </div>
          )}
          {first.data && !hasMore && items.length > 0 && <div className="sm-note" style={{ textAlign: 'center' }}>That’s everything.</div>}
        </div>
        <div className="stack">
          {me.isFinance && <DigestCard />}
          {me.isFinance ? (
            <Card title="What reaches finance" icon="info">
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13, color: 'var(--ink-2)' }}>
                <li>Claims ready for verification</li>
                <li>Replies to your queries, edits to expenses under query, and members asking about a rejection or a lower approval</li>
                <li>A colleague on a trip asking you to set its budgets or decide their claim</li>
                <li>Trips running past their planned end (Extended)</li>
                <li>Budget crossings at 80% and 100%</li>
                <li>Your exports ready or failed</li>
                <li>An owner deactivated: the trip needs a new owner</li>
              </ul>
              <div className="sm-note" style={{ marginTop: 10 }}>New trips, starts, ends and every expense show live on the dashboard and on each trip’s timeline.</div>
            </Card>
          ) : (
            <Card title="What reaches you here" icon="info">
              <div className="sm-note">Notifications for finance cover claims, trips, budgets and exports. Administration changes you make are recorded in the audit log with who, when and before and after (FR-ADM-04).</div>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
