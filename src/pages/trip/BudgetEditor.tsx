/**
 * W05 budget editor: the shared trip pool and each member's private individual budget, with the effect on
 * earlier expenses previewed by the server before saving (FR-BUD-01..06), removal with a note (W05·c),
 * the change log (W05·b), and the FR-VER-10 lock for a finance user who is on the trip (W05·d).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, queryClient, useMe } from '../../app/core';
import { useBudgetLog, useBudgetPreview } from '../../api/hooks';
import { keys } from '../../api/keys';
import type { BudgetPreview, BudgetsSaveInput, BudgetsSaveResult, FinanceTrip, MemberRow } from '../../api/types';
import { Icon, type IconName } from '../../components/Icon';
import { Drawer, Modal } from '../../components/Overlay';
import { HandoffButton } from '../../components/handoff';
import { toast } from '../../components/Toasts';
import { Avatar, Banner, Btn, Card, Field, Impact, Pill, Switch, Tbl, TextArea, TextInput } from '../../components/ui';
import { budgetPct, budgetState, firstName, fmtDayTime, inr, joinNames, parseRupees, plural, rupeesInput } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { tripPath } from '../../lib/links';
import { clearDraft, getDraft, saveDraft } from '../../lib/drafts';
import { refreshTrip } from './dialogs';
import { shortName } from './helpers';

interface Row { on: boolean; amount: string }


/** The "When you save" lines, from the server's preview plus what the change does to alerts and who is told. */
export function impactLines(t: FinanceTrip, p: BudgetPreview | undefined, pool: { was: number | null; will: number | null }, ind: Record<string, { was: number | null; will: number | null }>): Array<[IconName, string]> {
  const out: Array<[IconName, string]> = [];
  const names = new Map(t.members.map(m => [m.userId, m.name]));
  if (p) {
    const to = (k: 'toPool' | 'toIndividual' | 'needChoice' | 'poolToUnbudgeted' | 'individualToUnbudgeted') => p.members.filter(m => m.effect[k]).map(m => ({ name: m.name, ...m.effect[k]! }));
    const toPool = to('toPool');
    if (toPool.length) out.push(['users', `${joinNames(toPool.map(x => `${firstName(x.name)}’s`))} earlier expenses (${inr(toPool.reduce((s, x) => s + x.paise, 0))}, ${plural(toPool.reduce((s, x) => s + x.count, 0), 'expense')}) are charged to the trip pool now.`]);
    for (const x of to('toIndividual')) out.push(['lock', `${firstName(x.name)}’s ${plural(x.count, 'earlier expense')} (${inr(x.paise)}) are charged to their individual budget now.`]);
    for (const x of to('needChoice')) out.push(['lock', `${firstName(x.name)} will hold both budgets, so their ${plural(x.count, 'earlier expense')} (${inr(x.paise)}) stay Unbudgeted until they choose one for each. The app asks them straight away.`]);
    for (const x of to('poolToUnbudgeted')) out.push(['undo', `${firstName(x.name)}’s ${plural(x.count, 'expense')} in the trip pool (${inr(x.paise)}) return to Unbudgeted and become private to them again.`]);
    for (const x of to('individualToUnbudgeted')) out.push(['undo', `${firstName(x.name)}’s ${plural(x.count, 'individual-budget expense')} (${inr(x.paise)}) return to Unbudgeted, still private.`]);
  }
  const company = t.expenses.filter(e => e.paidBy === 'company');
  if (company.length && (pool.will !== pool.was)) out.push(['building', company.length === 1 ? `${company[0].description} (${inr(company[0].amountPaise)}) is company-paid and draws no budget.` : `${plural(company.length, 'company-paid expense')} (${inr(company.reduce((s, e) => s + e.amountPaise, 0))}) draw no budget.`]);
  if (pool.was != null && pool.will != null && pool.was !== pool.will && t.budgets.pool) {
    const spent = t.budgets.pool.spentPaise;
    const a = budgetPct(spent, pool.was), b = budgetPct(spent, pool.will);
    const sa = budgetState(spent, pool.was), sb = budgetState(spent, pool.will);
    let tail = '';
    if (sa === 'over' && sb !== 'over') tail = sb === 'warn' ? ' The red Over budget banner clears for members; the pool stays amber from 80%, so no new alert is sent.' : ' The Over budget banner clears for members.';
    else if (sa === 'warn' && sb === 'ok') tail = ' The amber banner clears for members.';
    else if (sb === 'over' && sa !== 'over') tail = ' The pool shows Over budget at once. Nothing is blocked (FR-BUD-08).';
    else if (sb === 'warn' && sa === 'ok') tail = ' Members see an amber banner.';
    out.push(['alert', `Used goes from ${a}% to ${b}%.${tail}`]);
  }
  const accepted = t.members.filter(m => m.joinStatus === 'accepted');
  if (pool.will !== pool.was) out.push(['bellRing', pool.will == null ? `All ${plural(accepted.length, 'member')} are told the trip pool was removed.` : `All ${plural(accepted.length, 'member')} are told ${pool.was == null ? 'about the trip pool' : 'the new amount'} (FR-BUD-06).`]);
  const indChanged = Object.entries(ind).filter(([, v]) => v.was !== v.will).map(([uid]) => firstName(names.get(uid)));
  if (indChanged.length) out.push(['bellRing', `Only ${joinNames(indChanged)} ${indChanged.length === 1 ? 'is' : 'are'} told about ${indChanged.length === 1 ? 'their budget' : 'their own budgets'}, with no amount on the lock screen (FR-NOT-03).`]);
  if (pool.will !== pool.was || indChanged.length) out.push(['history', 'Every change is logged with your name, the time and your note.']);
  return out;
}

export function BudgetEditor({ t, locked, onClose }: { t: FinanceTrip; locked: string | null; onClose: () => void }) {
  const me = useMe();
  const nav = useNavigate();
  const log = useBudgetLog(t.trip.id);
  const accepted = t.members.filter(m => m.joinStatus === 'accepted');
  const curInd = (uid: string) => t.budgets.individuals.find(b => b.memberUserId === uid) ?? null;
  const [pool, setPool] = useState<Row>({ on: !!t.budgets.pool, amount: rupeesInput(t.budgets.pool?.allocatedPaise) });
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(accepted.map(m => [m.userId, { on: !!curInd(m.userId), amount: rupeesInput(curInd(m.userId)?.allocatedPaise) }])));
  const draftKey = `budgetnote:${t.trip.id}`;
  const [note, setNote] = useState(() => getDraft(me.id, draftKey));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [reason, setReason] = useState('');

  const poolWas = t.budgets.pool?.allocatedPaise ?? null;
  const poolWill = pool.on ? parseRupees(pool.amount) : null;
  const indState = useMemo(() => Object.fromEntries(accepted.map(m => {
    const r = rows[m.userId];
    return [m.userId, { was: curInd(m.userId)?.allocatedPaise ?? null, will: r?.on ? parseRupees(r.amount) : null }];
  })), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = (!pool.on || (poolWill != null && poolWill > 0)) && accepted.every(m => !rows[m.userId]?.on || (parseRupees(rows[m.userId].amount) ?? 0) > 0);
  const changedInd = Object.entries(indState).filter(([, v]) => v.was !== v.will);
  const poolChanged = poolWas !== poolWill;
  const anyChange = poolChanged || changedInd.length > 0;
  const previewInput = useDebounced({ pool: pool.on ? (poolWill ?? 1) : null, individuals: Object.fromEntries(changedInd.map(([uid, v]) => [uid, v.will])) }, 300);
  const preview = useBudgetPreview(t.trip.id, previewInput, !locked && anyChange && valid);
  const lines = anyChange ? impactLines(t, preview.data, { was: poolWas, will: poolWill }, indState) : [];
  const removals = [...(poolWas != null && poolWill == null ? [{ kind: 'pool' as const, userId: undefined as string | undefined, label: 'the trip pool' }] : []), ...changedInd.filter(([, v]) => v.will == null).map(([uid]) => ({ kind: 'individual' as const, userId: uid, label: `${t.members.find(m => m.userId === uid)?.name}’s individual budget` }))];

  const memberNote = (m: MemberRow) => {
    const r = rows[m.userId];
    const both = r?.on && pool.on;
    const reimb = m.claimStatus === 'reimbursed' ? ' · claim reimbursed, its expenses keep their source' : '';
    return `${m.role === 'owner' ? 'Owner · ' : ''}${both ? 'Will hold both budgets' : r?.on ? 'Individual budget only' : pool.on ? 'Trip pool only' : 'No budget'}${reimb}`;
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (pool.on && !(poolWill != null && poolWill > 0)) e.pool = 'Enter the pool in rupees, more than ₹0.';
    for (const m of accepted) { const r = rows[m.userId]; if (r?.on && !(parseRupees(r.amount) ?? 0)) e[m.userId] = 'Enter an amount.'; }
    setErrors(e);
    return !Object.keys(e).length;
  };

  /**
   * The whole form in one PUT (FR-BUD-03): the server applies every change in one transaction and resolves
   * earlier unbudgeted expenses once, against the budgets each member holds afterwards, exactly as previewed.
   */
  const save = async (removeNote?: string) => {
    if (!validate()) return;
    if (!anyChange) { toast('Nothing to save', { tone: 'info' }); return; }
    if (removals.length && removeNote === undefined) { setConfirmRemove(true); return; }
    setBusy(true); setFormErr(null);
    const n = note.trim() || null;
    const body: BudgetsSaveInput = { note: removeNote || n };
    if (poolChanged) body.pool = poolWill == null ? null : { amountPaise: poolWill, note: n };
    if (changedInd.length) body.individuals = Object.fromEntries(changedInd.map(([uid, v]) => [uid, v.will == null ? null : { amountPaise: v.will, note: n }]));
    try {
      const res = await api.put<BudgetsSaveResult>(`/finance/trips/${t.trip.id}/budgets`, body);
      queryClient.setQueryData(keys.trip(t.trip.id), res.trip);
      clearDraft(me.id, draftKey);
      refreshTrip(t.trip.id);
      const told = changedInd.map(([uid]) => firstName(t.members.find(m => m.userId === uid)?.name));
      const asked = res.askedToChoose.map(uid => t.members.find(m => m.userId === uid)?.name).filter((x): x is string => !!x);
      toast(`Budgets saved${poolChanged ? ` · ${plural(accepted.length, 'member')} told about the pool` : ''}${told.length ? `${poolChanged ? ',' : ' ·'} ${joinNames(told)} told privately` : ''}`,
        asked.length ? { sub: `${joinNames(asked.map(firstName))} ${asked.length === 1 ? 'is' : 'are'} asked to choose a budget for earlier expenses` } : {});
      nav(tripPath(t.trip), { state: { budgetsSaved: { at: new Date().toISOString(), lines: lines.filter(l => l[0] !== 'history' && l[0] !== 'bellRing').map(l => l[1]), charged: res.charged, asked } } });
    } catch (e) {
      setFormErr((e as Error).message);
      refreshTrip(t.trip.id);
    } finally { setBusy(false); setConfirmRemove(false); }
  };

  const poolState = t.budgets.pool?.state;
  const pre = <><span className="refc">{t.trip.ref}</span>{poolState === 'over' ? <Pill tone="bad" icon="alert">Over budget</Pill> : <Pill tone={t.trip.status === 'active' ? 'ok' : t.trip.status === 'extended' ? 'warn' : 'line'}>{t.trip.status[0].toUpperCase() + t.trip.status.slice(1)}{t.trip.progress ? ` · day ${t.trip.progress.day}` : ''}</Pill>}</>;
  const logTable = (
    <div style={{ display: 'grid', gap: 8 }}>
      <b style={{ fontSize: 14 }}>Change log</b>
      <Card flush>
        {log.data && log.data.length === 0 && !anyChange ? <div className="card-b sm-note">No budget changes yet.</div> : (
          <Tbl label="Budget change log" heads={[['When'], ['Budget'], ['Change'], ['Note']]}>
            {anyChange && !locked && (
              <tr className="sel">
                <td>Now · you</td>
                <td>{[poolChanged && 'Trip pool', ...changedInd.map(([uid]) => firstName(t.members.find(m => m.userId === uid)?.name))].filter(Boolean).join(', ')}</td>
                <td>{poolChanged ? `${poolWas != null ? inr(poolWas) : '–'} → ${poolWill != null ? inr(poolWill) : 'removed'}` : `${plural(changedInd.length, 'individual budget')}`}</td>
                <td>{note || <span className="faint">–</span>}</td>
              </tr>
            )}
            {(log.data ?? []).map(r => (
              <tr key={r.id}>
                <td>{fmtDayTime(r.at)} · {r.by === me.name ? 'you' : r.by}</td>
                <td>{r.type === 'pool' ? 'Trip pool' : <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="lock" size={13} />{r.memberName}</span>}</td>
                <td className="money">{r.oldPaise != null ? inr(r.oldPaise) : '–'} → {r.newPaise != null ? inr(r.newPaise) : 'removed'}</td>
                <td>{r.note ?? <span className="faint">{r.type === 'individual' ? 'Private' : '–'}</span>}</td>
              </tr>
            ))}
          </Tbl>
        )}
      </Card>
    </div>
  );

  if (locked) {
    return (
      <Drawer title={`Budgets · ${shortName(t.trip.name)}`} pre={pre} sub="Only finance sets budgets. Members see them live in the app; an individual budget only by its member." onClose={onClose} width={580}
        footer={<Btn kind="sec" onClick={onClose}>Close</Btn>}>
        <Banner tone="info" icon="shield" title="Budgets are locked for you"
          actions={t.viewer.isMember ? <HandoffButton trip={t.trip} topic="budgets" financeUsers={t.financeUsers} /> : undefined}>{locked}</Banner>
        <div className="impact">
          <h4>Current budgets</h4>
          <div className="it"><Icon name="users" size={16} /><span>Trip pool: {t.budgets.pool ? `${inr(t.budgets.pool.allocatedPaise)} · ${t.budgets.pool.pct}% used` : 'not set'}</span></div>
          {t.budgets.individuals.map(b => <div className="it" key={b.id}><Icon name="lock" size={16} /><span>{b.memberName}: {inr(b.allocatedPaise)} · {b.pct}% used · private</span></div>)}
        </div>
        {logTable}
      </Drawer>
    );
  }

  return (
    <>
      <Drawer title={`Budgets · ${shortName(t.trip.name)}`} pre={pre} sub="Only finance sets budgets. Members see them live in the app; an individual budget only by its member." onClose={onClose} width={580}
        footer={<>
          <span className="sm-note" style={{ marginRight: 'auto' }}>Budgets never block an expense (FR-BUD-08)</span>
          <Btn kind="sec" onClick={onClose}>Cancel</Btn>
          <Btn kind="pri" icon="check" busy={busy} onClick={() => void save()} locked={!anyChange ? 'Change an amount first.' : null}>Save budgets</Btn>
        </>}>
        {formErr && <Banner tone="bad" icon="alert" title="Couldn’t save every change">{formErr}</Banner>}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="users" size={18} /><b>Trip pool</b><Pill tone="pool">{`Shared by all ${plural(accepted.length, 'member')}`}</Pill>
            <span style={{ marginLeft: 'auto' }}><Switch checked={pool.on} label="Trip pool" onChange={v => setPool(p => ({ ...p, on: v }))} /></span>
          </div>
          {pool.on && (
            <Field label="Amount" htmlFor="poolAmt" error={errors.pool} help={t.budgets.pool ? `Spent so far: ${inr(t.budgets.pool.spentPaise)}` : 'Every member sees the pool, what’s spent from it and what’s left.'}>
              <TextInput id="poolAmt" prefix="₹" inputMode="decimal" wrapClassName="big" value={pool.amount} error={!!errors.pool} autoFocus={!t.budgets.pool}
                onChange={e => setPool(p => ({ ...p, amount: e.target.value }))} onBlur={() => { const v = parseRupees(pool.amount); if (v != null) setPool(p => ({ ...p, amount: rupeesInput(v) })); }}
                wrapStyle={poolChanged && poolWas != null ? { borderColor: 'var(--accent)' } : undefined}
                end={poolWas != null && poolWill !== poolWas ? <span className="sm-note">was {inr(poolWas)}</span> : undefined} />
            </Field>
          )}
          {!pool.on && poolWas != null && <Banner tone="warn" icon="undo" title="The trip pool will be removed">Its expenses return to Unbudgeted and become private to each member again (FR-BUD-05). You’ll be asked for the reason.</Banner>}
        </div>
        <div className="divider" />
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Icon name="lock" size={18} /><b>Individual budgets</b><Pill tone="priv">Private</Pill></div>
          <div className="sm-note">Only that member and finance ever see an individual budget or what is charged to it. It can be combined with the trip pool.</div>
          {accepted.map(m => {
            const r = rows[m.userId] ?? { on: false, amount: '' };
            return (
              <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line)', ...(r.on ? { background: 'var(--priv-soft)', borderColor: 'transparent' } : {}) }}>
                <Avatar name={m.name} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{m.name}</b><div className="sm-note">{memberNote(m)}</div>{errors[m.userId] && <div className="errtxt"><Icon name="alert" size={13} />{errors[m.userId]}</div>}</div>
                {r.on && <TextInput prefix="₹" inputMode="decimal" aria-label={`Individual budget for ${m.name}`} wrapStyle={{ width: 140, fontWeight: 700 }} value={r.amount} error={!!errors[m.userId]}
                  onChange={e => setRows(p => ({ ...p, [m.userId]: { ...r, amount: e.target.value } }))} onBlur={() => { const v = parseRupees(r.amount); if (v != null) setRows(p => ({ ...p, [m.userId]: { ...r, amount: rupeesInput(v) } })); }} />}
                <Switch checked={r.on} label={`Individual budget for ${m.name}`} onChange={v => setRows(p => ({ ...p, [m.userId]: { ...r, on: v } }))} />
              </div>
            );
          })}
        </div>
        {anyChange ? (
          <Impact title={preview.isFetching && !preview.data ? 'When you save · working it out…' : 'When you save'} items={lines.length ? lines : [['info', 'Checking what this does to earlier expenses…']]} />
        ) : <div className="impact"><h4>When you save</h4><div className="it"><Icon name="info" size={16} /><span>Change an amount or switch a budget on or off to see what it does to earlier expenses before you save.</span></div></div>}
        <Field label="Note for the change log" htmlFor="budgetNote" help="Optional. Members don’t see notes.">
          <TextArea id="budgetNote" value={note} placeholder="Pool approved by the Sales head; approval note is on the trip." onChange={e => { setNote(e.target.value); saveDraft(me.id, draftKey, 'budget note', e.target.value); }} />
        </Field>
        {logTable}
      </Drawer>
      {confirmRemove && (
        <Modal icon="lock" tone="warn" title={removals.length === 1 ? `Remove ${removals[0].label}?` : `Remove ${removals.length} budgets?`} onClose={() => setConfirmRemove(false)}
          lead="Removing a budget returns its expenses to Unbudgeted, private to their member and finance. Nothing moves into another budget unless the member or you choose it (FR-BUD-05)."
          footer={<><Btn kind="sec" onClick={() => setConfirmRemove(false)}>Keep {removals.length === 1 ? 'budget' : 'budgets'}</Btn><Btn kind="dangerfill" icon="trash" busy={busy} onClick={() => { if (reason.trim().length < 3) { toast('Give the reason. It is kept in the change log.', { tone: 'warn' }); return; } void save(reason.trim()); }}>Remove and save</Btn></>}>
          <Impact title="What happens" items={lines.filter(l => l[0] === 'undo' || l[0] === 'bellRing').concat([['receipt', 'Claims don’t change. Budgets never reduce or block a claim.']])} />
          <Field label="Reason" required htmlFor="rmReason2" help="Kept in the change log">
            <TextArea id="rmReason2" value={reason} onChange={e => setReason(e.target.value)} placeholder="Tools are covered by the service tools budget, not travel." />
          </Field>
        </Modal>
      )}
    </>
  );
}
