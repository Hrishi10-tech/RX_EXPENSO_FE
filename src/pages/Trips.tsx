/**
 * W03 trips: every trip in every department, filterable by status, department, owner, member, dates, budget
 * state and claim status, searchable, sortable and paged, updating live (FR-WEB-02, FR-WEB-03).
 * W03·a over-budget view and W03·b empty search are the same page with filters set.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCrumbs } from '../app/Shell';
import { useMe } from '../app/core';
import { fetchTrips, type TripListParams, useDepartments, useMyTripIds, usePeople, useTripCount, useTrips } from '../api/hooks';
import type { TripRow, TripStatus } from '../api/types';
import { Amt, Banner, Btn, Card, EmptyState, ErrorState, Loading, PageHead, Pill, Prog, Tabs, Tbl, Usage, Who } from '../components/ui';
import { ChoiceList, DateRange, FilterChip, MultiList, Pager, PersonPicker, SearchBox } from '../components/filters';
import { RowLink, ScheduleCell, StatusCell, TripFlags, TripNameCell, memberLine } from '../components/trip';
import { toast } from '../components/Toasts';
import { saveCsv } from '../lib/download';
import { fmtCalShort, fmtDayTime, istToday, plural } from '../lib/format';
import { useDebounced, useNewSince } from '../lib/hooks';
import { CLAIM_STATUS, PURPOSE, TRIP_STATUS } from '../lib/labels';
import { tripPath } from '../lib/links';

const VIEWS: Array<{ key: string; label: string; status?: string; claim?: string; budget?: string }> = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running', status: 'active,extended' },
  { key: 'verify', label: 'Needs verification', claim: 'ready' },
  { key: 'over', label: 'Over budget', budget: 'over' },
  { key: 'extended', label: 'Extended', status: 'extended' },
  { key: 'scheduled', label: 'Scheduled', status: 'scheduled' },
  { key: 'closed', label: 'Closed', status: 'closed' },
];
const SORTS: Array<[string, string]> = [['', 'Running first, then newest'], ['start_asc', 'Start date, earliest first'], ['spend_desc', 'Spend, highest first'], ['ref_desc', 'Reference, newest first']];
const BUDGETS: Array<[string, string]> = [['pool', 'Has a trip pool'], ['individual', 'Has an individual budget'], ['unbudgeted', 'No budget'], ['over', 'Over budget']];

function ViewCount({ v }: { v: (typeof VIEWS)[number] }) {
  const c = useTripCount({ status: v.status, claim: v.claim, budget: v.budget });
  return c.data == null ? null : <span className="cnt">{c.data}</span>;
}

export function Trips() {
  const me = useMe();
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const set = (patch: Record<string, string | null>) => setSp(prev => {
    const p = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    if (!('page' in patch)) p.delete('page');
    return p;
  }, { replace: true });

  // Legacy links from the dashboard: ?view=running
  const viewParam = get('view');
  const preset = VIEWS.find(v => v.key === viewParam);
  const status = preset?.status ?? get('status');
  const claim = preset?.claim ?? get('claim');
  const budget = preset?.budget ?? get('budget');
  const [qInput, setQInput] = useState(get('q'));
  const q = useDebounced(qInput.trim(), 300);
  const page = Number(get('page') || 1), pageSize = Number(get('size') || 20);
  const params: TripListParams = {
    status: status || undefined, claim: claim || undefined, budget: budget || undefined, q: q || undefined,
    departmentId: get('dept') || undefined, ownerId: get('owner') || undefined, memberId: get('member') || undefined,
    from: get('from') || undefined, to: get('to') || undefined, sort: get('sort') || undefined, page, pageSize,
  };
  const activeView = VIEWS.find(v => (v.status ?? '') === status && (v.claim ?? '') === claim && (v.budget ?? '') === budget)?.key ?? '';
  const trips = useTrips(params);
  const mine = useMyTripIds(me.id);
  const depts = useDepartments();
  const people = usePeople();
  const fresh = useNewSince(trips.isPlaceholderData ? undefined : trips.data?.items, t => t.id, JSON.stringify(params));
  const filtered = !!(status || claim || budget || q || params.departmentId || params.ownerId || params.memberId || params.from || params.to);
  const allCount = useTripCount({});
  const [exporting, setExporting] = useState(false);

  const titleCrumb = activeView && activeView !== 'all' ? VIEWS.find(v => v.key === activeView)!.label : q ? 'Search' : '';
  useCrumbs(titleCrumb ? [{ label: 'Trips', to: '/trips' }, { label: titleCrumb }] : [{ label: 'Trips' }]);

  const deptName = (id: string) => depts.data?.find(d => d.id === id)?.name ?? '';
  const personName = (id: string) => people.data?.find(p => p.id === id)?.name ?? '';
  const peopleOpts = useMemo(() => (people.data ?? []).map(p => ({ id: p.id, name: p.name, sub: `${p.employeeCode}${depts.data ? ' · ' + (depts.data.find(d => d.id === p.departmentId)?.name ?? '') : ''}${p.active ? '' : ' · deactivated'}` })), [people.data, depts.data]);
  const statusValues = status ? status.split(',') as TripStatus[] : [];
  const liveDepts = depts.data?.filter(d => !d.archivedAt).length ?? 0;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: TripRow[] = [];
      for (let p = 1; ; p++) {
        const r = await fetchTrips({ ...params, page: p, pageSize: 200 });
        all.push(...r.items);
        if (all.length >= r.total || !r.items.length) break;
      }
      const rupees = (paise: number | null | undefined) => (paise == null ? '' : (paise / 100).toFixed(2));
      const ist = (iso: string | null) => (iso ? fmtDayTime(iso) : '');
      saveCsv(`expenso-trips-${istToday()}.csv`, [
        ['Reference', 'Trip', 'Purpose', 'Client or event', 'Primary city', 'Department', 'Owner', 'Owner active', 'Members', 'Invited', 'Declined', 'Status', 'Scheduled start (IST)', 'Tentative end (IST)', 'First start (IST)', 'Last end (IST)', 'Spend (INR)', 'Trip pool (INR)', 'Pool spent (INR)', 'Pool used %', 'Individual budgets', 'Expenses', 'Checked', 'Open queries', 'Claims ready', 'Claims verified', 'Claims paid'],
        ...all.map(t => [t.ref, t.name, PURPOSE[t.purpose] ?? t.purpose, t.clientEvent ?? '', t.primaryCity, t.departmentName, t.ownerName, t.ownerActive ? 'Yes' : 'No', t.memberCount, t.invitedCount, t.declinedCount, TRIP_STATUS[t.status].label,
          ist(t.scheduledStart), ist(t.tentativeEnd), ist(t.firstStartAt), ist(t.lastEnd), rupees(t.spendPaise), rupees(t.poolPaise), rupees(t.poolSpentPaise), t.pool ? t.pool.pct : '', t.individualCount, t.expenseCount, t.settledCount, t.queryCount, t.claimsReady, t.claimsVerified, t.claimsPaid]),
      ]);
      toast(`Trips list exported as CSV · ${plural(all.length, 'row')}`);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t export the list', { tone: 'bad' });
    } finally { setExporting(false); }
  };

  const clearAll = () => { setQInput(''); setSp(new URLSearchParams(), { replace: true }); };
  const total = trips.data?.total ?? 0;
  const sub = filtered
    ? (total ? `${total} of ${plural(allCount.data ?? 0, 'trip')} match` : 'No trips match')
    : `${plural(total, 'trip')} across ${plural(liveDepts, 'department')} · updates live`;

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead title="Trips" sub={sub}
        actions={<>
          {filtered && <Btn kind="sec" size="sm" icon="x" onClick={clearAll}>Clear filters</Btn>}
          <Btn kind="sec" size="sm" icon="download" onClick={exportCsv} busy={exporting}>Export this list</Btn>
        </>} />
      <Tabs label="Saved views" active={activeView} onSelect={k => { const v = VIEWS.find(x => x.key === k)!; set({ view: null, status: v.status ?? null, claim: v.claim ?? null, budget: v.budget ?? null }); }}
        items={VIEWS.map(v => ({ key: v.key, label: <>{v.label}<ViewCount v={v} /></> }))} />
      <div className="toolbar">
        <SearchBox value={qInput} onChange={v => { setQInput(v); set({ q: v.trim() || null }); }} placeholder="Search name, reference, client or event" width={290} />
        <FilterChip label="Status" value={statusValues.length ? statusValues.map(s => TRIP_STATUS[s]?.label).join(', ') : null} onClear={() => set({ view: null, status: null })}>
          {() => <MultiList title="Trip status" options={(Object.keys(TRIP_STATUS) as TripStatus[]).map(s => [s, TRIP_STATUS[s].label])} values={statusValues} onChange={v => set({ view: null, status: v.join(',') || null })} />}
        </FilterChip>
        <FilterChip label="Department" value={params.departmentId ? deptName(params.departmentId) : null} onClear={() => set({ dept: null })}>
          {close => <ChoiceList title="Department" options={(depts.data ?? []).filter(d => !d.archivedAt).map(d => [d.id, d.name])} value={params.departmentId} onPick={v => { set({ dept: v || null }); close(); }} />}
        </FilterChip>
        <FilterChip label="Owner" value={params.ownerId ? personName(params.ownerId) : null} onClear={() => set({ owner: null })} width={300}>
          {close => <PersonPicker people={peopleOpts} value={params.ownerId} loading={people.isLoading} placeholder="Search owners" onPick={v => { set({ owner: v || null }); close(); }} />}
        </FilterChip>
        <FilterChip label="Member" value={params.memberId ? personName(params.memberId) : null} onClear={() => set({ member: null })} width={300}>
          {close => <PersonPicker people={peopleOpts} value={params.memberId} loading={people.isLoading} placeholder="Search members" onPick={v => { set({ member: v || null }); close(); }} />}
        </FilterChip>
        <FilterChip label="Dates" value={params.from || params.to ? `${params.from ? fmtCalShort(params.from) : '…'} – ${params.to ? fmtCalShort(params.to) : '…'}` : null} onClear={() => set({ from: null, to: null })} width={280}>
          {close => <DateRange from={params.from} to={params.to} note="Trips whose scheduled dates overlap this range." onApply={(f, t) => { set({ from: f || null, to: t || null }); close(); }} onClear={() => { set({ from: null, to: null }); close(); }} />}
        </FilterChip>
        <FilterChip label="Budget state" value={budget ? BUDGETS.find(b => b[0] === budget)?.[1] : null} onClear={() => set({ view: null, budget: null })}>
          {close => <ChoiceList title="Budget state" options={BUDGETS} value={budget} onPick={v => { set({ view: null, budget: v || null }); close(); }} />}
        </FilterChip>
        <FilterChip label="Claim status" value={claim ? CLAIM_STATUS[claim as keyof typeof CLAIM_STATUS]?.label : null} onClear={() => set({ view: null, claim: null })}>
          {close => <ChoiceList title="Any member’s claim is" options={Object.entries(CLAIM_STATUS).map(([k, v]) => [k, v.label])} value={claim} onPick={v => { set({ view: null, claim: v || null }); close(); }} />}
        </FilterChip>
        <span style={{ marginLeft: 'auto' }} />
        <FilterChip label={get('sort') ? 'Sort' : 'Running first, then newest'} value={get('sort') ? SORTS.find(s => s[0] === get('sort'))?.[1] : null} onClear={() => set({ sort: null })} align="right" width={260}>
          {close => <ChoiceList title="Sort trips by" options={SORTS.filter(s => s[0])} value={get('sort')} onPick={v => { set({ sort: v || null }); close(); }} />}
        </FilterChip>
      </div>

      {trips.isLoading ? <Card flush><Loading label="Loading trips…" /></Card>
        : trips.error ? <Card><ErrorState error={trips.error} onRetry={() => void trips.refetch()} /></Card>
          : total === 0 ? (
            <Card>
              <EmptyState icon="search" title={q ? `No trips match “${q}”` : 'No trips match these filters'}
                actions={<>{q && <Btn kind="sec" size="sm" onClick={() => { setQInput(''); set({ q: null }); }}>Clear search</Btn>}{filtered && <Btn kind="ghost" size="sm" onClick={clearAll}>Clear all filters</Btn>}</>}>
                Search covers trip names, references and client or event names in every department.{(params.from || params.to) ? ' The date filter is set, so trips outside it are hidden.' : ''} Cancelled trips are included; they are never hidden from finance.
              </EmptyState>
            </Card>
          ) : (
            <Card flush>
              <Tbl label="Trips" heads={[['Trip', '', '250px'], ['Owner'], ['Scheduled · actual'], ['Status'], ['Spend', 'r'], ['Trip pool', '', '140px'], ['Verification'], ['Flags']]}>
                {trips.data!.items.map(t => (
                  <RowLink key={t.id} to={tripPath(t)} className={fresh.has(t.id) ? 'new' : ''}>
                    <td><TripNameCell t={t} sub={<><span className="mono">{t.ref}</span> · {t.departmentName}</>} /></td>
                    <td><Who name={t.ownerName} sub={t.ownerActive ? memberLine(t) : <span style={{ color: 'var(--bad)' }}>Deactivated</span>} /></td>
                    <td><ScheduleCell t={t} /></td>
                    <td><StatusCell t={t} /></td>
                    <td className="r"><Amt paise={t.spendPaise} /></td>
                    <td><Usage spent={t.pool?.spentPaise ?? 0} alloc={t.pool?.allocatedPaise} />{t.individualCount > 0 && <span className="t2">+ {t.individualCount} individual{t.individualOver ? ' · over' : ''}</span>}</td>
                    <td><Prog done={t.settledCount} total={t.expenseCount} queries={t.queryCount} /></td>
                    <td>{fresh.has(t.id) ? <div className="flags"><Pill tone="ok">New</Pill></div> : <TripFlags t={t} mine={mine.data?.has(t.id)} nameOf={personName} />}</td>
                  </RowLink>
                ))}
              </Tbl>
              <Pager page={page} pageSize={pageSize} total={total} onPage={p => set({ page: String(p) })} onSize={n => set({ size: String(n), page: null })} />
            </Card>
          )}
      {budget === 'over' && (
        <Banner tone="neutral" icon="info" title="How over budget is counted">
          A trip matches when its trip pool or any individual budget is at or above 100%. Unbudgeted trips never match. Nothing is blocked by a budget; the export states the overage for each budget (FR-BUD-08, FR-BUD-12).
        </Banner>
      )}
    </main>
  );
}
