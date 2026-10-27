/** Pieces of a trip row shared by the dashboard and the trips list (prototype tripRow()). */
import { type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { TripRow } from '../api/types';
import { fmtDayTime, fmtRange, fmtShortDayTime, humanDuration, istDate, plural } from '../lib/format';
import { tripPath } from '../lib/links';
import { Flag, TripStatusPill } from './ui';

/** "Day 2 of 4", or "+3 d 20 h past the end" for an Extended trip. */
export function progressLine(t: Pick<TripRow, 'status' | 'progress'>): string | null {
  if (!t.progress) return null;
  if (t.status === 'extended') return `+${humanDuration(t.progress.extendedMs)} past the end`;
  if (t.status === 'active') return `Day ${t.progress.day} of ${t.progress.of}`;
  return null;
}

export function StatusCell({ t }: { t: TripRow }) {
  const line = progressLine(t);
  return <><TripStatusPill status={t.status} />{line && <span className="t2" style={{ marginTop: 3 }}>{line}</span>}</>;
}

/** Scheduled window and what actually happened. */
export function ScheduleCell({ t }: { t: TripRow }) {
  let actual: string;
  if (t.status === 'cancelled') actual = t.cancelledAt ? `Cancelled ${fmtDayTime(t.cancelledAt)}${t.firstStartAt ? '' : ', before it started'}` : 'Cancelled';
  else if (!t.firstStartAt) actual = 'Not started';
  else if (t.status === 'closed' && t.lastEnd) actual = istDate(t.firstStartAt) === istDate(t.lastEnd) ? `${fmtShortDayTime(t.firstStartAt)} → ${fmtDayTime(t.lastEnd).split(' ').pop()}` : `${fmtShortDayTime(t.firstStartAt)} → ${fmtShortDayTime(t.lastEnd)}`;
  else actual = `From ${fmtDayTime(t.firstStartAt)}`;
  return <><span style={{ fontSize: 13 }}>{fmtRange(t.scheduledStart, t.tentativeEnd)}</span><span className="t2">{actual}</span></>;
}

export function memberLine(t: TripRow): string {
  return [plural(t.memberCount, 'member'), t.invitedCount ? `${t.invitedCount} invited` : '', t.declinedCount ? `${t.declinedCount} declined` : ''].filter(Boolean).join(' · ');
}

/** Flags worth a glance: early start, over budget, owner gone, unbudgeted spend, late entry, your own trip. */
export function TripFlags({ t, mine, nameOf, max = 2 }: { t: TripRow; mine?: boolean; nameOf?: (id: string) => string | undefined; max?: number }) {
  const finance = (t.financeMemberIds ?? []).map(id => nameOf?.(id) ?? 'A finance user');
  const out: ReactNode[] = [];
  if (!t.ownerActive && (t.status === 'scheduled' || t.status === 'active' || t.status === 'extended')) out.push(<Flag key="own" tone="bad" icon="userX">Owner deactivated</Flag>);
  const poolOver = !!t.pool && t.pool.spentPaise > t.pool.allocatedPaise;
  if (poolOver || t.individualOver) out.push(<Flag key="over" tone="bad" icon="alert">{poolOver ? 'Over budget' : 'Individual over'}</Flag>);
  if (t.firstStartAt && t.earlyStarts > 0 && new Date(t.firstStartAt) < new Date(t.scheduledStart)) {
    out.push(<Flag key="early" tone="info" icon="play">{`Started ${humanDuration(new Date(t.scheduledStart).getTime() - new Date(t.firstStartAt).getTime())} early`}</Flag>);
  }
  if (mine) out.push(<Flag key="mine" tone="info" icon="shield" title="You can’t set its budgets or decide your own claim (FR-VER-10)">You’re a member</Flag>);
  else if (finance.length) out.push(<Flag key="fin" tone="info" icon="shield" title={`${finance.join(', ')} ${finance.length === 1 ? 'is' : 'are'} on this trip: another finance user sets its budgets and decides their claims (FR-VER-10)`}>Finance member</Flag>);
  if (t.enteredAfterStart) out.push(<Flag key="eas" tone="info" icon="clock">Entered after start</Flag>);
  if (t.poolPaise == null && t.individualCount === 0 && t.spendPaise > 0 && (t.status === 'active' || t.status === 'extended')) out.push(<Flag key="unb" icon="wallet">Unbudgeted</Flag>);
  if (t.claimsReady > 0 && out.length < 2) out.push(<Flag key="ready" tone="info" icon="inbox">{`${t.claimsReady} ${t.claimsReady === 1 ? 'claim' : 'claims'} ready`}</Flag>);
  return <div className="flags">{out.slice(0, max)}</div>;
}

/** A table row that opens a page: the whole row is clickable and keyboard reachable, the name is a real link. */
export function RowLink({ to, children, className, state }: { to: string; children: ReactNode; className?: string; state?: unknown }) {
  const nav = useNavigate();
  const go = (e: MouseEvent | KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('a,button,input,select,textarea,[role=checkbox]')) return;
    nav(to, { state });
  };
  return (
    <tr className={className} data-href={to} tabIndex={0} onClick={go} onKeyDown={e => { if (e.key === 'Enter') go(e); }}>
      {children}
    </tr>
  );
}

export function TripNameCell({ t, sub }: { t: Pick<TripRow, 'id' | 'ref' | 'name'>; sub?: ReactNode }) {
  return <><Link className="link" to={tripPath(t)}>{t.name}</Link>{sub && <span className="t2">{sub}</span>}</>;
}
