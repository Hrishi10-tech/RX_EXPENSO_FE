/**
 * "Ask another finance user" (W05·d, W06·g): a finance user who is on a trip can't set its budgets or decide
 * their own claim (FR-VER-10), so they hand it to a colleague who isn't on the trip. The colleague gets a
 * `finance.handoff` notification that opens the budgets or the claim.
 *
 * The trip and the claim review both carry `financeUsers` (every active finance user, with `onTrip` and `isMe`),
 * so the candidates come straight from the page's own data.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../app/core';
import type { FinanceUser } from '../api/types';
import { Modal } from './Overlay';
import { toast } from './Toasts';
import { Banner, Btn, Field, Ropt, TextArea } from './ui';
import { firstName } from '../lib/format';

export type HandoffTopic = 'budgets' | 'claim';

/** Finance users other than me who aren't on the trip. */
export function handoffCandidates(financeUsers: FinanceUser[] | undefined): FinanceUser[] {
  return (financeUsers ?? []).filter(u => !u.isMe && !u.onTrip);
}

function HandoffDialog({ trip, topic, candidates, onClose }: { trip: { id: string; ref: string; name: string }; topic: HandoffTopic; candidates: FinanceUser[]; onClose: () => void }) {
  const [to, setTo] = useState(candidates.length === 1 ? candidates[0].userId : '');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const who = candidates.find(c => c.userId === to);
  const send = useMutation({
    mutationFn: () => api.post(`/finance/trips/${trip.id}/handoff`, { toUserId: to, topic, message: message.trim() || null }),
    onSuccess: () => {
      toast(`${who?.name ?? 'They'} ${topic === 'budgets' ? 'was asked to set the budgets' : 'was asked to verify and pay your claim'}`, { icon: 'send', sub: `${trip.ref} · they get a notification that opens it` });
      onClose();
    },
    onError: (e: unknown) => setErr((e as Error).message),
  });
  return (
    <Modal icon="send" title={topic === 'budgets' ? 'Ask another finance user to set the budgets' : 'Ask another finance user to decide your claim'} onClose={onClose}
      lead={`You’re on ${trip.name}, so another finance user ${topic === 'budgets' ? 'sets its budgets' : 'verifies your claim and records your payment'} (FR-VER-10).`}
      footer={<>
        <Btn kind="sec" onClick={onClose}>Cancel</Btn>
        <Btn kind="pri" icon="send" busy={send.isPending} locked={!to ? 'Choose who to ask' : null} onClick={() => send.mutate()}>{who ? `Ask ${firstName(who.name)}` : 'Ask'}</Btn>
      </>}>
      {candidates.length > 1 && (
        <div className="radio-list" role="radiogroup" aria-label="Who to ask">
          {candidates.map(c => <Ropt key={c.userId} on={to === c.userId} onClick={() => { setTo(c.userId); setErr(null); }} title={c.name} sub="Finance · not on this trip" />)}
        </div>
      )}
      <Field label="Message (optional)" htmlFor="hoMsg" help={`${who ? firstName(who.name) : 'They'} sees this in the notification.`}>
        <TextArea id="hoMsg" value={message} maxLength={1000} onChange={e => setMessage(e.target.value)}
          placeholder={topic === 'budgets' ? 'The Supplier audit needs a pool before Friday.' : 'My claim is ready; receipts are all attached.'} />
      </Field>
      {err && <Banner tone="bad" icon="alert" title="Not sent">{err}</Banner>}
    </Modal>
  );
}

/** The button: "Ask Meera Krishnan" when one colleague can take it, "Ask another finance user" otherwise. */
export function HandoffButton({ trip, topic, financeUsers, size = 'sm' }: { trip: { id: string; ref: string; name: string }; topic: HandoffTopic; financeUsers: FinanceUser[] | undefined; size?: 'sm' | 'xs' }) {
  const candidates = handoffCandidates(financeUsers);
  const [open, setOpen] = useState(false);
  if (!candidates.length) return null;
  return (
    <>
      <Btn kind="sec" size={size} icon="send" onClick={() => setOpen(true)}>{candidates.length === 1 ? `Ask ${candidates[0].name}` : 'Ask another finance user'}</Btn>
      {open && <HandoffDialog trip={trip} topic={topic} candidates={candidates} onClose={() => setOpen(false)} />}
    </>
  );
}
