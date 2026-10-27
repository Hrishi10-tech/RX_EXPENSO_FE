/**
 * W10·c departments (administrators): people invite only colleagues from their own department. Add, rename,
 * archive an empty department and restore it; trips keep the department they were created in (FR-ADM-02,
 * FR-ADM-03). Every change is audited on the server (FR-ADM-04).
 */
import { type FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCrumbs } from '../../app/Shell';
import { api, queryClient } from '../../app/core';
import { useAdminDepartments } from '../../api/hooks';
import { keys } from '../../api/keys';
import type { AdminDepartment } from '../../api/types';
import { ApiError } from '../../lib/api';
import { Icon } from '../../components/Icon';
import { toast } from '../../components/Toasts';
import { Banner, Btn, Card, EmptyState, ErrorState, Loading, PageHead, Pill, Tbl, TextInput } from '../../components/ui';
import { plural } from '../../lib/format';

function refresh() {
  void queryClient.invalidateQueries({ queryKey: keys.adminDepartments });
  void queryClient.invalidateQueries({ queryKey: keys.departments });
  void queryClient.invalidateQueries({ queryKey: keys.adminUsersAll });
}
const message = (e: unknown) => (e instanceof ApiError && e.code === 'department_in_use' ? 'Move its active people to another department first.' : (e as Error).message);

function RenameRow({ d, onDone }: { d: AdminDepartment; onDone: () => void }) {
  const [name, setName] = useState(d.name);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.patch(`/admin/departments/${d.id}`, { name: name.trim() }),
    onSuccess: () => { refresh(); toast(`Renamed to ${name.trim()}. Trips keep the department they were created in.`); onDone(); },
    onError: e => setErr(message(e)),
  });
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (name.trim().length < 2) { setErr('Use at least 2 characters.'); return; }
    if (name.trim() === d.name) { onDone(); return; }
    save.mutate();
  };
  return (
    <tr className="sel">
      <td colSpan={4}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'center' }} id={`ren-${d.id}`}>
          <TextInput value={name} onChange={e => { setName(e.target.value); setErr(null); }} aria-label={`New name for ${d.name}`} error={!!err} autoFocus wrapStyle={{ maxWidth: 320 }}
            onKeyDown={e => { if (e.key === 'Escape') onDone(); }} />
          {err && <span className="errtxt" role="alert"><Icon name="alert" size={14} /><span>{err}</span></span>}
        </form>
      </td>
      <td className="r">
        <div className="acts" style={{ justifyContent: 'flex-end' }}>
          <Btn kind="ghost" size="xs" onClick={onDone}>Cancel</Btn>
          <Btn kind="pri" size="xs" type="submit" form={`ren-${d.id}`} busy={save.isPending}>Save</Btn>
        </div>
      </td>
    </tr>
  );
}

export function Departments() {
  useCrumbs([{ label: 'Departments' }]);
  const list = useAdminDepartments();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [addErr, setAddErr] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api.post<AdminDepartment>('/admin/departments', { name: name.trim() }),
    onSuccess: d => { refresh(); toast(`${d.name} added`); setName(''); },
    onError: e => setAddErr(message(e)),
  });
  const archive = useMutation({
    mutationFn: (v: { d: AdminDepartment; archived: boolean }) => api.patch(`/admin/departments/${v.d.id}`, { archived: v.archived }),
    onSuccess: (_r, v) => { refresh(); toast(v.archived ? `${v.d.name} archived. Nobody can be added to it.` : `${v.d.name} restored`); },
    onError: e => toast(message(e), { tone: 'bad' }),
  });
  const submitAdd = (ev: FormEvent) => {
    ev.preventDefault();
    if (name.trim().length < 2) { setAddErr('Enter a name of at least 2 characters.'); return; }
    add.mutate();
  };
  const rows = [...(list.data ?? [])].sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || b.userCount - a.userCount || a.name.localeCompare(b.name));

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead title="Departments" sub="People only invite colleagues from their own department" actions={<Btn kind="sec" size="sm" icon="users" to="/admin/users">Users</Btn>} />
      {list.error ? <Card><ErrorState error={list.error} onRetry={() => void list.refetch()} /></Card> : !list.data ? <Card><Loading label="Loading departments…" /></Card> : (
        <Card flush>
          {rows.length === 0 && <EmptyState icon="building" title="No departments yet">Add the first one below.</EmptyState>}
          <Tbl label="Departments" heads={[['Department'], ['People', 'r'], ['Live trips', 'r'], ['Trips this year', 'r'], ['', 'r']]}>
            {rows.map(d => renaming === d.id ? <RenameRow key={d.id} d={d} onDone={() => setRenaming(null)} /> : (
              <tr key={d.id} className={d.archivedAt ? 'dim-row' : undefined}>
                <td><b>{d.name}</b>{d.archivedAt && <> <Pill tone="line">Archived</Pill></>}</td>
                <td className="r num">{d.userCount}</td>
                <td className="r num">{d.liveTrips}</td>
                <td className="r num">{d.tripsThisYear ?? '–'}</td>
                <td className="r">
                  <div className="acts" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    {d.archivedAt ? (
                      <Btn kind="ghost" size="xs" icon="undo" busy={archive.isPending && archive.variables?.d.id === d.id} onClick={() => archive.mutate({ d, archived: false })}>Restore</Btn>
                    ) : (
                      <>
                        <Btn kind="ghost" size="xs" onClick={() => setRenaming(d.id)} ariaLabel={`Rename ${d.name}`}>Rename</Btn>
                        <Btn kind="ghost" size="xs" busy={archive.isPending && archive.variables?.d.id === d.id} ariaLabel={`Archive ${d.name}`}
                          locked={d.userCount ? `Move its ${plural(d.userCount, 'person', 'people')} to another department first` : null}
                          onClick={() => archive.mutate({ d, archived: true })}>Archive</Btn>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            <tr className="sel">
              <td colSpan={4}>
                <form id="addDept" onSubmit={submitAdd} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <TextInput value={name} onChange={e => { setName(e.target.value); setAddErr(null); }} placeholder="New department, for example Regulatory Affairs" aria-label="New department name" error={!!addErr} wrapStyle={{ maxWidth: 360, flex: 1 }} />
                  {addErr && <span className="errtxt" role="alert"><Icon name="alert" size={14} /><span>{addErr}</span></span>}
                </form>
              </td>
              <td className="r"><Btn kind="pri" size="xs" icon="plus" type="submit" form="addDept" busy={add.isPending}>Add</Btn></td>
            </tr>
          </Tbl>
        </Card>
      )}
      <Banner tone="neutral" icon="info" title="Archiving a department">Allowed only when nobody active is in it. Trips keep the department they were created in, even after a rename or an archive (FR-ADM-02, FR-ADM-03).</Banner>
    </main>
  );
}
