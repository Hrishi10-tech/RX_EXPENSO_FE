/**
 * Trip dialogs: end a member's trip (W04·g), assign a new owner (W04·h) and remove a budget (W05·c).
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, queryClient, useMe } from '../../app/core';
import { keys } from '../../api/keys';
import { usePeople } from '../../api/hooks';
import type { BudgetsSaveResult, FinanceTrip, MemberRow } from '../../api/types';
import { Modal } from '../../components/Overlay';
import { toast } from '../../components/Toasts';
import { Banner, Btn, Field, Impact, Ropt, TextArea, TextInput } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { clearDraft, getDraft, saveDraft } from '../../lib/drafts';
import { firstName, fmtDayTimeComma, fromIstInput, inr, joinNames, plural, toIstInput } from '../../lib/format';

function refreshTrip(tripId: string) {
  void queryClient.invalidateQueries({ queryKey: keys.trip(tripId) });
  void queryClient.invalidateQueries({ queryKey: keys.timeline(tripId) });
  void queryClient.invalidateQueries({ queryKey: keys.tripsAll });
  void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  void queryClient.invalidateQueries({ queryKey: keys.claimsAll });
  void queryClient.invalidateQueries({ queryKey: keys.budgetLog(tripId) });
  void queryClient.invalidateQueries({ queryKey: keys.claimOfTrip(tripId) });
}

/* ---------------- W04·g ---------------- */

export function EndMemberDialog({ t, m, onClose }: { t: FinanceTrip; m: MemberRow; onClose: () => void }) {
  const me = useMe();
  const first = firstName(m.name);
  const draftKey = `end:${t.trip.id}:${m.userId}`;
  const [end, setEnd] = useState(() => toIstInput(Date.now() - (Date.now() % (5 * 60_000))));
  const [reason, setReason] = useState(() => getDraft(me.id, draftKey));
  const [err, setErr] = useState<{ endAt?: string; reason?: string; form?: string }>({});
  const claim = t.claims.find(c => c.userId === m.userId);
  const others = t.members.filter(x => x.joinStatus === 'accepted' && x.running && x.userId !== m.userId);
  const owner = t.members.find(x => x.userId === t.trip.ownerId);
  const pending = t.expenses.filter(e => e.userId === m.userId && e.attachments.some(a => a.status !== 'uploaded'));
  const mut = useMutation({
    mutationFn: (b: { endAt: string; reason: string }) => api.post<FinanceTrip>(`/finance/trips/${t.trip.id}/members/${m.userId}/end`, b),
    onSuccess: r => {
      clearDraft(me.id, draftKey);
      queryClient.setQueryData(keys.trip(t.trip.id), r);
      refreshTrip(t.trip.id);
      toast(`${first}’s trip ended at ${fmtDayTimeComma(fromIstInput(end)!)}${r.trip.status === 'closed' ? ' · the trip closed' : ''}`);
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        const f = e.fields;
        setErr({ endAt: f.endAt, reason: f.reason, form: !f.endAt && !f.reason ? e.message : undefined });
      } else setErr({ form: 'Couldn’t end the trip. Try again.' });
    },
  });
  const submit = () => {
    const iso = fromIstInput(end);
    const e: typeof err = {};
    if (!iso) e.endAt = 'Enter the date and time they were back.';
    else if (new Date(iso).getTime() > Date.now() + 60_000) e.endAt = 'The end can’t be in the future.';
    else if (m.actualStart && new Date(iso) < new Date(m.actualStart)) e.endAt = `Their start was ${fmtDayTimeComma(m.actualStart)}.`;
    if (reason.trim().length < 3) e.reason = 'Give the reason. The member and the owner see it.';
    setErr(e);
    if (Object.keys(e).length) return;
    mut.mutate({ endAt: iso!, reason: reason.trim() });
  };
  return (
    <Modal icon="stop" tone="warn" title={`End ${m.name}’s trip`} width={600} onClose={onClose}
      lead={`For a member who is back but hasn’t ended the trip. ${first} and the owner see the time and your reason.`}
      footer={<><Btn kind="sec" onClick={onClose}>Cancel</Btn><Btn kind="pri" icon="stop" busy={mut.isPending} onClick={submit}>{`End ${first}’s trip`}</Btn></>}>
      {err.form && <Banner tone="bad" icon="alert" title="Couldn’t end the trip">{err.form}</Banner>}
      <div className="grid2" style={{ gap: 14 }}>
        <Field label="Actual end" required htmlFor="endAt" error={err.endAt} help={m.actualStart ? `After their start (${fmtDayTimeComma(m.actualStart)}), not in the future` : 'Not in the future'}>
          <TextInput id="endAt" type="datetime-local" icon="calendarClock" value={end} error={!!err.endAt} max={toIstInput(Date.now())} onChange={e => setEnd(e.target.value)} />
        </Field>
        <Field label="Planned end" htmlFor="plannedEnd">
          <TextInput id="plannedEnd" icon="lock" locked value={fmtDayTimeComma(t.trip.tentativeEnd)} readOnly />
        </Field>
      </div>
      <Field label="Reason" required htmlFor="endReason" error={err.reason} help={`Shown to ${first}${owner && owner.userId !== m.userId ? ` and ${firstName(owner.name)}` : ''}, and kept in the audit log`}>
        <TextArea id="endReason" value={reason} error={!!err.reason} placeholder="Back at the office from 5 Oct evening per attendance." onChange={e => { setReason(e.target.value); saveDraft(me.id, draftKey, `ending ${first}’s trip`, e.target.value); }} />
      </Field>
      <Impact title="What happens" items={[
        ['inbox', `${first}’s claim${claim ? ` (${inr(claim.selfPaise)})` : ''} moves to Ready for verification.`],
        others.length === 0 ? ['checkCircle', `${first} is the last member running, so the trip closes.`] : ['users', `${joinNames(others.map(x => firstName(x.name)))} ${others.length === 1 ? 'is' : 'are'} still running, so the trip stays open.`],
        ['bellRing', `${first}${owner && owner.userId !== m.userId ? ` and ${firstName(owner.name)} (owner)` : ''} ${owner && owner.userId !== m.userId ? 'are' : 'is'} told the time and your reason.`],
        ['shield', `If ${first}’s phone later sends its own End, your time stands and theirs stays in the audit log.`],
        pending.length > 0 && ['cloudOff', `${plural(pending.length, 'receipt')} still on ${first}’s phone (${pending.map(e => `${e.description}, ${inr(e.amountPaise)}`).join('; ')}). ${pending.length === 1 ? 'It stays' : 'They stay'} pending until ${first} opens the app.`],
      ]} />
    </Modal>
  );
}

/* ---------------- W04·h ---------------- */

export function AssignOwnerDialog({ t, onClose }: { t: FinanceTrip; onClose: () => void }) {
  const people = usePeople();
  const active = useMemo(() => new Map((people.data ?? []).map(p => [p.id, p.active])), [people.data]);
  const eligible = t.members.filter(m => m.joinStatus === 'accepted' && m.userId !== t.trip.ownerId && active.get(m.userId) !== false);
  const [pick, setPick] = useState<string | null>(eligible.length === 1 ? eligible[0].userId : null);
  const chosen = eligible.find(m => m.userId === pick);
  const mut = useMutation({
    mutationFn: (userId: string) => api.post<FinanceTrip>(`/finance/trips/${t.trip.id}/owner`, { userId }),
    onSuccess: r => {
      queryClient.setQueryData(keys.trip(t.trip.id), r);
      refreshTrip(t.trip.id);
      toast(`${chosen?.name} now owns ${t.trip.name}`);
      onClose();
    },
    onError: (e: unknown) => toast((e as Error).message, { tone: 'bad' }),
  });
  return (
    <Modal icon="crown" title="Assign a new owner" onClose={onClose}
      lead={`${t.trip.ownerName}’s account was deactivated. The new owner can edit dates, invite ${t.trip.departmentName} colleagues and cancel.`}
      footer={<><Btn kind="sec" onClick={onClose}>Not now</Btn><Btn kind="pri" icon="crown" busy={mut.isPending} locked={!chosen ? 'Choose the new owner first.' : null} onClick={() => chosen && mut.mutate(chosen.userId)}>{chosen ? `Make ${firstName(chosen.name)} the owner` : 'Make owner'}</Btn></>}>
      {eligible.length ? (
        <div className="radio-list" role="radiogroup" aria-label="New owner">
          {eligible.map(m => (
            <Ropt key={m.userId} on={pick === m.userId} onClick={() => setPick(m.userId)} title={m.name}
              sub={`Member · ${m.employeeCode} · ${m.running ? 'still travelling' : m.actualEnd ? 'ended' : 'not started'} · accepted ${m.respondedAt ? fmtDayTimeComma(m.respondedAt) : ''}`} />
          ))}
        </div>
      ) : (
        <Banner tone="warn" icon="users" title="Nobody else can own this trip">
          There is no other active member. You can still end a running member’s trip with the real end time and close it; ownership isn’t needed after that.
        </Banner>
      )}
      <Banner tone="neutral" icon="info" title="Only members can own a trip">
        To hand the trip to someone outside it, the new owner invites them first; ownership can then move to them.
      </Banner>
      <Impact title="What happens" items={[
        ['bellRing', `${chosen ? firstName(chosen.name) : 'The new owner'} is told they own the trip now.`],
        ['receipt', `${firstName(t.trip.ownerName)}’s claim stays as it is and is still paid (FR-ROLE-08).`],
        ['history', 'Logged with your name and the time (NFR-11).'],
      ]} />
    </Modal>
  );
}

/* ---------------- W05·c ---------------- */

export function RemoveBudgetDialog({ t, kind, userId, onClose, onDone }: { t: FinanceTrip; kind: 'pool' | 'individual'; userId?: string; onClose: () => void; onDone?: () => void }) {
  const me = useMe();
  const b = kind === 'pool' ? t.budgets.pool : t.budgets.individuals.find(x => x.memberUserId === userId);
  const member = t.members.find(m => m.userId === userId);
  const first = firstName(member?.name ?? '');
  const affected = t.expenses.filter(e => e.budgetSource === kind && (kind === 'pool' || e.userId === userId) && e.paidBy === 'self');
  const locked = t.claims.filter(c => c.status === 'reimbursed').map(c => c.userId);
  const moving = affected.filter(e => !locked.includes(e.userId));
  const draftKey = `rmbudget:${t.trip.id}:${kind}:${userId ?? ''}`;
  const [reason, setReason] = useState(() => getDraft(me.id, draftKey));
  const [err, setErr] = useState<string | null>(null);
  const claim = t.claims.find(c => c.userId === userId);
  const mut = useMutation({
    // The same whole-form save as the budget editor, with only this removal (null removes).
    mutationFn: () => api.put<BudgetsSaveResult>(`/finance/trips/${t.trip.id}/budgets`,
      kind === 'pool' ? { pool: null, note: reason.trim() } : { individuals: { [userId!]: null }, note: reason.trim() }),
    onSuccess: r => {
      clearDraft(me.id, draftKey);
      queryClient.setQueryData(keys.trip(t.trip.id), r.trip);
      refreshTrip(t.trip.id);
      toast(kind === 'pool' ? `Trip pool removed · ${plural(moving.length, 'expense')} now Unbudgeted` : `${first}’s individual budget removed · ${plural(moving.length, 'expense')} now Unbudgeted`);
      onDone?.();
      onClose();
    },
    onError: (e: unknown) => setErr((e as Error).message),
  });
  if (!b) return null;
  const sum = moving.reduce((s, e) => s + (e.approvedPaise ?? e.amountPaise), 0);
  return (
    <Modal icon="lock" tone="warn" onClose={onClose}
      title={kind === 'pool' ? 'Remove the trip pool?' : `Remove ${member?.name}’s individual budget?`}
      lead={kind === 'pool' ? `${inr(b.spentPaise)} of ${inr(b.allocatedPaise)} is charged to it across ${plural(affected.length, 'expense')}.` : `${first} has ${inr(b.spentPaise)} charged to it across ${plural(affected.length, 'expense')}.`}
      footer={<><Btn kind="sec" onClick={onClose}>Keep budget</Btn><Btn kind="dangerfill" icon="trash" busy={mut.isPending} onClick={() => { if (reason.trim().length < 3) { setErr('Give the reason. It is kept in the change log.'); return; } mut.mutate(); }}>Remove budget</Btn></>}>
      {err && <Banner tone="bad" icon="alert" title="Couldn’t remove the budget">{err}</Banner>}
      <Impact title="What happens" items={[
        ['undo', moving.length ? `${moving.length === affected.length ? 'Those' : `${moving.length} of those`} ${plural(moving.length, 'expense')} (${moving.slice(0, 3).map(e => `${e.description} ${inr(e.amountPaise)}`).join(', ')}${moving.length > 3 ? ', …' : ''}) return to Unbudgeted, ${inr(sum)} in all. They stay private to ${kind === 'pool' ? 'each member' : first} and finance.` : 'No expenses are charged to it, so nothing moves.'],
        locked.length > 0 && affected.length !== moving.length && ['lock', 'Expenses on reimbursed claims keep their source; those claims are locked (FR-BUD-01).'],
        ['users', `Nothing moves into ${kind === 'pool' ? 'an individual budget' : 'the trip pool'} unless ${kind === 'pool' ? 'the member' : first} or you choose it (FR-BUD-05).`],
        ['receipt', kind === 'pool' ? 'Claims don’t change. Budgets never reduce or block a claim.' : `${first}’s claim doesn’t change${claim ? `: ${inr(claim.selfPaise)}` : ''}. Budgets never reduce or block a claim.`],
        ['bellRing', kind === 'pool' ? 'Every member is told the trip pool was removed.' : `${first} is told the budget was removed, with no amount on the lock screen.`],
      ]} />
      <Field label="Reason" required htmlFor="rmReason" help="Kept in the change log">
        <TextArea id="rmReason" value={reason} error={!!err && reason.trim().length < 3} placeholder="Tools are covered by the service tools budget, not travel."
          onChange={e => { setReason(e.target.value); setErr(null); saveDraft(me.id, draftKey, 'removing a budget', e.target.value); }} />
      </Field>
    </Modal>
  );
}

export { refreshTrip };
