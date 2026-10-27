/**
 * W04 trip overview: tiles, members and timing against the scheduled window, claims, budgets, spend by
 * category, locations and recent activity; with the state banners of W04·f (extended), W04·h (owner
 * deactivated), W04·i (closed with claims waiting), W04·j (cancelled) and W05·d (finance member).
 */
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import type { FinanceTrip, IndividualBudget, MemberRow, TimelineItem } from '../../api/types';
import { Gantt } from '../../components/Gantt';
import { BudgetPanel } from '../../components/BudgetPanel';
import { HandoffButton } from '../../components/handoff';
import { Icon } from '../../components/Icon';
import { Amt, Banner, Bar, Btn, Card, ClaimStatusPill, Feed, Kpi, Pill, Prog, Tbl, Who } from '../../components/ui';
import { firstName, fmtCalShort, fmtDayTime, fmtDayTimeComma, humanDuration, inr, joinNames, plural, relativeDay } from '../../lib/format';
import { CATEGORY } from '../../lib/labels';
import { claimPath, tripPath } from '../../lib/links';
import { durationText, ganttSub, joinCell, methodCell, startCell, timelineLook, timelineText } from './helpers';

export interface OverviewActions {
  budgetsLocked: string | null;
  openBudgets: () => void;
  endMember: (m: MemberRow) => void;
  assignOwner: () => void;
  removeIndividual: (b: IndividualBudget) => void;
  openExpenses: () => void;
}

function NowCell({ m, t, onEnd, now }: { m: MemberRow; t: FinanceTrip; onEnd: () => void; now: number }) {
  if (m.joinStatus === 'declined') return <Pill tone="line">Declined</Pill>;
  if (m.joinStatus === 'invited') return <Pill tone="line">Invited</Pill>;
  if (m.joinStatus === 'withdrawn' || m.joinStatus === 'expired') return <Pill tone="line">{m.joinStatus === 'withdrawn' ? 'Withdrawn' : 'Expired'}</Pill>;
  if (m.actualEnd) {
    if (m.endMethod === 'finance') return <><Pill tone="info" icon="shield">Ended by finance</Pill><span className="t2">Set to {fmtDayTime(m.actualEnd)}{m.actualStart ? ` · ${durationText(m.actualStart, m.actualEnd)}` : ''}</span></>;
    return <><Pill tone="line">Ended</Pill><span className="t2">{fmtDayTime(m.actualEnd)}{m.actualStart ? ` · ${durationText(m.actualStart, m.actualEnd)}` : ''}</span></>;
  }
  if (m.running) {
    const past = t.trip.status === 'extended' ? now - new Date(t.trip.tentativeEnd).getTime() : 0;
    return (
      <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
        {past > 0 ? <Pill tone="warn" icon="hourglass">Extended</Pill> : <Pill tone="ok">Running</Pill>}
        {past > 0 && <span className="t2">{humanDuration(past)} past the planned end</span>}
        <Btn kind="ghost" size="xs" icon="stop" onClick={onEnd}>End trip…</Btn>
      </div>
    );
  }
  return <Pill tone="acc" icon="calendar">Not started</Pill>;
}

export function Overview({ t, timeline, now, actions }: { t: FinanceTrip; timeline: TimelineItem[] | undefined; now: number; actions: OverviewActions }) {
  const trip = t.trip;
  const live = trip.status === 'scheduled' || trip.status === 'active' || trip.status === 'extended';
  const accepted = t.members.filter(m => m.joinStatus === 'accepted');
  const claimOf = (uid: string) => t.claims.find(c => c.userId === uid);
  const company = t.expenses.filter(e => e.paidBy === 'company');
  const companyPaise = company.reduce((s, e) => s + e.amountPaise, 0);
  const unbudgeted = t.claims.reduce((s, c) => s + c.unbudgetedPaise, 0);
  const unbudgetedCount = t.expenses.filter(e => e.paidBy === 'self' && e.budgetSource === 'unbudgeted').length;
  const unbudgetedWho = [...new Set(t.expenses.filter(e => e.paidBy === 'self' && e.budgetSource === 'unbudgeted').map(e => firstName(e.userName)))];
  const settled = t.expenses.filter(e => e.paidBy === 'self' && (e.verification === 'verified' || e.verification === 'rejected')).length;
  const selfCount = t.expenses.filter(e => e.paidBy === 'self').length;
  const queries = t.expenses.filter(e => e.verification === 'query').length;
  const pool = t.budgets.pool;
  const running = accepted.filter(m => m.running);
  const extended = trip.status === 'extended' ? running : [];
  const ready = t.claims.filter(c => c.status === 'ready');
  const poolOnly = accepted.filter(m => !t.budgets.individuals.some(b => b.memberUserId === m.userId)).map(m => m.name);
  const indNames = t.budgets.individuals.map(b => firstName(b.memberName));

  const cats = useMemo(() => {
    const max = Math.max(1, ...t.categories.map(c => c.totalPaise));
    return t.categories.map(c => {
      const ex = t.expenses.filter(e => e.category === c.category);
      const note = ex.length && ex.every(e => e.paidBy === 'company') ? 'company-paid' : ex.length && ex.every(e => e.budgetSource === 'individual') ? 'private' : '';
      return { ...c, note, w: Math.round((c.totalPaise / max) * 100) };
    });
  }, [t.categories, t.expenses]);

  const recent = (timeline ?? []).slice(-6).reverse();
  const names = new Map(t.members.map(m => [m.userId, m.name]));

  const saved = (useLocation().state as { budgetsSaved?: { at: string; lines: string[]; charged?: number; asked?: string[] } } | null)?.budgetsSaved;
  const banners = (
    <>
      {saved && Date.now() - new Date(saved.at).getTime() < 10 * 60_000 && (
        <Banner tone="info" icon="wallet" title={`Budgets saved at ${fmtDayTime(saved.at).split(' ').pop()}`}>
          {saved.lines.filter(l => !(saved.asked?.length && / will hold both budgets/.test(l))).join(' ') || 'Members see the new budgets live in the app.'}
          {saved.asked && saved.asked.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <Icon name="lock" size={14} />
              <span><b>{joinNames(saved.asked)} {saved.asked.length === 1 ? 'was' : 'were'} asked to choose.</b> {saved.asked.length === 1 ? 'They hold' : 'Each holds'} both the trip pool and an individual budget, so the app asks {saved.asked.length === 1 ? 'them' : 'each of them'} to pick one for every earlier unbudgeted expense (FR-BUD-03). Those stay Unbudgeted until chosen.</span>
            </div>
          )}
        </Banner>
      )}
      {t.viewer.isMember && (
        <Banner tone="info" icon="shield" title="You’re on this trip, so some finance actions are locked for you"
          actions={<HandoffButton trip={t.trip} topic="budgets" financeUsers={t.financeUsers} />}>
          Another finance user sets its budgets, verifies your claim and records your payment. You can still see everything, verify other members’ claims and export (FR-VER-10).
        </Banner>
      )}
      {!trip.ownerActive && live && (
        <Banner tone="bad" icon="userX" title="Nobody can manage this trip"
          actions={<Btn kind="pri" size="sm" icon="crown" onClick={actions.assignOwner}>Assign new owner</Btn>}>
          {trip.ownerName}’s account was deactivated. Until you assign a new owner, nobody can edit its dates, invite colleagues or cancel it.
        </Banner>
      )}
      {extended.length > 0 && (
        <Banner tone="warn" icon="hourglass"
          title={extended.length === 1 ? `${extended[0].name} is still running, ${humanDuration(now - new Date(trip.tentativeEnd).getTime())} past the planned end` : `${joinNames(extended.map(m => m.name))} are still running, ${humanDuration(now - new Date(trip.tentativeEnd).getTime())} past the planned end`}
          actions={<>{extended.slice(0, 3).map(m => <Btn key={m.userId} kind={extended.length === 1 ? 'pri' : 'sec'} size="sm" icon="stop" onClick={() => actions.endMember(m)}>{`End ${firstName(m.name)}’s trip…`}</Btn>)}</>}>
          The planned end was {fmtDayTimeComma(trip.tentativeEnd)}. {accepted.filter(m => m.actualEnd).length ? `${joinNames(accepted.filter(m => m.actualEnd).map(m => firstName(m.name)))} ${accepted.filter(m => m.actualEnd).length === 1 ? 'has' : 'have'} ended. ` : ''}Members are reminded at the planned end and every 12 hours. End a trip only for someone who is back.
        </Banner>
      )}
      {trip.status === 'closed' && ready.length > 0 && (
        <Banner tone="info" icon="inbox" title={`${plural(ready.length, 'claim')} ${ready.length === 1 ? 'is' : 'are'} ready for verification`}
          actions={<Btn kind="pri" size="sm" icon="scan" to={claimPath(trip, ready[0])}>{`Review ${firstName(ready[0].name)}’s claim`}</Btn>}>
          Everyone had ended by {trip.closedAt ? fmtDayTimeComma(trip.closedAt) : 'the close'}, when the trip closed.
        </Banner>
      )}
      {trip.status === 'cancelled' && (
        <Banner tone="neutral" icon="ban" title={`Cancelled${trip.cancelledBy ? ` by ${names.get(trip.cancelledBy) ?? 'the owner'}` : ''}${trip.cancelledAt ? ` on ${fmtDayTimeComma(trip.cancelledAt)}` : ''}${trip.firstStartAt ? '' : ', before it started'}`}>
          {trip.cancelReason ? `“${trip.cancelReason}” ` : ''}Members and invitees were told, and nobody will be started. Expenses already logged, such as advance bookings, stay on their members’ claims for you to verify and pay (FR-TRIP-07).
        </Banner>
      )}
      {pool && pool.state === 'over' && live && (
        <Banner tone="bad" icon="alert" title={`Trip pool over by ${inr(pool.spentPaise - pool.allocatedPaise)}`}
          actions={!actions.budgetsLocked ? <Btn kind="sec" size="sm" icon="wallet" onClick={actions.openBudgets}>Change budgets</Btn> : undefined}>
          Expenses still save. Members see a red banner. Decide whether to raise the pool or verify the overage as it is.
        </Banner>
      )}
      {pool && pool.state === 'warn' && live && (pool.spentPaise === pool.allocatedPaise
        ? <Banner tone="warn" icon="alert" title="Trip pool fully used">All {inr(pool.allocatedPaise)} is used. Expenses still save; the next one takes it over budget. Members see an amber banner.</Banner>
        : <Banner tone="warn" icon="alert" title={`Trip pool ${pool.pct}% used`}>{inr(pool.remainingPaise)} left of {inr(pool.allocatedPaise)}. Members see an amber banner.</Banner>)}
    </>
  );

  return (
    <>
      {banners}
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kpi label="Trip spend" icon="receipt" value={<span className="money">{inr(t.totals.spendPaise)}</span>} sub={`${plural(t.totals.expenseCount, 'expense')}${company.length ? ` · ${company.length} company-paid` : ''}`} />
        <Kpi label="Trip pool" icon="users" tone={pool && pool.state === 'over' ? 'warn' : ''} onClick={actions.openBudgets}
          value={pool ? <span className="money">{pool.spentPaise > pool.allocatedPaise ? `Over by ${inr(pool.spentPaise - pool.allocatedPaise)}` : pool.spentPaise === pool.allocatedPaise ? 'Fully used' : `${inr(pool.remainingPaise)} left`}</span> : 'Not set'}
          sub={pool ? `${pool.pct}% of ${inr(pool.allocatedPaise)} used` : 'Only finance sets budgets'} />
        <Kpi label="Individual budgets" icon="lock"
          value={t.budgets.individuals.length ? `${t.budgets.individuals.length} · ${indNames.length === 1 ? indNames[0] : 'members'}` : 'None'}
          sub={t.budgets.individuals.length === 1 ? `${inr(t.budgets.individuals[0].remainingPaise)} left · private` : t.budgets.individuals.length ? `${inr(t.budgets.individuals.reduce((s, b) => s + b.remainingPaise, 0))} left in total · private` : 'Private to each member'} />
        <Kpi label="Verification" icon="badgeCheck" onClick={actions.openExpenses}
          value={`${settled} of ${selfCount}`} sub={queries ? `${plural(queries, 'query', 'queries')} open` : settled ? 'No open queries' : 'Nothing checked yet'} />
      </div>

      <Card title="Members and timing" icon="users" flush sub="Each member’s actual start and end against the scheduled window (FR-START-06, FR-END-08)">
        <div className="card-b">
          <Gantt scheduledStart={trip.scheduledStart} tentativeEnd={trip.tentativeEnd} now={now}
            rows={accepted.map(m => ({ key: m.userId, name: m.name, sub: ganttSub(m, trip), start: m.actualStart, end: m.actualEnd }))} />
        </div>
        <Tbl label="Members" heads={[['Member'], ['Join'], ['Actual start'], ['Start method'], [trip.status === 'active' || trip.status === 'scheduled' ? 'Now' : 'Status'], ['Claim', 'r']]}>
          {t.members.map(m => {
            const c = claimOf(m.userId);
            return (
              <tr key={m.userId} className={m.joinStatus === 'declined' || m.joinStatus === 'withdrawn' || m.joinStatus === 'expired' ? 'dim-row' : ''}>
                <td><Who name={m.name} sub={`${m.employeeCode}${m.role === 'owner' ? ' · owner' : ''}${m.userId === trip.ownerId && !trip.ownerActive ? ' · deactivated' : ''}`} crown={m.role === 'owner'} /></td>
                <td>{joinCell(m, trip)}</td>
                <td>{startCell(m, trip)}</td>
                <td>{methodCell(m, trip)}</td>
                <td><NowCell m={m} t={t} now={now} onEnd={() => actions.endMember(m)} /></td>
                <td className="r">
                  {m.joinStatus === 'accepted' && c ? (
                    <Link to={claimPath(trip, m)} style={{ textDecoration: 'none', color: 'inherit', display: 'inline-grid', justifyItems: 'end' }}>
                      <ClaimStatusPill status={m.claimStatus} />
                      <span className="t2">{inr(c.selfPaise)}{c.individualPaise ? ` · ${inr(c.individualPaise)} private` : ''}</span>
                    </Link>
                  ) : <span className="faint">No claim</span>}
                </td>
              </tr>
            );
          })}
        </Tbl>
      </Card>

      {t.claims.length > 0 && (trip.status === 'closed' || t.claims.some(c => c.status !== 'open')) && (
        <Card title="Claims" icon="inbox" flush sub={`${inr(t.claims.reduce((s, c) => s + c.selfPaise, 0))} claimed`}>
          <Tbl label="Claims" heads={[['Member'], ['Ran'], ['Expenses', 'num'], ['Claimed', 'r'], ['Checked'], ['Status'], ['', 'r']]}>
            {t.claims.map(c => {
              const m = t.members.find(x => x.userId === c.userId);
              return (
                <tr key={c.userId}>
                  <td><Who name={c.name} sub={m?.role === 'owner' ? `${m.employeeCode} · owner` : m?.employeeCode} crown={m?.role === 'owner'} /></td>
                  <td>{m?.actualStart ? `${fmtDayTime(m.actualStart)} → ${m.actualEnd ? fmtDayTime(m.actualEnd) : 'running'}` : 'Not started'}<span className="t2">{m?.startMethod === 'automatic' ? 'Automatic' : 'Manual'} start · {m?.endMethod === 'finance' ? 'ended by finance' : m?.actualEnd ? 'manual end' : 'still running'}</span></td>
                  <td className="num">{c.count}</td>
                  <td className="r"><Amt paise={c.selfPaise} /></td>
                  <td><Prog done={c.verified + c.rejected} total={c.count - (t.expenses.filter(e => e.userId === c.userId && e.paidBy === 'company').length)} queries={c.query} /></td>
                  <td><ClaimStatusPill status={c.status} /></td>
                  <td className="r"><div className="acts"><Btn kind={c.status === 'verified' || c.status === 'part_paid' ? 'sec' : 'pri'} size="xs" to={claimPath(trip, c)}>Review</Btn>{(c.status === 'verified' || c.status === 'part_paid' || c.status === 'reimbursed') && <Btn kind="pri" size="xs" to={claimPath(trip, c, { payments: true })}>{c.status === 'reimbursed' ? 'Payments' : 'Pay'}</Btn>}</div></td>
                </tr>
              );
            })}
          </Tbl>
        </Card>
      )}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <Card title="Budgets" icon="wallet">
          <BudgetPanel pool={pool} individuals={t.budgets.individuals} poolOnly={poolOnly} unbudgeted={unbudgeted}
            unbudgetedNote={unbudgetedCount ? `${plural(unbudgetedCount, 'expense')}${unbudgetedWho.length === 1 ? ` · ${unbudgetedWho[0]}’s, private` : ''}` : undefined}
            companyPaise={companyPaise} onRemoveIndividual={actions.budgetsLocked ? undefined : actions.removeIndividual}
            footer={
              <div className="budgets-cta" style={{ marginTop: 0, alignItems: 'center' }}>
                <Btn kind="pri" size="sm" icon={actions.budgetsLocked ? 'lock' : 'wallet'} locked={actions.budgetsLocked} onClick={actions.openBudgets}>{pool || t.budgets.individuals.length ? 'Change budgets' : 'Set budgets'}</Btn>
                <Btn kind="ghost" size="sm" onClick={actions.openBudgets}>Change log</Btn>
                {actions.budgetsLocked && <span className="sm-note">Locked for you</span>}
              </div>
            } />
        </Card>
        <Card title="Spend by category" icon="chart">
          {cats.length ? (
            <>
              <div className="chart">
                {cats.map(c => (
                  <div className="cr" key={c.category} style={{ gridTemplateColumns: '190px 1fr 110px' }}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name={CATEGORY[c.category].icon} size={15} />{CATEGORY[c.category].label}{c.note && <span className="sm-note">{c.note}</span>}</span>
                    <Bar pct={c.w} tone="pool" label={`${CATEGORY[c.category].label}: ${inr(c.totalPaise)}, ${c.pct}%`} />
                    <b>{inr(c.totalPaise)} <span className="sm-note" style={{ fontFamily: 'var(--f-body)' }}>{c.pct}%</span></b>
                  </div>
                ))}
              </div>
              <div className="sm-note" style={{ marginTop: 10 }}>Finance sees every expense, private ones included. Members see totals built only from what they may see.</div>
            </>
          ) : <p className="sm-note" style={{ margin: 0 }}>No expenses yet. Spend appears here by category as members log it.</p>}
        </Card>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="Locations" icon="mapPin">
            <Feed items={t.locations.map(l => ({
              key: l.id, icon: 'mapPin', tone: 'acc',
              title: `${l.city}${l.venue ? ` · ${l.venue}` : ''}`,
              sub: `${fmtCalShort(l.arrivalDate)}–${fmtCalShort(l.departureDate)} · ${l.isPrimary ? 'created from the primary city' : `added by ${names.get(l.addedBy) ?? 'a member'}`} · ${plural(l.expenseCount, 'expense')}`,
              time: <span className="money">{inr(l.totalPaise)}</span>,
            }))} empty={<p className="sm-note" style={{ margin: 0 }}>No locations yet.</p>} />
            <div className="sm-note" style={{ marginTop: 8 }}>Members add cities as they travel. Each location shows its own subtotal (FR-BUD-10).</div>
          </Card>
        </div>
        <Card title="Recent activity" icon="activity">
          <Feed items={recent.map(a => {
            const look = timelineLook(a), tx = timelineText(a);
            return { key: a.id, icon: look.icon, tone: look.tone, title: tx.title, sub: tx.sub, time: relativeDay(a.at, now) };
          })} empty={<p className="sm-note" style={{ margin: 0 }}>Nothing yet.</p>} />
          <div style={{ marginTop: 8 }}><Btn kind="ghost" size="sm" icon="history" to={tripPath(trip, 'timeline')}>Full timeline</Btn></div>
        </Card>
      </div>
    </>
  );
}
