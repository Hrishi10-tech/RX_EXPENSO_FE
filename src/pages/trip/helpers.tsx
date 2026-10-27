/** Wording and small pieces for the trip page (W04), in the prototype's language. */
import type { ReactNode } from 'react';
import type { FinanceTrip, MemberRow, TimelineItem, TripDetail } from '../../api/types';
import type { IconName } from '../../components/Icon';
import { Flag, Pill } from '../../components/ui';
import { calendarDays, firstName, fmtDayTime, fmtTime, humanDuration, istDate } from '../../lib/format';

/** "MedTech Expo · Bengaluru & Mysuru" -> "MedTech Expo" for breadcrumbs. */
export const shortName = (name: string) => name.split(' · ')[0] ?? name;

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

export function joinedAfterStart(m: MemberRow, t: TripDetail): boolean {
  return m.role !== 'owner' && !!m.respondedAt && !!t.firstStartAt && ms(m.respondedAt) > ms(t.firstStartAt) && ms(m.respondedAt) > ms(t.scheduledStart);
}

export function joinCell(m: MemberRow, t: TripDetail): ReactNode {
  if (m.role === 'owner' && m.userId === t.ownerId && ms(m.invitedAt) <= ms(t.createdAt) + 60_000) return <>Created the trip<span className="t2">{fmtDayTime(t.createdAt)}</span></>;
  if (m.role === 'owner') return <>Owner<span className="t2">Since {fmtDayTime(t.updatedAt)}</span></>;
  switch (m.joinStatus) {
    case 'accepted': return joinedAfterStart(m, t)
      ? <>Invited {fmtDayTime(m.invitedAt)}<span className="t2">Accepted {m.respondedAt ? fmtTime(m.respondedAt) : ''}</span></>
      : <>Accepted<span className="t2">{m.respondedAt ? fmtDayTime(m.respondedAt) : ''}</span></>;
    case 'declined': return <>Declined<span className="t2">{m.respondedAt ? fmtDayTime(m.respondedAt) : ''}</span></>;
    case 'invited': return <>Invited<span className="t2">{fmtDayTime(m.invitedAt)} · no answer yet</span></>;
    case 'withdrawn': return <>Request withdrawn<span className="t2">Invited {fmtDayTime(m.invitedAt)}</span></>;
    case 'expired': return <>Request expired<span className="t2">Invited {fmtDayTime(m.invitedAt)}</span></>;
  }
}

export function startCell(m: MemberRow, t: TripDetail): ReactNode {
  if (!m.actualStart) return m.joinStatus === 'accepted' ? <span className="faint">Not started</span> : <span className="faint">–</span>;
  let sub = '';
  const diff = ms(t.scheduledStart) - ms(m.actualStart);
  if (m.startMethod === 'automatic') sub = 'At the scheduled start';
  else if (m.startBackdated) sub = 'Recorded at the scheduled start (flagged)';
  else if (m.startEarlyMinutes > 0 || diff > 60_000) sub = `${humanDuration(diff)} before the scheduled start`;
  else if (-diff > 60_000) sub = `${humanDuration(-diff)} after the scheduled start`;
  else sub = 'At the scheduled start';
  if (m.startDeviceTime && m.startReceivedAt && Math.abs(ms(m.startReceivedAt) - ms(m.actualStart)) > 5 * 60_000) sub = `Device time · reached the server ${fmtTime(m.startReceivedAt)}`;
  return <>{fmtDayTime(m.actualStart)}<span className="t2">{sub}</span></>;
}

export function methodCell(m: MemberRow, t: TripDetail): ReactNode {
  if (!m.actualStart) return <span className="faint">–</span>;
  if (m.startMethod === 'automatic') return <Pill tone="line" icon="zap">Automatic</Pill>;
  if (m.startBackdated) return <Flag icon="clock">Joined late · backdated</Flag>;
  if (joinedAfterStart(m, t)) return <Pill tone="line" icon="userPlus">Joined late</Pill>;
  const offline = m.startReceivedAt && Math.abs(ms(m.startReceivedAt) - ms(m.actualStart)) > 5 * 60_000;
  if (m.startEarlyMinutes > 0) return <Flag tone="info" icon={offline ? 'refresh' : 'play'}>{offline ? 'Manual, offline · early' : 'Manual · early'}</Flag>;
  if (offline) return <Flag tone="info" icon="refresh">Manual, offline</Flag>;
  return <Pill tone="line" icon="play">Manual</Pill>;
}

/** "6 days, 4 d 15 h" from start to end. */
export function durationText(start: string, end: string) {
  return `${calendarDays(start, end)} days, ${humanDuration(ms(end) - ms(start))}`;
}

export function ganttSub(m: MemberRow, t: TripDetail): string {
  if (!m.actualStart) return m.joinStatus === 'accepted' ? 'Not started' : m.joinStatus;
  if (m.startMethod === 'automatic') return `Automatic ${fmtTime(m.actualStart)}`;
  if (joinedAfterStart(m, t)) return `Joined late, ${fmtTime(m.actualStart)}`;
  const offline = m.startReceivedAt && Math.abs(ms(m.startReceivedAt) - ms(m.actualStart)) > 5 * 60_000;
  if (m.startEarlyMinutes > 0) return `Manual, ${humanDuration(m.startEarlyMinutes * 60_000)} early`;
  return `Manual ${fmtTime(m.actualStart)}${offline ? ', offline' : ''}`;
}

/** Timeline icon, tone and filter group per audit action (W04·d). */
export function timelineLook(a: TimelineItem): { icon: IconName; tone: '' | 'ok' | 'warn' | 'bad' | 'info' | 'acc' | 'pool' | 'priv'; group: 'life' | 'exp' | 'bud' | 'ver' | 'mem' | 'other' } {
  const meta = a.meta ?? {};
  switch (a.action) {
    case 'trip.create': return { icon: 'plus', tone: 'acc', group: 'mem' };
    case 'trip.update': return { icon: 'pencil', tone: '', group: 'other' };
    case 'trip.cancel': return { icon: 'ban', tone: 'bad', group: 'life' };
    case 'trip.close': return { icon: 'checkCircle', tone: 'ok', group: 'life' };
    case 'trip.extended': return { icon: 'hourglass', tone: 'warn', group: 'life' };
    case 'trip.handover': case 'trip.owner_assigned': return { icon: 'crown', tone: 'acc', group: 'mem' };
    case 'member.invite': return { icon: 'send', tone: '', group: 'mem' };
    case 'member.accept': return { icon: 'userCheck', tone: 'ok', group: 'mem' };
    case 'member.decline': case 'member.withdraw': case 'member.leave': case 'member.remove': return { icon: 'userX', tone: '', group: 'mem' };
    case 'member.start': return { icon: 'play', tone: 'ok', group: 'life' };
    case 'member.auto_start': return { icon: 'zap', tone: 'ok', group: 'life' };
    case 'member.end': return meta.method === 'finance' ? { icon: 'shield', tone: 'info', group: 'life' } : { icon: 'stop', tone: '', group: 'life' };
    case 'member.resume': return { icon: 'undo', tone: 'warn', group: 'life' };
    case 'member.start_ignored': case 'member.end_ignored': return { icon: 'refresh', tone: 'info', group: 'life' };
    case 'member.reminded': return { icon: 'bell', tone: 'warn', group: 'life' };
    case 'location.add': case 'location.update': case 'location.delete': return { icon: 'mapPin', tone: 'acc', group: 'other' };
    case 'expense.create': return { icon: 'receipt', tone: 'acc', group: 'exp' };
    case 'expense.update': return { icon: 'pencil', tone: 'warn', group: 'exp' };
    case 'expense.delete': return { icon: 'trash', tone: '', group: 'exp' };
    case 'expense.budget_source': return { icon: 'lock', tone: 'priv', group: 'bud' };
    case 'attachment.add': case 'attachment.delete': return { icon: 'paperclip', tone: '', group: 'exp' };
    case 'expense.verify': return { icon: 'check', tone: 'ok', group: 'ver' };
    case 'expense.query': return { icon: 'message', tone: 'warn', group: 'ver' };
    case 'expense.reject': return { icon: 'xCircle', tone: 'bad', group: 'ver' };
    case 'expense.reply': return { icon: 'message', tone: 'acc', group: 'ver' };
    case 'expense.dispute': return { icon: 'message', tone: 'warn', group: 'ver' };
    case 'expense.message': return { icon: 'send', tone: 'info', group: 'ver' };
    case 'expense.remind': return { icon: 'bellRing', tone: 'warn', group: 'ver' };
    case 'payment.record': return { icon: 'bank', tone: 'ok', group: 'ver' };
    case 'claim.reopen': case 'claim.close': return { icon: 'undo', tone: 'warn', group: 'ver' };
    case 'budget.set': case 'budget.change': case 'budget.remove': case 'budget.apply': return { icon: 'wallet', tone: 'pool', group: 'bud' };
    case 'document.upload': case 'document.delete': return { icon: 'file', tone: '', group: 'other' };
    case 'export.request': case 'export.ready': case 'export.device': case 'export.failed': case 'export.retry': return { icon: 'fileZip', tone: a.action === 'export.failed' ? 'bad' : 'ok', group: 'other' };
    default: return { icon: 'activity', tone: '', group: 'other' };
  }
}

/** Better words than the raw audit text for a few events the API leaves terse. */
export function timelineText(a: TimelineItem): { title: string; sub: string } {
  const meta = (a.meta ?? {}) as Record<string, unknown>;
  const src = meta.client === 'web' ? 'Web' : meta.client === 'mobile' ? 'Mobile' : meta.client === 'system' ? 'Server' : '';
  let title = a.text;
  let sub = '';
  if (a.action === 'expense.query' && meta.remark) sub = `“${String(meta.remark)}”`;
  if (a.action === 'expense.reject' && meta.remark) sub = `“${String(meta.remark)}”`;
  if (a.action === 'expense.verify' && meta.reason) sub = `“${String(meta.reason)}”`;
  if (a.action === 'claim.reopen' && meta.reason) sub = '';
  if (a.action === 'export.device') { title = `${a.actor} exported their claim on the phone`; sub = [Array.isArray(meta.formats) ? (meta.formats as string[]).map(f => f.toUpperCase()).join(' · ') : '', meta.provisional ? 'Provisional' : 'Final'].filter(Boolean).join(' · '); }
  if (a.action === 'export.request') { title = `${a.actor} requested an export`; sub = [String(meta.scope ?? '').replace(/_/g, ' '), meta.provisional ? 'Provisional' : ''].filter(Boolean).join(' · '); }
  if (a.action === 'export.ready') title = 'Export ready';
  if (a.action === 'document.upload') title = `${a.actor} uploaded ${String(meta.name ?? 'a document')}`;
  if (a.action === 'document.delete') title = `${a.actor} deleted a document`;
  if (a.action === 'budget.apply') { title = `Budget applied to ${String(meta.expenses ?? '')} earlier expense${meta.expenses === 1 ? '' : 's'}`; sub = `Charged to the ${meta.to === 'individual' ? 'individual budget' : 'trip pool'}`; }
  if (a.action === 'member.reminded') title = `${a.memberName} was reminded to end the trip`;
  // The server's timeline has no words of its own for these two yet ("expense dispute").
  if (a.action === 'expense.dispute') title = `${a.actor} asked finance about a decision on an expense`;
  if (a.action === 'expense.message') { title = `${a.actor} (finance) wrote to ${a.memberName ? firstName(a.memberName) : 'the member'} about an expense`; sub = meta.message ? `“${String(meta.message)}”` : ''; }
  return { title, sub: [sub, src].filter(Boolean).join(' · ') };
}

/** Status of each member for the header and banners. */
export function runningPastEnd(t: FinanceTrip) {
  return t.members.filter(m => m.joinStatus === 'accepted' && m.running && t.trip.status === 'extended');
}

export function dayGroups<T extends { at: string }>(items: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const d = istDate(it.at);
    map.set(d, [...(map.get(d) ?? []), it]);
  }
  return [...map.entries()];
}
