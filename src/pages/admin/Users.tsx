/**
 * W10 users and roles (administrators): who can use Expenso, in which department, with which roles; whether
 * they have signed in to the mobile app; add, edit (W10·a), deactivate with its impact (W10·b), reactivate.
 * Every change is audited on the server (FR-ADM-01, FR-ADM-04, FR-ROLE-08).
 */
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useCrumbs } from '../../app/Shell';
import { api, queryClient, useMe } from '../../app/core';
import { useAdminDepartments, useAdminUsers, useImpact, type AdminUsersParams } from '../../api/hooks';
import { keys } from '../../api/keys';
import type { AdminUser, UserInput } from '../../api/types';
import { ApiError } from '../../lib/api';
import { ChoiceList, FilterChip, SearchBox } from '../../components/filters';
import { Icon } from '../../components/Icon';
import { Drawer, Modal } from '../../components/Overlay';
import { toast } from '../../components/Toasts';
import { Banner, Btn, Card, EmptyState, ErrorState, Field, Impact, Loading, PageHead, Pill, Ropt, Select, Tbl, TextInput, Who } from '../../components/ui';
import { firstName, fmtDayTime, joinNames, plural, relativeDay } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { TRIP_STATUS } from '../../lib/labels';

/** Fewer than this many people with Finance, and someone would have to verify their own claim (FR-VER-10). */
const MIN_FINANCE = 2;
const FINANCE_FLOOR = 'At least two people need Finance so nobody approves their own claim.';

const lastActive = (u: AdminUser) => {
  if (!u.active && u.deactivatedAt) return fmtDayTime(u.deactivatedAt);
  const ts = [u.lastSeenAt, u.lastMobile, u.lastWeb, u.firstMobileLoginAt].filter(Boolean).map(t => new Date(t!).getTime());
  return ts.length ? relativeDay(Math.max(...ts)) : 'Never';
};

function Roles({ u }: { u: Pick<AdminUser, 'isFinance' | 'isAdmin'> }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      <Pill tone="line">Employee</Pill>
      {u.isFinance && <Pill tone="acc">Finance</Pill>}
      {u.isAdmin && <Pill tone="priv">Administrator</Pill>}
    </span>
  );
}

function refreshUsers() {
  void queryClient.invalidateQueries({ queryKey: keys.adminUsersAll });
  void queryClient.invalidateQueries({ queryKey: keys.adminDepartments });
  void queryClient.invalidateQueries({ queryKey: keys.people });
}

/* ---------------- W10·a add or edit ---------------- */

interface Draft { name: string; email: string; employeeCode: string; designation: string; phone: string; departmentId: string; isFinance: boolean; isAdmin: boolean; password: string }

/** "Send app link" (W10): emails the install link and sign-in steps to someone who never signed in to the app. */
function useSendAppLink() {
  return useMutation({
    mutationFn: (u: AdminUser) => api.post(`/admin/users/${u.id}/app-link`),
    onSuccess: (_r, u) => toast(`App link sent to ${u.email}`, { icon: 'mail' }),
    onError: (e: unknown, u) => {
      if (e instanceof ApiError && e.code === 'already_signed_in') { refreshUsers(); toast(`${firstName(u.name)} has already signed in to the app`, { tone: 'info', sub: e.message }); }
      else toast((e as Error).message, { tone: 'bad' });
    },
  });
}

function UserDrawer({ user, users, onClose, onDeactivate }: { user: AdminUser | null; users: AdminUser[]; onClose: () => void; onDeactivate: (u: AdminUser) => void }) {
  const me = useMe();
  const depts = useAdminDepartments();
  const active = (depts.data ?? []).filter(d => !d.archivedAt || d.id === user?.departmentId);
  const [d, setD] = useState<Draft>(() => ({
    name: user?.name ?? '', email: user?.email ?? '', employeeCode: user?.employeeCode ?? '', designation: user?.designation ?? '', phone: user?.phone ?? '',
    departmentId: user?.departmentId ?? '', isFinance: user?.isFinance ?? false, isAdmin: user?.isAdmin ?? false, password: '',
  }));
  const [err, setErr] = useState<Partial<Record<keyof Draft | 'form', string>>>({});
  const set = (p: Partial<Draft>) => { setD(x => ({ ...x, ...p })); setErr({}); };
  const financeCount = users.filter(u => u.active && u.isFinance).length;
  const dropsFinance = !!user?.isFinance && !d.isFinance && user.active && financeCount <= MIN_FINANCE;
  const self = user?.id === me.id;
  const deptName = (id: string) => depts.data?.find(x => x.id === id)?.name ?? '';
  const movedDept = !!user && d.departmentId !== user.departmentId;
  const fn = firstName(d.name || user?.name || 'They');

  const save = useMutation({
    mutationFn: () => {
      const body: Partial<UserInput> = {
        name: d.name.trim(), email: d.email.trim(), employeeCode: d.employeeCode.trim(), designation: d.designation.trim() || null, phone: d.phone.trim() || null,
        departmentId: d.departmentId, isFinance: d.isFinance, isAdmin: d.isAdmin, ...(d.password ? { password: d.password } : {}),
      };
      return user ? api.patch<AdminUser>(`/admin/users/${user.id}`, body) : api.post<AdminUser>('/admin/users', body);
    },
    onSuccess: u => {
      refreshUsers();
      toast(user ? `${u.name} saved` : `${u.name} added. ${firstName(u.name)} can sign in ${d.password ? 'with the password you set' : 'with a one-time code'}.`);
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === 'duplicate_user') setErr(/email/i.test(e.message) ? { email: e.message } : { employeeCode: e.message });
      // The server keeps at least two people with Finance (FR-VER-10); say it in its words.
      else if (e instanceof ApiError && (e.code === 'finance_minimum' || e.code === 'self_admin')) setErr({ form: e.message });
      else if (e instanceof ApiError && e.code === 'validation') {
        const fields = (e.details as Array<{ field?: string; message?: string }> | undefined) ?? [];
        const next: typeof err = {};
        for (const f of fields) if (f.field) next[f.field as keyof Draft] = f.message;
        setErr(Object.keys(next).length ? next : { form: e.message });
      } else setErr({ form: (e as Error).message });
    },
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e: typeof err = {};
    if (!d.name.trim()) e.name = 'Enter the name.';
    if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = 'Enter a valid work email.';
    if (!d.employeeCode.trim()) e.employeeCode = 'Enter the employee ID.';
    if (!d.departmentId) e.departmentId = 'Pick a department.';
    if (d.password && d.password.length < 8) e.password = 'Use at least 8 characters.';
    if (dropsFinance) e.form = FINANCE_FLOOR;
    setErr(e);
    if (!Object.keys(e).length) save.mutate();
  };

  const status = user ? [user.employeeCode, user.designation, user.signedInToApp ? 'signed in to the mobile app' : 'not yet signed in to the mobile app', user.active ? 'active' : 'deactivated'].filter(Boolean).join(' · ') : 'Name, work email, employee ID, designation, department and roles';
  return (
    <Drawer title={user ? `Edit ${user.name}` : 'Add user'} sub={status} width={540} onClose={onClose} initialFocus="#uName"
      footer={<>
        {user && user.active && !self && <Btn kind="danger" icon="userX" onClick={() => onDeactivate(user)} style={{ marginRight: 'auto' }}>Deactivate…</Btn>}
        <Btn kind="sec" onClick={onClose}>Cancel</Btn>
        <Btn kind="pri" icon="check" type="submit" form="userForm" busy={save.isPending}>{user ? 'Save changes' : 'Add user'}</Btn>
      </>}>
      <form id="userForm" onSubmit={submit} noValidate style={{ display: 'grid', gap: 14 }}>
        <div className="grid2" style={{ gap: 12 }}>
          <Field label="Name" htmlFor="uName" error={err.name}>
            <TextInput id="uName" value={d.name} onChange={e => set({ name: e.target.value })} error={!!err.name} autoComplete="off" />
          </Field>
          <Field label="Employee ID" htmlFor="uCode" error={err.employeeCode} help={user ? 'Fixed once created' : undefined}>
            <TextInput id="uCode" value={d.employeeCode} onChange={e => set({ employeeCode: e.target.value })} error={!!err.employeeCode} locked={!!user} autoComplete="off" />
          </Field>
        </div>
        <Field label="Work email" htmlFor="uEmail" error={err.email}>
          <TextInput id="uEmail" type="email" icon="mail" value={d.email} onChange={e => set({ email: e.target.value })} error={!!err.email} autoComplete="off" />
        </Field>
        <div className="grid2" style={{ gap: 12 }}>
          <Field label="Designation (optional)" htmlFor="uDesig" error={err.designation} help={err.designation ? undefined : 'Shown beside the name, for example Area Sales Manager'}>
            <TextInput id="uDesig" value={d.designation} onChange={e => set({ designation: e.target.value })} error={!!err.designation} autoComplete="off" maxLength={80} />
          </Field>
          <Field label="Mobile number (optional)" htmlFor="uPhone" error={err.phone}>
            <TextInput id="uPhone" type="tel" icon="phone" value={d.phone} onChange={e => set({ phone: e.target.value })} autoComplete="off" />
          </Field>
        </div>
        <Field label="Department" htmlFor="uDept" error={err.departmentId} help={movedDept ? `Was ${deptName(user!.departmentId)}` : undefined}>
          <Select id="uDept" value={d.departmentId} onChange={e => set({ departmentId: e.target.value })} error={!!err.departmentId}
            placeholder={depts.isLoading ? 'Loading…' : 'Choose a department'} options={active.map(x => [x.id, x.name] as [string, string])} />
        </Field>
        <div className="w-field">
          <span className="flabel">Roles</span>
          <div className="radio-list" role="group" aria-label="Roles">
            <Ropt checkbox role="checkbox" on locked title="Employee" sub="Uses the mobile app: trips, expenses, own claims · everyone has it" />
            <Ropt checkbox role="checkbox" on={d.isFinance} onClick={() => set({ isFinance: !d.isFinance })} title="Finance" sub="Uses the web console: all trips, budgets, verification, payments, exports" />
            <Ropt checkbox role="checkbox" on={d.isAdmin} locked={self && d.isAdmin} onClick={() => set({ isAdmin: !d.isAdmin })} title="Administrator"
              sub={self && d.isAdmin ? 'Uses the web console: users, departments · you can’t remove your own administrator role' : 'Uses the web console: users, departments, audit log'} />
          </div>
          {dropsFinance && <div className="errtxt" role="alert" style={{ marginTop: 8 }}><Icon name="alert" size={14} /><span>{FINANCE_FLOOR}</span></div>}
        </div>
        <Field label={user ? 'Set a new password (optional)' : 'Password (optional)'} htmlFor="uPw" error={err.password}
          help={err.password ? undefined : user ? (user.hasPassword ? 'Leave empty to keep the current password' : 'They sign in with a one-time code until a password is set') : 'Leave empty and they sign in with a one-time code sent to their work email'}>
          <TextInput id="uPw" type="password" icon="key" value={d.password} onChange={e => set({ password: e.target.value })} error={!!err.password} autoComplete="new-password" />
        </Field>
        {user && movedDept && (
          <Impact title="This department change" items={[
            ['trip', `${fn} stays on the trips already joined${user.liveTrips ? ` (${plural(user.liveTrips, 'live trip')})` : ''}; those trips keep their department and ${fn}’s claims are unaffected.`],
            ['userPlus', `From now on only ${deptName(d.departmentId)} colleagues can invite ${fn}, and ${fn} can invite only them (FR-ADM-03).`],
            ['history', 'Logged with your name, the time and the old and new department (FR-ADM-04).'],
          ]} />
        )}
        {user && (user.isFinance !== d.isFinance || user.isAdmin !== d.isAdmin) && (
          <Impact title="This role change" items={[
            user.isFinance !== d.isFinance && ['wallet', d.isFinance ? `${fn} can open the finance console: every trip, budgets, verification, payments and exports. ${fn} can never verify or pay their own claim (FR-VER-10).` : `${fn} loses the finance console at the next page load. Claims ${fn} was verifying stay with the other finance users.`],
            user.isAdmin !== d.isAdmin && ['shield', d.isAdmin ? `${fn} can manage users, roles and departments.` : `${fn} can no longer manage users, roles and departments.`],
            ['history', 'Logged with your name, the time and the roles before and after (FR-ADM-04).'],
          ]} />
        )}
        {err.form && <Banner tone="bad" icon="alert" title="Not saved">{err.form}</Banner>}
      </form>
    </Drawer>
  );
}

/* ---------------- W10·b deactivate ---------------- */

function DeactivateDialog({ user, users, onClose }: { user: AdminUser; users: AdminUser[]; onClose: () => void }) {
  const impact = useImpact(user.id);
  const fn = firstName(user.name);
  const lastFinance = user.isFinance && users.filter(u => u.active && u.isFinance).length <= MIN_FINANCE;
  const [reason, setReason] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const go = useMutation({
    mutationFn: () => api.post<AdminUser & { impact?: unknown }>(`/admin/users/${user.id}/deactivate`, { reason: reason.trim() || null }),
    onSuccess: () => {
      refreshUsers();
      toast(`${user.name} deactivated. Sign-in stopped on both apps.`, { icon: 'userX' });
      onClose();
    },
    // finance_minimum, self_deactivate: the server's own sentence, in the dialog.
    onError: (e: unknown) => setRefusal((e as Error).message),
  });
  const i = impact.data;
  return (
    <Modal icon="userX" tone="bad" title={`Deactivate ${user.name}?`} onClose={onClose}
      lead={`Deactivating stops ${fn}’s access to both apps at once.`}
      footer={<>
        <Btn kind="sec" onClick={onClose}>Cancel</Btn>
        <Btn kind="dangerfill" icon="userX" busy={go.isPending} locked={lastFinance ? FINANCE_FLOOR : !i ? 'Checking what this affects…' : null} onClick={() => go.mutate()}>Deactivate</Btn>
      </>}>
      {impact.error ? <ErrorState error={impact.error} /> : !i ? <Loading label="Checking trips and claims…" /> : (
        <Impact title="What happens" items={[
          ['ban', 'Sign-in to the mobile app and the web console stops immediately; open sessions end (FR-ROLE-08).'],
          i.ownedLiveTrips.length > 0 && ['crown', `${fn} owns ${plural(i.ownedLiveTrips.length, 'live trip')}: ${joinNames(i.ownedLiveTrips.map(t => `${t.name} (${TRIP_STATUS[t.status].label})`))}. Finance is asked to assign a new owner (FR-MEM-10).`],
          i.runningTrips.length > 0 && ['trip', `${fn} is on ${plural(i.runningTrips.length, 'running trip')}: ${joinNames(i.runningTrips.map(t => t.name))}. Finance can end it on ${fn}’s behalf.`],
          ['receipt', i.openClaims ? `${plural(i.openClaims, 'open claim')} stay${i.openClaims === 1 ? 's' : ''} with finance and ${i.openClaims === 1 ? 'is' : 'are'} still verified and paid.` : 'No open claims; past trips, expenses and claims stay for finance.'],
          ['userMinus', 'Pending invitations to trips are withdrawn.'],
          ['undo', 'Reversible: reactivate the account to restore access.'],
        ]} />
      )}
      <Field label="Reason" htmlFor="deReason" help="Optional. Kept in the audit log with your name and the time (FR-ADM-04).">
        <TextInput id="deReason" value={reason} maxLength={500} placeholder="Left the company on 30 Sep 2026" onChange={e => { setReason(e.target.value); setRefusal(null); }} />
      </Field>
      {lastFinance && <Banner tone="bad" icon="alert" title="Not possible">{FINANCE_FLOOR}</Banner>}
      {refusal && !lastFinance && <Banner tone="bad" icon="alert" title="Not deactivated">{refusal}</Banner>}
    </Modal>
  );
}

function ReactivateDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const go = useMutation({
    mutationFn: () => api.post<AdminUser>(`/admin/users/${user.id}/reactivate`),
    onSuccess: () => { refreshUsers(); toast(`${user.name} can sign in again`, { icon: 'userCheck' }); onClose(); },
    onError: (e: unknown) => toast((e as Error).message, { tone: 'bad' }),
  });
  return (
    <Modal icon="userCheck" tone="ok" title={`Reactivate ${user.name}?`} onClose={onClose}
      lead={`${firstName(user.name)} can sign in to both apps again, with the same department and roles.`}
      footer={<><Btn kind="sec" onClick={onClose}>Cancel</Btn><Btn kind="pri" icon="userCheck" busy={go.isPending} onClick={() => go.mutate()}>Reactivate</Btn></>}>
      <Impact title="Good to know" items={[
        ['crown', 'Trips that got a new owner while the account was off keep that owner.'],
        ['users', 'Withdrawn trip invitations aren’t restored; colleagues can invite again.'],
        ['history', 'Logged with your name and the time (FR-ADM-04).'],
      ]} />
    </Modal>
  );
}

/* ---------------- W10 list ---------------- */

export function Users() {
  const me = useMe();
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const set = (patch: Record<string, string | null>) => setSp(prev => {
    const p = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    return p;
  }, { replace: true });
  const [qInput, setQInput] = useState(get('q'));
  const q = useDebounced(qInput.trim(), 250);
  useEffect(() => { if (q !== get('q')) set({ q: q || null }); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const params: AdminUsersParams = { q: q || undefined, departmentId: get('dept') || undefined, role: get('role') || undefined, status: get('status') || undefined };
  const list = useAdminUsers(params);
  const everyone = useAdminUsers({});
  const depts = useAdminDepartments();
  const app = get('app');
  const users = (list.data ?? []).filter(u => !app || (app === 'yes' ? u.signedInToApp : !u.signedInToApp));
  const all = everyone.data ?? [];
  const editId = get('edit');
  const adding = get('add') === '1';
  const editing = editId ? all.find(u => u.id === editId) ?? null : null;
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null);
  const [reactivating, setReactivating] = useState<AdminUser | null>(null);
  const appLink = useSendAppLink();
  const focus = get('focus');
  useEffect(() => { if (focus && users.some(u => u.id === focus)) document.getElementById(`u-${focus}`)?.scrollIntoView({ block: 'center' }); }, [focus, users]);
  useCrumbs(editing ? [{ label: 'Users', to: '/admin/users' }, { label: editing.name }] : adding ? [{ label: 'Users', to: '/admin/users' }, { label: 'Add user' }] : [{ label: 'Users' }]);

  const deptCount = (depts.data ?? []).filter(d => !d.archivedAt).length;
  const notYet = all.filter(u => u.active && !u.signedInToApp);
  const deptName = (id: string) => depts.data?.find(d => d.id === id)?.name;
  const filtered = !!(q || params.departmentId || params.role || params.status || app);
  const deptOpts = useMemo(() => (depts.data ?? []).filter(d => !d.archivedAt).map(d => [d.id, d.name, String(d.userCount)] as [string, string, string]), [depts.data]);

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead title="Users" sub={everyone.data ? `${plural(all.filter(u => u.active).length, 'person', 'people')} · ${plural(deptCount, 'department')} · roles and departments decide what each person can do` : 'Roles and departments decide what each person can do'}
        actions={<>
          <Btn kind="sec" size="sm" icon="building" to="/admin/departments">Departments</Btn>
          <Btn kind="pri" size="sm" icon="userPlus" onClick={() => set({ add: '1', edit: null })}>Add user</Btn>
        </>} />
      <div className="toolbar" role="search" aria-label="Filter users">
        <SearchBox value={qInput} onChange={setQInput} placeholder="Search name, email or ID" width={240} />
        <FilterChip label="Department" value={params.departmentId ? deptName(params.departmentId) ?? 'one' : null} onClear={() => set({ dept: null })}>
          {close => <ChoiceList title="Department" value={get('dept')} onPick={v => { set({ dept: v || null }); close(); }} options={deptOpts} />}
        </FilterChip>
        <FilterChip label="Role" value={params.role === 'finance' ? 'Finance' : params.role === 'admin' ? 'Administrator' : null} onClear={() => set({ role: null })}>
          {close => <ChoiceList title="Role" value={get('role')} onPick={v => { set({ role: v || null }); close(); }} options={[['finance', 'Finance'], ['admin', 'Administrator']]} />}
        </FilterChip>
        <FilterChip label="Status" value={params.status === 'active' ? 'Active' : params.status === 'inactive' ? 'Deactivated' : null} onClear={() => set({ status: null })}>
          {close => <ChoiceList title="Status" value={get('status')} onPick={v => { set({ status: v || null }); close(); }} options={[['active', 'Active'], ['inactive', 'Deactivated']]} />}
        </FilterChip>
        <FilterChip label="Mobile app" value={app === 'yes' ? 'Signed in' : app === 'no' ? 'Not yet' : null} onClear={() => set({ app: null })}>
          {close => <ChoiceList title="Mobile app" value={app} onPick={v => { set({ app: v || null }); close(); }} options={[['yes', 'Signed in at least once'], ['no', 'Not yet signed in']]} />}
        </FilterChip>
      </div>

      {list.error ? <Card><ErrorState error={list.error} onRetry={() => void list.refetch()} /></Card> : !list.data ? <Card><Loading label="Loading users…" /></Card> : (
        <Card flush>
          {users.length === 0 ? (
            <EmptyState icon="users" title={filtered ? 'Nobody matches' : 'No users yet'}
              actions={filtered ? <Btn kind="sec" size="sm" onClick={() => { setQInput(''); setSp(new URLSearchParams(), { replace: true }); }}>Clear filters</Btn> : <Btn kind="pri" size="sm" icon="userPlus" onClick={() => set({ add: '1' })}>Add user</Btn>}>
              {filtered ? 'Try another department, role or status.' : 'Add the first person to get started.'}
            </EmptyState>
          ) : (
            <Tbl label="Users" heads={[['Name'], ['Employee ID'], ['Department'], ['Roles'], ['Mobile app'], ['Status'], ['Last active'], ['', 'r']]}>
              {users.map(u => (
                <tr key={u.id} id={`u-${u.id}`} className={!u.active ? 'dim-row' : u.id === focus || u.id === editId ? 'sel' : undefined}>
                  <td><Who name={u.name} sub={u.email} /></td>
                  <td><span className="mono" style={{ fontSize: 12 }}>{u.employeeCode}</span></td>
                  <td>{u.departmentName}{u.designation && <span className="t2">{u.designation}</span>}</td>
                  <td><Roles u={u} /></td>
                  <td>{u.signedInToApp
                    ? <span style={{ color: 'var(--ok)', display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}><Icon name="check" size={13} />Signed in</span>
                    : <span className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>Not yet</span>}</td>
                  <td>{u.active ? <Pill tone="ok">Active</Pill> : <Pill tone="bad">Deactivated</Pill>}{u.id === me.id && <span className="t2">You</span>}</td>
                  <td>{lastActive(u)}</td>
                  <td className="r">
                    <div className="acts" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      {!u.active && <Btn kind="sec" size="xs" icon="userCheck" onClick={() => setReactivating(u)} ariaLabel={`Reactivate ${u.name}`}>Reactivate</Btn>}
                      {u.active && !u.signedInToApp && (
                        <Btn kind="ghost" size="xs" icon="send" busy={appLink.isPending && appLink.variables?.id === u.id} onClick={() => appLink.mutate(u)} ariaLabel={`Send the app link to ${u.name}`} title={`Email the app link and sign-in steps to ${u.email}`}>App link</Btn>
                      )}
                      <Btn kind="ghost" size="xs" onClick={() => set({ edit: u.id, add: null })} ariaLabel={`Edit ${u.name}`}>Edit</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </Tbl>
          )}
        </Card>
      )}
      {notYet.length > 0 && (
        <Banner tone="neutral" icon="info" title={notYet.length === 1 ? `${notYet[0].name} hasn’t signed in to the mobile app yet` : `${plural(notYet.length, 'person', 'people')} haven’t signed in to the mobile app yet`}
          actions={notYet.length === 1
            ? <Btn kind="sec" size="sm" icon="send" busy={appLink.isPending} onClick={() => appLink.mutate(notYet[0])}>Send app link</Btn>
            : app !== 'no' ? <Btn kind="sec" size="sm" onClick={() => set({ app: 'no' })}>Show them</Btn> : undefined}>
          Colleagues can invite only people who have signed in at least once (FR-MEM-01). {notYet.length === 1
            ? `Send ${firstName(notYet[0].name)} the app link: an email to ${notYet[0].email} with the install link and how to sign in.`
            : 'Send each of them the app link from their row: an email with the install link and how to sign in.'}
        </Banner>
      )}
      {(adding || editing) && (
        <UserDrawer key={editing?.id ?? 'new'} user={editing} users={all} onClose={() => set({ edit: null, add: null })}
          onDeactivate={u => { set({ edit: null }); setDeactivating(u); }} />
      )}
      {deactivating && <DeactivateDialog user={deactivating} users={all} onClose={() => setDeactivating(null)} />}
      {reactivating && <ReactivateDialog user={reactivating} onClose={() => setReactivating(null)} />}
    </main>
  );
}
