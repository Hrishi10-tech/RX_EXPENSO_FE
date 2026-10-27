/**
 * W04·a every expense on the trip, grouped by member, then location, then date, with bulk verification
 * (FR-WEB-04, FR-VER-05). W06·e: the confirmation lists each selected expense with its flags.
 */
import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { api, queryClient } from '../../app/core';
import { keys } from '../../api/keys';
import type { BulkVerifyResult, Expense, FinanceTrip } from '../../api/types';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Overlay';
import { toast } from '../../components/Toasts';
import { Amt, Avatar, Banner, Btn, Card, Check, ClaimStatusPill, EmptyState, Flag, SrcPill, Tbl, VerPill } from '../../components/ui';
import { ChoiceList, FilterChip, SearchBox } from '../../components/filters';
import { firstName, fmtDay, fmtTime, inr, joinNames, plural } from '../../lib/format';
import { useKey } from '../../lib/hooks';
import { CATEGORY, FLAG, PAYMENT_MODE } from '../../lib/labels';
import { claimPath } from '../../lib/links';
import { refreshTrip } from './dialogs';

type StatusKey = 'pending' | 'query' | 'verified' | 'rejected' | 'company';
const STATUS_OPTS: Array<[StatusKey, string]> = [['pending', 'To check'], ['query', 'Query'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['company', 'Company-paid']];
const SOURCE_OPTS: Array<[string, string]> = [['pool', 'Trip pool'], ['individual', 'Individual'], ['unbudgeted', 'Unbudgeted'], ['company', 'Company-paid']];

const statusOf = (e: Expense): StatusKey => (e.paidBy === 'company' ? 'company' : e.verification);
export const receiptsIn = (e: Expense) => e.attachments.filter(a => a.kind === 'receipt' && !a.messageId);
const pendingReceipt = (e: Expense) => e.attachments.some(a => a.status !== 'uploaded');

/** Why an expense can't be ticked for bulk verification, or null when it can. */
export function bulkBlock(e: Expense, meId: string, reimbursed: boolean): string | null {
  if (e.paidBy === 'company') return 'Company-paid: nothing to verify for reimbursement';
  if (e.verification !== 'pending') return 'Already decided or under query';
  if (e.userId === meId) return 'Your own expense: another finance user verifies it (FR-VER-10)';
  if (reimbursed) return 'The claim is reimbursed and locked';
  if (!e.attachments.length) return 'No receipt';
  if (pendingReceipt(e)) return 'A receipt is still on the member’s phone';
  return null;
}

export function flagChips(e: Expense) {
  return e.flags.map(f => <Flag key={f} tone={FLAG[f].tone} icon={FLAG[f].icon} title={FLAG[f].why}>{FLAG[f].label}</Flag>);
}

function BulkVerify({ t, list, onClose, onDone }: { t: FinanceTrip; list: Expense[]; onClose: () => void; onDone: () => void }) {
  const [results, setResults] = useState<BulkVerifyResult['results'] | null>(null);
  const flagged = list.filter(e => e.flags.length);
  const total = list.reduce((s, e) => s + e.amountPaise, 0);
  const people = [...new Set(list.map(e => firstName(e.userName)))];
  const mut = useMutation({
    mutationFn: () => api.post<BulkVerifyResult>('/finance/expenses/verify-bulk', { items: list.map(e => ({ id: e.id, version: e.version })), includeFlagged: true }),
    onSuccess: r => {
      refreshTrip(t.trip.id);
      const ok = r.results.filter(x => x.ok);
      const bad = r.results.filter(x => !x.ok);
      if (!bad.length) {
        toast(`${plural(ok.length, 'expense')} verified · ${joinNames(people)} told`);
        onDone();
        onClose();
      } else setResults(r.results);
    },
    onError: (e: unknown) => toast((e as Error).message, { tone: 'bad' }),
  });
  if (results) {
    const ok = results.filter(x => x.ok).length;
    return (
      <Modal icon="checks" tone="warn" title={`${ok} verified, ${results.length - ok} skipped`} width={620} onClose={() => { onDone(); onClose(); }}
        lead="Skipped expenses weren’t changed. Open them in review to decide one by one."
        footer={<Btn kind="pri" onClick={() => { onDone(); onClose(); }}>Done</Btn>}>
        <Card flush>
          <Tbl heads={[['Expense'], ['Result']]} label="Bulk verification results">
            {results.map(r => {
              const e = list.find(x => x.id === r.id);
              return <tr key={r.id}><td><b>{e?.description}</b><span className="t2">{e?.userName} · {inr(e?.amountPaise)}</span></td><td>{r.ok ? <span style={{ color: 'var(--ok)', fontWeight: 700 }}>Verified</span> : <span style={{ color: 'var(--bad)' }}>{r.code === 'stale_version' ? 'Changed by the member since you looked' : r.message ?? r.code}</span>}</td></tr>;
            })}
          </Tbl>
        </Card>
      </Modal>
    );
  }
  return (
    <Modal icon="checks" tone="ok" title={`Verify ${plural(list.length, 'expense')}?`} width={620} onClose={onClose}
      lead={`${inr(total)} from ${joinNames(people)}. Each of them is told.`}
      footer={<><Btn kind="sec" onClick={onClose}>Back</Btn><Btn kind="pri" icon="check" busy={mut.isPending} onClick={() => mut.mutate()}>{`Verify ${list.length}`}</Btn></>}>
      <Card flush>
        <Tbl heads={[['Expense'], ['Member'], ['Flags'], ['Amount', 'r']]} label="Expenses to verify">
          {list.map(e => (
            <tr key={e.id}>
              <td><b>{e.description}</b><span className="t2">{fmtDay(e.spentAt)} {fmtTime(e.spentAt)} · {CATEGORY[e.category].label}</span></td>
              <td>{e.userName}</td>
              <td><div className="flags">{e.flags.length ? flagChips(e) : <span className="faint">None</span>}</div></td>
              <td className="r"><Amt paise={e.amountPaise} /></td>
            </tr>
          ))}
        </Tbl>
      </Card>
      {flagged.length > 0 && (
        <Banner tone="warn" icon="flag" title={`${flagged.length} of these ${flagged.length === 1 ? 'is' : 'are'} flagged`}>
          Listed here so nothing is verified unseen. {flagged.map(e => `${e.description} (${firstName(e.userName)}): ${e.flags.map(f => FLAG[f].why).join(' ')}`).join(' ')}
        </Banner>
      )}
      <div className="sm-note">Opened the receipts for all of them? You can still check each one in review first.</div>
    </Modal>
  );
}

export function ExpensesTab({ t, meId }: { t: FinanceTrip; meId: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [member, setMember] = useState('');
  const [loc, setLoc] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [flag, setFlag] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  const reimbursed = useMemo(() => new Set(t.members.filter(m => m.claimStatus === 'reimbursed').map(m => m.userId)), [t.members]);
  const accepted = t.members.filter(m => m.joinStatus === 'accepted');
  const locName = (id: string | null) => { const l = t.locations.find(x => x.id === id); return l ? `${l.city}${l.venue ? ` · ${l.venue}` : ''}` : 'No location'; };

  const filtered = useMemo(() => t.expenses.filter(e => {
    if (member && e.userId !== member) return false;
    if (loc && (e.locationId ?? 'none') !== loc) return false;
    if (status && statusOf(e) !== status) return false;
    if (source && (source === 'company' ? e.paidBy !== 'company' : e.paidBy === 'company' || e.budgetSource !== source)) return false;
    if (flag && (flag === 'any' ? !e.flags.length : !e.flags.includes(flag as never))) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      if (![e.description, e.userName, CATEGORY[e.category].label, e.remarks ?? ''].some(x => x.toLowerCase().includes(s))) return false;
    }
    return true;
  }), [t.expenses, member, loc, status, source, flag, q]);

  const selectable = (e: Expense) => !bulkBlock(e, meId, reimbursed.has(e.userId));
  const selected = t.expenses.filter(e => sel.has(e.id) && selectable(e));
  const toggle = (id: string, on: boolean) => setSel(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  useKey('v', () => { if (selected.length) setBulk(true); }, selected.length > 0);

  const firstToCheck = accepted.find(m => t.expenses.some(e => e.userId === m.userId && e.paidBy === 'self' && (e.verification === 'pending' || e.verification === 'query')));
  const anyFilter = !!(q || member || loc || status || source || flag);

  const groups = accepted.map(m => {
    const list = filtered.filter(e => e.userId === m.userId);
    const byLoc = new Map<string, Expense[]>();
    for (const e of list) byLoc.set(e.locationId ?? 'none', [...(byLoc.get(e.locationId ?? 'none') ?? []), e]);
    return { m, list, byLoc: [...byLoc.entries()] };
  }).filter(g => g.list.length || !anyFilter);

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search expenses" />
        <FilterChip label="Member" value={member ? t.members.find(m => m.userId === member)?.name : null} onClear={() => setMember('')}>
          {close => <ChoiceList title="Member" options={accepted.map(m => [m.userId, m.name])} value={member} onPick={v => { setMember(v); close(); }} />}
        </FilterChip>
        <FilterChip label="Location" value={loc ? locName(loc === 'none' ? null : loc) : null} onClear={() => setLoc('')}>
          {close => <ChoiceList title="Location" options={[...t.locations.map(l => [l.id, `${l.city}${l.venue ? ` · ${l.venue}` : ''}`] as [string, string]), ...(t.expenses.some(e => !e.locationId) ? [['none', 'No location'] as [string, string]] : [])]} value={loc} onPick={v => { setLoc(v); close(); }} />}
        </FilterChip>
        <FilterChip label="Status" value={status ? STATUS_OPTS.find(s => s[0] === status)?.[1] : null} onClear={() => setStatus('')}>
          {close => <ChoiceList title="Status" options={STATUS_OPTS} value={status} onPick={v => { setStatus(v); close(); }} />}
        </FilterChip>
        <FilterChip label="Budget source" value={source ? SOURCE_OPTS.find(s => s[0] === source)?.[1] : null} onClear={() => setSource('')}>
          {close => <ChoiceList title="Budget source" options={SOURCE_OPTS} value={source} onPick={v => { setSource(v); close(); }} />}
        </FilterChip>
        <FilterChip label="Flags" value={flag ? (flag === 'any' ? 'Any flag' : FLAG[flag as keyof typeof FLAG].label) : null} onClear={() => setFlag('')}>
          {close => <ChoiceList title="Flags" options={[['any', 'Any flag'], ...Object.entries(FLAG).map(([k, v]) => [k, v.label] as [string, string])]} value={flag} onPick={v => { setFlag(v); close(); }} />}
        </FilterChip>
        <span style={{ marginLeft: 'auto' }} />
        {firstToCheck && <Btn kind="pri" size="sm" icon="scan" to={claimPath(t.trip, firstToCheck)}>Review one by one</Btn>}
      </div>
      {selected.length > 0 ? (
        <div className="bulk" role="region" aria-label="Selection">
          <Icon name="checks" size={18} />
          <span>{plural(selected.length, 'selected', 'selected')} · {inr(selected.reduce((s, e) => s + e.amountPaise, 0))}</span>
          <span className="sp" />
          <Btn kind="ghost" size="sm" onClick={() => setSel(new Set())}>Clear</Btn>
          <Btn kind="pri" size="sm" icon="check" kbd="V" onClick={() => setBulk(true)}>Verify selected</Btn>
        </div>
      ) : (
        <div className="sm-note">Grouped by member, then location, then date. Tick expenses to verify several at once; rows already checked, company-paid rows, open queries and receipts still on a phone can’t be selected.</div>
      )}
      <Card flush>
        {groups.length === 0 ? (
          <EmptyState icon="receipt" title={anyFilter ? 'No expenses match' : 'No expenses yet'}>{anyFilter ? 'Try clearing a filter.' : 'Expenses appear here live as members log them in the app.'}</EmptyState>
        ) : (
          <Tbl label="Expenses" heads={[['', '', '44px'], ['Date'], ['Expense'], ['Payment'], ['Budget'], ['Amount', 'r'], ['Status'], ['Flags'], ['Files']]}>
            {groups.map(({ m, list, byLoc }) => {
              const c = t.claims.find(x => x.userId === m.userId);
              return (
                <Fragment key={m.userId}>
                  <tr className="grp">
                    <td colSpan={9}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={m.name} size="sm" />
                        <span style={{ color: 'var(--ink)' }}>{m.name}</span>
                        {list.length || c?.count ? <span>· claim {inr(c?.selfPaise ?? 0)}{c?.individualPaise ? ` · ${inr(c.individualPaise)} private` : ''}</span> : <span>· no expenses yet</span>}
                        <ClaimStatusPill status={m.claimStatus} />
                      </div>
                    </td>
                  </tr>
                  {byLoc.map(([lid, items]) => (
                    <Fragment key={lid}>
                      <tr className="grp"><td colSpan={9}><span style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700, paddingLeft: 34 }}><Icon name="mapPin" size={13} />{locName(lid === 'none' ? null : lid)}</span></td></tr>
                      {items.map(e => {
                        const block = bulkBlock(e, meId, reimbursed.has(e.userId));
                        const on = sel.has(e.id) && !block;
                        const to = claimPath(t.trip, { name: e.userName, userId: e.userId }, { expense: e.id });
                        const rcpt = receiptsIn(e);
                        const lowered = e.approvedPaise != null && e.approvedPaise !== e.amountPaise;
                        return (
                          <tr key={e.id} className={on ? 'sel' : ''} data-href={to} tabIndex={0}
                            onClick={ev => { if (!(ev.target as HTMLElement).closest('button,a,[role=checkbox]')) nav(to); }}
                            onKeyDown={ev => { if (ev.key === 'Enter') nav(to); if (ev.key === ' ' && !block) { ev.preventDefault(); toggle(e.id, !on); } }}>
                            <td>{block ? <span className="cbx" style={{ opacity: 0.35 }} title={block} aria-label={block} /> : <Check checked={on} onChange={v => toggle(e.id, v)} label={`Select ${e.description}`} />}</td>
                            <td>{fmtDay(e.spentAt)}<span className="t2">{fmtTime(e.spentAt)}</span></td>
                            <td><b>{e.description}</b><span className="t2">{CATEGORY[e.category].label}</span></td>
                            <td>{PAYMENT_MODE[e.paymentMode]}<span className="t2">{e.paidBy === 'company' ? 'Paid by the company' : `Paid by ${firstName(e.userName)}`}</span></td>
                            <td><SrcPill source={e.budgetSource} paidBy={e.paidBy} who={e.budgetSource === 'individual' ? 'private' : undefined} /></td>
                            <td className="r"><Amt paise={e.amountPaise} strike={e.verification === 'rejected'} />{lowered && <span className="t2">approved {inr(e.approvedPaise)}</span>}</td>
                            <td><VerPill v={e.verification} company={e.paidBy === 'company'} lowered={lowered} /></td>
                            <td><div className="flags">{flagChips(e)}</div></td>
                            <td>{pendingReceipt(e)
                              ? <span className="att" title="The photo is saved on the phone but hasn’t uploaded yet"><Icon name="cloudOff" size={13} />on the phone</span>
                              : <span className="att" aria-label={`${rcpt.length} attachments`}><Icon name="paperclip" size={13} />{e.attachments.length}</span>}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
          </Tbl>
        )}
      </Card>
      {bulk && selected.length > 0 && <BulkVerify t={t} list={selected} onClose={() => setBulk(false)} onDone={() => { setSel(new Set()); void queryClient.invalidateQueries({ queryKey: keys.trip(t.trip.id) }); }} />}
    </>
  );
}
