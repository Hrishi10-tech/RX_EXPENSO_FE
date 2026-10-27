/**
 * W01 sign in: work email with password or an emailed one-time code. Refuses employee accounts with a pointer
 * to the mobile app (W01·a), explains lockouts and deactivation, and returns to the page a deep link pointed at.
 */
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { api, session, useSession } from '../app/core';
import { XLogo } from '../components/Brand';
import { Icon } from '../components/Icon';
import { Banner, Btn, Field, TextInput } from '../components/ui';
import { ApiError } from '../lib/api';
import type { LoginResult, OtpRequestResult } from '../api/types';

function deviceLabel() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  const os = /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'desktop';
  return `Web · ${b} on ${os}`;
}

/** Only same-site paths are followed after sign-in. */
function safeNext(n: string | null): string {
  if (!n || !n.startsWith('/') || n.startsWith('//') || n.startsWith('/sign-in')) return '/';
  return n;
}

function LoginArt() {
  return (
    <div className="login-art">
      <span className="glow" />
      <XLogo />
      <div style={{ position: 'relative' }}>
        <h2>Every trip, every rupee, live.</h2>
        <p>Verify claims beside their receipts, set budgets while trips run, and export the complete claim package.</p>
      </div>
      <div style={{ position: 'relative', display: 'flex', gap: 26, color: '#C5C9E6', fontSize: 13, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="zap" size={15} />Live within 5 seconds</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="lock" size={15} />Finance and administrators only</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="fileZip" size={15} />PDF, Excel and ZIP</span>
      </div>
    </div>
  );
}

type Problem =
  | { kind: 'role'; email: string }
  | { kind: 'locked'; until?: string }
  | { kind: 'wrong'; left?: number }
  | { kind: 'code'; left?: number; message: string }
  | { kind: 'deactivated' }
  | { kind: 'other'; message: string };

export function SignIn() {
  const s = useSession();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const next = safeNext(sp.get('next'));
  const [email, setEmail] = useState(sp.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const reason = useRef(s.reason ?? (sp.get('ended') as typeof s.reason) ?? null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (s.reason) session.clearReason(); }, [s.reason]);
  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  if (s.status === 'signedIn') return <Navigate to={next} replace />;

  const finish = (r: LoginResult) => {
    session.apply(r);
    nav(next, { replace: true });
  };

  const handle = (e: unknown, via: 'password' | 'code') => {
    if (!(e instanceof ApiError)) { setProblem({ kind: 'other', message: 'Something went wrong. Try again.' }); return; }
    const d = (e.details ?? {}) as { attemptsLeft?: number; lockedUntil?: string };
    if (e.code === 'web_role_required') setProblem({ kind: 'role', email: email.trim() });
    else if (e.code === 'locked') setProblem({ kind: 'locked', until: d.lockedUntil });
    else if (e.code === 'invalid_credentials') { setProblem({ kind: 'wrong', left: d.attemptsLeft }); setPwErr('Check the password.'); }
    else if (e.code === 'invalid_code') setProblem({ kind: 'code', left: d.attemptsLeft, message: e.message });
    else if (e.code === 'deactivated') setProblem({ kind: 'deactivated' });
    else if (e.code === 'validation') {
      const f = e.fields;
      if (f.email) setEmailErr('Enter your work email.');
      if (f.password) setPwErr('Enter your password.');
      if (f.code) setProblem({ kind: 'code', message: 'Enter the 6-digit code from the email.' });
      if (!f.email && !f.password && !f.code) setProblem({ kind: 'other', message: e.message });
    } else setProblem({ kind: 'other', message: e.message });
    if (via === 'code') setCode('');
  };

  const signIn = async (ev: FormEvent) => {
    ev.preventDefault();
    setProblem(null); setEmailErr(null); setPwErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setEmailErr('Enter your work email.'); return; }
    if (!password) { setPwErr('Enter your password.'); return; }
    setBusy(true);
    try {
      finish(await api.anon<LoginResult>('POST', '/auth/login', { email: email.trim(), password, client: 'web', deviceLabel: deviceLabel() }));
    } catch (e) { handle(e, 'password'); } finally { setBusy(false); }
  };

  const requestCode = async () => {
    setProblem(null); setEmailErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setEmailErr('Enter your work email first.'); return; }
    setBusy(true);
    try {
      const r = await api.anon<OtpRequestResult>('POST', '/auth/otp/request', { email: email.trim() });
      setDevCode(r.devCode ?? null);
      setStep('code');
      setCode('');
    } catch (e) { handle(e, 'code'); } finally { setBusy(false); }
  };

  const verifyCode = async (ev: FormEvent) => {
    ev.preventDefault();
    setProblem(null);
    if (!/^\d{6}$/.test(code)) { setProblem({ kind: 'code', message: 'Enter the 6-digit code from the email.' }); return; }
    setBusy(true);
    try {
      finish(await api.anon<LoginResult>('POST', '/auth/otp/verify', { email: email.trim(), code, client: 'web', deviceLabel: deviceLabel() }));
    } catch (e) { handle(e, 'code'); } finally { setBusy(false); }
  };

  const banner = (() => {
    if (problem?.kind === 'role') return (
      <Banner tone="bad" icon="ban" title="This console is for finance and administrators"
        actions={<Btn kind="ghost" size="sm" onClick={() => { setProblem(null); setEmail(''); setPassword(''); setStep('password'); }}>Use another account</Btn>}>
        {problem.email} is an employee account. Your trips, expenses and claims are in the Expenso mobile app.
      </Banner>
    );
    if (problem?.kind === 'locked') return (
      <Banner tone="warn" icon="lock" title="Password sign-in is locked for 15 minutes"
        actions={<Btn kind="sec" size="sm" icon="mail" onClick={requestCode}>Email me a one-time code</Btn>}>
        Too many wrong passwords. You can still sign in with a one-time code sent to your work email.
      </Banner>
    );
    if (problem?.kind === 'wrong') return (
      <Banner tone="bad" icon="alert" title="Email or password doesn’t match">
        {problem.left != null ? (problem.left > 0 ? `${problem.left} ${problem.left === 1 ? 'attempt' : 'attempts'} left before password sign-in locks for 15 minutes.` : 'Password sign-in is now locked for 15 minutes.') : 'Check both and try again.'}
      </Banner>
    );
    if (problem?.kind === 'code') return (
      <Banner tone="bad" icon="alert" title={problem.message}>
        {problem.left != null && problem.left > 0 ? `${problem.left} ${problem.left === 1 ? 'try' : 'tries'} left for this code.` : 'Ask for a new code if this one has expired.'}
      </Banner>
    );
    if (problem?.kind === 'deactivated') return <Banner tone="bad" icon="userX" title="This account is no longer active">Contact it-admin@xelements.in. Trips and claims you logged stay with finance.</Banner>;
    if (problem?.kind === 'other') return <Banner tone="bad" icon="alert" title="Couldn’t sign you in">{problem.message}</Banner>;
    if (reason.current === 'timeout') return <Banner tone="neutral" icon="lock" title="You were signed out after 30 minutes idle">Sign in again to go back to the page you were on. Anything you decided was saved.</Banner>;
    if (reason.current === 'session_ended') return <Banner tone="neutral" icon="lock" title="Your session ended">Sign in again to continue.</Banner>;
    if (reason.current === 'deactivated') return <Banner tone="bad" icon="userX" title="This account is no longer active">Contact it-admin@xelements.in.</Banner>;
    return null;
  })();

  return (
    <div className="login-page">
      <div className="login">
        <LoginArt />
        <main className="login-form" id="main">
          <div className="lf">
            <div>
              <h1>Sign in to Expenso</h1>
              <p className="muted" style={{ margin: '6px 0 0' }}>Finance and administrator accounts.</p>
            </div>
            {banner}
            {step === 'password' ? (
              <form onSubmit={signIn} noValidate style={{ display: 'grid', gap: 18 }}>
                <Field label="Work email" htmlFor="email" error={emailErr}>
                  <TextInput id="email" type="email" icon="mail" autoComplete="username" value={email} error={!!emailErr} placeholder="name@xelements.in"
                    onChange={e => { setEmail(e.target.value); setEmailErr(null); }} autoFocus />
                </Field>
                <Field label="Password" htmlFor="password" error={pwErr}>
                  <TextInput id="password" type={show ? 'text' : 'password'} icon="key" autoComplete="current-password" value={password} error={!!pwErr}
                    onChange={e => { setPassword(e.target.value); setPwErr(null); }}
                    end={<button type="button" className="w-icb" style={{ width: 28, height: 28, border: 0 }} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(v => !v)}><Icon name={show ? 'eyeOff' : 'eye'} size={16} /></button>} />
                </Field>
                <Btn kind="pri" block type="submit" busy={busy} icon="logIn">Sign in</Btn>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)', fontSize: 12.5 }}>
                  <span className="divider" style={{ flex: 1 }} />or with a one-time code<span className="divider" style={{ flex: 1 }} />
                </div>
                <Btn kind="sec" block icon="mail" onClick={requestCode} locked={busy ? 'Working…' : null}>Email me a one-time code</Btn>
              </form>
            ) : (
              <form onSubmit={verifyCode} noValidate style={{ display: 'grid', gap: 18 }}>
                <Banner tone="info" icon="mail" title={`We emailed a 6-digit code to ${email.trim()}`}>It works for 10 minutes. Didn’t get it? Check spam, or send a new one.</Banner>
                {devCode && <div className="help" data-testid="dev-code">Development server: the code is <b className="mono">{devCode}</b>. Real deployments email it instead.</div>}
                <Field label="One-time code" htmlFor="code">
                  <TextInput id="code" ref={codeRef} wrapClassName="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} placeholder="000000"
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                </Field>
                <Btn kind="pri" block type="submit" busy={busy} icon="logIn">Verify and sign in</Btn>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <button type="button" className="linkbtn" onClick={requestCode}>Send a new code</button>
                  <button type="button" className="linkbtn" onClick={() => { setStep('password'); setProblem(null); }}>Use your password instead</button>
                </div>
              </form>
            )}
            <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
              Employees record trips in the Expenso mobile app. Sessions end after 30 minutes without activity. Trouble signing in? Write to it-admin@xelements.in.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
