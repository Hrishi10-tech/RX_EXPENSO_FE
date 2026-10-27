/**
 * W07 reimbursement: claim totals, payments recorded and the balance; record a payment with its proof
 * (FR-VER-07), part payments (FR-VER-08), the reimbursed lock and reopening with a reason (FR-VER-09).
 * A finance user never records their own reimbursement (FR-VER-10).
 */
import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useCrumbs } from '../app/Shell';
import { api, queryClient, useMe } from '../app/core';
import { useClaimReview, useMemberId, useTimeline, useTripId } from '../api/hooks';
import { HandoffButton } from '../components/handoff';
import { keys } from '../api/keys';
import type { Attachment, ClaimReview, PaymentResult, ReimbursementMode } from '../api/types';
import { Icon } from '../components/Icon';
import { Drawer, Modal } from '../components/Overlay';
import { toast } from '../components/Toasts';
import { Amt, Banner, Btn, Card, ClaimStatusPill, EmptyState, ErrorState, Feed, Field, FileRow, Impact, Kvs, Loading, PageHead, Segs, SrcPill, Steps, Tbl, TextArea, TextInput, VerPill, fileKind } from '../components/ui';
import { ApiError } from '../lib/api';
import { calendarDays, firstName, fmtBytes, fmtCalDate, fmtDay, fmtDayTime, humanDuration, inr, istToday, parseRupees, plural, rupeesInput, slug } from '../lib/format';
import { CATEGORY, DOC_TYPE, REIMBURSE_MODE } from '../lib/labels';
import { claimPath, tripPath } from '../lib/links';
import { downloadAttachment, fileProblem } from './trip/DocumentsTab';
import { timelineLook, timelineText } from './trip/helpers';

function refresh(r: ClaimReview) {
  void queryClient.invalidateQueries({ queryKey: keys.claim(r.trip.id, r.member.userId) });
  void queryClient.invalidateQueries({ queryKey: keys.trip(r.trip.id) });
  void queryClient.invalidateQueries({ queryKey: keys.claimsAll });
  void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  void queryClient.invalidateQueries({ queryKey: keys.timeline(r.trip.id) });
}

function PaymentDrawer({ r, onClose }: { r: ClaimReview; onClose: () => void }) {
  const first = firstName(r.member.name);
  const bal = r.claim.balancePaise;
  const [amount, setAmount] = useState(rupeesInput(bal));
  const [paidOn, setPaidOn] = useState(istToday());
  const [mode, setMode] = useState<ReimbursementMode>('bank_transfer');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<{ file: File; state: 'uploading' | 'done' | 'error'; doc?: { id: string; name: string; size: number }; message?: string } | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const paise = parseRupees(amount);

  const uploadProof = async (f: File) => {
    const problem = fileProblem(f);
    if (problem) { setProof({ file: f, state: 'error', message: problem }); return; }
    setProof({ file: f, state: 'uploading' });
    const form = new FormData();
    form.append('file', f, f.name);
    form.append('tripId', r.trip.id);
    form.append('scope', 'claim');
    form.append('memberUserId', r.member.userId);
    form.append('docType', 'payment_proof');
    try {
      const d = await api.postForm<{ id: string; name: string; size: number }>('/finance/documents', form);
      setProof({ file: f, state: 'done', doc: d });
    } catch (e) {
      setProof({ file: f, state: 'error', message: (e as Error).message });
    }
  };

  const mut = useMutation({
    mutationFn: () => api.post<PaymentResult>(`/finance/trips/${r.trip.id}/claims/${r.member.userId}/payments`, {
      amountPaise: paise, paidOn, mode, reference: ref.trim() || null, proofAttachmentId: proof?.doc?.id ?? null, note: note.trim() || null,
    }),
    onSuccess: res => {
      refresh(r);
      toast(`Payment of ${inr(paise)} recorded · ${first} told`, { sub: res.claimStatus === 'reimbursed' ? 'The claim is Reimbursed and locked' : `Balance due ${inr(res.balancePaise)}` });
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === 'validation') { const f = e.fields; setErr({ amount: f.amountPaise ?? '', reference: f.reference ?? '', paidOn: f.paidOn ?? '' }); setFormErr(e.message); }
      else setFormErr((e as Error).message);
    },
  });
  const submit = () => {
    const x: Record<string, string> = {};
    if (paise == null || paise <= 0) x.amount = 'Enter the amount paid.';
    else if (paise > bal) x.amount = `The balance due is ${inr(bal)}.`;
    if (!paidOn) x.paidOn = 'Enter the payment date.';
    else if (paidOn > istToday()) x.paidOn = 'The payment date can’t be in the future.';
    if (mode !== 'cash' && !ref.trim()) x.reference = mode === 'upi' ? 'Enter the UPI transaction ID.' : 'Enter the UTR of the bank transfer.';
    if (proof?.state === 'uploading') x.proof = 'Wait for the proof to finish uploading.';
    setErr(x); setFormErr(null);
    if (!Object.values(x).some(Boolean)) mut.mutate();
  };
  const full = paise != null && paise >= bal;
  return (
    <Drawer title="Record a payment" sub={`${r.member.name} · ${r.trip.name.split(' · ')[0]} · balance due ${inr(bal)}`} onClose={onClose} width={540}
      footer={<><Btn kind="sec" onClick={onClose}>Cancel</Btn><Btn kind="pri" icon="check" busy={mut.isPending} onClick={submit}>{paise && paise > 0 ? `Record ${inr(paise)}` : 'Record payment'}</Btn></>}>
      {formErr && <Banner tone="bad" icon="alert" title="Couldn’t record the payment">{formErr}</Banner>}
      <Field label="Amount" required htmlFor="payAmt" error={err.amount} help="Defaults to the balance due. Enter less for a part payment.">
        <TextInput id="payAmt" prefix="₹" inputMode="decimal" wrapClassName="big" value={amount} error={!!err.amount} onChange={e => setAmount(e.target.value)} onBlur={() => { const v = parseRupees(amount); if (v != null) setAmount(rupeesInput(v)); }} />
      </Field>
      <div className="grid2" style={{ gap: 14 }}>
        <Field label="Payment date" required htmlFor="paidOn" error={err.paidOn}>
          <TextInput id="paidOn" type="date" icon="calendar" value={paidOn} max={istToday()} error={!!err.paidOn} onChange={e => setPaidOn(e.target.value)} />
        </Field>
        <Field label="Mode">
          <Segs label="Payment mode" value={mode} onChange={setMode} options={[['bank_transfer', 'Bank transfer'], ['upi', 'UPI'], ['cash', 'Cash']]} />
        </Field>
      </div>
      <Field label="Reference" required={mode !== 'cash'} htmlFor="payRef" error={err.reference} help="UTR, UPI transaction ID or cash voucher number">
        <TextInput id="payRef" icon="hash" value={ref} error={!!err.reference} onChange={e => setRef(e.target.value)} placeholder={mode === 'upi' ? 'UPI 4271 8823 1190' : mode === 'cash' ? 'Voucher CV-0142' : 'UTR 5286 1140 9903'} />
      </Field>
      <Field label="Proof" error={err.proof}>
        <input ref={input} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadProof(f); e.target.value = ''; }} />
        {proof ? (
          <FileRow kind={fileKind(proof.file.type || proof.file.name)} name={proof.doc?.name ?? proof.file.name}
            meta={proof.state === 'error' ? <span style={{ color: 'var(--bad)', fontWeight: 700 }}>{proof.message}</span> : `${fmtBytes(proof.file.size)} · ${proof.state === 'done' ? 'uploaded' : 'uploading…'}`}
            actions={proof.state === 'done' ? <span style={{ color: 'var(--ok)' }}><Icon name="checkCircle" size={20} title="Uploaded" /></span> : proof.state === 'error' ? <Btn kind="ghost" size="xs" onClick={() => input.current?.click()}>Choose again</Btn> : <Icon name="loader" size={18} className="spin" />} />
        ) : (
          <div className="drop" role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void uploadProof(f); }} style={{ padding: 16 }}>
            <Icon name="upload" size={20} /><b style={{ color: 'var(--ink)' }}>Attach the payment proof</b><span>PDF or image, up to 20 MB. Filed on {first}’s claim as a payment proof.</span>
          </div>
        )}
        {!proof && <div className="help">Allowed without proof; the export then lists the payment without a proof file.</div>}
      </Field>
      <Field label="Note" htmlFor="payNote" help="Optional. Kept with the payment.">
        <TextArea id="payNote" value={note} onChange={e => setNote(e.target.value)} placeholder="Advance against the claim" wrapStyle={{ minHeight: 70 }} />
      </Field>
      <Impact title="After saving" items={[
        ['badgeCheck', full ? `Balance becomes ${inr(0)}: the claim is Reimbursed and locked (FR-VER-09).` : `Balance becomes ${inr(bal - (paise ?? 0))}: the claim shows Part paid (FR-VER-08).`],
        ['bellRing', `${first} is told and sees the amount, date, mode and reference in the app (FR-VER-07).`],
        ['fileZip', `The proof is filed in exports under Finance-documents/${slug(r.member.name)}/.`],
      ]} />
    </Drawer>
  );
}

function ReopenModal({ r, onClose }: { r: ClaimReview; onClose: () => void }) {
  const first = firstName(r.member.name);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.post<{ claimStatus: string }>(`/finance/trips/${r.trip.id}/claims/${r.member.userId}/reopen`, { reason: reason.trim() }),
    onSuccess: () => { refresh(r); toast(`Claim reopened · ${first} told`); onClose(); },
    onError: (e: unknown) => setErr((e as Error).message),
  });
  return (
    <Modal icon="undo" tone="warn" title="Reopen this reimbursed claim?" onClose={onClose}
      lead={`Reimbursed claims are locked. Reopening lets you or ${first} correct it; the reason is logged and printed on the next export.`}
      footer={<><Btn kind="sec" onClick={onClose}>Cancel</Btn><Btn kind="pri" icon="undo" busy={mut.isPending} onClick={() => { if (reason.trim().length < 3) { setErr('Say what needs correcting.'); return; } mut.mutate(); }}>Reopen claim</Btn></>}>
      <Field label="Reason" required htmlFor="reopenReason" error={err}>
        <TextArea id="reopenReason" value={reason} error={!!err} placeholder="Say what needs correcting" onChange={e => { setReason(e.target.value); setErr(null); }} />
      </Field>
      <Impact title="What happens" items={[
        ['undo', 'Status goes back to Verified. Payments already made stay recorded.'],
        ['plus', `${first} can add a missed bill as a late entry; the claim then returns to Ready for verification (FR-END-06).`],
        ['fileText', 'The reason prints on the next export of this claim (FR-VER-09).'],
        ['bellRing', `${first} is told the claim was reopened and why.`],
      ]} />
    </Modal>
  );
}

export function Reimbursement() {
  const { tripKey = '', memberKey = '' } = useParams();
  const me = useMe();
  const tid = useTripId(tripKey);
  const mid = useMemberId(tid.id, memberKey);
  const rq = useClaimReview(tid.id, mid.id);
  const tl = useTimeline(tid.id);
  const [pay, setPay] = useState(false);
  const [reopen, setReopen] = useState(false);
  const r = rq.data;
  useCrumbs([{ label: 'Claims', to: '/claims' }, { label: r ? `${r.member.name} · ${r.trip.name.split(' · ')[0]}` : 'Claim', to: r ? claimPath(r.trip, r.member) : undefined }, { label: 'Payments' }]);
  const close = useMutation({
    mutationFn: () => api.post(`/finance/trips/${r!.trip.id}/claims/${r!.member.userId}/close`),
    onSuccess: () => { refresh(r!); toast('Claim closed again'); },
    onError: (e: unknown) => toast((e as Error).message, { tone: 'bad' }),
  });

  if (tid.error || mid.error || rq.error) return <main className="w-body" id="main"><ErrorState error={tid.error ?? mid.error ?? rq.error} onRetry={() => void rq.refetch()} /></main>;
  if (!r) return <main className="w-body" id="main"><Loading label="Loading the claim…" /></main>;

  const first = firstName(r.member.name);
  const c = r.claim;
  const status = c.status;
  const stage = { open: 0, ready: 1, verified: 2, part_paid: 3, reimbursed: 4 }[status];
  const own = r.viewer.ownClaim;
  const canPay = (status === 'verified' || status === 'part_paid') && c.balancePaise > 0 && !own;
  const reduced = r.expenses.filter(e => e.verification === 'verified' && e.approvedPaise != null && e.approvedPaise < e.amountPaise && e.paidBy === 'self').reduce((s, e) => s + (e.amountPaise - (e.approvedPaise ?? e.amountPaise)), 0);
  const docsById = new Map<string, Attachment>(r.documents.map(d => [d.id, d]));
  const events = (tl.data ?? []).filter(a => a.memberUserId === r.member.userId && ['expense.verify', 'expense.reject', 'expense.query', 'expense.reply', 'expense.dispute', 'expense.message', 'payment.record', 'claim.reopen', 'claim.close', 'member.end'].includes(a.action)).reverse().slice(0, 8);
  const ran = r.member.actualStart && r.member.actualEnd ? `ran ${fmtDayTime(r.member.actualStart)} → ${fmtDayTime(r.member.actualEnd)} · ${calendarDays(r.member.actualStart, r.member.actualEnd)} calendar days, ${humanDuration(new Date(r.member.actualEnd).getTime() - new Date(r.member.actualStart).getTime())}` : r.member.actualStart ? `running since ${fmtDayTime(r.member.actualStart)}` : 'not started';
  const reopened = !!c.reopenedAt;
  const skip = status === 'reimbursed' && r.payments.length === 1 ? 3 : undefined;

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead
        pre={<><ClaimStatusPill status={status} /><span className="refc">{r.trip.ref}</span></>}
        title={`${r.member.name} · ${r.trip.name.split(' · ')[0]}`}
        sub={`${r.trip.departmentName} · ${r.member.employeeCode} · ${ran}`}
        actions={<>
          <Btn kind="sec" size="sm" icon="download" to={`${tripPath(r.trip, 'export')}?scope=member&member=${r.member.userId}`}>Export claim</Btn>
          <Btn kind="sec" size="sm" icon="scan" to={claimPath(r.trip, r.member)}>Review</Btn>
          {own && <HandoffButton trip={r.trip} topic="claim" financeUsers={r.financeUsers} />}
          {status === 'reimbursed'
            ? <Btn kind="sec" size="sm" icon="undo" locked={own ? 'Locked: this is your own claim (FR-VER-10).' : null} onClick={() => setReopen(true)}>Reopen claim…</Btn>
            : reopened && c.balancePaise <= 0 && status === 'verified'
              ? <Btn kind="pri" size="sm" icon="check" busy={close.isPending} locked={own ? 'Locked: this is your own claim (FR-VER-10).' : null} onClick={() => close.mutate()}>Close claim</Btn>
              : <Btn kind="pri" size="sm" icon="bank" locked={own ? 'Locked: this is your own claim. Another finance user records your payment (FR-VER-10).' : !canPay ? (status === 'open' || status === 'ready' ? 'Verify every expense before recording a payment.' : 'Nothing is due on this claim.') : null} onClick={() => setPay(true)}>Record payment</Btn>}
        </>}
      />
      <Card flush>
        <div className="card-b" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Steps current={stage} skip={skip} />
          <span className="sm-note" style={{ marginLeft: 'auto' }}>Reimbursable {inr(c.reimbursablePaise)} · paid {inr(c.paidPaise)} · balance {inr(Math.max(c.balancePaise, 0))}</span>
        </div>
      </Card>
      {own && <Banner tone="info" icon="shield" title="This is your own claim">Another finance user verifies it and records your payment (FR-VER-10).</Banner>}
      {reopened && status !== 'reimbursed' && <Banner tone="info" icon="undo" title={`Reopened ${fmtDayTime(c.reopenedAt!)}`}>“{c.reopenReason}” {first} was told. Payments stay recorded; the reason prints on the next export.</Banner>}
      {status === 'reimbursed' && <Banner tone="neutral" icon="lock" title="This claim is locked">Reimbursed claims can’t change. To correct one, reopen it with a reason; the reason is logged and printed on the next export (FR-VER-09).</Banner>}
      {(status === 'open' || status === 'ready') && !own && (
        <Banner tone="warn" icon="inbox" title={status === 'open' ? `${first} is still travelling` : 'Not verified yet'} actions={<Btn kind="pri" size="sm" icon="scan" to={claimPath(r.trip, r.member)}>{`Review ${first}’s claim`}</Btn>}>
          {c.pending + c.query > 0 ? `${plural(c.pending + c.query, 'expense')} still to decide. ` : ''}Payments can be recorded once every expense is Verified or Rejected with no open query (FR-VER-06, FR-VER-07).
        </Banner>
      )}
      <div className="twocol">
        <div className="stack">
          <Card title="Expenses" icon="receipt" flush sub={plural(r.expenses.length, 'expense')}>
            <Tbl label="Expenses on this claim" heads={[['Expense'], ['Date'], ['Budget'], ['Claimed', 'r'], ['Approved', 'r'], ['Status']]}>
              {r.expenses.map(e => {
                const low = e.approvedPaise != null && e.approvedPaise !== e.amountPaise;
                return (
                  <tr key={e.id}>
                    <td><b>{e.description}</b><span className="t2">{CATEGORY[e.category].label}</span></td>
                    <td>{fmtDay(e.spentAt)}</td>
                    <td><SrcPill source={e.budgetSource} paidBy={e.paidBy} /></td>
                    <td className="r"><Amt paise={e.amountPaise} /></td>
                    <td className="r">{e.paidBy === 'company' ? <span className="faint">Not reimbursed</span> : e.verification === 'rejected' ? <span className="money" style={{ color: 'var(--bad)', fontWeight: 700 }}>{inr(0)}</span> : e.verification === 'verified' ? <Amt paise={e.approvedPaise ?? e.amountPaise} /> : <span className="faint">Not yet</span>}</td>
                    <td><VerPill v={e.verification} company={e.paidBy === 'company' && e.verification === 'pending'} lowered={low} /></td>
                  </tr>
                );
              })}
            </Tbl>
          </Card>
          <Card title="Payments" icon="bank" flush>
            {r.payments.length ? (
              <Tbl label="Payments" heads={[['Paid'], ['Mode'], ['Date'], ['Reference'], ['Proof'], ['Recorded']]}>
                {r.payments.map((p, i) => {
                  const proof = p.proof ?? (p.proofAttachmentId ? docsById.get(p.proofAttachmentId) : undefined);
                  const last = i === r.payments.length - 1;
                  return (
                    <tr key={p.id}>
                      <td><b className="amt money">{inr(p.amountPaise)}</b><span className="t2">{p.note ?? (last && status === 'reimbursed' ? 'Final' : last && status === 'part_paid' ? 'Part payment' : 'Part payment')}</span></td>
                      <td>{REIMBURSE_MODE[p.mode]}</td>
                      <td>{fmtCalDate(p.paidOn, true)}</td>
                      <td><span className="mono" style={{ fontSize: 12 }}>{p.reference ?? '–'}</span></td>
                      <td>{proof ? <button type="button" className="att" onClick={() => proof.url && void downloadAttachment(proof.url, proof.name)} title={proof.name}><Icon name="fileText" size={13} />{fileKind(proof.mime).toUpperCase()}</button> : <span className="faint">None</span>}</td>
                      <td>{p.recordedBy === me.id ? 'You' : p.recordedByName ?? 'Finance'} · {fmtDayTime(p.recordedAt)}</td>
                    </tr>
                  );
                })}
              </Tbl>
            ) : (
              <div className="card-b">
                <EmptyState icon="bank" title="Nothing paid yet" actions={canPay ? <Btn kind="pri" size="sm" icon="bank" onClick={() => setPay(true)}>Record payment</Btn> : undefined}>
                  Pay through the company’s bank or UPI, then record it here with the reference and proof. {first} sees it in the app.
                </EmptyState>
              </div>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="Summary" icon="coins">
            <Kvs pairs={[
              ['Claimed', <span className="money" key="a">{inr(c.selfPaise)}</span>],
              ['Rejected', c.rejectedPaise ? <span className="money" style={{ color: 'var(--bad)' }} key="b">−{inr(c.rejectedPaise)}</span> : <span className="money" key="b">{inr(0)}</span>],
              ['Reduced at verification', reduced ? <span className="money" key="c">−{inr(reduced)}</span> : <span className="money" key="c">{inr(0)}</span>],
              [<b key="d">Reimbursable</b>, <b className="money" key="e">{inr(c.reimbursablePaise)}</b>, true],
              ['Paid', <span className="money" key="f">{inr(c.paidPaise)}</span>],
              [<b key="g">Balance due</b>, <b className="money" key="h" style={{ color: c.balancePaise > 0 ? 'var(--warn)' : 'var(--ok)' }}>{inr(Math.max(c.balancePaise, 0))}</b>],
            ]} />
            {c.pending + c.query > 0 && <div className="sm-note" style={{ marginTop: 10 }}>{plural(c.pending + c.query, 'expense')} not decided yet {c.pending + c.query === 1 ? 'is' : 'are'} left out of the reimbursable total.</div>}
          </Card>
          <Card title="By budget source" icon="wallet">
            <Kvs pairs={[
              ['Trip pool', c.poolPaise ? <span className="money" key="p">{inr(c.poolPaise)}</span> : <span className="faint" key="p">None</span>],
              ['Individual budget', c.individualPaise ? <span className="money" key="i">{inr(c.individualPaise)} · private</span> : <span className="faint" key="i">None</span>],
              ['Unbudgeted', c.unbudgetedPaise ? <span className="money" key="u">{inr(c.unbudgetedPaise)}</span> : <span className="faint" key="u">None</span>],
              ['Company-paid, not reimbursed', c.companyPaise ? <span className="money" key="c">{inr(c.companyPaise)}</span> : <span className="faint" key="c">None</span>],
            ]} />
          </Card>
          <Card title="Documents on this claim" icon="file">
            {r.documents.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {r.documents.map(d => <FileRow key={d.id} kind={fileKind(d.mime || d.name)} name={d.name} meta={`${d.docType ? DOC_TYPE[d.docType] : 'Document'} · ${fmtBytes(d.size)}${d.uploadedByName ? ` · ${d.uploadedByName}` : ''}${d.note ? ` · “${d.note}”` : ''}`} actions={d.url ? <Btn kind="ghost" size="xs" icon="download" ariaLabel={`Download ${d.name}`} onClick={() => void downloadAttachment(d.url!, d.name)} /> : undefined} />)}
              </div>
            ) : <span className="sm-note">None yet. Payment proofs land here.</span>}
          </Card>
          <Card title="History" icon="history">
            <Feed items={events.map(a => { const l = timelineLook(a), t = timelineText(a); return { key: a.id, icon: l.icon, tone: l.tone, title: t.title, sub: `${fmtDayTime(a.at)}${t.sub ? ` · ${t.sub}` : ''}` }; })} empty={<span className="sm-note">Nothing yet.</span>} />
          </Card>
        </div>
      </div>
      {pay && <PaymentDrawer r={r} onClose={() => setPay(false)} />}
      {reopen && <ReopenModal r={r} onClose={() => setReopen(false)} />}
    </main>
  );
}
