/** Audit rows written as the dashboard's live activity feed, in plain words (W02). */
import type { AuditItem } from '../api/types';
import type { IconName } from '../components/Icon';
import type { Tone } from '../api/types';
import { firstName, humanDuration, inr } from './format';
import { SOURCE } from './labels';

export interface ActivityLine { icon: IconName; tone: Tone | ''; title: string; sub: string }

const FEED_ACTIONS = new Set([
  'trip.create', 'trip.cancel', 'trip.close', 'trip.extended', 'member.start', 'member.auto_start', 'member.end', 'member.accept', 'member.decline',
  'expense.create', 'expense.update', 'expense.reply', 'expense.dispute', 'expense.message', 'expense.verify', 'expense.query', 'expense.reject', 'budget.set', 'budget.change', 'budget.remove',
  'payment.record', 'claim.reopen', 'document.upload', 'export.ready', 'owner_assigned', 'trip.owner_assigned',
]);

export const inFeed = (a: AuditItem) => FEED_ACTIONS.has(a.action);

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));
const str = (v: unknown) => (v == null ? '' : String(v));

/** One line of the feed. `meId` turns your own actions into "You …". */
export function describeActivity(a: AuditItem, meId?: string): ActivityLine {
  const you = !!meId && a.actorId === meId;
  const actor = you ? 'You' : a.actor;
  const trip = a.tripName ?? a.tripRef ?? '';
  const after = (a.after ?? {}) as Record<string, unknown>;
  const before = (a.before ?? {}) as Record<string, unknown>;
  const meta = (a.meta ?? {}) as Record<string, unknown>;
  const member = a.member || '';
  switch (a.action) {
    case 'trip.create': return { icon: 'plus', tone: 'ok', title: `${actor} created ${trip}`, sub: a.tripRef ?? '' };
    case 'trip.cancel': return { icon: 'ban', tone: 'bad', title: `${actor} cancelled ${trip}`, sub: a.tripRef ?? '' };
    case 'trip.close': return { icon: 'checkCircle', tone: 'ok', title: `${trip} closed`, sub: 'Every member has ended' };
    case 'trip.extended': return { icon: 'hourglass', tone: 'warn', title: `${trip} is extended`, sub: 'Members still running past the planned end' };
    case 'member.start': {
      const early = num(meta.earlyMinutes);
      return { icon: 'play', tone: 'ok', title: `${member || actor} started${early > 0 ? ` ${humanDuration(early * 60000)} early` : ''}`, sub: trip };
    }
    case 'member.auto_start': return { icon: 'zap', tone: 'ok', title: `${member} started automatically`, sub: trip };
    case 'member.end': return meta.method === 'finance'
      ? { icon: 'shield', tone: 'info', title: `${actor} ended ${firstName(member)}’s trip`, sub: `${trip} · ${str(meta.reason)}` }
      : { icon: 'stop', tone: '', title: `${member || actor} ended the trip`, sub: trip };
    case 'member.accept': return { icon: 'userCheck', tone: 'ok', title: `${member || actor} accepted`, sub: trip };
    case 'member.decline': return { icon: 'userX', tone: '', title: `${member || actor} declined`, sub: trip };
    case 'expense.create': {
      const src = str(after.budgetSource) as keyof typeof SOURCE;
      const company = after.paidBy === 'company';
      return { icon: company ? 'building' : 'receipt', tone: 'acc', title: `${actor} logged ${str(after.description) || 'an expense'} · ${inr(num(after.amountPaise))}`, sub: `${trip} · ${company ? 'company-paid' : (SOURCE[src] ?? 'unbudgeted').toLowerCase()}` };
    }
    case 'expense.update': return { icon: 'pencil', tone: 'warn', title: `${actor} edited ${str(after.description) || 'an expense'}`, sub: trip };
    case 'expense.reply': return { icon: 'message', tone: 'acc', title: `${actor} replied to a query`, sub: `${trip}${num(meta.files) ? ` · ${num(meta.files)} new attachment${num(meta.files) > 1 ? 's' : ''}` : ''}` };
    case 'expense.dispute': return { icon: 'message', tone: 'warn', title: `${actor} asked about a decision`, sub: `${a.item ?? trip}` };
    case 'expense.message': return { icon: 'send', tone: 'info', title: `${actor} wrote to ${member ? firstName(member) : 'the member'}`, sub: meta.message ? `“${str(meta.message)}”` : trip };
    case 'expense.verify': return { icon: 'check', tone: 'ok', title: `${actor} verified ${member ? `${firstName(member)}’s expense` : 'an expense'}${meta.approvedPaise ? ` at ${inr(num(meta.approvedPaise))}` : ''}`, sub: trip };
    case 'expense.query': return { icon: 'message', tone: 'warn', title: `${actor} asked ${member || 'the member'} about an expense`, sub: meta.remark ? `“${str(meta.remark)}”` : trip };
    case 'expense.reject': return { icon: 'xCircle', tone: 'bad', title: `${actor} rejected ${member ? `${firstName(member)}’s expense` : 'an expense'}`, sub: meta.remark ? `“${str(meta.remark)}”` : trip };
    case 'budget.set':
    case 'budget.change': return { icon: 'wallet', tone: 'pool', title: `${actor} ${a.action === 'budget.set' ? 'set' : 'changed'} ${member ? `${firstName(member)}’s individual budget` : 'the trip pool'} to ${inr(num(after.amountPaise))}`, sub: trip };
    case 'budget.remove': return { icon: 'wallet', tone: 'pool', title: `${actor} removed ${member ? `${firstName(member)}’s individual budget` : 'the trip pool'}`, sub: trip + (before.amountPaise ? ` · was ${inr(num(before.amountPaise))}` : '') };
    case 'payment.record': return { icon: 'bank', tone: 'ok', title: `${actor} recorded ${inr(num(after.amountPaise))} for ${member || 'a member'}`, sub: trip };
    case 'claim.reopen': return { icon: 'undo', tone: 'warn', title: `${actor} reopened ${member ? `${firstName(member)}’s claim` : 'a claim'}`, sub: str(meta.reason) || trip };
    case 'document.upload': return { icon: 'file', tone: '', title: `${actor} uploaded ${str(meta.name) || 'a document'}`, sub: trip };
    case 'export.ready': return { icon: 'fileZip', tone: 'ok', title: `Export ready: ${trip}`, sub: a.tripRef ?? '' };
    case 'trip.owner_assigned': return { icon: 'crown', tone: 'acc', title: `${actor} assigned a new owner`, sub: trip };
    default: return { icon: 'activity', tone: '', title: `${actor}: ${a.action}`, sub: trip };
  }
}
