/**
 * W02 dashboard: running trips, claims waiting, verified but unpaid, open queries, this month's spend by
 * department, what needs a finance decision, and live activity from both apps (FR-WEB-07, FR-WEB-03).
 * W02·a: when the live connection drops, the page says so and labels its figures with their time.
 */
import { useMemo, useState } from 'react';
import { useCrumbs, useStaleNote } from '../app/Shell';
import { useMe } from '../app/core';
import { retryRealtime, useLive } from '../app/realtime';
import { useAudit, useClaims, useDashboard, useDashboardMonth, useMyTripIds, usePeople } from '../api/hooks';
import type { ClaimQueueItem, DashboardData } from '../api/types';
import { Amt, Banner, Bar, Btn, Card, EmptyState, ErrorState, Feed, type FeedItem, Kpi, Loading, PageHead, Pill, Segs, Tbl, Usage, Who } from '../components/ui';
import { RowLink, StatusCell, TripFlags, TripNameCell } from '../components/trip';
import { describeActivity, inFeed } from '../lib/activity';
import { addDays, fmtDay, fmtLongDay, fmtMonth, fmtTime, firstName, greeting, humanDuration, inr, istDate, istDayStart, joinNames, plural, relativeDay, waitingLabel } from '../lib/format';
import { useNewSince, useNow } from '../lib/hooks';
import { claimPath, tripPath } from '../lib/links';

const sumBy = (xs: ClaimQueueItem[], f: (c: ClaimQueueItem) => number) => xs.reduce((s, c) => s + f(c), 0);

function attentionItems(d: DashboardData, now: number): FeedItem[] {
  const out: FeedItem[] = [];
  const byTrip = new Map<string, DashboardData['needsAttention']>();
  for (const a of d.needsAttention) {
    if (a.kind !== 'extended') continue;
    byTrip.set(a.tripId, [...(byTrip.get(a.tripId) ?? []), a]);
  }
  for (const a of d.needsAttention) {
    if (a.kind === 'owner_inactive') out.push({ key: `o${a.tripId}`, icon: 'userX', tone: 'bad', title: `${a.name} has no active owner`, sub: `${a.who} was deactivated. Assign a new owner.`, to: `${tripPath(a)}?assign=owner` });
  }
  for (const t of d.running) {
    const pOver = !!t.pool && t.pool.spentPaise > t.pool.allocatedPaise;
    if (pOver) out.push({ key: `b${t.id}`, icon: 'alert', tone: 'bad', title: `${t.name}: trip pool over by ${inr(t.pool!.spentPaise - t.pool!.allocatedPaise)}`, sub: `${t.pool!.pct}% of ${inr(t.pool!.allocatedPaise)} · nothing is blocked`, to: tripPath(t) });
    else if (t.individualOver) out.push({ key: `bi${t.id}`, icon: 'alert', tone: 'bad', title: `${t.name}: an individual budget is over`, sub: `${t.ref} · private to that member and finance`, to: tripPath(t) });
  }
  for (const [tripId, list] of byTrip) {
    const a = list[0];
    out.push({ key: `e${tripId}`, icon: 'hourglass', tone: 'warn', title: `${joinNames(list.map(x => x.who))} ${list.length === 1 ? 'is' : 'are'} past the planned end`, sub: `${a.name} · ${humanDuration(now - new Date(a.at).getTime())} since ${fmtDay(a.at)}, ${fmtTime(a.at)}`, to: tripPath({ id: tripId, ref: a.ref }) });
  }
  for (const a of d.needsAttention) {
    if (a.kind === 'receipt_pending') out.push({ key: `r${a.tripId}${a.userId}`, icon: 'cloudOff', tone: 'warn', title: `${firstName(a.who)}’s receipt hasn’t reached the server`, sub: `${a.name} · saved on the phone ${relativeDay(a.at)}`, to: a.userId ? claimPath({ id: a.tripId, ref: a.ref }, a.userId) : tripPath({ id: a.tripId, ref: a.ref }) });
  }
  return out;
}

function DeptChart({ d, past }: { d: DashboardData['spendByDepartment']; past?: string }) {
  const rows = d.map(x => ({ ...x, total: Number(x.total), trips: Number(x.trips) }));
  if (!rows.length) return past
    ? <EmptyState icon="chart" title={`Nothing spent in ${past}`}>No expenses were logged on trips that month.</EmptyState>
    : <EmptyState icon="chart" title="Nothing spent yet this month">Spend appears here by department as members log expenses.</EmptyState>;
  const max = Math.max(...rows.map(r => r.total), 1);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div className="chart">
      {rows.map(x => (
        <div className="cr" key={x.id}>
          <span><b style={{ display: 'block', textAlign: 'left', fontFamily: 'var(--f-body)', fontWeight: 700 }}>{x.name}</b><small className="faint">{plural(x.trips, 'trip')}</small></span>
          <Bar pct={Math.round((x.total / max) * 100)} tone="pool" label={`${x.name}: ${inr(x.total)}`} />
          <b>{inr(x.total)}</b>
        </div>
      ))}
      <div className="cr" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <span><b style={{ fontFamily: 'var(--f-body)' }}>Total</b></span><span /><b>{inr(total)}</b>
      </div>
    </div>
  );
}

export function Dashboard() {
  useCrumbs([{ label: 'Dashboard' }]);
  const me = useMe();
  const mine = useMyTripIds(me.id);
  const people = usePeople();
  const now = useNow(30_000);
  // Spend by department: this month from the dashboard, last month on demand (?month=YYYY-MM).
  const [month, setMonth] = useState<'this' | 'last'>('this');
  const lastMonthStart = istDayStart(addDays(`${istDate(now).slice(0, 7)}-01`, -1));
  const lastMonth = useDashboardMonth(month === 'last' ? istDate(lastMonthStart).slice(0, 7) : null);
  const live = useLive();
  const stale = useStaleNote();
  const dash = useDashboard();
  const ready = useClaims({ status: 'ready' });
  const verified = useClaims({ status: 'verified' });
  const partPaid = useClaims({ status: 'part_paid' });
  const open = useClaims({ status: 'open' });
  const audit = useAudit('/finance/audit', { page: 1, pageSize: 40 });
  const feed = useMemo(() => (audit.data?.items ?? []).filter(inFeed).slice(0, 8), [audit.data]);
  const fresh = useNewSince(audit.data ? feed : undefined, a => String(a.id));

  if (dash.isLoading) return <main className="w-body" id="main"><Loading /></main>;
  if (dash.error || !dash.data) return <main className="w-body" id="main"><ErrorState error={dash.error} onRetry={() => void dash.refetch()} /></main>;
  const d = dash.data;
  const k = d.kpis;
  const readyList = ready.data ?? d.claimsReady;
  const unpaid = [...(verified.data ?? []), ...(partPaid.data ?? [])];
  const queryPeople = [...new Set([...(open.data ?? []), ...(ready.data ?? []), ...(verified.data ?? [])].filter(c => c.totals.query > 0).map(c => c.name))];
  const monthTrips = d.spendByDepartment.reduce((s, x) => s + Number(x.trips), 0);
  const today = istDate(now);
  const offline = !live.connected && live.everConnected;
  const attention = attentionItems(d, now);

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead
        title={`${greeting(now)}, ${firstName(me.name)}`}
        sub={`${fmtLongDay(now)} · every department, updated live`}
        actions={<>
          <Btn kind="sec" size="sm" icon="download" to="/exports">Export centre</Btn>
          <Btn kind="pri" size="sm" icon="inbox" to="/claims">Verify claims</Btn>
        </>}
      />
      {offline && (
        <Banner tone="warn" icon="wifiOff" title={`Live updates paused since ${fmtTime(live.offlineSince ?? now)}`}
          actions={<Btn kind="sec" size="sm" icon="refresh" onClick={retryRealtime}>Retry now</Btn>}>
          The connection dropped. Figures below are from {fmtTime(live.offlineSince ?? now)} and may be out of date. You can keep reading; verifying, budgets and payments wait until the connection returns, and nothing you typed is lost.
        </Banner>
      )}
      <div className="kpis">
        <Kpi label="Running trips" icon="play" to="/trips?view=running" value={k.runningTrips}
          sub={`${k.extendedTrips} Extended · ${plural(k.runningDepartments, 'department')}${stale}`} />
        <Kpi label="Claims to verify" icon="inbox" tone="acc" to="/claims" value={k.claimsReady}
          sub={k.claimsReady ? `${inr(sumBy(readyList, c => c.totals.selfPaise))}${k.oldestReadyAt ? ` · oldest ${waitingLabel(now - new Date(k.oldestReadyAt).getTime())}` : ''}${stale}` : `All caught up${stale}`} />
        <Kpi label="Verified, not paid" icon="coins" to="/claims?tab=verified" value={k.claimsVerifiedUnpaid}
          sub={`${inr(sumBy(unpaid, c => c.totals.balancePaise))} to pay${stale}`} />
        <Kpi label="Open queries" icon="message" tone={k.openQueries ? 'warn' : ''} to="/claims?tab=all&flag=query" value={k.openQueries}
          sub={k.openQueries ? (queryPeople.length ? `Waiting on ${joinNames(queryPeople.slice(0, 2))}${queryPeople.length > 2 ? ` and ${queryPeople.length - 2} more` : ''}${stale}` : `Waiting on members${stale}`) : `None open${stale}`} />
        <Kpi label={`Spent in ${fmtMonth(now)}`} icon="trend" value={<span className="money">{inr(k.monthSpendPaise)}</span>}
          sub={`1–${Number(today.slice(8))} ${fmtMonth(now).slice(0, 3)} · ${plural(monthTrips, 'trip')}${stale}`} />
      </div>

      <div className="g-main">
        <div className="stack">
          <Card title="Running now" icon="play" flush sub="Active and Extended trips" right={<Btn kind="ghost" size="sm" to="/trips?view=running">All trips</Btn>}>
            {d.running.length ? (
              <Tbl heads={[['Trip', '', '38%'], ['Progress'], ['Spend', 'r'], ['Trip pool', '', '140px'], ['Flags']]} label="Running trips">
                {d.running.map(t => (
                  <RowLink key={t.id} to={tripPath(t)}>
                    <td><TripNameCell t={t} sub={`${t.departmentName} · ${t.ref} · ${plural(t.memberCount, 'member')}`} /></td>
                    <td><StatusCell t={t} /></td>
                    <td className="r"><Amt paise={t.spendPaise} /></td>
                    <td><Usage spent={t.pool?.spentPaise ?? 0} alloc={t.pool?.allocatedPaise} />{t.individualCount > 0 && <span className="t2">+ {t.individualCount} individual</span>}</td>
                    <td><TripFlags t={t} max={1} mine={mine.data?.has(t.id)} nameOf={id => people.data?.find(p => p.id === id)?.name} /></td>
                  </RowLink>
                ))}
              </Tbl>
            ) : <EmptyState icon="play" title="No trips running">Active and Extended trips appear here the moment someone starts.</EmptyState>}
          </Card>
          <Card title="Claims ready for verification" icon="inbox" flush sub={`${plural(readyList.length, 'claim')} · ${inr(sumBy(readyList, c => c.totals.selfPaise))}`} right={<Btn kind="ghost" size="sm" to="/claims">{`All ${readyList.length}`}</Btn>}>
            {readyList.length ? (
              <Tbl heads={[['Member'], ['Trip'], ['Waiting'], ['Claimed', 'r']]} label="Claims ready for verification">
                {readyList.slice(0, 6).map(c => (
                  <RowLink key={c.tripId + c.userId} to={claimPath({ id: c.tripId, ref: c.ref }, { name: c.name, userId: c.userId })}>
                    <td><Who name={c.name} sub={c.departmentName} /></td>
                    <td>{c.tripName}</td>
                    <td><Pill tone={c.waitingMs > 5 * 86400000 ? 'warn' : 'line'}>{waitingLabel(c.waitingMs)}</Pill></td>
                    <td className="r"><Amt paise={c.totals.selfPaise} /></td>
                  </RowLink>
                ))}
              </Tbl>
            ) : <EmptyState icon="badgeCheck" title="All caught up">No claims are waiting. Claims arrive here when members end their trips.</EmptyState>}
          </Card>
        </div>
        <div className="stack">
          <Card title="Needs attention" icon="alert">
            <Feed items={attention} empty={<p className="sm-note" style={{ margin: 0 }}>Nothing needs a finance decision right now.</p>} />
          </Card>
          <Card title="Live activity" icon="activity" sub={offline ? 'Paused' : 'Today'}>
            {offline && <Banner tone="neutral" icon="clock" title={`Paused at ${fmtTime(live.offlineSince ?? now)}`} style={{ marginBottom: 6 }} />}
            {audit.isLoading ? <Loading /> : (
              <Feed
                items={feed.map(a => {
                  const l = describeActivity(a, me.id);
                  return { key: a.id, icon: l.icon, tone: l.tone, title: l.title, sub: l.sub, time: istDate(a.at) === today ? fmtTime(a.at) : relativeDay(a.at, now, false), to: a.tripId ? tripPath({ id: a.tripId, ref: a.tripRef }) : undefined, isNew: fresh.has(String(a.id)) };
                })}
                empty={<p className="sm-note" style={{ margin: 0 }}>Nothing yet today.</p>}
              />
            )}
          </Card>
        </div>
      </div>

      <div className="grid2">
        <Card title="Verified, not yet reimbursed" icon="coins" flush sub={inr(sumBy(unpaid, c => c.totals.balancePaise))}>
          {unpaid.length ? (
            <Tbl heads={[['Member'], ['Trip'], ['Verified'], ['To pay', 'r']]} label="Verified claims not yet reimbursed">
              {unpaid.map(c => (
                <RowLink key={c.tripId + c.userId} to={claimPath({ id: c.tripId, ref: c.ref }, { name: c.name, userId: c.userId }, { payments: true })}>
                  <td><Who name={c.name} sub={c.departmentName} /></td>
                  <td>{c.tripName}{c.status === 'part_paid' && <span className="t2">Part paid</span>}</td>
                  <td>{fmtDay(c.since)}</td>
                  <td className="r"><Amt paise={c.totals.balancePaise} /></td>
                </RowLink>
              ))}
            </Tbl>
          ) : <EmptyState icon="badgeCheck" title="Nothing to pay">Verified claims wait here until their payment is recorded.</EmptyState>}
        </Card>
        <Card title="Spend by department" icon="chart" sub={month === 'last' ? `${fmtMonth(lastMonthStart)} · whole month` : `${fmtMonth(now)} so far`}
          right={<Segs label="Month" value={month} onChange={setMonth} options={[['this', fmtMonth(now)], ['last', fmtMonth(lastMonthStart)]]} />}>
          {month === 'last'
            ? (lastMonth.data ? <div style={{ opacity: lastMonth.isFetching ? 0.6 : 1 }}><DeptChart d={lastMonth.data.spendByDepartment} past={fmtMonth(lastMonthStart)} /></div>
              : lastMonth.error ? <ErrorState error={lastMonth.error} onRetry={() => void lastMonth.refetch()} /> : <Loading label="Loading last month…" />)
            : <DeptChart d={d.spendByDepartment} />}
        </Card>
      </div>
    </main>
  );
}
