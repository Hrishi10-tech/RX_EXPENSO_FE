/**
 * W09·b settings: the daily digest and what pops up in the console, the theme (light, dark or match the
 * device, saved to the account), session facts and a password change (FR-NOT-05, NFR-06, FR-ROLE-07).
 */
import { type FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCrumbs } from '../app/Shell';
import { api, consolePref, useMe } from '../app/core';
import type { Theme } from '../app/theme';
import { useSaveSettings } from '../api/hooks';
import type { UserSettings } from '../api/types';
import { ApiError } from '../lib/api';
import { toast } from '../components/Toasts';
import { Btn, Card, Field, Kvs, PageHead, Switch, TextInput } from '../components/ui';

const THEMES: Array<[Theme, string, string]> = [
  ['light', 'Light', '#FFFFFF'],
  ['dark', 'Dark', '#121428'],
  ['system', 'Match device', 'linear-gradient(90deg,#FFFFFF 50%,#121428 50%)'],
];

function SetRow({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="tx"><b>{title}</b><small>{sub}</small></div>
      {children}
    </div>
  );
}

function PasswordCard() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState<{ cur?: string; next?: string; again?: string }>({});
  const change = useMutation({
    mutationFn: () => api.post('/me/password', { currentPassword: cur, newPassword: next }),
    onSuccess: () => { setCur(''); setNext(''); setAgain(''); setErr({}); toast('Password changed. Use it the next time you sign in.'); },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === 'invalid_credentials') setErr({ cur: 'That isn’t your current password.' });
      else if (e instanceof ApiError && e.code === 'validation') setErr({ next: e.message });
      else toast((e as Error).message, { tone: 'bad' });
    },
  });
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e: typeof err = {};
    if (next.length < 8) e.next = 'Use at least 8 characters.';
    else if (next === cur) e.next = 'Choose a password different from the current one.';
    if (again !== next) e.again = 'The two new passwords don’t match.';
    setErr(e);
    if (!Object.keys(e).length) change.mutate();
  };
  return (
    <Card title="Password" icon="key">
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }} noValidate>
        <Field label="Current password" htmlFor="pwCur" error={err.cur ?? null} help="Leave empty if you have only ever signed in with a one-time code.">
          <TextInput id="pwCur" type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} error={!!err.cur} />
        </Field>
        <div className="grid2" style={{ gap: 12 }}>
          <Field label="New password" htmlFor="pwNew" error={err.next ?? null} help={err.next ? undefined : 'At least 8 characters'}>
            <TextInput id="pwNew" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} error={!!err.next} />
          </Field>
          <Field label="New password again" htmlFor="pwAgain" error={err.again ?? null}>
            <TextInput id="pwAgain" type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} error={!!err.again} />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn kind="sec" size="sm" type="submit" icon="check" busy={change.isPending} locked={!next ? 'Enter a new password first' : null}>Change password</Btn>
        </div>
      </form>
    </Card>
  );
}

export function Settings() {
  useCrumbs([{ label: 'Settings' }]);
  const me = useMe();
  const save = useSaveSettings();
  const s = me.settings;
  const role = [me.isFinance && 'Finance', me.isAdmin && 'Administrator'].filter(Boolean).join(' · ') || 'Employee';
  const put = (patch: Partial<UserSettings>, done: string) => save.mutate(patch, {
    onSuccess: () => toast(done),
    onError: e => toast(`Not saved: ${(e as Error).message}`, { tone: 'bad' }),
  });
  const pref = (k: 'budgetCrossings' | 'everyExpense' | 'digestOverBudget') => consolePref(k);
  const setPref = (k: string, v: boolean, done: string) => put({ notificationPrefs: { [k]: v } }, done);

  return (
    <main className="w-body" id="main" tabIndex={-1}>
      <PageHead title="Settings" sub={`${me.name} · ${role}`} />
      <div className="twocol">
        <div className="stack">
          {me.isFinance && (
            <Card title="Email" icon="mail">
              <SetRow title="Daily digest at 09:00" sub="Claims ready for verification and Extended trips (FR-NOT-05)">
                <Switch label="Daily digest at 09:00" checked={s.dailyDigest} onChange={v => put({ dailyDigest: v }, v ? 'Digest on · the first one arrives at 09:00' : 'Digest off')} />
              </SetRow>
              <SetRow title="Include over-budget trips" sub="Trips where any budget is above 100%">
                <Switch label="Include over-budget trips" checked={pref('digestOverBudget')} disabled={!s.dailyDigest} onChange={v => setPref('digestOverBudget', v, v ? 'Over-budget trips included in the digest' : 'Over-budget trips left out of the digest')} />
              </SetRow>
              <SetRow title="Send to" sub={me.email} />
            </Card>
          )}
          {me.isFinance && (
            <Card title="In the console" icon="bell">
              <SetRow title="Replies to my queries" sub="Always on">
                <Switch label="Replies to my queries (always on)" checked disabled onChange={() => undefined} />
              </SetRow>
              <SetRow title="Budget crossings at 80% and 100%" sub="A pop-up for every trip; always kept in Notifications">
                <Switch label="Budget crossings at 80% and 100%" checked={pref('budgetCrossings')} onChange={v => setPref('budgetCrossings', v, v ? 'Budget crossings pop up again' : 'Budget crossings stay in Notifications only')} />
              </SetRow>
              <SetRow title="Every new expense" sub="Off by default; the dashboard shows them live">
                <Switch label="Every new expense" checked={pref('everyExpense')} onChange={v => setPref('everyExpense', v, v ? 'A pop-up for every new expense' : 'New expenses show on the dashboard only')} />
              </SetRow>
            </Card>
          )}
          <PasswordCard />
        </div>
        <div className="stack">
          <Card title="Appearance" icon="sun">
            <div className="theme-pick" role="radiogroup" aria-label="Theme">
              {THEMES.map(([k, l, bg]) => (
                <button type="button" key={k} role="radio" aria-checked={s.theme === k} aria-pressed={s.theme === k}
                  onClick={() => { if (s.theme !== k) put({ theme: k }, `Theme: ${l.toLowerCase()}`); }}>
                  <span className="sw" style={{ background: bg }} />{l}
                </button>
              ))}
            </div>
            <div className="sm-note" style={{ marginTop: 10 }}>Saved to your account, so the console looks the same wherever you sign in. Match device follows the operating system and switches live.</div>
          </Card>
          <Card title="Session" icon="shield">
            <Kvs pairs={[
              ['Sign-in', 'Work email with a password or a one-time code'],
              ['Idle timeout', '30 minutes · company policy'],
              ['Role', role],
              ['Department', me.departmentName],
              ['Also on the mobile app', 'Yes, as an employee'],
            ]} />
          </Card>
        </div>
      </div>
    </main>
  );
}
