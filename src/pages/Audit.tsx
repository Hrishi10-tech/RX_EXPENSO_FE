/**
 * W11 audit log: every change in both apps with who, when (IST, to the second), the item, before and after,
 * and where it came from, filterable by trip, person, kind of action, source, dates and text, exportable as
 * CSV (NFR-11). Finance reads everything; an administrator without Finance reads the administration entries
 * (users, roles and departments, FR-ADM-04), so no expense data reaches them.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useCrumbs } from '../app/Shell';
import { api, useMe } from '../app/core';
import { auditPath, useAdminDepartments, useAdminUsers, useAudit, useDepartments, usePeople, useTripRow, type AuditParams } from '../api/hooks';
import type { AuditItem } from '../api/types';
import { ChoiceList, DateRange, FilterChip, Pager, PersonPicker, SearchBox, TripPicker } from '../components/filters';
import { Icon } from '../components/Icon';
import { toast } from '../components/Toasts';
import { Banner, Btn, Card, EmptyState, ErrorState, Loading, PageHead, Pill, Tbl, Who } from '../components/ui';
import { auditCells } from '../lib/audit';
import { saveBlob } from '../lib/download';
import { fmtCalShort, fmtDay, fmtTimeSec } from '../lib/format';
import { useDebounced } from '../lib/hooks';
import { ACTION_GROUPS, actionLabel } from '../lib/labels';
import { tripPath } from '../lib/links';

const SOURCES: Array<[string, string]> = [['web', 'Web'], ['mobile', 'Mobile app'], ['system', 'Server (automatic)']];
const ADMIN_ACTIONS: Array<[string, string]> = [['user.', 'Users and roles'], ['department.', 'Departments']];
const SOURCE_PILL: Record<string, string> = { web: 'Web', mobile: 'Mobile', system: 'Server' };

export function Audit() {
  useCrumbs([{ label: 'Audit log' }]);
  const me = useMe();
  const fin = me.isFinance;
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const set = (patch: Record<string, string | null>) => setSp(prev => {
    const p = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    if (!('page' in patch)) p.delete('page');
    return p;
  }, { replace: true });
  const [qInput, setQInput] = useState(get('q'));
  const q = useDebounced(qInput.trim(), 300);
  useEffect(() => { if (q !== get('q')) set({ q: q || null }); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const tripKey = fin ? get('trip') : '';
  const trip = useTripRow(tripKey || undefined);
  // People and departments for names: finance lists for finance, the administration lists otherwise.
  const people = usePeople(fin);
  const depts = useDepartments(fin);
  const adminUsers = useAdminUsers({}, !fin);
  const adminDepts = useAdminDepartments(!fin);
  const page = Number(get('page') || 1), pageSize = Number(get('size') || 100);
  const params: AuditParams = {
    tripId: trip.data?.id, actorId: get('who') || undefined, action: get('action') || undefined, client: get('source') || undefined,
    q: q || undefined, from: get('from') || undefined, to: get('to') || undefined, page, pageSize,
  };
  const path = auditPath(fin);
  const ready = !tripKey || !!trip.data;
  const audit = useAudit(path, params, ready);
  const [csvBusy, setCsvBusy] = useState(false);

  const personList = useMemo(() => (fin
    ? (people.data ?? []).map(p => ({ id: p.id, name: p.name, code: p.employeeCode, departmentId: p.departmentId, active: p.active, isFinance: p.isFinance }))
    : (adminUsers.data ?? []).map(u => ({ id: u.id, name: u.name, code: u.employeeCode, departmentId: u.departmentId, active: u.active, isFinance: u.isFinance }))), [fin, people.data, adminUsers.data]);
  const personOf = useMemo(() => new Map(personList.map(p => [p.id, p])), [personList]);
  const deptOf = useMemo(() => new Map([...(depts.data ?? []), ...(adminDepts.data ?? [])].map(d => [d.id, d.name])), [depts.data, adminDepts.data]);
  const look = useMemo(() => ({ dept: (id: string) => deptOf.get(id), person: (id: string) => personOf.get(id)?.name }), [deptOf, personOf]);
  const rows = useMemo(() => (audit.data?.items ?? []).map(a => ({ a, c: auditCells(a, look) })), [audit.data, look]);
  const peopleOpts = useMemo(() => personList.map(p => ({ id: p.id, name: p.name, sub: `${p.code} · ${deptOf.get(p.departmentId) ?? ''}${p.active ? '' : ' · deactivated'}` })), [personList, deptOf]);
  const whoName = personOf.get(get('who'))?.name;
  const actions = fin ? ACTION_GROUPS : ADMIN_ACTIONS;
  const actionName = actions.find(g => g[0] === get('action'))?.[1];
  const dates = get('from') || get('to') ? `${get('from') ? fmtCalShort(get('from')) : '…'} – ${get('to') ? fmtCalShort(get('to')) : '…'}` : null;
  const filtered = !!(tripKey || params.actorId || params.action || params.client || params.q || params.from || params.to);
  const total = audit.data?.total ?? rows.length;

  const exportCsv = async () => {
    setCsvBusy(true);
    try {
      const { page: _p, pageSize: _s, ...filters } = params;
      const r = await api.blob(path, { ...filters, format: 'csv' });
      const name = `expenso-audit${fin ? '' : '-administration'}${tripKey ? `-${tripKey}` : ''}${params.from ? `-from-${params.from}` : ''}${params.to ? `-to-${params.to}` : ''}.csv`;
      saveBlob(r.blob, r.filename && r.filename !== 'expenso-audit.csv' ? r.filename : name);
      toast(filtered ? `Audit log exported as CSV · ${total} ${total === 1 ? 'entry' : 'entries'} with the current filters` : 'Audit log exported as CSV');
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' });
    } finally {
      setCsvBusy(false);
    }
  };

  const whoCell = (a: AuditItem) => {
    if (!a.actorId) return <span className="faint">{a.actor === 'Expenso server' ? 'Server' : a.actor}</span>;
    const p = personOf.get(a.actorId);
    const sub = p ? (p.isFinance ? 'Finance' : deptOf.get(p.departmentId) ?? '') : '';
    return <Who name={a.actor} sub={sub} />;
  };

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead title="Audit log"
        sub={fin ? 'Every change in both apps, with who, when and before and after' : 'Users, roles and departments: every change, with who, when and before and after'}
        actions={<Btn kind="sec" size="sm" icon="download" busy={csvBusy} onClick={() => void exportCsv()}>Export CSV</Btn>} />
      <div className="toolbar" role="search" aria-label="Filter the audit log">
        <SearchBox value={qInput} onChange={setQInput} placeholder={fin ? 'Search who, action, trip or member' : 'Search who or action'} width={250} />
        {fin && (
          <FilterChip label="Trip" value={tripKey ? (trip.data?.name ?? tripKey) : null} onClear={() => set({ trip: null })} width={340}>
            {close => <TripPicker value={trip.data?.id ?? tripKey} onPick={t => { set({ trip: t?.ref ?? null }); close(); }} />}
          </FilterChip>
        )}
        <FilterChip label="User" value={whoName ?? (get('who') ? 'someone' : null)} onClear={() => set({ who: null })} width={300}>
          {close => <PersonPicker people={peopleOpts} value={get('who')} loading={fin ? people.isLoading : adminUsers.isLoading} onPick={id => { set({ who: id || null }); close(); }} />}
        </FilterChip>
        <FilterChip label="Action" value={actionName} onClear={() => set({ action: null })} width={300}>
          {close => <ChoiceList title="Kind of action" value={get('action')} onPick={v => { set({ action: v || null }); close(); }} options={actions} />}
        </FilterChip>
        <FilterChip label="Source" value={SOURCES.find(s => s[0] === get('source'))?.[1]} onClear={() => set({ source: null })}>
          {close => <ChoiceList title="Source" value={get('source')} onPick={v => { set({ source: v || null }); close(); }} options={SOURCES} />}
        </FilterChip>
        <FilterChip label="Dates" value={dates} onClear={() => set({ from: null, to: null })} width={280}>
          {close => <DateRange from={get('from')} to={get('to')} note="IST calendar days, both included" onApply={(f, t) => { set({ from: f || null, to: t || null }); close(); }} onClear={() => { set({ from: null, to: null }); close(); }} />}
        </FilterChip>
      </div>

      {trip.error ? <ErrorState error={trip.error} /> : audit.error ? <Card><ErrorState error={audit.error} onRetry={() => void audit.refetch()} /></Card> : !audit.data ? <Card><Loading label="Loading the audit log…" /></Card> : (
        <Card flush>
          {rows.length === 0 ? (
            <EmptyState icon="history" title={filtered ? 'Nothing matches' : 'Nothing recorded yet'}
              actions={filtered ? <Btn kind="sec" size="sm" onClick={() => { setQInput(''); setSp(new URLSearchParams(), { replace: true }); }}>Clear filters</Btn> : undefined}>
              {filtered ? 'Try a wider date range, another person or fewer words.' : 'Changes appear here as they happen.'}
            </EmptyState>
          ) : (
            <>
              <Tbl label="Audit log" heads={[['When (IST)'], ['Who'], ['Action'], ['Item'], ['Before'], ['After'], ['Source']]}>
                {rows.map(({ a, c }) => (
                  <tr key={a.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDay(a.at)} {fmtTimeSec(a.at)}</td>
                    <td>{whoCell(a)}</td>
                    <td>{actionLabel(a.action)}</td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
                        {c.private && <Icon name="lock" size={12} title="Individual budget: private to the member and finance" />}
                        <span>{c.item}</span>
                      </span>
                      {fin && a.tripRef && !tripKey && <span className="t2"><Link to={tripPath({ ref: a.tripRef, id: a.tripId })} style={{ color: 'inherit' }} title={a.tripName ?? undefined}>{a.tripRef}</Link></span>}
                    </td>
                    <td>{c.before}</td>
                    <td style={{ maxWidth: 320 }}>{c.after}</td>
                    <td>
                      {a.client ? <Pill tone="line">{SOURCE_PILL[a.client] ?? a.client}</Pill> : c.source ? <Pill tone="line">{c.source}</Pill> : <span className="faint">–</span>}
                      {c.deviceTime && <span className="t2">device {c.deviceTime}</span>}
                    </td>
                  </tr>
                ))}
              </Tbl>
              <Pager page={page} pageSize={pageSize} total={total} onPage={p => set({ page: String(p) })} onSize={n => set({ size: String(n) })} sizes={[50, 100, 200]} />
            </>
          )}
        </Card>
      )}
      <Banner tone="neutral" icon="shield" title="Read-only and complete">
        {fin
          ? 'Nothing here can be edited or deleted. Members see the history of their own expenses in the app; finance sees everything (NFR-11). Times are IST; the phone’s own time is shown when an action was made offline (NFR-14).'
          : 'Nothing here can be edited or deleted. Administrators see user, role and department changes; trips, expenses and money stay with finance (FR-ADM-04).'}
      </Banner>
    </main>
  );
}
