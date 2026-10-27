/** A page that doesn't exist, and /expenses/:id links (from notifications) that open the expense in its claim. */
import { Navigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useCrumbs } from '../app/Shell';
import { api, useMe } from '../app/core';
import type { ExpenseView } from '../api/types';
import { ApiError } from '../lib/api';
import { Btn, Card, EmptyState, ErrorState, Loading } from '../components/ui';
import { claimPath } from '../lib/links';

export function NotFound() {
  useCrumbs([{ label: 'Not found' }]);
  const me = useMe();
  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <Card>
        <EmptyState icon="search" title="This page doesn’t exist"
          actions={<Btn kind="pri" size="sm" icon="dashboard" to={me.isFinance ? '/' : '/admin/users'}>{me.isFinance ? 'Go to the dashboard' : 'Go to users'}</Btn>}>
          The link may be mistyped, or the page moved. Trips open by their reference, for example /trips/EXP-2026-00106.
        </EmptyState>
      </Card>
    </main>
  );
}

export function ExpenseRedirect() {
  const { id = '' } = useParams();
  useCrumbs([{ label: 'Expense' }]);
  const q = useQuery({ queryKey: ['expense', id], queryFn: ({ signal }) => api.get<ExpenseView>(`/finance/expenses/${id}`, undefined, signal), retry: false });
  if (q.data) return <Navigate replace to={claimPath(q.data.trip, q.data.expense.userId, { expense: q.data.expense.id })} />;
  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <Card>
        {q.error ? (q.error instanceof ApiError && q.error.status === 404
          ? <EmptyState icon="trash" title="This expense is no longer there" actions={<Btn kind="sec" size="sm" to="/notifications">Back to notifications</Btn>}>It was deleted by the member after the notification was sent. The trip’s timeline and the audit log keep the record.</EmptyState>
          : <ErrorState error={q.error} onRetry={() => void q.refetch()} />) : <Loading label="Opening the expense…" />}
      </Card>
    </main>
  );
}
