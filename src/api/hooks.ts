/** Typed queries for every screen, one per endpoint (docs/api.md). */
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api, queryClient, session } from '../app/core';
import { ApiError, type Query } from '../lib/api';
import { personSlug } from '../lib/format';
import { keys } from './keys';
import type {
  AdminDepartment, AdminUser, AuditPage, BudgetLogItem, BudgetPreview, ClaimQueueItem, ClaimReview, DashboardData, DeactivationImpact,
  Department, ExportPreview, ExportRow, FinanceTrip, NotificationList, Page, Person, TimelineItem, TripRow, UserSettings,
} from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | undefined | null) => !!s && UUID.test(s);

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: ({ signal }) => api.get<DashboardData>('/finance/dashboard', undefined, signal), refetchInterval: 60_000 });
}

/** Spend by department for another IST month ("2026-08"); only the spend figures depend on the month. */
export function useDashboardMonth(month: string | null) {
  return useQuery({
    queryKey: [...keys.dashboard, 'month', month ?? ''],
    enabled: !!month,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => api.get<DashboardData>('/finance/dashboard', { month: month! }, signal),
  });
}

export interface TripListParams {
  status?: string; departmentId?: string; ownerId?: string; memberId?: string; from?: string; to?: string;
  budget?: string; claim?: string; q?: string; sort?: string; page?: number; pageSize?: number;
}

/** Remember ref -> id for every trip we have seen, so /trips/EXP-2026-00106 opens without another lookup. */
function seedRefs(items: TripRow[]) {
  for (const t of items) queryClient.setQueryData(keys.tripRef(t.ref), t.id);
}

export async function fetchTrips(p: TripListParams, signal?: AbortSignal) {
  const r = await api.get<Page<TripRow>>('/finance/trips', p as Query, signal);
  seedRefs(r.items);
  return r;
}

export function useTrips(p: TripListParams, enabled = true) {
  return useQuery({ queryKey: keys.trips(p), queryFn: ({ signal }) => fetchTrips(p, signal), placeholderData: keepPreviousData, enabled });
}

/** Count only (for saved-view tabs). */
export function useTripCount(p: TripListParams, enabled = true) {
  return useQuery({
    queryKey: keys.tripCount(p),
    queryFn: ({ signal }) => api.get<Page<TripRow>>('/finance/trips', { ...p, page: 1, pageSize: 1 } as Query, signal).then(r => r.total),
    enabled,
    staleTime: 30_000,
  });
}

/** Trips the signed-in finance user is a member of (FR-VER-10 locks and flags). */
export function useMyTripIds(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.myTrips(userId ?? ''),
    enabled: enabled && !!userId,
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchTrips({ memberId: userId, pageSize: 200 }, signal).then(r => new Set(r.items.map(t => t.id))),
  });
}

/** Accepts a trip reference (EXP-2026-00106) or a UUID from the URL. */
export function useTripId(key: string | undefined) {
  const uuid = isUuid(key);
  const q = useQuery({
    queryKey: keys.tripRef(key ?? ''),
    enabled: !!key && !uuid,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const r = await fetchTrips({ q: key, pageSize: 20 }, signal);
      const hit = r.items.find(i => i.ref.toLowerCase() === key!.toLowerCase());
      if (!hit) throw new ApiError(404, 'not_found', `There is no trip ${key}.`);
      return hit.id;
    },
  });
  return uuid ? { id: key as string, isLoading: false, error: null } : { id: q.data, isLoading: q.isLoading, error: q.error };
}

export function useFinanceTrip(id: string | undefined) {
  return useQuery({
    queryKey: keys.trip(id ?? ''),
    enabled: !!id,
    queryFn: async ({ signal }) => {
      const t = await api.get<FinanceTrip>(`/finance/trips/${id}`, undefined, signal);
      queryClient.setQueryData(keys.tripRef(t.trip.ref), t.trip.id);
      return t;
    },
  });
}

/** Accepts a member's user id or the slug of their name ("suresh-babu"). */
export function useMemberId(tripId: string | undefined, key: string | undefined) {
  const uuid = isUuid(key);
  const t = useFinanceTrip(!uuid ? tripId : undefined);
  if (uuid) return { id: key as string, isLoading: false, error: null };
  const m = t.data?.members.find(x => personSlug(x.name) === key);
  const error = t.error ?? (t.data && !m ? new ApiError(404, 'not_found', 'That member isn’t on this trip.') : null);
  return { id: m?.userId, isLoading: t.isLoading, error };
}

export function useTimeline(id: string | undefined) {
  return useQuery({ queryKey: keys.timeline(id ?? ''), enabled: !!id, queryFn: ({ signal }) => api.get<TimelineItem[]>(`/finance/trips/${id}/timeline`, undefined, signal) });
}

export function useBudgetLog(id: string | undefined) {
  return useQuery({ queryKey: keys.budgetLog(id ?? ''), enabled: !!id, queryFn: ({ signal }) => api.get<BudgetLogItem[]>(`/finance/trips/${id}/budgets/log`, undefined, signal) });
}

export interface BudgetPreviewInput { pool?: number | null; individuals: Record<string, number | null> }
export function useBudgetPreview(id: string | undefined, input: BudgetPreviewInput, enabled: boolean) {
  return useQuery({
    queryKey: keys.budgetPreview(id ?? '', input),
    enabled: !!id && enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.request<BudgetPreview>('POST', `/finance/trips/${id}/budgets/preview`, { body: input, signal }),
  });
}

export interface ClaimsParams { status?: string; q?: string; departmentId?: string }
export function useClaims(p: ClaimsParams, enabled = true) {
  return useQuery({ queryKey: keys.claims(p), enabled, placeholderData: keepPreviousData, queryFn: ({ signal }) => api.get<ClaimQueueItem[]>('/finance/claims', p as Query, signal) });
}

export function useClaimReview(tripId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: keys.claim(tripId ?? '', userId ?? ''),
    enabled: !!tripId && !!userId,
    queryFn: ({ signal }) => api.get<ClaimReview>(`/finance/trips/${tripId}/claims/${userId}`, undefined, signal),
  });
}

export interface ExportPreviewParams { scope: string; memberUserId?: string; formats: string; locationId?: string; dateFrom?: string; dateTo?: string }
export function useExportPreview(tripId: string | undefined, p: ExportPreviewParams, enabled = true) {
  return useQuery({
    queryKey: keys.exportPreview(tripId ?? '', p),
    enabled: !!tripId && enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<ExportPreview>(`/finance/trips/${tripId}/exports/preview`, p as unknown as Query, signal),
  });
}

export interface ExportsParams { tripId?: string; status?: string; via?: string; scope?: string; requestedBy?: string; q?: string; page?: number; pageSize?: number }
export function useExports(p: ExportsParams) {
  return useQuery({ queryKey: keys.exports(p), placeholderData: keepPreviousData, queryFn: ({ signal }) => api.get<Page<ExportRow>>('/finance/exports', p as Query, signal) });
}

export function useExport(id: string | null | undefined, poll = false) {
  return useQuery({
    queryKey: keys.export(id ?? ''),
    enabled: !!id,
    queryFn: ({ signal }) => api.get<ExportRow>(`/exports/${id}`, undefined, signal),
    refetchInterval: q => (poll && (q.state.data?.status === 'queued' || q.state.data?.status === 'building') ? 2000 : false),
  });
}

export function useNotifications(limit = 50) {
  return useQuery({ queryKey: keys.notifications({ limit }), queryFn: ({ signal }) => api.get<NotificationList>('/notifications', { limit }, signal), refetchInterval: 120_000 });
}

export function usePeople(enabled = true) {
  return useQuery({ queryKey: keys.people, enabled, staleTime: 5 * 60_000, queryFn: ({ signal }) => api.get<Person[]>('/finance/people', undefined, signal) });
}

export function useDepartments(enabled = true) {
  return useQuery({ queryKey: keys.departments, enabled, staleTime: 5 * 60_000, queryFn: ({ signal }) => api.get<Department[]>('/finance/departments', undefined, signal) });
}

export interface AdminUsersParams { q?: string; departmentId?: string; role?: string; status?: string }
export function useAdminUsers(p: AdminUsersParams, enabled = true) {
  return useQuery({ queryKey: keys.adminUsers(p), enabled, placeholderData: keepPreviousData, queryFn: ({ signal }) => api.get<AdminUser[]>('/admin/users', p as Query, signal), refetchInterval: 60_000 });
}

export function useAdminDepartments(enabled = true) {
  return useQuery({ queryKey: keys.adminDepartments, enabled, queryFn: ({ signal }) => api.get<AdminDepartment[]>('/admin/departments', undefined, signal) });
}

export function useImpact(id: string | null) {
  return useQuery({ queryKey: keys.impact(id ?? ''), enabled: !!id, staleTime: 0, queryFn: ({ signal }) => api.get<DeactivationImpact>(`/admin/users/${id}/deactivation-impact`, undefined, signal) });
}

export interface AuditParams {
  tripId?: string; actorId?: string; memberId?: string; action?: string; entity?: string; client?: string; q?: string;
  from?: string; to?: string; page?: number; pageSize?: number;
}
/**
 * The audit log: finance reads everything at /finance/audit; an administrator without Finance reads the
 * administration entries (users, roles, departments) at /admin/audit.
 */
export const auditPath = (isFinance: boolean) => (isFinance ? '/finance/audit' : '/admin/audit');
export function useAudit(path: string, p: AuditParams, enabled = true) {
  return useQuery({ queryKey: keys.audit({ path, ...p }), enabled, placeholderData: keepPreviousData, queryFn: ({ signal }) => api.get<AuditPage>(path, p as Query, signal) });
}

/** A trip's list row by reference or id, for filter chips that show the trip's name. */
export function useTripRow(key: string | undefined) {
  return useQuery({
    queryKey: ['tripRow', key ?? ''],
    enabled: !!key,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      if (isUuid(key)) {
        const t = await api.get<FinanceTrip>(`/finance/trips/${key}`, undefined, signal);
        return { id: t.trip.id, ref: t.trip.ref, name: t.trip.name };
      }
      const r = await fetchTrips({ q: key, pageSize: 20 }, signal);
      const hit = r.items.find(i => i.ref.toLowerCase() === key!.toLowerCase());
      if (!hit) throw new ApiError(404, 'not_found', `There is no trip ${key}.`);
      return { id: hit.id, ref: hit.ref, name: hit.name };
    },
  });
}

/** Saves digest, theme and console preferences (PATCH /me/settings) and updates the signed-in profile. */
export function useSaveSettings() {
  return useMutation({
    mutationFn: (patch: Partial<UserSettings>) => api.request<UserSettings>('PATCH', '/me/settings', { body: patch }),
    onMutate: patch => {
      // Optimistic, so a switch or the theme reacts at once; rolled back on failure.
      const before = session.user;
      if (before) session.setUser({ ...before, settings: { ...before.settings, ...patch, notificationPrefs: { ...before.settings.notificationPrefs, ...(patch.notificationPrefs ?? {}) } } });
      return { before };
    },
    onSuccess: next => { const u = session.user; if (u) session.setUser({ ...u, settings: { dailyDigest: next.dailyDigest, theme: next.theme, notificationPrefs: next.notificationPrefs ?? {} } }); },
    onError: (_e, _p, c) => { if (c?.before) session.setUser(c.before); },
  });
}

