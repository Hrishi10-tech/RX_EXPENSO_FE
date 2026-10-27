/**
 * W06: finance writes on an expense's thread without changing the decision (POST /finance/expenses/:id/messages).
 * After a member asks about a rejection or a lower approval (M10·b/c) this is where finance answers; on any other
 * expense it's a note to the member. The text is kept as a draft until it's sent, like the decision dialogs.
 * Never shown on your own claim: another finance user answers it (FR-VER-10, `403 own_claim`).
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, queryClient } from '../../app/core';
import { keys } from '../../api/keys';
import type { ClaimReview, ReviewExpense, ThreadMessage } from '../../api/types';
import { Btn, Field, TextArea } from '../../components/ui';
import { toast } from '../../components/Toasts';
import { ApiError } from '../../lib/api';
import { clearDraft, getDraft, saveDraft } from '../../lib/drafts';
import { inr } from '../../lib/format';

const MAX = 2000;

/** What sending does to the decision, in one line under the box. */
export function composerHelp(e: Pick<ReviewExpense, 'verification' | 'approvedPaise' | 'amountPaise'>, first: string): string {
  const lowered = e.verification === 'verified' && e.approvedPaise != null && e.approvedPaise !== e.amountPaise;
  if (e.verification === 'query') return `${first} gets this on the phone and can reply here. The query stays open.`;
  if (e.verification === 'rejected') return `${first} gets this on the phone and can write back. It stays rejected unless you verify it.`;
  if (lowered) return `${first} gets this on the phone and can write back. It stays approved at ${inr(e.approvedPaise)}.`;
  return `${first} gets this on the phone. It doesn’t change the decision; to ask for something ${first} answers, use Query.`;
}

export function ThreadComposer({ e, tripId, memberId, first, me, answering }: {
  e: ReviewExpense;
  tripId: string;
  memberId: string;
  first: string;
  me: { id: string; name: string };
  /** The member asked about the decision and nothing has been written since. */
  answering: boolean;
}) {
  const key = `msg:${e.id}`;
  const id = `msg-${e.id}`;
  const [text, setText] = useState(() => getDraft(me.id, key));
  const [open, setOpen] = useState(() => answering || !!getDraft(me.id, key));
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  // A question that arrives while the expense is on screen opens the box.
  useEffect(() => { if (answering) setOpen(true); }, [answering]);

  const set = (v: string) => { setText(v); setErr(null); saveDraft(me.id, key, `${answering ? 'your answer' : 'a note'} to ${first} on ${e.description}`, v); };
  const send = useMutation({
    mutationFn: (body: string) => api.post<{ id: string; body: string; createdAt: string }>(`/finance/expenses/${e.id}/messages`, { body }),
    onSuccess: msg => {
      clearDraft(me.id, key);
      setText('');
      setOpen(false);
      // Show it at once; the refetch (and the trip's live event) bring the server's copy.
      const m: ThreadMessage = { id: msg.id, side: 'finance', kind: 'note', body: msg.body, authorId: me.id, authorName: me.name, createdAt: msg.createdAt, attachments: [] };
      queryClient.setQueryData<ClaimReview>(keys.claim(tripId, memberId), old => old && {
        ...old,
        expenses: old.expenses.map(x => (x.id === e.id && !x.thread.some(t => t.id === m.id) ? { ...x, thread: [...x.thread, m] } : x)),
      });
      void queryClient.invalidateQueries({ queryKey: keys.claimOfTrip(tripId) });
      void queryClient.invalidateQueries({ queryKey: keys.expense(e.id) });
      toast(`Sent to ${first}`, { icon: 'send', sub: `${e.description} · the decision is unchanged` });
    },
    onError: (x: unknown) => setErr(x instanceof ApiError ? x.message : 'Couldn’t send. Your text is kept; try again.'),
  });
  const submit = () => {
    if (send.isPending) return;
    if (!text.trim()) { setErr('Write the message first.'); ref.current?.focus(); return; }
    send.mutate(text.trim());
  };

  if (!open) {
    return (
      <div className="wcompose-b start">
        <Btn kind="sec" size="sm" icon="message" onClick={() => { setOpen(true); requestAnimationFrame(() => ref.current?.focus()); }}>Write to {first}</Btn>
      </div>
    );
  }
  const title = answering ? `Answer ${first}` : `Write to ${first}`;
  return (
    <div className="wcompose">
      <Field label={title} htmlFor={id} error={err} help={composerHelp(e, first)}>
        <TextArea id={id} ref={ref} value={text} maxLength={MAX} error={!!err}
          placeholder={answering ? (e.verification === 'rejected' ? 'Why it was rejected, and what would change it.' : 'Why this amount was approved.') : `A note for ${first} about this expense.`}
          onChange={ev => set(ev.target.value)}
          onKeyDown={ev => { if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); submit(); } }} />
      </Field>
      <div className="wcompose-b">
        {text.length > MAX - 200 && <span className="sm-note" aria-live="polite">{MAX - text.length} characters left</span>}
        {!answering && <Btn kind="ghost" size="sm" onClick={() => { set(''); setOpen(false); }}>Cancel</Btn>}
        <Btn kind="pri" size="sm" icon="send" busy={send.isPending} onClick={submit} title="Send (Ctrl+Enter)">{answering ? 'Send answer' : 'Send'}</Btn>
      </div>
    </div>
  );
}
