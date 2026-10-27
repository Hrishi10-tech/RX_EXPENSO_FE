/**
 * W12 claims queue: every member's claim across all trips by status, longest waiting first, so nothing
 * waits unseen (FR-VER-06, FR-BUD-09). A finance user's own claim shows read-only (FR-VER-10).
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCrumbs } from '../app/Shell';
import { useClaims, useDepartments, usePeople } from '../api/hooks';
import type { ClaimQueueItem, ClaimStatus } from '../api/types';
import { Amt, Banner, Btn, Card, EmptyState, ErrorState, Flag, Loading, PageHead, Pill, Prog, Tabs, Tbl, Who } from '../components/ui';
import { ChoiceList, FilterChip, SearchBox } from '../components/filters';
import { RowLink } from '../components/trip';
import { toast } from '../components/Toasts';
import { saveCsv } from '../lib/download';
import { fmtDayTime, inr, istToday, plural, waitingLabel } from '../lib/format';
import { useDebounced } from '../lib/hooks';
import { CLAIM_STATUS } from '../lib/labels';
import { claimPath, tripPath } from '../lib/links';
import { Link } from 'react-router';

type Tab = ClaimStatus | 'all';
const TABS: Array<[Tab, string]> = [['ready', 'Ready for verification'], ['open', 'Open'], ['verified', 'Verified'], ['part_paid', 'Part paid'], ['reimbursed', 'Reimbursed'], ['all', 'All']];
const SINCE: Record<Tab, string> = { ready: 'Ended', open: 'Started', verified: 'Verified', part_paid: 'Last paid', reimbursed: 'Reimbursed', all: 'Since' };

/** The member's own trip timing: "ended Tue 22 Sep 21:10", "ended by finance …", "running since …". */
export function timingLine(c: Pick<ClaimQueueItem, 'actualStart' | 'actualEnd' | 'endMethod'>): string {
  if (c.actualEnd) return `ended${c.endMethod === 'finance' ? ' by finance' : ''} ${fmtDayTime(c.actualEnd)}`;
  if (c.actualStart) return `running since ${fmtDayTime(c.actualStart)}`;
  return 'not started';
}

const sourceLabel = (c: ClaimQueueItem) => {
  const t = c.totals, parts: string[] = [];
  if (t.poolPaise) parts.push('Trip pool');
  if (t.individualPaise) parts.push('individual');
  if (t.unbudgetedPaise) parts.push('unbudgeted');
  const s = parts.join(' + ');
  return s ? s[0].toUpperCase() + s.slice(1) : 'Company-paid only';
};

export function Claims() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'ready';
  const [qIn, setQIn] = useState(sp.get('q') ?? '');
  const q = useDebounced(qIn.trim(), 300);
  const dept = sp.get('dept') ?? '';
  const [trip, setTrip] = useState('');
  const [source, setSource] = useState('');
  const [flag, setFlag] = useState(sp.get('flag') ?? '');
  useCrumbs(tab === 'ready' ? [{ label: 'Claims' }] : [{ label: 'Claims', to: '/claims' }, { label: TABS.find(x => x[0] === tab)![1] }]);
  const setParam = (k: string, v: string | null) => setSp(prev => { const p = new URLSearchParams(prev); if (v) p.set(k, v); else p.delete(k); return p; }, { replace: true });
  const base = { q: q || undefined, departmentId: dept || undefined };
  const lists = {
    ready: useClaims({ ...base, status: 'ready' }),
    open: useClaims({ ...base, status: 'open' }),
    verified: useClaims({ ...base, status: 'verified' }),
    part_paid: useClaims({ ...base, status: 'part_paid' }),
    reimbursed: useClaims({ ...base, status: 'reimbursed' }),
  };
  const depts = useDepartments();
  const people = usePeople();
  const inactive = useMemo(() => new Set((people.data ?? []).filter(p => !p.active).map(p => p.id)), [people.data]);
  const all = useMemo(() => Object.values(lists).flatMap(l => l.data ?? []).sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime()), [lists.ready.data, lists.open.data, lists.verified.data, lists.part_paid.data, lists.reimbursed.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = tab === 'all' ? all : lists[tab].data ?? [];
  const loading = tab === 'all' ? Object.values(lists).some(l => l.isLoading) : lists[tab].isLoading;
  const error = tab === 'all' ? Object.values(lists).find(l => l.error)?.error : lists[tab].error;
  const trips = [...new Map(all.map(c => [c.tripId, `${c.tripName} · ${c.ref}`])).entries()];
  const rows = cur.filter(c => {
    if (trip && c.tripId !== trip) return false;
    if (source === 'pool' && !c.totals.poolPaise) return false;
    if (source === 'individual' && !c.totals.individualPaise) return false;
    if (source === 'unbudgeted' && !c.totals.unbudgetedPaise) return false;
    if (flag === 'query' && !c.totals.query) return false;
    if (flag === 'flagged' && !c.flagged) return false;
    if (flag === 'own' && !c.ownClaim) return false;
    if (flag === 'inactive' && !inactive.has(c.userId)) return false;
    return true;
  });
  const openCount = lists.open.data?.length ?? 0;

  const exportCsv = () => {
    saveCsv(`expenso-claims-${tab}-${istToday()}.csv`, [
      ['Member', 'Employee ID', 'Department', 'Trip', 'Reference', 'Status', 'Since (IST)', 'Started (IST)', 'Ended (IST)', 'Ended by', 'Expenses', 'Claimed (INR)', 'Company-paid (INR)', 'Rejected (INR)', 'Reimbursable (INR)', 'Paid (INR)', 'Balance (INR)', 'Checked', 'Open queries', 'Flagged'],
      ...rows.map(c => [c.name, c.employeeCode, c.departmentName, c.tripName, c.ref, CLAIM_STATUS[c.status].label, fmtDayTime(c.since), c.actualStart ? fmtDayTime(c.actualStart) : '', c.actualEnd ? fmtDayTime(c.actualEnd) : '', c.actualEnd ? (c.endMethod === 'finance' ? 'Finance' : 'Member') : '', c.totals.count, (c.totals.selfPaise / 100).toFixed(2), (c.totals.companyPaise / 100).toFixed(2), (c.totals.rejectedPaise / 100).toFixed(2), (c.totals.reimbursablePaise / 100).toFixed(2), (c.totals.paidPaise / 100).toFixed(2), (c.totals.balancePaise / 100).toFixed(2), c.totals.verified + c.totals.rejected, c.totals.query, c.flagged]),
    ]);
    toast(`Claims list exported as CSV · ${plural(rows.length, 'row')}`);
  };

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead title="Claims" sub="Each member’s claim is verified and paid on its own" actions={<Btn kind="sec" size="sm" icon="download" onClick={exportCsv}>Export this list</Btn>} />
      <Tabs label="Claim status" active={tab} onSelect={k => setParam('tab', k === 'ready' ? null : k)}
        items={TABS.map(([k, l]) => ({ key: k, label: l, count: k === 'all' ? (Object.values(lists).every(x => x.data) ? all.length : undefined) : lists[k].data?.length }))} />
      <div className="toolbar">
        <SearchBox value={qIn} onChange={v => { setQIn(v); setParam('q', v.trim() || null); }} placeholder="Search member, trip or reference" />
        <FilterChip label="Department" value={dept ? depts.data?.find(d => d.id === dept)?.name : null} onClear={() => setParam('dept', null)}>
          {close => <ChoiceList title="Department" options={(depts.data ?? []).filter(d => !d.archivedAt).map(d => [d.id, d.name])} value={dept} onPick={v => { setParam('dept', v || null); close(); }} />}
        </FilterChip>
        <FilterChip label="Trip" value={trip ? trips.find(x => x[0] === trip)?.[1] : null} onClear={() => setTrip('')} width={320}>
          {close => <ChoiceList title="Trip" options={trips} value={trip} onPick={v => { setTrip(v); close(); }} />}
        </FilterChip>
        <FilterChip label="Budget source" value={source ? { pool: 'Trip pool', individual: 'Individual', unbudgeted: 'Unbudgeted' }[source] : null} onClear={() => setSource('')}>
          {close => <ChoiceList title="Includes spending from" options={[['pool', 'Trip pool'], ['individual', 'Individual budget'], ['unbudgeted', 'Unbudgeted']]} value={source} onPick={v => { setSource(v); close(); }} />}
        </FilterChip>
        <FilterChip label="Flags" value={flag ? { query: 'Open query', flagged: 'Entry flags', own: 'Your own claims', inactive: 'Account deactivated' }[flag] : null} onClear={() => { setFlag(''); setParam('flag', null); }}>
          {close => <ChoiceList title="Show claims with" options={[['query', 'An open query'], ['flagged', 'Entry flags'], ['own', 'Your own claims'], ['inactive', 'Account deactivated']]} value={flag} onPick={v => { setFlag(v); close(); }} />}
        </FilterChip>
        <span className="sm-note" style={{ marginLeft: 'auto' }}>Longest waiting first</span>
      </div>
      <Card flush>
        {loading ? <Loading label="Loading claims…" /> : error ? <ErrorState error={error} /> : rows.length === 0 ? (
          <EmptyState icon="badgeCheck" title={cur.length ? 'No claims match these filters' : tab === 'ready' ? 'All caught up' : `No ${TABS.find(x => x[0] === tab)![1].toLowerCase()} claims`}>
            {cur.length ? 'Try clearing a filter.' : tab === 'ready' ? 'No claim is waiting for verification. Claims arrive here when members end their trips.' : 'Claims move through Open, Ready for verification, Verified, Part paid and Reimbursed.'}
          </EmptyState>
        ) : (
          <Tbl label="Claims" heads={[['Member'], ['Trip'], [SINCE[tab]], ['Waiting'], ['Expenses', 'num'], ['Claimed', 'r'], ['Checked'], ['Flags'], ['', 'r']]}>
            {rows.map(c => {
              const pay = c.status === 'verified' || c.status === 'part_paid';
              const to = claimPath({ id: c.tripId, ref: c.ref }, { name: c.name, userId: c.userId }, { payments: pay || c.status === 'reimbursed' });
              const long = c.waitingMs > 5 * 86400000 && (c.status === 'ready' || c.status === 'verified');
              return (
                <RowLink key={c.tripId + c.userId} to={to}>
                  <td><Who name={c.name} sub={`${c.departmentName}${inactive.has(c.userId) ? ' · deactivated' : ''}`} /></td>
                  <td><Link className="link" to={tripPath({ id: c.tripId, ref: c.ref })}>{c.tripName}</Link><span className="t2">{c.ref}{tab === 'all' ? ` · ${CLAIM_STATUS[c.status].label}` : ''}{tab !== 'ready' && tab !== 'open' ? ` · ${timingLine(c)}` : ''}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {tab === 'ready' ? fmtDayTime(c.actualEnd ?? c.since) : tab === 'open' ? fmtDayTime(c.actualStart ?? c.since) : fmtDayTime(c.since)}
                    {tab === 'ready' && c.endMethod === 'finance' && <span className="t2">ended by finance</span>}
                    {tab === 'open' && <span className="t2">{c.actualStart ? 'still travelling' : 'not started yet'}</span>}
                  </td>
                  <td><Pill tone={long ? 'warn' : 'line'}>{waitingLabel(c.waitingMs)}</Pill></td>
                  <td className="num">{c.totals.count}</td>
                  <td className="r"><Amt paise={c.totals.selfPaise} /><span className="t2" style={{ whiteSpace: 'nowrap' }}>{sourceLabel(c)}</span>{c.totals.paidPaise > 0 && <span className="t2">{c.totals.balancePaise > 0 ? `balance ${inr(c.totals.balancePaise)}` : 'paid in full'}</span>}</td>
                  <td><Prog done={c.totals.verified + c.totals.rejected} total={c.totals.count} queries={c.totals.query} /></td>
                  <td><div className="flags">
                    {c.ownClaim && <Flag tone="info" icon="shield">Your own claim</Flag>}
                    {inactive.has(c.userId) && <Flag tone="bad" icon="userX">Account deactivated</Flag>}
                    {c.flagged > 0 && <Flag icon="flag">{`${c.flagged} flagged`}</Flag>}
                    {c.totals.query > 0 && <Flag icon="message">{`${c.totals.query} ${c.totals.query === 1 ? 'query' : 'queries'}`}</Flag>}
                  </div></td>
                  <td className="r">{c.ownClaim ? <Btn kind="sec" size="xs" to={to}>View</Btn> : <Btn kind={c.status === 'reimbursed' ? 'sec' : 'pri'} size="xs" to={to}>{pay ? 'Pay' : c.status === 'reimbursed' ? 'View' : 'Review'}</Btn>}</td>
                </RowLink>
              );
            })}
          </Tbl>
        )}
      </Card>
      <div className="grid2">
        <Banner tone="neutral" icon="info" title="Open claims can be checked early">
          {openCount ? `${plural(openCount, 'member')} ${openCount === 1 ? 'is' : 'are'} still travelling with expenses logged.` : 'Members still travelling have Open claims.'} You can verify their expenses as they arrive (FR-VER-01, FR-VER-06).
        </Banner>
        <Banner tone="neutral" icon="shield" title="Your own claims are never yours to decide">
          A finance user on a trip sees their own claim here only as read-only; another finance user verifies it and records the payment (FR-VER-10).
        </Banner>
      </div>
    </main>
  );
}
