/** Routes, role guards and the session lifecycle (boot, live socket, theme). */
import { type ReactNode, useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, session, useMe, useSession } from './core';
import { startRealtime, stopRealtime } from './realtime';
import { applyTheme, storedTheme } from './theme';
import { Shell } from './Shell';
import { keepOnlyDraftsOf } from '../lib/drafts';
import { XMark } from '../components/Brand';
import { EmptyState } from '../components/ui';
import { SignIn } from '../pages/SignIn';
import { Dashboard } from '../pages/Dashboard';
import { Trips } from '../pages/Trips';
import { TripPage } from '../pages/trip/TripPage';
import { ExportPage } from '../pages/export/ExportPage';
import { Claims } from '../pages/Claims';
import { ClaimReviewPage } from '../pages/review/ClaimReviewPage';
import { Reimbursement } from '../pages/Reimbursement';
import { ExportCentre } from '../pages/ExportCentre';
import { Notifications } from '../pages/Notifications';
import { Settings } from '../pages/Settings';
import { Users } from '../pages/admin/Users';
import { Departments } from '../pages/admin/Departments';
import { Audit } from '../pages/Audit';
import { ExpenseRedirect, NotFound } from '../pages/Misc';

function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading Expenso">
      <XMark />
      <span>Expenso</span>
    </div>
  );
}

/** Signed-in area. A timed-out session keeps its page dimmed under the sign-out dialog (W01·b). */
function RequireAuth({ children }: { children: ReactNode }) {
  const s = useSession();
  const loc = useLocation();
  if (s.status === 'booting') return <Splash />;
  if (s.status === 'signedOut') {
    if (s.reason === 'timeout' && s.lastUser) return <>{children}</>;
    const next = loc.pathname + loc.search;
    return <Navigate to={next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

function Finance({ children }: { children: ReactNode }) {
  const me = useMe();
  if (!me.isFinance) {
    return (
      <main className="w-body" id="main">
        <EmptyState icon="lock" title="This part of the console is for finance">
          Your account holds the Administrator role, which covers users, departments and roles. Trips, budgets, claims and exports need the Finance role (FR-ROLE-07).
        </EmptyState>
      </main>
    );
  }
  return <>{children}</>;
}

function Admin({ children }: { children: ReactNode }) {
  const me = useMe();
  if (!me.isAdmin) {
    return (
      <main className="w-body" id="main">
        <EmptyState icon="lock" title="Administrators only">Users, departments and roles are managed by an administrator (FR-ADM-01).</EmptyState>
      </main>
    );
  }
  return <>{children}</>;
}

function Home() {
  const me = useMe();
  if (!me.isFinance && me.isAdmin) return <Navigate to="/admin/users" replace />;
  return <Dashboard />;
}

function useSessionLifecycle() {
  const s = useSession();
  const lastUserId = useRef<string | null>(null);
  useEffect(() => { void session.boot(); }, []);
  useEffect(() => {
    if (s.status === 'signedIn' && s.user) {
      if (lastUserId.current && lastUserId.current !== s.user.id) queryClient.clear();
      lastUserId.current = s.user.id;
      keepOnlyDraftsOf(s.user.id);
      startRealtime();
    } else if (s.status === 'signedOut') {
      stopRealtime();
      void queryClient.cancelQueries();
      if (s.reason !== 'timeout') queryClient.clear();
    }
  }, [s.status, s.user, s.reason]);
  // Theme: the user's saved choice once signed in; the browser's last choice before that.
  const theme = s.user?.settings.theme;
  useEffect(() => { applyTheme(theme ?? storedTheme()); }, [theme]);
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Lifecycle />
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route element={<RequireAuth><Shell /></RequireAuth>}>
            <Route index element={<Home />} />
            <Route path="trips" element={<Finance><Trips /></Finance>} />
            <Route path="trips/:tripKey/export" element={<Finance><ExportPage /></Finance>} />
            <Route path="trips/:tripKey/:tab?" element={<Finance><TripPage /></Finance>} />
            <Route path="claims" element={<Finance><Claims /></Finance>} />
            <Route path="claims/:tripKey/:memberKey" element={<Finance><ClaimReviewPage /></Finance>} />
            <Route path="claims/:tripKey/:memberKey/payments" element={<Finance><Reimbursement /></Finance>} />
            <Route path="exports" element={<Finance><ExportCentre /></Finance>} />
            <Route path="expenses/:id" element={<Finance><ExpenseRedirect /></Finance>} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="audit" element={<Audit />} />
            <Route path="admin/users" element={<Admin><Users /></Admin>} />
            <Route path="admin/departments" element={<Admin><Departments /></Admin>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Lifecycle() {
  useSessionLifecycle();
  return null;
}
