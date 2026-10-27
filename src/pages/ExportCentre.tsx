/**
 * W08·d export centre: every export from the web and the mobile app, newest first, with live build progress,
 * the reason and Retry for a failure, and Download again for anything ready (FR-EXPT-05, FR-EXPT-07, FR-EXPT-09).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useCrumbs } from '../app/Shell';
import { useExports, usePeople, useTripRow, type ExportsParams } from '../api/hooks';
import type { ExportRow, TripRow } from '../api/types';
import { ExportActions, ExportStatus } from '../components/exports';
import { ChoiceList, FilterChip, Pager, PersonPicker, SearchBox, TripPicker } from '../components/filters';
import { Modal } from '../components/Overlay';
import { Banner, Btn, Card, EmptyState, ErrorState, Loading, PageHead, Tbl, Who } from '../components/ui';
import { fmtBytes, fmtDay, fmtTime, firstName } from '../lib/format';
import { useDebounced, useNewSince } from '../lib/hooks';
import { EXPORT_SCOPE, fmtFormats } from '../lib/labels';
import { tripPath } from '../lib/links';

const STATUS: Array<[string, string]> = [['ready', 'Ready'], ['building', 'Building'], ['queued', 'Queued'], ['failed', 'Failed'], ['provisional', 'Provisional'], ['final', 'Final']];
const SOURCE: Array<[string, string]> = [['web', 'Web'], ['mobile', 'Mobile app']];

function NewExportDialog({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const pick = (t: TripRow | null) => { if (t) { onClose(); void nav(tripPath(t, 'export')); } };
  return (
    <Modal icon="download" title="New export" onClose={onClose} width={520}
      lead="Exports start from a trip. Choose the trip, then what to export and in which formats.">
      <div className="card" style={{ padding: 8 }}>
        <TripPicker onPick={pick} />
      </div>
    </Modal>
  );
}

/** Size of a ready export, or where a phone export lives. */
function SizeCell({ x }: { x: ExportRow }) {
  if (x.status !== 'ready') return <>–</>;
  return <>{fmtBytes(x.sizeBytes)}</>;
}

export function ExportCentre() {
  useCrumbs([{ label: 'Exports' }]);
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
  const tripKey = get('trip');
  const trip = useTripRow(tripKey || undefined);
  const people = usePeople();
  const page = Number(get('page') || 1), pageSize = Number(get('size') || 20);
  const params: ExportsParams = {
    tripId: trip.data?.id, status: get('status') || undefined, via: get('via') || undefined, scope: get('scope') || undefined,
    requestedBy: get('by') || undefined, q: q || undefined, page, pageSize,
  };
  const list = useExports(params);
  const waitingForTrip = !!tripKey && !trip.data && !trip.error;
  const items = list.data?.items ?? [];
  const fresh = useNewSince(list.isPlaceholderData ? undefined : list.data?.items, x => x.id, JSON.stringify(params));
  const focus = get('focus');
  const [newOpen, setNewOpen] = useState(false);
  useEffect(() => {
    if (!focus || !items.some(x => x.id === focus)) return;
    document.getElementById(`x-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, items]);
  const peopleOpts = useMemo(() => (people.data ?? []).map(p => ({ id: p.id, name: p.name, sub: `${p.employeeCode}${p.isFinance ? ' · Finance' : ''}` })), [people.data]);
  const byName = people.data?.find(p => p.id === get('by'))?.name;
  const filtered = !!(tripKey || params.status || params.via || params.scope || params.requestedBy || q);

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead title="Exports" sub="Every export from the web and the mobile app, newest first"
        actions={<Btn kind="pri" size="sm" icon="download" onClick={() => setNewOpen(true)}>New export</Btn>} />
      <div className="toolbar" role="search" aria-label="Filter exports">
        <SearchBox value={qInput} onChange={setQInput} placeholder="Search trip, member or file name" width={270} />
        <FilterChip label="Trip" value={tripKey ? (trip.data?.name ?? tripKey) : null} onClear={() => set({ trip: null })} width={340}>
          {close => <TripPicker value={trip.data?.id ?? tripKey} onPick={t => { set({ trip: t?.ref ?? null }); close(); }} />}
        </FilterChip>
        <FilterChip label="Scope" value={params.scope ? EXPORT_SCOPE[params.scope as keyof typeof EXPORT_SCOPE]?.label : null} onClear={() => set({ scope: null })}>
          {close => <ChoiceList title="Scope" value={get('scope')} onPick={v => { set({ scope: v || null }); close(); }} options={(['trip', 'member', 'each', 'trip_and_each'] as const).map(s => [s, EXPORT_SCOPE[s].label])} />}
        </FilterChip>
        <FilterChip label="Status" value={STATUS.find(s => s[0] === params.status)?.[1]} onClear={() => set({ status: null })}>
          {close => <ChoiceList title="Status" value={get('status')} onPick={v => { set({ status: v || null }); close(); }} options={STATUS} />}
        </FilterChip>
        <FilterChip label="Made by" value={byName ?? (get('by') ? 'someone' : null)} onClear={() => set({ by: null })} width={300}>
          {close => <PersonPicker people={peopleOpts} value={get('by')} loading={people.isLoading} onPick={id => { set({ by: id || null }); close(); }} />}
        </FilterChip>
        <FilterChip label="Source" value={get('via') ? SOURCE.find(s => s[0] === get('via'))?.[1] ?? null : 'web and mobile'} onClear={get('via') ? () => set({ via: null }) : undefined}>
          {close => <ChoiceList title="Source" value={get('via')} onPick={v => { set({ via: v || null }); close(); }} options={SOURCE} />}
        </FilterChip>
      </div>

      {trip.error ? <ErrorState error={trip.error} /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : (!list.data || waitingForTrip) ? <Card><Loading label="Loading exports…" /></Card> : (
        <Card flush>
          {items.length === 0 ? (
            <EmptyState icon="fileZip" title={filtered ? 'No export matches these filters' : 'No exports yet'}
              actions={filtered ? <Btn kind="sec" size="sm" onClick={() => { setQInput(''); setSp(new URLSearchParams(), { replace: true }); }}>Clear filters</Btn> : <Btn kind="pri" size="sm" icon="download" onClick={() => setNewOpen(true)}>New export</Btn>}>
              {filtered ? 'Try another trip, status or person.' : 'Exports from the web and members’ own exports from the phone are listed here as soon as they’re made.'}
            </EmptyState>
          ) : (
            <>
              <Tbl label="Exports" heads={[['When'], ['Trip'], ['Scope'], ['Formats'], ['Status'], ['By'], ['Size', 'r'], ['', 'r']]}>
                {items.map(x => {
                  const onPhone = x.via === 'mobile' && x.files.every(f => !f.url);
                  return (
                    <tr key={x.id} id={`x-${x.id}`} className={x.id === focus ? 'sel' : fresh.has(x.id) ? 'new' : undefined} aria-current={x.id === focus ? 'true' : undefined}>
                      <td style={{ minWidth: 92 }}>{fmtDay(x.createdAt)} {fmtTime(x.createdAt)}</td>
                      <td>
                        <Link to={tripPath({ ref: x.tripRef, id: x.tripId }, 'exports')} className="link" title="Open the trip’s export log"><b>{x.tripName}</b></Link>
                        <span className="t2">{x.tripRef}</span>
                      </td>
                      <td>{x.scopeLabel}{x.limitLabel && <span className="t2">{x.limitLabel}</span>}</td>
                      <td>{fmtFormats(x.formats)}</td>
                      <td><ExportStatus x={x} withFinal={x.via === 'web'} /></td>
                      <td><Who name={x.requestedByName ?? 'Someone'} sub={x.via === 'mobile' ? 'Mobile app' : 'Web'} /></td>
                      <td className="r num" style={{ whiteSpace: 'nowrap' }}><SizeCell x={x} /></td>
                      <td className="r">{onPhone && x.status === 'ready' ? <span className="sm-note">{`On ${firstName(x.requestedByName) || 'their'}’s phone`}</span> : <ExportActions x={x} />}</td>
                    </tr>
                  );
                })}
              </Tbl>
              <Pager page={page} pageSize={pageSize} total={list.data.total} onPage={p => set({ page: String(p) })} onSize={n => set({ size: String(n) })} />
            </>
          )}
        </Card>
      )}
      <Banner tone="neutral" icon="info" title="Nothing expires">Every export stays downloadable and is also listed on its trip page. Members’ own exports from the phone are logged here but live on their phones.</Banner>
      {newOpen && <NewExportDialog onClose={() => setNewOpen(false)} />}
    </main>
  );
}
