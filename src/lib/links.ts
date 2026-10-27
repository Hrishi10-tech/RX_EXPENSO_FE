/** Console URLs: trips by reference (like the prototype's paths), claims by trip and member slug. */
import type { NotificationItem } from '../api/types';
import { personSlug } from './format';

export const tripPath = (t: { ref?: string | null; id?: string | null } | string, tab = '') => {
  const key = typeof t === 'string' ? t : t.ref || t.id || '';
  return `/trips/${encodeURIComponent(key)}${tab ? `/${tab}` : ''}`;
};

export const claimPath = (trip: { ref?: string | null; id?: string | null } | string, member: { name?: string | null; userId?: string | null } | string, o: { expense?: string; payments?: boolean } = {}) => {
  const t = typeof trip === 'string' ? trip : trip.ref || trip.id || '';
  const m = typeof member === 'string' ? member : member.name ? personSlug(member.name) : member.userId ?? '';
  return `/claims/${encodeURIComponent(t)}/${encodeURIComponent(m)}${o.payments ? '/payments' : ''}${o.expense ? `?expense=${o.expense}` : ''}`;
};

/** Where a notification leads (FR-NOT-02). */
export function notificationTarget(n: NotificationItem): string {
  const d = n.data ?? {};
  const tripId = d.tripId ?? n.tripId ?? undefined;
  switch (n.type) {
    case 'query.reply':
    case 'expense.disputed':
    case 'expense.edited':
    case 'expense.message':
      if (tripId && d.userId) return claimPath(tripId, d.userId, { expense: d.expenseId });
      if (d.expenseId) return `/expenses/${d.expenseId}`;
      break;
    case 'claim.ready':
      if (tripId && d.userId) return claimPath(tripId, d.userId);
      break;
    case 'trip.owner_inactive':
      if (tripId) return `${tripPath(tripId)}?assign=owner`;
      break;
    case 'finance.handoff':
      // A colleague on the trip asks you to set its budgets, or to decide their claim.
      if (tripId && d.topic === 'claim' && d.userId) return claimPath(tripId, d.userId);
      if (tripId) return tripPath(tripId, 'budgets');
      break;
    case 'export.ready':
    case 'export.failed':
      return d.exportId ? `/exports?focus=${d.exportId}` : '/exports';
    default:
      break;
  }
  if (d.expenseId && tripId && d.userId) return claimPath(tripId, d.userId, { expense: d.expenseId });
  if (tripId) return tripPath(tripId);
  if (d.userId) return `/admin/users?focus=${d.userId}`;
  return '/notifications';
}
