/**
 * W04 trip page: header with reference, status and flags; tabs for overview, expenses, documents, timeline
 * and exports; dialogs to end a member's trip, assign an owner and change budgets (W05, drawer over the page).
 */
import { useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useCrumbs } from '../../app/Shell';
import { useMe } from '../../app/core';
import { useFinanceTrip, useTimeline, useTripId } from '../../api/hooks';
import type { FinanceTrip } from '../../api/types';
import { Btn, ErrorState, Flag, Loading, PageHead, Tabs, TripStatusPill } from '../../components/ui';
import { fmtRange, humanDuration } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { PURPOSE } from '../../lib/labels';
import { tripPath } from '../../lib/links';
import { watchTrip } from '../../app/realtime';
import { Overview } from './Overview';
import { ExpensesTab } from './ExpensesTab';
import { DocumentsTab } from './DocumentsTab';
import { TimelineTab } from './TimelineTab';
import { ExportsTab } from './ExportsTab';
import { BudgetEditor } from './BudgetEditor';
import { AssignOwnerDialog, EndMemberDialog, RemoveBudgetDialog } from './dialogs';
import { shortName } from './helpers';

const TAB_LABEL: Record<string, string> = { expenses: 'Expenses', documents: 'Documents', timeline: 'Timeline', exports: 'Exports', budgets: 'Budgets' };

export function TripHeader({ t, locked }: { t: FinanceTrip; locked: string | null }) {
  const trip = t.trip;
  const extra = trip.progress ? (trip.status === 'extended' ? `Day ${trip.progress.day} of a ${trip.progress.of}-day trip` : `Day ${trip.progress.day} of ${trip.progress.of}`) : null;
  const early = trip.firstStartAt && new Date(trip.firstStartAt) < new Date(trip.scheduledStart) ? new Date(trip.scheduledStart).getTime() - new Date(trip.firstStartAt).getTime() : 0;
  const live = trip.status === 'scheduled' || trip.status === 'active' || trip.status === 'extended';
  const over = (t.budgets.pool && t.budgets.pool.state === 'over') || t.budgets.individuals.some(b => b.state === 'over');
  const pastEnd = t.members.filter(m => m.running && trip.status === 'extended').length;
  const endedByFinance = t.members.some(m => m.endMethod === 'finance');
  const sub = [trip.departmentName, `owner ${trip.ownerName}${trip.ownerActive ? '' : ' (deactivated)'}`, PURPOSE[trip.purpose], trip.clientEvent, `planned ${fmtRange(trip.scheduledStart, trip.tentativeEnd)}`].filter(Boolean).join(' · ');
  return (
    <PageHead
      pre={<>
        <span className="refc">{trip.ref}</span>
        <TripStatusPill status={trip.status} extra={extra} />
        {early > 60_000 && live && <Flag tone="info" icon="play">{`Started ${humanDuration(early)} early`}</Flag>}
        {pastEnd > 0 && <Flag icon="hourglass">{`${pastEnd} ${pastEnd === 1 ? 'member' : 'members'} past the planned end`}</Flag>}
        {!trip.ownerActive && live && <Flag tone="bad" icon="userX">Owner deactivated</Flag>}
        {over && <Flag tone="bad" icon="alert">Over budget</Flag>}
        {endedByFinance && !live && <Flag tone="info" icon="shield">Ended by finance</Flag>}
        {t.viewer.isMember && <Flag tone="info" icon="shield">You’re a member</Flag>}
      </>}
      title={trip.name}
      sub={sub}
      actions={<>
        <Btn kind="sec" size="sm" icon={locked ? 'lock' : 'wallet'} to={locked ? undefined : tripPath(trip, 'budgets')} locked={locked}>Budgets</Btn>
        <Btn kind="sec" size="sm" icon="upload" to={`${tripPath(trip, 'documents')}?upload=1`}>Upload document</Btn>
        <Btn kind="pri" size="sm" icon="download" to={tripPath(trip, 'export')}>Export</Btn>
      </>}
    />
  );
}

export function TripPage() {
  const { tripKey = '', tab = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const me = useMe();
  const now = useNow(30_000);
  const idq = useTripId(tripKey);
  const tq = useFinanceTrip(idq.id);
  const tl = useTimeline(idq.id);
  const t = tq.data;
  useEffect(() => (idq.id ? watchTrip(idq.id) : undefined), [idq.id]);

  const crumbs = [{ label: 'Trips', to: '/trips' }, { label: t ? shortName(t.trip.name) : tripKey, to: t ? tripPath(t.trip) : undefined }];
  if (TAB_LABEL[tab]) crumbs.push({ label: TAB_LABEL[tab], to: undefined });
  useCrumbs(crumbs);

  const setQ = useCallback((k: string, v: string | null) => setSp(prev => { const p = new URLSearchParams(prev); if (v) p.set(k, v); else p.delete(k); return p; }, { replace: true }), [setSp]);

  if (idq.error || tq.error) return <main className="w-body" id="main"><ErrorState error={idq.error ?? tq.error} onRetry={() => void tq.refetch()} /></main>;
  if (!t) return <main className="w-body" id="main"><Loading label="Loading the trip…" /></main>;

  const locked = !t.viewer.canSetBudgets
    ? (t.viewer.isMember ? 'Locked: you’re a member of this trip. Another finance user sets its budgets (FR-VER-10).' : 'Budgets can’t change on a cancelled trip.')
    : null;
  const endUser = sp.get('end');
  const endMember = endUser ? t.members.find(m => m.userId === endUser && m.running) : undefined;
  const removeUser = sp.get('remove');
  const active = TAB_LABEL[tab] && tab !== 'budgets' ? tab : 'overview';
  const docs = t.documents.length;

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <TripHeader t={t} locked={locked} />
      <Tabs label="Trip sections" active={active} items={[
        { key: 'overview', label: 'Overview', to: tripPath(t.trip) },
        { key: 'expenses', label: 'Expenses', count: t.totals.expenseCount, to: tripPath(t.trip, 'expenses') },
        { key: 'documents', label: 'Documents', count: docs, to: tripPath(t.trip, 'documents') },
        { key: 'timeline', label: 'Timeline', to: tripPath(t.trip, 'timeline') },
        { key: 'exports', label: 'Exports', count: t.exports.length, to: tripPath(t.trip, 'exports') },
      ]} />
      {active === 'overview' && (
        <Overview t={t} timeline={tl.data} now={now} actions={{
          budgetsLocked: locked,
          openBudgets: () => nav(tripPath(t.trip, 'budgets')),
          endMember: m => setQ('end', m.userId),
          assignOwner: () => setQ('assign', 'owner'),
          removeIndividual: b => setQ('remove', b.memberUserId),
          openExpenses: () => nav(tripPath(t.trip, 'expenses')),
        }} />
      )}
      {active === 'expenses' && <ExpensesTab t={t} meId={me.id} />}
      {active === 'documents' && <DocumentsTab t={t} uploadOpen={sp.get('upload') === '1'} setUpload={v => setQ('upload', v ? '1' : null)} />}
      {active === 'timeline' && <TimelineTab t={t} timeline={tl.data} loading={tl.isLoading} />}
      {active === 'exports' && <ExportsTab t={t} />}

      {tab === 'budgets' && <BudgetEditor t={t} locked={locked} onClose={() => nav(tripPath(t.trip))} />}
      {endMember && <EndMemberDialog t={t} m={endMember} onClose={() => setQ('end', null)} />}
      {sp.get('assign') === 'owner' && <AssignOwnerDialog t={t} onClose={() => setQ('assign', null)} />}
      {removeUser && !locked && <RemoveBudgetDialog t={t} kind="individual" userId={removeUser} onClose={() => setQ('remove', null)} />}
    </main>
  );
}
