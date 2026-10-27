/** W06·a query, W06·c approve a lower amount, W06·d reject: each needs its words, and says what it changes. */
import { useState } from 'react';
import type { ReviewExpense } from '../../api/types';
import { Modal } from '../../components/Overlay';
import { Btn, Field, Impact, TextArea, TextInput } from '../../components/ui';
import { clearDraft, getDraft, saveDraft } from '../../lib/drafts';
import { inr, parseRupees, rupeesInput } from '../../lib/format';

function Chips({ items, onPick, active }: { items: Array<[string, string]>; onPick: (t: string) => void; active: string }) {
  return (
    <div className="qchips" role="group" aria-label="Suggestions">
      {items.map(([label, text]) => <button type="button" key={label} className={`qchip ${active === text ? 'on' : ''}`} onClick={() => onPick(text)}>{label}</button>)}
    </div>
  );
}

const QUERY_CHIPS: Array<[string, string]> = [
  ['Attach the itemised bill', 'Please attach the itemised bill. The photo doesn’t show what was bought.'],
  ['Receipt is unreadable', 'The receipt photo is hard to read. Please attach a clearer photo or a copy of the bill.'],
  ['Explain the business purpose', 'Please explain the business purpose of this expense and who it was for.'],
  ['Split out personal items', 'Part of this bill looks personal. Please edit the amount to the business part and attach the bill.'],
];
const REJECT_CHIPS: Array<[string, string]> = [
  ['Not covered by the travel policy', 'Not covered by the travel policy.'],
  ['Personal expense', 'This is a personal expense.'],
  ['Duplicate of another expense', 'Duplicate of another expense on this claim.'],
  ['No valid receipt', 'There is no valid receipt for this expense.'],
];

interface Base { e: ReviewExpense; first: string; userId: string; onClose: () => void; busy: boolean }

export function QueryDialog({ e, first, userId, onClose, busy, running, onSubmit }: Base & { running: boolean; onSubmit: (remark: string) => void }) {
  const key = `query:${e.id}`;
  const [text, setText] = useState(() => getDraft(userId, key) || e.financeRemark || '');
  const [err, setErr] = useState<string | null>(null);
  const set = (v: string) => { setText(v); setErr(null); saveDraft(userId, key, `the query on ${e.description}`, v); };
  const submit = () => { if (!text.trim()) { setErr(`Write the question. ${first} sees exactly this.`); return; } onSubmit(text.trim()); };
  return (
    <Modal icon="message" tone="warn" title={`Query “${e.description}”`} onClose={onClose}
      lead={`${first} is told now and can reply with text or a new attachment, and edit the expense.`}
      footer={<><Btn kind="sec" onClick={onClose}>Cancel</Btn><Btn kind="pri" icon="send" busy={busy} onClick={submit}>Send query</Btn></>}>
      <Chips items={QUERY_CHIPS} active={text} onPick={set} />
      <Field label="Question" required htmlFor="qText" error={err} help={`Required. ${first} sees exactly this.`}>
        <TextArea id="qText" value={text} error={!!err} onChange={ev => set(ev.target.value)} data-autofocus />
      </Field>
      <Impact title="Meanwhile" items={[
        ['clock', 'The expense shows Query and doesn’t count as checked.'],
        ['pencil', `${first} can edit it even after ending the trip, while it is under query (FR-END-06).`],
        running ? ['play', 'The trip keeps running; verification never waits for the end (FR-VER-01).'] : ['inbox', 'The claim can’t become Verified until this is answered and decided (FR-VER-06).'],
      ]} />
    </Modal>
  );
}

export function RejectDialog({ e, first, userId, onClose, busy, reimbursable, onSubmit }: Base & { reimbursable: number; onSubmit: (remark: string) => void }) {
  const key = `reject:${e.id}`;
  const [text, setText] = useState(() => getDraft(userId, key));
  const [err, setErr] = useState<string | null>(null);
  const set = (v: string) => { setText(v); setErr(null); saveDraft(userId, key, `rejecting ${e.description}`, v); };
  const counts = e.verification !== 'rejected' ? (e.approvedPaise ?? e.amountPaise) : 0;
  return (
    <Modal icon="xCircle" tone="bad" title={`Reject “${e.description}”`} onClose={onClose}
      lead="Rejected expenses stay on the claim, marked, and aren’t reimbursed."
      footer={<><Btn kind="sec" onClick={onClose}>Cancel</Btn><Btn kind="dangerfill" icon="x" busy={busy} onClick={() => { if (!text.trim()) { setErr(`Give the reason. ${first} sees it on the expense.`); return; } onSubmit(text.trim()); }}>Reject expense</Btn></>}>
      <Chips items={REJECT_CHIPS} active={text} onPick={set} />
      <Field label="Reason" required htmlFor="rText" error={err} help={`Required. ${first} sees it on the expense.`}>
        <TextArea id="rText" value={text} error={!!err} onChange={ev => set(ev.target.value)} data-autofocus />
      </Field>
      <Impact title="What happens" items={[
        ['receipt', `Reimbursable total: ${inr(reimbursable)} → ${inr(Math.max(0, reimbursable - counts))}`],
        ['wallet', e.budgetSource === 'unbudgeted' || e.budgetSource == null ? 'Unbudgeted, so there is no budget draw-down to release' : 'Removed from the budget draw-down (FR-BUD-02)'],
        ['bellRing', `${first} is told with your reason and can ask about it`],
        ['undo', 'You can change the decision until the claim is reimbursed'],
      ]} />
    </Modal>
  );
}

export function LowerDialog({ e, first, userId, onClose, busy, reimbursable, lastOpen, onSubmit }: Base & { reimbursable: number; lastOpen: boolean; onSubmit: (paise: number, reason: string) => void }) {
  const key = `lower:${e.id}`;
  const [amount, setAmount] = useState(() => rupeesInput(e.approvedPaise ?? Math.round(e.amountPaise * 0.8 / 100) * 100));
  const [text, setText] = useState(() => getDraft(userId, key) || e.approvalReason || '');
  const [err, setErr] = useState<{ amount?: string; reason?: string }>({});
  const low = parseRupees(amount);
  const counts = e.verification === 'verified' ? (e.approvedPaise ?? e.amountPaise) : e.verification === 'rejected' ? 0 : e.amountPaise;
  const submit = () => {
    const x: typeof err = {};
    if (low == null) x.amount = 'Enter the amount to approve.';
    else if (low <= 0) x.amount = 'Zero isn’t an approval: reject it with a reason instead.';
    else if (low >= e.amountPaise) x.amount = `That’s the full claim. Use Verify for ${inr(e.amountPaise)}.`;
    if (!text.trim()) x.reason = `Give the reason. ${first} sees both amounts and this reason.`;
    setErr(x);
    if (!Object.keys(x).length) onSubmit(low!, text.trim());
  };
  const diff = low != null && low > 0 && low < e.amountPaise ? e.amountPaise - low : 0;
  return (
    <Modal icon="percent" title="Approve a lower amount" onClose={onClose} lead={`${e.description} · claimed ${inr(e.amountPaise)}`}
      footer={<><Btn kind="sec" onClick={onClose}>Cancel</Btn><Btn kind="pri" icon="check" busy={busy} onClick={submit}>{low && low > 0 && low < e.amountPaise ? `Approve ${inr(low)}` : 'Approve'}</Btn></>}>
      <div className="grid2" style={{ gap: 14 }}>
        <Field label="Claimed" htmlFor="claimed"><TextInput id="claimed" locked readOnly value={inr(e.amountPaise)} /></Field>
        <Field label="Approve" required htmlFor="approve" error={err.amount}>
          <TextInput id="approve" prefix="₹" inputMode="decimal" value={amount} error={!!err.amount} wrapStyle={{ borderColor: err.amount ? undefined : 'var(--accent)', fontWeight: 700 }}
            onChange={ev => { setAmount(ev.target.value); setErr(p => ({ ...p, amount: undefined })); }} data-autofocus />
        </Field>
      </div>
      <Field label="Reason" required htmlFor="lText" error={err.reason} help={`Required. ${first} sees both amounts and this reason.`}>
        <TextArea id="lText" value={text} error={!!err.reason} placeholder="The meal limit is ₹335 a head, and there were four of you."
          onChange={ev => { setText(ev.target.value); setErr(p => ({ ...p, reason: undefined })); saveDraft(userId, key, `approving ${e.description} lower`, ev.target.value); }} />
      </Field>
      <Impact title="What changes" items={[
        ['receipt', `${first}’s reimbursable total: ${inr(reimbursable)} → ${inr(Math.max(0, reimbursable - counts + (low && low > 0 && low < e.amountPaise ? low : counts)))}`],
        e.budgetSource === 'pool' || e.budgetSource === 'individual' ? ['wallet', `${e.budgetSource === 'pool' ? 'Trip pool' : 'Individual budget'} draw-down drops by ${inr(diff)}`] : ['wallet', 'Unbudgeted, so no budget draw-down changes'],
        ['eye', `${first} sees both amounts and your reason on the expense (M10·c)`],
        lastOpen && ['badgeCheck', 'This is the last open item: the claim becomes Verified'],
      ]} />
    </Modal>
  );
}

export function clearDecisionDrafts(userId: string, expenseId: string) {
  ['query', 'reject', 'lower'].forEach(k => clearDraft(userId, `${k}:${expenseId}`));
}
