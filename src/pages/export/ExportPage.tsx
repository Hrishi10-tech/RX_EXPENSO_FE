/**
 * W08 export: scope, formats and limits on the left; provisional and missing-receipt warnings and a preview
 * with counts, estimated size and the ZIP folder tree on the right (FR-EXPT-01..11). Generating queues a
 * server build; W08·b shows its progress live from export.progress events, and W08·c hands over the files.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useCrumbs } from '../../app/Shell';
import { api, queryClient } from '../../app/core';
import { useExportProgress, useLive, watchedExports } from '../../app/realtime';
import { useExport, useExportPreview, useFinanceTrip, useMemberId, useTripId } from '../../api/hooks';
import { keys } from '../../api/keys';
import type { ExportRow, ExportPreview, FinanceTrip } from '../../api/types';
import { Modal } from '../../components/Overlay';
import { toast } from '../../components/Toasts';
import { downloadExportFile, useCancelExport, useRetryExport } from '../../components/exports';
import { ZipTree } from '../../components/ZipTree';
import { Banner, Bar, Btn, Card, ErrorState, FileRow, Ibx, Kvs, Loading, PageHead, Pill, fileKind } from '../../components/ui';
import { firstName, fmtBytes, fmtCalDate, fmtDay, inr, joinNames, plural } from '../../lib/format';
import { tripPath } from '../../lib/links';
import { shortName } from '../trip/helpers';
import { type ExportChoice, ExportScopeForm, effectiveFormats, exportParams } from './ExportScopeForm';
import { buildSteps } from './buildSteps';

function statusLine(t: FinanceTrip) {
  const s = t.trip;
  if (s.status === 'closed' && s.closedAt) return `closed ${fmtDay(s.closedAt)}`;
  if (s.status === 'cancelled') return 'cancelled';
  if (s.progress) return s.status === 'extended' ? `extended · day ${s.progress.day} of ${s.progress.of}` : `running · day ${s.progress.day} of ${s.progress.of}`;
  return 'scheduled';
}

function BuildDialog({ id, prov, hidden, onHide, onClose }: { id: string; prov: ExportPreview | undefined; hidden: boolean; onHide: () => void; onClose: () => void }) {
  const nav = useNavigate();
  const live = useLive();
  // Progress arrives live (export.progress); the row is also polled while building, so a build that
  // finishes before this dialog mounts, or while the socket reconnects, still lands on "ready".
  const x = useExport(id, true).data;
  const p = useExportProgress(id);
  const cancel = useCancelExport();
  const retry = useRetryExport();
  useEffect(() => {
    if (hidden) return;
    watchedExports.add(id);
    return () => { watchedExports.delete(id); };
  }, [id, hidden]);
  if (!x) return hidden ? null : <Modal icon="loader" title="Starting your export" onClose={onClose}><Loading /></Modal>;
  if (x.status === 'ready') return <ReadyDialog x={x} prov={prov} onClose={onClose} />;
  if (x.status === 'failed') {
    return (
      <Modal icon="alert" tone="bad" title="The export failed" onClose={onClose}
        lead={x.error ?? 'The export couldn’t be built.'}
        footer={<><Btn kind="sec" onClick={onClose}>Close</Btn><Btn kind="pri" icon="refresh" busy={retry.isPending} onClick={() => retry.mutate(x.id)}>Retry</Btn></>}>
        <Banner tone="neutral" icon="info" title="Nothing partial was delivered">Retry rebuilds everything. The failure stays in the export centre with its reason.</Banner>
      </Modal>
    );
  }
  if (hidden) return null;
  const pct = p?.pct ?? x.progress?.pct ?? (x.status === 'queued' ? 0 : 1);
  const step = p?.step ?? x.progress?.step ?? (x.status === 'queued' ? 'Waiting for the builder' : 'Starting');
  const detail = p?.detail ?? x.progress?.detail;
  const rows = buildSteps(x, { step, detail, phase: p?.phase ?? x.progress?.phase, subject: p ? p.subject : x.progress?.subject });
  return (
    <Modal icon="loader" title="Building your export" onClose={onHide}
      lead="On the server, so you can keep working or leave this page. You’ll be notified when it’s ready."
      footer={<>
        <Btn kind="ghost" busy={cancel.isPending} onClick={() => cancel.mutate(x, { onSuccess: onClose })}>Cancel export</Btn>
        <Btn kind="sec" onClick={() => { toast('Building in the background. You’ll get a notification.', { icon: 'bell' }); nav('/exports'); }}>Leave, notify me</Btn>
        <Btn kind="pri" onClick={() => { onHide(); toast('Keep working. The files open here as soon as they’re built.', { icon: 'loader' }); }}>Show when ready</Btn>
      </>}>
      <div className="prog" aria-live="polite">
        {x.status === 'queued' && !p && <div className="sm-note">Queued: another export is being built first.</div>}
        {rows.map(r => (
          <div key={r.key} className={`pstep ${r.state}`}>
            <Ibx icon={r.state === 'done' ? 'checkCircle' : r.state === 'run' ? 'loader' : r.icon} size={16} />
            <span className="tx"><b>{r.title}</b><small>{r.state === 'run' ? r.running : r.idle}</small></span>
            {r.state === 'done' ? <Pill tone="ok">Done</Pill> : r.state === 'run' ? <Pill tone="acc">{`${pct}%`}</Pill> : <Pill tone="line">Waiting</Pill>}
          </div>
        ))}
        <Bar pct={pct} tone="pool" label={`Export ${pct}% built`} />
        {!live.connected && <div className="sm-note">Live updates are paused; checking the export every few seconds instead.</div>}
      </div>
    </Modal>
  );
}

/** What is in each delivered file, from the preview the export was generated from. */
function fileFacts(format: ExportRow['formats'][number], x: ExportRow, pv: ExportPreview | undefined): string[] {
  const out: string[] = [];
  if (format === 'zip' && pv) {
    if (x.scope === 'each' || x.scope === 'trip_and_each') out.push(plural(pv.counts.members, 'member folder'));
    out.push(plural(pv.counts.receiptsReceived, 'receipt'));
    if (pv.counts.documents) out.push(plural(pv.counts.documents, 'finance document'));
  } else if (format === 'xlsx' && pv) {
    out.push(plural(pv.counts.expenses, 'expense row'));
  }
  if (x.provisional && format !== 'zip') out.push('Provisional');
  return out;
}

function ReadyDialog({ x, prov, onClose }: { x: ExportRow; prov: ExportPreview | undefined; onClose: () => void }) {
  const nav = useNavigate();
  const order = ['zip', 'pdf', 'xlsx'];
  const files = [...x.files].sort((a, b) => order.indexOf(a.format) - order.indexOf(b.format));
  return (
    <Modal icon="checkCircle" tone="ok" title="Your export is ready" width={640} onClose={onClose}
      lead="Logged on the trip’s export log. You can download it again any time."
      footer={<><Btn kind="sec" icon="history" onClick={() => nav(tripPath({ id: x.tripId, ref: x.tripRef }, 'exports'))}>View export log</Btn><Btn kind="pri" onClick={onClose}>Done</Btn></>}>
      {files.map((f, i) => (
        <FileRow key={f.format} kind={fileKind(f.format === 'xlsx' ? 'xlsx' : f.format)} name={f.name}
          meta={[fmtBytes(f.size), ...fileFacts(f.format, x, prov)].join(' · ')}
          actions={<Btn kind={i === 0 ? 'pri' : 'sec'} size="sm" icon="download" onClick={() => void downloadExportFile(f)}>Download</Btn>} />
      ))}
      {x.provisional
        ? <Banner tone="warn" icon="fileText" title="Provisional">{prov?.reasons.join(' ') ?? 'The trip isn’t closed or a claim isn’t verified yet.'} Export again after verification for a final copy.</Banner>
        : <Banner tone="ok" icon="badgeCheck" title="Final">Nothing in this export is provisional.</Banner>}
      {x.missingReceipts > 0 && <Banner tone="warn" icon="cloudOff" title={`${plural(x.missingReceipts, 'receipt')} not received`}>Those rows say “receipt not received” in the PDF and Excel.</Banner>}
    </Modal>
  );
}

export function ExportPage() {
  const { tripKey = '' } = useParams();
  const [sp] = useSearchParams();
  const idq = useTripId(tripKey);
  const tq = useFinanceTrip(idq.id);
  const t = tq.data;
  const memberParam = sp.get('member');
  const mid = useMemberId(idq.id, memberParam ?? undefined);
  const [choice, setChoice] = useState<ExportChoice>({ scope: sp.get('scope') === 'member' ? 'member' : 'trip_and_each', memberUserId: '', formats: ['pdf', 'xlsx', 'zip'], limit: 'all', locationId: '', dateFrom: '', dateTo: '' });
  // The preview is kept with the build, so the ready dialog describes what was generated even if the
  // form changes while it builds in the background.
  const [building, setBuilding] = useState<{ id: string; hidden: boolean; pv: ExportPreview | undefined } | null>(null);
  const members = useMemo(() => (t?.members ?? []).filter(m => m.joinStatus === 'accepted').map(m => ({ userId: m.userId, name: m.name })), [t]);
  useEffect(() => {
    if (!t) return;
    setChoice(c => ({ ...c, memberUserId: c.memberUserId || (memberParam && mid.id) || members[0]?.userId || '', dateFrom: c.dateFrom || t.trip.window.from, dateTo: c.dateTo || t.trip.window.to }));
  }, [t, mid.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useCrumbs([{ label: 'Trips', to: '/trips' }, { label: t ? shortName(t.trip.name) : tripKey, to: t ? tripPath(t.trip) : undefined }, { label: 'Export' }]);

  const params = exportParams(choice);
  const fmts = effectiveFormats(choice);
  const badDates = choice.limit === 'dates' && !!choice.dateFrom && !!choice.dateTo && choice.dateFrom > choice.dateTo;
  const prevParams = { ...params, formats: fmts.join(',') || 'pdf' };
  const preview = useExportPreview(idq.id, prevParams as never, !!t && !!fmts.length && !badDates && (choice.scope !== 'member' || !!choice.memberUserId));
  const pv = preview.data;
  const gen = useMutation({
    mutationFn: () => api.post<ExportRow>(`/finance/trips/${idq.id}/exports`, { ...params, formats: fmts }),
    onSuccess: x => { queryClient.setQueryData(keys.export(x.id), x); void queryClient.invalidateQueries({ queryKey: keys.exportsAll }); setBuilding({ id: x.id, hidden: false, pv: preview.data }); },
    onError: (e: unknown) => toast((e as Error).message, { tone: 'bad' }),
  });
  const remind = useMutation({
    mutationFn: (v: { id: string; who: string }) => api.post(`/finance/expenses/${v.id}/remind`),
    onSuccess: (_r, v) => toast(`${firstName(v.who)} was reminded to open Expenso and finish uploading`, { icon: 'bellRing' }),
    onError: (e: unknown) => toast((e as Error).message, { tone: 'bad' }),
  });

  if (idq.error || tq.error) return <main className="w-body" id="main"><ErrorState error={idq.error ?? tq.error} /></main>;
  if (!t) return <main className="w-body" id="main"><Loading label="Loading the trip…" /></main>;

  const memberName = members.find(m => m.userId === choice.memberUserId)?.name ?? '';
  const noFormat = !fmts.length;
  const missingBy = new Map<string, NonNullable<typeof pv>['missingReceipts']>();
  for (const m of pv?.missingReceipts ?? []) missingBy.set(m.userId, [...(missingBy.get(m.userId) ?? []), m]);
  const indiv = choice.scope === 'member' ? t.budgets.individuals.find(b => b.memberUserId === choice.memberUserId) : undefined;
  const indivSpend = choice.scope === 'member' ? t.expenses.filter(e => e.userId === choice.memberUserId && e.budgetSource === 'individual').reduce((s, e) => s + e.amountPaise, 0) : 0;

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead
        title={`Export · ${shortName(t.trip.name)}`}
        sub={`${t.trip.ref} · ${statusLine(t)} · ${plural(members.length, 'member')} · built on the server`}
        actions={<>
          <Btn kind="sec" size="sm" icon="history" to={tripPath(t.trip, 'exports')}>Export log</Btn>
          <Btn kind="pri" size="sm" icon="download" busy={gen.isPending} locked={noFormat ? 'Choose at least one format' : badDates ? 'Fix the date range first' : null} onClick={() => gen.mutate()}>Generate export</Btn>
        </>}
      />
      <div className="twocol" style={{ gridTemplateColumns: 'minmax(0,1fr) 520px' }}>
        <div className="stack">
          <ExportScopeForm value={choice} onChange={setChoice} members={members} locations={t.locations} window={t.trip.window} />
        </div>
        <div className="stack">
          {pv && (pv.provisional
            ? <Banner tone="warn" icon="fileText" title="This export will be Provisional">{pv.reasons.join(' ')} “PROVISIONAL” prints on every page and in the file names; export again after verification for a final copy.</Banner>
            : <Banner tone="ok" icon="badgeCheck" title="Final export">{choice.scope === 'member' ? `The trip is closed and ${firstName(memberName)}’s claim is verified.` : 'The trip is closed and every claim is verified.'}</Banner>)}
          {pv && pv.missingReceipts.length > 0 && (
            <Banner tone="warn" icon="cloudOff" title={`${plural(pv.missingReceipts.length, 'self-paid expense')} ${pv.missingReceipts.length === 1 ? 'has' : 'have'} no receipt on the server`}
              actions={<>{[...missingBy.entries()].map(([uid, list]) => <Btn key={uid} kind="sec" size="sm" icon="bellRing" busy={remind.isPending} onClick={() => list.forEach(m => remind.mutate({ id: m.expenseId, who: m.memberName }))}>{`Remind ${firstName(list[0].memberName)}`}</Btn>)}</>}>
              {pv.missingReceipts.map(m => `${m.memberName} · ${m.description} · ${fmtDay(m.spentAt)} · ${inr(m.amountPaise)}`).join('; ')}. The photo is still on the phone. You can export anyway; the row says “receipt not received” (FR-EXPT-10).
            </Banner>
          )}
          {choice.scope === 'member' && memberName && (
            <Banner tone="priv" icon="eyeOff" title={`Only ${firstName(memberName)}’s data`}>
              Included: {firstName(memberName)}’s trip pool expenses, {indiv ? `their individual budget (${inr(indiv.allocatedPaise)}) and its expenses (${inr(indivSpend)}), ` : ''}unbudgeted expenses, receipts and finance documents on the claim, plus the trip pool’s totals. Never: another member’s individual budget, private expenses or claim (FR-EXPT-04).
            </Banner>
          )}
          <Card title="Preview" icon="eye">
            {!pv ? (noFormat ? <span className="sm-note">Choose at least one format to see the preview.</span> : preview.error ? <ErrorState error={preview.error} /> : <Loading label="Working out the preview…" />) : (
              <div style={{ display: 'grid', gap: 12, opacity: preview.isFetching ? 0.6 : 1, transition: 'opacity .15s' }} aria-busy={preview.isFetching}>
                <Kvs pairs={[
                  ['Members', choice.scope === 'member' ? `1 · ${memberName}` : String(pv.counts.members)],
                  ['Expenses', String(pv.counts.expenses)],
                  ['Attachments', `${pv.counts.receiptsReceived} of ${plural(pv.counts.receipts, 'receipt')}${pv.counts.documents ? ` · ${plural(pv.counts.documents, 'finance document')}` : ''}`],
                  ['Budgets stated', [pv.budgetsStated.pool ? 'Trip pool' : 'No trip pool', pv.budgetsStated.individuals.length ? `${plural(pv.budgetsStated.individuals.length, 'individual')}${choice.scope === 'member' ? '' : ` (${joinNames(pv.budgetsStated.individuals.map(firstName))})`}` : '', pv.budgetsStated.changeLog ? 'change log' : ''].filter(Boolean).join(' · ')],
                  pv.limitLabel ? ['Limited to', pv.limitLabel] : null,
                  ['Estimated size', fmts.includes('zip') ? `ZIP ${fmtBytes(pv.estimatedBytes.zip)}` : `PDF ${fmtBytes(pv.estimatedBytes.pdf)}`],
                ]} />
                {fmts.includes('zip') && pv.zipPaths.length ? (
                  <>
                    <ZipTree paths={pv.zipPaths} />
                    <div className="sm-note">Attachments are named &lt;trip ref&gt;_&lt;member&gt;_&lt;location&gt;_&lt;date&gt;_&lt;category&gt;_&lt;amount&gt;_&lt;n&gt;, and the same name is printed on the expense’s row in the PDF and Excel (FR-EXPT-03).</div>
                  </>
                ) : (
                  <>
                    <div className="tree">{pv.deliverables.map(d => <span className="ln" key={d.name}><b>{d.name}</b></span>)}</div>
                    <div className="sm-note">Turn on ZIP to include every attachment from both apps.</div>
                  </>
                )}
                {choice.limit === 'dates' && choice.dateFrom && choice.dateTo && <div className="sm-note">Expenses dated {fmtCalDate(choice.dateFrom)} to {fmtCalDate(choice.dateTo)}; payments aren’t tied to a date, so claim totals stay whole.</div>}
              </div>
            )}
          </Card>
        </div>
      </div>
      {building && <BuildDialog id={building.id} prov={building.pv} hidden={building.hidden} onHide={() => setBuilding(b => b && { ...b, hidden: true })} onClose={() => setBuilding(null)} />}
    </main>
  );
}
