/**
 * Plain-language cells for the W11 audit log: the item an entry is about, what it was before, what it
 * became, where it came from (web, mobile or the server) and the device time when that differs.
 */
import type { AuditItem } from '../api/types';
import { firstName, fmtBytes, fmtCalDate, fmtTimeSec, inr, istDate, plural } from './format';
import { EXPORT_SCOPE, SOURCE, categoryLabel, fmtFormats, REIMBURSE_MODE, CLAIM_STATUS } from './labels';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const quote = (s: string, max = 60) => `“${s.length > max ? `${s.slice(0, max - 1)}…` : s}”`;

export interface AuditCells {
  item: string;
  before: string;
  after: string;
  /** Web, Mobile or Server. */
  source: 'Web' | 'Mobile' | 'Server' | '';
  /** The phone's own time for an action made offline, when it differs from when the server got it. */
  deviceTime: string | null;
  /** The entry concerns someone's individual budget (shown with a lock). */
  private: boolean;
}

const VER: Record<string, string> = { pending: 'To check', verified: 'Verified', query: 'Query', rejected: 'Rejected' };
const verLabel = (v: unknown) => VER[str(v)] ?? (str(v) || '–');
const srcLabel = (v: unknown) => SOURCE[str(v) as keyof typeof SOURCE] ?? (str(v) || 'Unbudgeted');
const money = (v: unknown) => { const n = num(v); return n == null ? '' : inr(n); };

/** Describes an expense row from its snapshot: "₹1,640 · Trip pool · Meals". */
function expenseLine(e: Obj): string {
  return [money(e.amountPaise), e.budgetSource !== undefined ? srcLabel(e.budgetSource) : '', e.category ? categoryLabel(str(e.category)) : ''].filter(Boolean).join(' · ');
}

/** What changed in an edit, as "field: old" and "field: new". */
function diff(before: Obj, after: Obj): [string, string] {
  const keys = ['description', 'amountPaise', 'category', 'spentAt', 'paidBy', 'paymentMode', 'budgetSource', 'remarks', 'locationId'];
  const label: Record<string, string> = { description: 'description', amountPaise: 'amount', category: 'category', spentAt: 'date', paidBy: 'paid by', paymentMode: 'payment mode', budgetSource: 'budget', remarks: 'remarks', locationId: 'location' };
  const show = (k: string, v: unknown) => (k === 'amountPaise' ? money(v) : k === 'category' ? categoryLabel(str(v)) : k === 'budgetSource' ? srcLabel(v) : k === 'spentAt' && v ? fmtCalDate(istDate(str(v))) : k === 'locationId' ? 'changed' : str(v) || '–');
  const changed = keys.filter(k => k in after && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (!changed.length) return ['–', 'Saved without changes'];
  return [changed.map(k => `${label[k]} ${show(k, before[k])}`).join(' · '), changed.map(k => `${label[k]} ${show(k, after[k])}`).join(' · ')];
}

/** Names for ids found in snapshots (departments, trip owners); unknown ids read as "changed". */
export interface AuditLookup { dept?: (id: string) => string | undefined; person?: (id: string) => string | undefined }

export function auditCells(a: AuditItem, look: AuditLookup = {}): AuditCells {
  const b = obj(a.before), x = obj(a.after), m = obj(a.meta);
  const client = str(a.client ?? m.client);
  const source: AuditCells['source'] = client === 'web' ? 'Web' : client === 'mobile' ? 'Mobile' : client === 'system' ? 'Server' : '';
  const who = a.member;
  let item = '', before = '–', after = '–', priv = false, deviceTime: string | null = null;
  const [family, verb] = a.action.split('.');

  switch (family) {
    case 'expense': {
      const desc = str(x.description) || str(b.description);
      item = desc ? `${desc}${who ? ` · ${who}` : ''}` : who ? `Expense · ${who}` : 'Expense';
      priv = x.budgetSource === 'individual' || b.budgetSource === 'individual';
      if (verb === 'create') { after = [expenseLine(x), x.paidBy === 'company' ? 'Company-paid' : ''].filter(Boolean).join(' · ') || 'Created'; }
      else if (verb === 'update') { [before, after] = diff(b, x); }
      else if (verb === 'delete') { before = expenseLine(b) || 'Recorded'; after = 'Deleted'; }
      else if (verb === 'budget_source') { before = srcLabel(b.budgetSource); after = x.budgetSource === 'individual' ? 'Individual (private)' : srcLabel(x.budgetSource); }
      else if (verb === 'verify') {
        before = verLabel(b.verification);
        const lowered = num(x.approvedPaise);
        after = `Verified${lowered != null ? ` at ${inr(lowered)}` : ''}${m.reason ? ` · ${quote(str(m.reason))}` : ''}`;
      } else if (verb === 'query') { before = verLabel(b.verification); after = `Query${m.remark ? ` · ${quote(str(m.remark))}` : ''}`; }
      else if (verb === 'reject') { before = verLabel(b.verification); after = `Rejected${m.remark ? ` · ${quote(str(m.remark))}` : ''}`; }
      else if (verb === 'reply') { before = 'Query'; after = `Replied${num(m.files) ? ` · ${plural(num(m.files)!, 'new file')}` : ''}`; }
      else if (verb === 'remind') { after = 'Reminded to finish uploading the receipt'; }
      else if (verb === 'dispute') { after = 'Wrote to finance about the decision'; }
      else if (verb === 'message') { after = `Wrote to ${who ? firstName(who) : 'the member'}${m.message ? ` · ${quote(str(m.message))}` : ''}`; }
      else if (verb === 'move') { before = 'On this trip'; after = 'Moved to another trip'; }
      break;
    }
    case 'finance':
      item = a.tripName ?? 'Trip';
      if (verb === 'handoff') after = `Asked ${str(m.toName) || 'another finance user'} to ${m.topic === 'claim' ? 'decide their claim' : 'set the budgets'}${m.message ? ` · ${quote(str(m.message))}` : ''}`;
      break;
    case 'attachment':
      item = str(m.name) || 'Receipt';
      after = verb === 'add' ? `Added${who ? ` by ${who}` : ''}` : 'Deleted';
      break;
    case 'budget': {
      const indiv = !!who || b.type === 'individual' || x.type === 'individual';
      priv = indiv;
      item = indiv ? `Individual · ${who || 'member'}` : 'Trip pool';
      if (verb === 'set' || verb === 'change' || verb === 'remove') {
        before = money(b.amountPaise) || '–';
        after = verb === 'remove' ? 'Removed' : [money(x.amountPaise), x.note ? quote(str(x.note), 40) : ''].filter(Boolean).join(' · ');
      } else if (verb === 'apply') { after = `${plural(num(m.expenses) ?? 0, 'earlier expense')} charged to the ${m.to === 'individual' ? 'individual budget' : 'trip pool'}`; }
      else if (verb === 'alert') { after = `Crossed ${num(m.level) ?? num(m.pct) ?? ''}%`; }
      break;
    }
    case 'payment':
      item = `Claim · ${who || 'member'}`;
      after = [money(x.amountPaise), REIMBURSE_MODE[str(x.mode) as keyof typeof REIMBURSE_MODE] ?? str(x.mode), str(x.reference), x.paidOn ? `paid ${fmtCalDate(str(x.paidOn))}` : ''].filter(Boolean).join(' · ');
      break;
    case 'claim':
      item = `Claim · ${who || 'member'}`;
      before = verb === 'reopen' ? CLAIM_STATUS.reimbursed.label : 'Reopened';
      after = verb === 'reopen' ? `Reopened${m.reason ? ` · ${quote(str(m.reason))}` : ''}` : CLAIM_STATUS.reimbursed.label;
      break;
    case 'document':
      item = str(m.name) || 'Finance document';
      after = verb === 'upload' ? ['Uploaded', m.scope === 'claim' && who ? `to ${who}’s claim` : m.scope === 'trip' ? 'to the trip' : ''].filter(Boolean).join(' ') : 'Deleted';
      break;
    case 'export': {
      item = a.tripName ? `Export · ${a.tripName}` : 'Export';
      const fm = Array.isArray(m.formats) ? fmtFormats(m.formats as never) : '';
      if (verb === 'request') after = [EXPORT_SCOPE[str(m.scope) as keyof typeof EXPORT_SCOPE]?.label ?? str(m.scope), fm, m.provisional ? 'Provisional' : 'Final'].filter(Boolean).join(' · ');
      else if (verb === 'ready') {
        const files = Array.isArray(m.files) ? (m.files as Obj[]) : [];
        after = `Ready · ${plural(files.length, 'file')} · ${fmtBytes(files.reduce((s, f) => s + (num(f.size) ?? 0), 0))}`;
      } else if (verb === 'failed') after = `Failed${m.error ? ` · ${quote(str(m.error))}` : ''}`;
      else if (verb === 'retry') after = 'Retried';
      else if (verb === 'device') { item = `Own claim · ${who || a.actor}`; after = ['Built on the phone', fm, m.provisional ? 'Provisional' : 'Final'].filter(Boolean).join(' · '); }
      break;
    }
    case 'member': {
      item = who || 'Membership';
      const start = str(x.actualStart), end = str(x.actualEnd);
      if (verb === 'invite') { before = '–'; after = m.reinvite ? 'Invited again' : 'Invited'; }
      else if (verb === 'accept') { before = 'Invited'; after = m.startChoice === 'now' ? 'Member · starting now' : 'Member'; }
      else if (verb === 'decline') { before = 'Invited'; after = 'Declined'; }
      else if (verb === 'withdraw') { before = 'Invited'; after = 'Withdrawn'; }
      else if (verb === 'start' || verb === 'auto_start' || verb === 'resume') {
        before = verb === 'resume' ? 'Ended' : 'Not started';
        const early = num(m.earlyMinutes);
        after = [start ? `Started ${fmtTimeSec(start)}` : 'Started', verb === 'auto_start' ? 'automatic' : '', early ? `${early} min early` : '', m.offline ? 'offline' : ''].filter(Boolean).join(' · ');
        if (m.offline && start && Math.abs(new Date(start).getTime() - new Date(a.at).getTime()) > 60_000) deviceTime = fmtTimeSec(start);
      } else if (verb === 'end') {
        before = 'Running';
        after = [end ? `Ended ${fmtTimeSec(end)}` : 'Ended', m.method === 'finance' ? 'by finance' : '', m.offline ? 'offline' : ''].filter(Boolean).join(' · ');
        if (m.offline && end && Math.abs(new Date(end).getTime() - new Date(a.at).getTime()) > 60_000) deviceTime = fmtTimeSec(end);
      } else if (verb === 'start_ignored' || verb === 'end_ignored') {
        before = m.kept ? `Kept ${fmtTimeSec(str(m.kept))}` : 'Kept';
        after = m.deviceTime ? `Later ${verb === 'start_ignored' ? 'start' : 'end'} ${fmtTimeSec(str(m.deviceTime))} ignored; the earlier one stands` : 'Ignored';
        if (m.deviceTime) deviceTime = fmtTimeSec(str(m.deviceTime));
      } else if (verb === 'leave' || verb === 'remove') { before = 'Member'; after = verb === 'leave' ? 'Left' : 'Removed'; }
      else if (verb === 'reminded') { after = 'Reminded to end the trip'; }
      break;
    }
    case 'trip': {
      item = a.tripName ?? 'Trip';
      if (verb === 'create') after = [str(x.status) === 'active' ? 'Active' : 'Scheduled', x.type === 'same_day' ? 'same day' : ''].filter(Boolean).join(' · ');
      else if (verb === 'update') { const [bf, af] = tripDiff(b, x); before = bf; after = af; }
      else if (verb === 'cancel') { before = 'Scheduled'; after = `Cancelled${m.reason ? ` · ${quote(str(m.reason))}` : ''}`; }
      else if (verb === 'close') { before = 'Running'; after = 'Closed'; }
      else if (verb === 'extended') { before = 'Running'; after = `Extended${num(m.running) ? ` · ${plural(num(m.running)!, 'member')} still running` : ''}`; }
      else if (verb === 'handover' || verb === 'owner_assigned') {
        before = `Owner ${look.person?.(str(b.ownerId)) ?? 'before'}`;
        after = `Owner ${look.person?.(str(x.ownerId)) ?? 'changed'}${verb === 'owner_assigned' ? ' · assigned by finance' : ''}`;
      }
      break;
    }
    case 'location':
      item = str(x.city) || str(b.city) || 'Location';
      after = verb === 'add' ? 'Added' : verb === 'delete' ? 'Deleted' : 'Edited';
      break;
    case 'user': {
      item = str(x.name) || str(b.name) || 'User';
      if (verb === 'deactivate') { before = 'Active'; after = `Deactivated${Array.isArray(m.ownedLiveTrips) && m.ownedLiveTrips.length ? ` · owned ${(m.ownedLiveTrips as string[]).join(', ')}` : ''}${m.reason ? ` · ${quote(str(m.reason))}` : ''}`; }
      else if (verb === 'reactivate') { before = 'Deactivated'; after = 'Active'; }
      else if (verb === 'app_link') { after = `App link sent${m.email ? ` to ${str(m.email)}` : ''}`; }
      else if (verb === 'roles') { before = roles(b); after = roles(x); }
      else if (verb === 'create') { after = roles(x); }
      else if (verb === 'department') { before = look.dept?.(str(b.departmentId)) ?? 'Previous department'; after = look.dept?.(str(x.departmentId)) ?? 'New department'; }
      else { after = m.passwordReset ? 'Password reset' : 'Details edited'; }
      break;
    }
    case 'department':
      item = str(x.name) || str(b.name) || 'Department';
      if (verb === 'create') after = 'Added';
      else if (b.name !== x.name) { before = str(b.name); after = str(x.name); }
      else if (!!b.archivedAt !== !!x.archivedAt) { before = b.archivedAt ? 'Archived' : 'In use'; after = x.archivedAt ? 'Archived' : 'Restored'; }
      break;
    default:
      item = a.entity;
  }
  // The server's own label names the expense, budget, person or department (with the amount for expenses);
  // trips and exports read better with the trip's name.
  if (a.item && family !== 'trip' && family !== 'export' && family !== 'finance') {
    item = (family === 'expense' || family === 'attachment') && who && !a.item.includes(who) ? `${a.item} · ${firstName(who)}` : a.item;
  }
  return { item, before: before || '–', after: after || '–', source, deviceTime, private: priv };
}

function roles(u: Obj): string {
  return ['Employee', u.isFinance ? 'Finance' : '', u.isAdmin ? 'Administrator' : ''].filter(Boolean).join(' · ');
}

function tripDiff(b: Obj, x: Obj): [string, string] {
  const label: Record<string, string> = { name: 'name', scheduledStart: 'start', tentativeEnd: 'end', purpose: 'purpose', clientEvent: 'client or event', notes: 'notes' };
  const changed = Object.keys(label).filter(k => k in x && JSON.stringify(b[k]) !== JSON.stringify(x[k]));
  if (!changed.length) return ['–', 'Edited'];
  const show = (k: string, v: unknown) => (k === 'scheduledStart' || k === 'tentativeEnd') && v ? fmtCalDate(istDate(str(v))) : str(v) || '–';
  return [changed.map(k => `${label[k]} ${show(k, b[k])}`).join(' · '), changed.map(k => `${label[k]} ${show(k, x[k])}`).join(' · ')];
}
