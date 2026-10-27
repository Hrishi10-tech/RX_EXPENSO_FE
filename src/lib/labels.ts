/** Labels, icons and tones for the API's enumerations, in the prototype's words. */
import type { IconName } from '../components/Icon';
import type {
  BudgetSource, Category, ClaimStatus, DocScope, DocType, EntryFlag, ExportFormat, ExportScope, PaymentMode, Purpose,
  ReimbursementMode, Tone, TripStatus,
} from '../api/types';

export const CATEGORY: Record<Category, { label: string; icon: IconName }> = {
  airfare: { label: 'Airfare', icon: 'plane' },
  train: { label: 'Train', icon: 'train' },
  cab: { label: 'Local travel / cab', icon: 'cab' },
  fuel_toll: { label: 'Fuel & toll', icon: 'fuel' },
  accommodation: { label: 'Accommodation', icon: 'hotel' },
  meals: { label: 'Meals', icon: 'meals' },
  client_entertainment: { label: 'Client entertainment', icon: 'entertainment' },
  event_fee: { label: 'Event / registration fee', icon: 'ticket' },
  printing: { label: 'Printing & stationery', icon: 'printer' },
  courier: { label: 'Courier', icon: 'courier' },
  internet_phone: { label: 'Internet & phone', icon: 'wifi' },
  visa_passport: { label: 'Visa & passport', icon: 'passport' },
  other: { label: 'Other', icon: 'otherCat' },
};
export const categoryLabel = (c: string) => CATEGORY[c as Category]?.label ?? c;
export const categoryIcon = (c: string): IconName => CATEGORY[c as Category]?.icon ?? 'otherCat';

export const PURPOSE: Record<Purpose, string> = {
  client_meeting: 'Client meeting', conference: 'Conference / event', training: 'Training', audit: 'Audit', installation: 'Installation', other: 'Other',
};

export const TRIP_STATUS: Record<TripStatus, { label: string; tone: Tone; icon: IconName }> = {
  active: { label: 'Active', tone: 'ok', icon: 'play' },
  extended: { label: 'Extended', tone: 'warn', icon: 'hourglass' },
  scheduled: { label: 'Scheduled', tone: 'acc', icon: 'calendar' },
  closed: { label: 'Closed', tone: 'line', icon: 'checkCircle' },
  cancelled: { label: 'Cancelled', tone: 'bad', icon: 'ban' },
};

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: Tone; icon: IconName }> = {
  open: { label: 'Open', tone: 'line', icon: 'play' },
  ready: { label: 'Ready for verification', tone: 'acc', icon: 'inbox' },
  verified: { label: 'Verified', tone: 'ok', icon: 'check' },
  part_paid: { label: 'Part paid', tone: 'info', icon: 'coins' },
  reimbursed: { label: 'Reimbursed', tone: 'ok', icon: 'badgeCheck' },
};

export const PAYMENT_MODE: Record<PaymentMode, string> = { upi: 'UPI', cash: 'Cash', card: 'Card', company: 'Company-paid' };
export const REIMBURSE_MODE: Record<ReimbursementMode, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', cash: 'Cash' };

export const SOURCE: Record<Exclude<BudgetSource, null>, string> = { pool: 'Trip pool', individual: 'Individual', unbudgeted: 'Unbudgeted' };

export const FLAG: Record<EntryFlag, { label: string; icon: IconName; tone: '' | 'info' | 'bad'; why: string }> = {
  pre_trip: { label: 'Pre-trip', icon: 'calendarClock', tone: '', why: 'Logged for a date before the trip’s scheduled start, as an advance booking (FR-EXP-11).' },
  outside_times: { label: 'Outside trip times', icon: 'clock', tone: '', why: 'Dated outside the member’s actual start and end (FR-EXP-12).' },
  late_entry: { label: 'Late entry', icon: 'clock', tone: '', why: 'Added after the member ended the trip (FR-END-06).' },
  device_time_mismatch: { label: 'Device time mismatch', icon: 'clock', tone: 'info', why: 'The phone’s clock and the server’s clock differed by more than 10 minutes when this was saved (NFR-14).' },
};

export const DOC_TYPE: Record<DocType, string> = {
  payment_proof: 'Payment proof', invoice: 'Invoice', approval_note: 'Approval note', bank_statement: 'Bank statement extract', other: 'Other',
};
export const DOC_SCOPE: Record<DocScope, string> = { trip: 'The trip', claim: 'A member’s claim', expense: 'One expense' };

export const EXPORT_SCOPE: Record<ExportScope, { label: string; sub: string }> = {
  trip: { label: 'Whole trip', sub: 'All members, the trip pool, every individual budget, all expenses and attachments' },
  member: { label: 'One member', sub: 'That member’s claim only. Never another member’s individual data.' },
  each: { label: 'Each member separately', sub: 'One export per member, generated together, delivered as one ZIP' },
  trip_and_each: { label: 'Whole trip and each member', sub: 'The whole-trip export plus every member export, in one ZIP' },
};
export const FORMAT_LABEL: Record<ExportFormat, string> = { pdf: 'PDF', xlsx: 'Excel', zip: 'ZIP' };
export const fmtFormats = (f: ExportFormat[]) => f.map(x => FORMAT_LABEL[x]).join(' · ');

/** Icon and tone for a notification, by type, like the prototype's bell. */
export function notificationLook(type: string): { icon: IconName; tone: Tone | '' } {
  switch (type) {
    case 'query.reply': return { icon: 'message', tone: 'acc' };
    case 'expense.edited': return { icon: 'refresh', tone: 'warn' };
    case 'claim.ready': return { icon: 'inbox', tone: 'acc' };
    case 'claim.paid': return { icon: 'bank', tone: 'ok' };
    case 'claim.reopened': return { icon: 'undo', tone: 'warn' };
    case 'trip.owner_inactive': return { icon: 'userX', tone: 'bad' };
    case 'trip.extended': case 'trip.extension_reminder': case 'trip.planned_end': return { icon: 'hourglass', tone: 'warn' };
    case 'trip.cancelled': return { icon: 'ban', tone: 'bad' };
    case 'trip.closed': return { icon: 'checkCircle', tone: 'ok' };
    case 'budget.over': return { icon: 'alert', tone: 'bad' };
    case 'budget.warn': return { icon: 'alert', tone: 'warn' };
    case 'budget.set': case 'budget.removed': case 'budget.choose': return { icon: 'wallet', tone: 'pool' };
    case 'export.ready': return { icon: 'fileZip', tone: 'ok' };
    case 'export.failed': return { icon: 'alert', tone: 'bad' };
    case 'expense.query': return { icon: 'message', tone: 'warn' };
    case 'expense.disputed': return { icon: 'message', tone: 'warn' };
    case 'expense.message': return { icon: 'message', tone: 'info' };
    case 'finance.handoff': return { icon: 'send', tone: 'acc' };
    case 'expense.rejected': return { icon: 'xCircle', tone: 'bad' };
    case 'expense.lowered': return { icon: 'percent', tone: 'ok' };
    case 'receipt.reminder': return { icon: 'bellRing', tone: 'warn' };
    case 'member.ended_by_finance': return { icon: 'shield', tone: 'info' };
    case 'trip.owner': return { icon: 'crown', tone: 'acc' };
    default:
      if (type.startsWith('member.') || type.startsWith('join.')) return { icon: 'users', tone: '' };
      return { icon: 'bell', tone: '' };
  }
}

/** Which notification-centre tab a notification belongs to (a hand-off by its topic). */
export function notificationGroup(type: string, data?: { topic?: string }): 'claims' | 'trips' | 'budgets' | 'exports' {
  if (type === 'finance.handoff') return data?.topic === 'claim' ? 'claims' : 'budgets';
  if (type.startsWith('export.')) return 'exports';
  if (type.startsWith('budget.')) return 'budgets';
  if (type.startsWith('claim.') || type.startsWith('expense.') || type === 'query.reply' || type === 'receipt.reminder') return 'claims';
  return 'trips';
}

/** Plain-language names for audit actions (W11). */
export const ACTION_LABEL: Record<string, string> = {
  'trip.create': 'Trip created', 'trip.update': 'Trip edited', 'trip.cancel': 'Trip cancelled', 'trip.close': 'Trip closed', 'trip.extended': 'Trip extended',
  'trip.handover': 'Owner handed over', 'trip.owner_assigned': 'New owner assigned',
  'member.invite': 'Member invited', 'member.accept': 'Join accepted', 'member.decline': 'Join declined', 'member.withdraw': 'Request withdrawn',
  'member.start': 'Trip started', 'member.auto_start': 'Automatic start', 'member.end': 'Trip ended', 'member.resume': 'Trip resumed',
  'member.leave': 'Member left', 'member.remove': 'Member removed', 'member.reminded': 'Extension reminder sent',
  'member.start_ignored': 'Later start ignored', 'member.end_ignored': 'Later end ignored',
  'location.add': 'Location added', 'location.update': 'Location edited', 'location.delete': 'Location deleted',
  'expense.create': 'Expense created', 'expense.update': 'Expense edited', 'expense.delete': 'Expense deleted', 'expense.budget_source': 'Budget source chosen',
  'expense.verify': 'Expense verified', 'expense.query': 'Query raised', 'expense.reject': 'Expense rejected', 'expense.reply': 'Query answered', 'expense.remind': 'Receipt reminder sent',
  'expense.dispute': 'Asked about the decision', 'expense.message': 'Wrote to the member', 'expense.move': 'Expense moved to another trip', 'finance.handoff': 'Asked another finance user',
  'attachment.add': 'Attachment added', 'attachment.delete': 'Attachment deleted',
  'budget.set': 'Budget set', 'budget.change': 'Budget changed', 'budget.remove': 'Budget removed', 'budget.apply': 'Budget applied to earlier spend', 'budget.alert': 'Budget alert',
  'payment.record': 'Payment recorded', 'claim.reopen': 'Claim reopened', 'claim.close': 'Claim closed again',
  'document.upload': 'Document uploaded', 'document.delete': 'Document deleted',
  'export.request': 'Export requested', 'export.ready': 'Export ready', 'export.failed': 'Export failed', 'export.retry': 'Export retried', 'export.device': 'Exported on the phone',
  'user.create': 'User created', 'user.update': 'User edited', 'user.roles': 'Roles changed', 'user.department': 'Department changed',
  'user.deactivate': 'User deactivated', 'user.reactivate': 'User reactivated', 'user.app_link': 'App link sent', 'department.create': 'Department added', 'department.update': 'Department changed',
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a.replace(/[._]/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** Action families for the audit filter. */
export const ACTION_GROUPS: Array<[string, string]> = [
  ['trip.', 'Trips'], ['member.', 'Members, starts and ends'], ['location.', 'Locations'], ['expense.', 'Expenses and verification'], ['attachment.', 'Receipts'],
  ['budget.', 'Budgets'], ['payment.', 'Payments'], ['claim.', 'Claims'], ['document.', 'Finance documents'], ['export.', 'Exports'], ['finance.', 'Hand-offs between finance users'], ['user.', 'Users and roles'], ['department.', 'Departments'],
];
