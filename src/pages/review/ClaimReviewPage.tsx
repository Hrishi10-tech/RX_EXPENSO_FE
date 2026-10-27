/**
 * W06 claim review: one member's expenses beside their receipts, one after another (FR-WEB-05), decided with
 * one key: Verify, Approve lower, Query, Reject (FR-VER-01, FR-VER-02). J and K step through.
 * W06·f: a decision carries the version it was made on; when the member changes the expense meanwhile, the
 * change is shown field by field and decisions wait until the new version is loaded.
 * W06·g own claim read-only (FR-VER-10), W06·h flags with their evidence, W06·i receipt still on the phone.
 * Finance can write on any expense's thread without changing the decision; that's how a member's question about a
 * rejection or a lower approval gets its answer (ThreadComposer).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCrumbs } from '../../app/Shell';
import { api, queryClient, useMe } from '../../app/core';
import { useLive, watchTrip } from '../../app/realtime';
import { useClaimReview, useMemberId, useTripId } from '../../api/hooks';
import { HandoffButton } from '../../components/handoff';
import { keys } from '../../api/keys';
import type { ExpenseView, ReviewExpense } from '../../api/types';
import { Icon } from '../../components/Icon';
import { toast } from '../../components/Toasts';
import { dialogOpen } from '../../components/Overlay';
import { Avatar, Banner, Btn, ClaimStatusPill, EmptyState, ErrorState, Feed, Flag, Kbd, Kvs, Loading, Pill, Segs, SrcPill, Tbl, VerPill } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { firstName, fmtDay, fmtDayTime, fmtDayTimeComma, fmtTime, fmtTimeSec, humanDuration, inr, plural } from '../../lib/format';
import { CATEGORY, FLAG, PAYMENT_MODE, SOURCE } from '../../lib/labels';
import { claimPath, tripPath } from '../../lib/links';
import { ReceiptViewer } from './ReceiptViewer';
import { LowerDialog, QueryDialog, RejectDialog, clearDecisionDrafts } from './DecisionDialogs';
import { ThreadComposer } from './ThreadComposer';

type Filter = 'all' | 'todo' | 'flag';
type ModalKind = 'query' | 'reject' | 'lower' | null;

const decided = (e: ReviewExpense) => e.verification === 'verified' || e.verification === 'rejected';
const open = (e: ReviewExpense) => !decided(e);
/** The member answered the query and finance hasn't decided since; a finance note on the way doesn't count. */
const replied = (e: ReviewExpense) => e.verification === 'query' && [...e.thread].reverse().find(m => m.kind !== 'note')?.side === 'member';
/** The member wrote about a rejection or a lower approval and nobody has written since (M10·b/c). */
const disputed = (e: ReviewExpense) => e.thread.length > 0 && e.thread[e.thread.length - 1].kind === 'dispute';
const THREAD_KIND: Partial<Record<ReviewExpense['thread'][number]['kind'], string>> = { reject: 'rejected', note: 'note', dispute: 'asked about the decision' };
/** Brings the answer box into view (from the "asked about this decision" banner). */
const focusComposer = (expenseId: string) => {
  const el = document.getElementById(`msg-${expenseId}`);
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el?.focus({ preventScroll: true });
};
const lowered = (e: ReviewExpense) => e.approvedPaise != null && e.approvedPaise !== e.amountPaise;
const receiptPending = (e: ReviewExpense) => e.attachments.some(a => a.status !== 'uploaded');
const ownFiles = (e: ReviewExpense) => e.attachments.filter(a => !a.messageId && a.kind === 'receipt').length;

/** The fields a decision depends on. A reply alone doesn't change them. */
function diffOf(a: ReviewExpense, b: ReviewExpense): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  const add = (label: string, x: string, y: string) => { if (x !== y) out.push([label, x, y]); };
  add('Amount', inr(a.amountPaise), inr(b.amountPaise));
  add('Description', a.description, b.description);
  add('Category', CATEGORY[a.category].label, CATEGORY[b.category].label);
  add('Date', fmtDayTime(a.spentAt), fmtDayTime(b.spentAt));
  add('Payment', PAYMENT_MODE[a.paymentMode], PAYMENT_MODE[b.paymentMode]);
  add('Budget', a.paidBy === 'company' ? 'Company-paid' : SOURCE[a.budgetSource ?? 'unbudgeted'], b.paidBy === 'company' ? 'Company-paid' : SOURCE[b.budgetSource ?? 'unbudgeted']);
  add('Location', a.locationCity || '–', b.locationCity || '–');
  add('Note', a.remarks ? `“${a.remarks}”` : '–', b.remarks ? `“${b.remarks}”` : '–');
  add('Attachments', String(ownFiles(a)), String(ownFiles(b)));
  return out;
}

function stIcon(e: ReviewExpense) {
  if (e.verification === 'verified') return <span className="st ok" aria-label="Verified"><Icon name="check" size={13} /></span>;
  if (e.verification === 'rejected') return <span className="st bad" aria-label={disputed(e) ? 'Rejected, member asked about it' : 'Rejected'}><Icon name="x" size={13} /></span>;
  if (e.verification === 'query') return <span className="st warn" aria-label={replied(e) ? 'Replied' : 'Query'}><Icon name="message" size={12} /></span>;
  if (e.paidBy === 'company') return <span className="st" aria-label="Company-paid"><Icon name="building" size={12} /></span>;
  return <span className="st" aria-label="To check" />;
}

function loggedLine(e: ReviewExpense, first: string) {
  const dev = e.deviceTime ? new Date(e.deviceTime).getTime() : null;
  const rec = new Date(e.receivedAt).getTime();
  if (dev != null && Math.abs(rec - dev) > 60_000) return `Phone said ${fmtTimeSec(e.deviceTime!)} · server received ${fmtTimeSec(e.receivedAt)}`;
  if (rec - new Date(e.spentAt).getTime() > 6 * 3600_000) return `${fmtDayTime(e.createdAt)} on ${first}’s phone · ${humanDuration(rec - new Date(e.spentAt).getTime())} after the expense`;
  return `${fmtDayTime(e.createdAt)} on ${first}’s phone · synced at once`;
}

function flagDetail(e: ReviewExpense, f: ReviewExpense['flags'][number]): string {
  if (f === 'device_time_mismatch' && e.deviceTime) {
    const d = new Date(e.receivedAt).getTime() - new Date(e.deviceTime).getTime();
    return `The phone reported ${fmtTime(e.deviceTime)} when the server received the entry at ${fmtTime(e.receivedAt)}: the phone clock was ${humanDuration(d)} ${d > 0 ? 'behind' : 'ahead'} (NFR-14).`;
  }
  return FLAG[f].why;
}

function historyLine(h: ExpenseView['history'][number], meName: string, first: string) {
  const who = h.actor === meName ? 'you' : h.actor;
  const after = (h.after ?? {}) as Record<string, unknown>;
  switch (h.action) {
    case 'expense.create': return { icon: 'plus' as const, t: `Created by ${h.actor === meName ? 'you' : firstName(h.actor) || first}` };
    case 'expense.update': return { icon: 'pencil' as const, t: `Edited by ${firstName(h.actor)}` };
    case 'expense.verify': return { icon: 'check' as const, t: `Verified by ${who}${after.approvedPaise ? ` at ${inr(Number(after.approvedPaise))}` : ''}` };
    case 'expense.query': return { icon: 'message' as const, t: `Queried by ${who}` };
    case 'expense.reject': return { icon: 'xCircle' as const, t: `Rejected by ${who}` };
    case 'expense.reply': return { icon: 'message' as const, t: `${firstName(h.actor)} replied` };
    case 'expense.dispute': return { icon: 'message' as const, t: `${firstName(h.actor)} asked about the decision` };
    case 'expense.message': return { icon: 'send' as const, t: `${h.actor === meName ? 'You' : firstName(h.actor)} wrote to ${first}` };
    case 'expense.budget_source': return { icon: 'wallet' as const, t: `Budget source chosen by ${firstName(h.actor)}` };
    case 'expense.remind': return { icon: 'bellRing' as const, t: `Receipt reminder sent by ${who}` };
    case 'attachment.add': return { icon: 'paperclip' as const, t: `Attachment added by ${firstName(h.actor)}` };
    default: return { icon: 'history' as const, t: `${h.action.replace('.', ' ')} · ${h.actor}` };
  }
}

export function ClaimReviewPage() {
  const { tripKey = '', memberKey = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const me = useMe();
  const live = useLive();
  const tid = useTripId(tripKey);
  const mid = useMemberId(tid.id, memberKey);
  const rq = useClaimReview(tid.id, mid.id);
  const r = rq.data;
  useEffect(() => (tid.id ? watchTrip(tid.id) : undefined), [tid.id]);

  const [cur, setCur] = useState<string | null>(sp.get('expense'));
  const [filter, setFilter] = useState<Filter>('all');
  const [modal, setModal] = useState<ModalKind>(null);
  const pinned = useRef(new Map<string, ReviewExpense>());
  const mine = useRef(new Set<string>());
  const [conflict, setConflict] = useState<{ id: string; before: ReviewExpense; at: string } | null>(null);
  const [loadedFresh, setLoadedFresh] = useState<{ id: string; at: string } | null>(null);
  const first = firstName(r?.member.name);

  useCrumbs([{ label: 'Claims', to: '/claims' }, { label: r ? `${r.member.name} · ${r.trip.name.split(' · ')[0]}` : 'Claim' }]);

  // Pick the first expense still to check when nothing is chosen, and follow deletions.
  useEffect(() => {
    if (!r) return;
    const ids = r.expenses.map(e => e.id);
    if (!cur || !ids.includes(cur)) {
      if (cur && pinned.current.has(cur) && !ids.includes(cur)) toast(`${first} deleted ${pinned.current.get(cur)!.description}`, { tone: 'info' });
      setCur((r.expenses.find(e => open(e) && e.paidBy === 'self') ?? r.expenses.find(open) ?? r.expenses[0])?.id ?? null);
    }
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the URL on the expense being looked at, so a reload or a shared link lands here.
  useEffect(() => {
    if (cur && sp.get('expense') !== cur) setSp(prev => { const p = new URLSearchParams(prev); p.set('expense', cur); return p; }, { replace: true });
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live changes: a member's edit to the expense on screen holds decisions until the new version is loaded (W06·f).
  useEffect(() => {
    if (!r) return;
    for (const x of r.expenses) {
      const p = pinned.current.get(x.id);
      if (!p || x.version === p.version) { if (!p) pinned.current.set(x.id, x); continue; }
      if (mine.current.has(x.id)) { mine.current.delete(x.id); pinned.current.set(x.id, x); continue; }
      if (x.id === cur && diffOf(p, x).length && !(conflict && conflict.id === x.id)) { setConflict({ id: x.id, before: p, at: x.updatedAt }); continue; }
      if (!(conflict && conflict.id === x.id)) pinned.current.set(x.id, x);
    }
  }, [r, cur]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = r?.expenses.find(e => e.id === cur) ?? null;
  const shown = conflict && current && conflict.id === current.id ? conflict.before : current;
  const hist = useQuery({ queryKey: keys.expense(cur ?? ''), enabled: !!cur, queryFn: ({ signal }) => api.get<ExpenseView>(`/finance/expenses/${cur}`, undefined, signal) });
  useEffect(() => { if (cur && current) void queryClient.invalidateQueries({ queryKey: keys.expense(cur) }); }, [current?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const afterDecision = (id: string, verb: string, advance: boolean) => {
    clearDecisionDrafts(me.id, id);
    setModal(null);
    setLoadedFresh(null);
    void queryClient.invalidateQueries({ queryKey: keys.claimOfTrip(r!.trip.id) });
    void queryClient.invalidateQueries({ queryKey: keys.trip(r!.trip.id) });
    void queryClient.invalidateQueries({ queryKey: keys.claimsAll });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    toast(verb);
    if (advance && r) {
      const idx = r.expenses.findIndex(e => e.id === id);
      const n = r.expenses.length;
      for (let j = 1; j < n; j++) { const x = r.expenses[(idx + j) % n]; if (open(x) && x.id !== id) { setCur(x.id); return; } }
    }
  };
  const onFail = (id: string) => (e: unknown) => {
    mine.current.delete(id);
    if (e instanceof ApiError && e.code === 'stale_version') {
      const before = pinned.current.get(id) ?? current!;
      setModal(null);
      void rq.refetch().then(res => {
        const now = res.data?.expenses.find(x => x.id === id);
        setConflict({ id, before, at: now?.updatedAt ?? new Date().toISOString() });
      });
      return;
    }
    toast(e instanceof ApiError ? e.message : 'Couldn’t save the decision. Try again.', { tone: 'bad' });
  };
  const verify = useMutation({
    mutationFn: (v: { id: string; version: number; approvedPaise?: number; reason?: string }) => { mine.current.add(v.id); return api.post(`/finance/expenses/${v.id}/verify`, { version: v.version, approvedPaise: v.approvedPaise ?? null, reason: v.reason ?? null }); },
    onSuccess: (_x, v) => afterDecision(v.id, v.approvedPaise ? `Approved at ${inr(v.approvedPaise)} · ${first} told` : `Verified · ${current?.description ?? ''}`, true),
    onError: (e, v) => onFail(v.id)(e),
  });
  const query = useMutation({
    mutationFn: (v: { id: string; version: number; remark: string }) => { mine.current.add(v.id); return api.post(`/finance/expenses/${v.id}/query`, { version: v.version, remark: v.remark }); },
    onSuccess: (_x, v) => afterDecision(v.id, `Query sent · ${first} told`, false),
    onError: (e, v) => onFail(v.id)(e),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; version: number; remark: string }) => { mine.current.add(v.id); return api.post(`/finance/expenses/${v.id}/reject`, { version: v.version, remark: v.remark }); },
    onSuccess: (_x, v) => afterDecision(v.id, `Rejected · ${first} told with your reason`, true),
    onError: (e, v) => onFail(v.id)(e),
  });
  const remind = useMutation({
    mutationFn: (id: string) => api.post(`/finance/expenses/${id}/remind`),
    onSuccess: () => toast(`${first} was sent “Open Expenso to finish uploading the receipt”`, { icon: 'bellRing' }),
    onError: (e: unknown) => toast((e as Error).message, { tone: 'bad' }),
  });
  const busy = verify.isPending || query.isPending || reject.isPending;

  const list = useMemo(() => (r?.expenses ?? []).filter(e => filter === 'all' || (filter === 'todo' ? open(e) : e.flags.length > 0 || receiptPending(e))), [r, filter]);
  const idx = r && current ? r.expenses.findIndex(e => e.id === current.id) : -1;
  const step = (d: number) => { if (!r || !r.expenses.length) return; const n = r.expenses.length; setModal(null); setCur(r.expenses[(Math.max(idx, 0) + d + n) % n].id); };

  const lockReason = !r ? null : r.viewer.ownClaim ? 'Locked: this is your own claim. Another finance user decides it (FR-VER-10).'
    : r.viewer.locked ? 'Locked: the claim is reimbursed. Reopen it with a reason to make a correction (FR-VER-09).'
      : !live.connected && live.everConnected ? 'Live updates are paused. Decisions wait until the connection returns, so nothing is decided on stale data.' : null;
  const conflictOn = !!(conflict && current && conflict.id === current.id);
  const reasonVerify = lockReason ?? (!current ? 'Choose an expense' : conflictOn ? 'Load the new version first' : receiptPending(current) ? `Verify needs the receipt. Query or reject instead, or remind ${first}.` : current.verification === 'verified' ? 'Already verified. Choose another expense, or query to reopen it.' : null);
  const reasonOther = lockReason ?? (conflictOn ? 'Load the new version first' : null);
  const companyReason = current?.paidBy === 'company' ? 'Company-paid: counts in trip cost and isn’t reimbursed' : null;

  const doVerify = () => { if (!reasonVerify && current) verify.mutate({ id: current.id, version: current.version }); else if (reasonVerify) toast(reasonVerify, { tone: 'info', icon: 'lock' }); };
  const openModal = (m: Exclude<ModalKind, null>) => {
    const why = reasonOther ?? (m !== 'query' ? companyReason : null);
    if (why) { toast(why, { tone: 'info', icon: 'lock' }); return; }
    setModal(m);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || dialogOpen() || modal) return;
      const k = e.key.toLowerCase();
      if (k === 'j') { e.preventDefault(); step(1); }
      else if (k === 'k') { e.preventDefault(); step(-1); }
      else if (k === 'v') { e.preventDefault(); doVerify(); }
      else if (k === 'a') { e.preventDefault(); openModal('lower'); }
      else if (k === 'q') { e.preventDefault(); openModal('query'); }
      else if (k === 'r') { e.preventDefault(); openModal('reject'); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  if (tid.error || mid.error || rq.error) return <main className="w-body" id="main"><ErrorState error={tid.error ?? mid.error ?? rq.error} onRetry={() => void rq.refetch()} /></main>;
  if (!r) return <main className="w-body" id="main"><Loading label="Loading the claim…" /></main>;

  const self = r.expenses.filter(e => e.paidBy === 'self');
  const checkedN = r.expenses.filter(decided).length;
  const allDone = r.expenses.length > 0 && checkedN === r.expenses.length;
  const reimbursable = self.reduce((s, e) => s + (e.verification === 'rejected' ? 0 : e.approvedPaise ?? e.amountPaise), 0);
  const lastOpen = !!current && r.expenses.filter(open).length === 1 && open(current) && !r.member.running;
  const ran = r.member.actualStart ? (r.member.actualEnd ? `ran ${fmtDayTime(r.member.actualStart)} → ${fmtDayTime(r.member.actualEnd)}${r.member.endMethod === 'finance' ? ' · ended by finance' : ''}` : `running since ${fmtDayTime(r.member.actualStart)}`) : 'not started';
  const budgetText = (e: ReviewExpense) => {
    if (e.paidBy === 'company') return 'Company-paid: counts in trip cost, draws no budget and isn’t reimbursed.';
    const b = e.budgetSource === 'pool' ? r.budgets.pool : e.budgetSource === 'individual' ? r.budgets.individual : null;
    if (!b) return e.budgetSource === 'unbudgeted' ? 'Unbudgeted: no budget draws on it; paid on verified actuals.' : 'No budget on this trip: paid on verified actuals.';
    const over = b.spentPaise > b.allocatedPaise;
    const head = e.budgetSource === 'pool' ? 'Trip pool' : `${first}’s individual budget`;
    return `${head}: ${inr(b.spentPaise)} of ${inr(b.allocatedPaise)} used${over ? `, over by ${inr(b.spentPaise - b.allocatedPaise)}` : ` (${b.pct}%)`}.${e.budgetSource === 'individual' ? ` Private to ${first} and finance.` : ' Verifying doesn’t change the draw-down; rejecting or lowering reduces it.'}`;
  };
  const e = shown;
  const verifyLabel = current?.verification === 'verified' ? (lowered(current) ? 'Approved lower' : 'Verified') : current?.verification === 'rejected' ? 'Verify instead' : 'Verify';

  return (
    <>
      <div className="cstrip">
        <div className="who2"><Avatar name={r.member.name} size="lg" /><div><b>{r.member.name}</b><small>{r.trip.departmentName} · {r.member.employeeCode}</small></div></div>
        <div style={{ minWidth: 0 }}>
          <Link className="link" to={tripPath(r.trip)} style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', textDecoration: 'none' }}>{r.trip.name}</Link>
          <div className="sm-note">{r.trip.ref} · {ran}</div>
        </div>
        <ClaimStatusPill status={r.claim.status} />
        <div className="nums">
          <div><small>Claimed</small><b>{inr(r.claim.selfPaise)}</b></div>
          <div><small>Approved so far</small><b>{inr(r.claim.reimbursablePaise)}</b></div>
          <div><small>Checked</small><b>{checkedN} of {r.expenses.length}</b></div>
          {(r.claim.status === 'verified' || r.claim.status === 'part_paid' || r.claim.status === 'reimbursed') && <Btn kind="sec" size="sm" icon="bank" to={claimPath(r.trip, r.member, { payments: true })}>Payments</Btn>}
        </div>
      </div>
      <div className="review" id="main">
        <div className="rv-list" aria-label="Expenses on this claim">
          <div className="rh">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b>{plural(r.expenses.length, 'expense')}</b><span className="sm-note money">{inr(r.claim.selfPaise)}</span></div>
            <Segs label="Show" value={filter} onChange={setFilter} options={[['all', 'All'], ['todo', 'To check'], ['flag', 'Flagged']]} />
          </div>
          <div className="items" role="listbox" aria-label="Expenses">
            {list.length === 0 && <div className="sd-empty">{filter === 'todo' ? 'Nothing left to check.' : filter === 'flag' ? 'No flagged expenses.' : 'No expenses on this claim.'}</div>}
            {list.map(x => (
              <button type="button" key={x.id} role="option" aria-selected={x.id === cur} aria-current={x.id === cur} className={`rv-item ${x.id === cur ? 'on' : ''}`} onClick={() => { setCur(x.id); setModal(null); }}>
                {stIcon(x)}
                <span className="mid">
                  <b>{x.description}</b>
                  <small>{fmtDay(x.spentAt)} · {CATEGORY[x.category].label}
                    {x.flags.length > 0 && <span className="nw"> · <Icon name="flag" size={11} /> flagged</span>}
                    {receiptPending(x) && <span className="nw"> · <Icon name="cloudOff" size={11} /> no receipt yet</span>}
                    {replied(x) && <span className="nw"> · <Icon name="message" size={11} /> replied</span>}
                    {disputed(x) && <span className="nw"> · <Icon name="message" size={11} /> asked about it</span>}</small>
                </span>
                <span className="amt" style={x.verification === 'rejected' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{inr(x.amountPaise)}</span>
              </button>
            ))}
          </div>
        </div>

        {e ? <ReceiptViewer e={e} first={first} reminding={remind.isPending} onRemind={() => remind.mutate(e.id)} /> : <div className="rv-view"><EmptyState icon="receipt" title="No expenses on this claim">Expenses arrive here live as the member logs them.</EmptyState></div>}

        <div className="rv-side" aria-label="Expense details and decision">
          <div className="rv-scroll">
            {allDone && !r.member.running && !r.viewer.ownClaim && (r.claim.status === 'verified' || r.claim.status === 'part_paid') && (
              <div className="rvs"><Banner tone="ok" icon="badgeCheck" title={`Claim verified · ${inr(r.claim.balancePaise)} to reimburse`} actions={<Btn kind="pri" size="sm" icon="bank" to={claimPath(r.trip, r.member, { payments: true })}>Record payment</Btn>}>Every expense is checked. {first} was told.</Banner></div>
            )}
            {r.viewer.ownClaim && <div className="rvs"><Banner tone="info" icon="shield" title="This is your own claim"
              actions={<HandoffButton trip={r.trip} topic="claim" financeUsers={r.financeUsers} />}>
              Another finance user verifies it, answers its thread and records your payment (FR-VER-10). You can read everything and answer queries from the mobile app.</Banner></div>}
            {current && disputed(current) && !r.viewer.ownClaim && (
              <div className="rvs"><Banner tone="warn" icon="message" title={`${first} asked about this decision`}
                actions={<Btn kind="sec" size="sm" icon="message" onClick={() => focusComposer(current.id)}>Answer {first}</Btn>}>
                The question is in the thread below. Answer it there and the decision stays as it is; to change it, {current.verification === 'rejected' ? 'verify it instead' : 'approve a different amount'} or query it. {first} is told either way.
              </Banner></div>
            )}
            {r.viewer.locked && !r.viewer.ownClaim && <div className="rvs"><Banner tone="neutral" icon="lock" title="This claim is reimbursed and locked" actions={<Btn kind="sec" size="sm" to={claimPath(r.trip, r.member, { payments: true })}>Open payments</Btn>}>To correct it, reopen it with a reason; the reason is logged and printed on the next export (FR-VER-09).</Banner></div>}
            {conflictOn && current && (
              <div className="rvs">
                <Banner tone="warn" icon="refresh" title={`${first} changed this expense at ${fmtTime(conflict!.at)}`}
                  actions={<Btn kind="pri" size="sm" icon="refresh" onClick={() => { pinned.current.set(current.id, current); setLoadedFresh({ id: current.id, at: conflict!.at }); setConflict(null); toast(`Loaded the version saved at ${fmtTime(conflict!.at)}`); }}>Load the new version</Btn>}>
                  You were looking at the earlier version, so no decision was saved on it. Load the new version and decide on that.
                </Banner>
                <Tbl className="diff-tbl" label="What changed" heads={[['Field'], ['Before'], ['Now']]}>
                  {(diffOf(conflict!.before, current).length ? diffOf(conflict!.before, current) : [['Thread', `${conflict!.before.thread.length} messages`, `${current.thread.length} messages`] as [string, string, string]]).map(([f, a, b]) => <tr key={f}><td>{f}</td><td>{a}</td><td><b>{b}</b></td></tr>)}
                </Tbl>
              </div>
            )}
            {loadedFresh && current && loadedFresh.id === current.id && !conflictOn && <div className="rvs"><Banner tone="ok" icon="refresh" title="You’re looking at the latest version">Changed by {first} at {fmtTime(loadedFresh.at)}. Decide on this version.</Banner></div>}
            {e && (
              <>
                <div className="rvs">
                  <div className="big money">{inr(e.amountPaise)}{lowered(e) && <small>Approved {inr(e.approvedPaise)}</small>}</div>
                  <div className="flags">
                    <Pill tone="line" icon={CATEGORY[e.category].icon}>{CATEGORY[e.category].label}</Pill>
                    <SrcPill source={e.budgetSource} paidBy={e.paidBy} who={e.budgetSource === 'individual' ? 'private' : undefined} />
                    <VerPill v={e.verification} company={e.paidBy === 'company' && e.verification === 'pending'} lowered={lowered(e)} replied={replied(e)} />
                  </div>
                </div>
                <div className="rvs">
                  <h3>Details</h3>
                  <Kvs left pairs={[
                    ['When', fmtDayTimeComma(e.spentAt)],
                    ['Location', e.locationCity || '–'],
                    ['Payment', `${PAYMENT_MODE[e.paymentMode]} · ${e.paidBy === 'company' ? 'paid by the company' : `paid by ${first}`}`],
                    ['Logged', loggedLine(e, first)],
                    e.remarks ? ['Member’s note', `“${e.remarks}”`] : null,
                    e.approvalReason ? ['Approval note', `“${e.approvalReason}”`] : null,
                    e.verification === 'rejected' && e.financeRemark ? ['Rejected because', `“${e.financeRemark}”`] : null,
                  ]} />
                </div>
                {e.flags.length > 0 && (
                  <div className="rvs">
                    <h3>Flags</h3>
                    {e.flags.map(f => <div key={f} style={{ display: 'grid', gap: 5 }}><Flag tone={FLAG[f].tone} icon={FLAG[f].icon}>{FLAG[f].label}</Flag><span className="sm-note">{flagDetail(e, f)}</span></div>)}
                  </div>
                )}
                {(e.thread.length > 0 || !r.viewer.ownClaim) && (
                  <div className="rvs">
                    <h3>Thread with {first}</h3>
                    {e.thread.length > 0 && (
                      <div className="wthread">
                        {e.thread.map(m => (
                          <div key={m.id} className={`wmsg ${m.side === 'finance' ? 'me' : ''} ${m.kind === 'note' ? 'note' : ''}`}>
                            <small>{m.side === 'finance' ? (m.authorId === me.id || m.authorName === me.name ? 'You' : m.authorName) : m.authorName} · {fmtDayTime(m.createdAt)}{THREAD_KIND[m.kind] ? ` · ${THREAD_KIND[m.kind]}` : ''}</small>
                            {m.body}
                            {m.attachments.length > 0 && <div className="att-list">{m.attachments.map(a => <span key={a.id} className="att"><Icon name="paperclip" size={13} />{a.name}</span>)}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {!r.viewer.ownClaim && <ThreadComposer key={e.id} e={current ?? e} tripId={r.trip.id} memberId={r.member.userId} first={first} me={me} answering={disputed(current ?? e)} />}
                  </div>
                )}
                <div className="rvs"><h3>Budget</h3><span className="sm-note">{budgetText(e)}</span></div>
                <div className="rvs">
                  <h3>History</h3>
                  {hist.isLoading ? <span className="sm-note">Loading…</span> : (
                    <Feed items={(hist.data?.history ?? []).slice().reverse().map((h, i) => { const l = historyLine(h, me.name, first); return { key: i, icon: l.icon, title: l.t, sub: fmtDayTime(h.at) }; })} empty={<span className="sm-note">No history.</span>} />
                  )}
                </div>
              </>
            )}
          </div>
          <div className="rv-acts">
            <Btn kind="pri" block icon="check" kbd="V" dataKey="v" busy={verify.isPending} locked={reasonVerify} onClick={doVerify}>{verifyLabel}</Btn>
            <div className="row3">
              <Btn kind="sec" size="sm" dataKey="a" locked={reasonOther ?? companyReason} onClick={() => openModal('lower')}>Approve lower</Btn>
              <Btn kind="sec" size="sm" dataKey="q" locked={reasonOther} onClick={() => openModal('query')}>Query</Btn>
              <Btn kind="danger" size="sm" dataKey="r" locked={reasonOther ?? companyReason} onClick={() => openModal('reject')}>Reject</Btn>
            </div>
            <div className="navrow sm-note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={() => step(-1)} aria-label="Previous expense (K)"><Kbd>K</Kbd>Previous</button>
              <span>{idx + 1} of {r.expenses.length} · keys <Kbd>A</Kbd> <Kbd>Q</Kbd> <Kbd>R</Kbd></span>
              <button type="button" onClick={() => step(1)} aria-label="Next expense (J)">Next<Kbd>J</Kbd></button>
            </div>
          </div>
        </div>
      </div>
      {modal === 'query' && current && <QueryDialog e={current} first={first} userId={me.id} busy={busy} running={r.member.running} onClose={() => setModal(null)} onSubmit={remark => query.mutate({ id: current.id, version: current.version, remark })} />}
      {modal === 'reject' && current && <RejectDialog e={current} first={first} userId={me.id} busy={busy} reimbursable={reimbursable} onClose={() => setModal(null)} onSubmit={remark => reject.mutate({ id: current.id, version: current.version, remark })} />}
      {modal === 'lower' && current && <LowerDialog e={current} first={first} userId={me.id} busy={busy} reimbursable={reimbursable} lastOpen={lastOpen} onClose={() => setModal(null)} onSubmit={(p, reason) => verify.mutate({ id: current.id, version: current.version, approvedPaise: p, reason })} />}
    </>
  );
}

