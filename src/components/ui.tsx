/**
 * The console's building blocks, reproducing the prototype's markup and classes (proto/src/w1-data.js):
 * pill, btn, banner, bar, flag, kpi, card, who, kvs, impact, segs, ropt, switch, fields, feed, tabs, steps.
 */
import { Children, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef, useId } from 'react';
import { Link, NavLink } from 'react-router';
import { Icon, type IconName } from './Icon';
import { toast } from './Toasts';
import { budgetPct, budgetState, inr, initials, pct as pctOf } from '../lib/format';
import { CLAIM_STATUS, TRIP_STATUS } from '../lib/labels';
import type { BudgetSource, ClaimStatus, PaidBy, Tone, TripStatus, Verification } from '../api/types';

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');

/* ---------------- money ---------------- */

/** An amount in INR. Always Manrope: Sora has no ₹ glyph. */
export function Money({ paise, className, decimals, style }: { paise: number | null | undefined; className?: string; decimals?: boolean; style?: CSSProperties }) {
  return <span className={cx('money', className)} style={style}>{inr(paise, { decimals })}</span>;
}
/** Table amount, like the prototype's amt(). */
export function Amt({ paise, strike }: { paise: number | null | undefined; strike?: boolean }) {
  return <span className={cx('amt money', strike && 'strike')}>{inr(paise)}</span>;
}

/* ---------------- pills, flags, bars ---------------- */

export function Pill({ tone, icon, children, title, className }: { tone?: Tone | ''; icon?: IconName; children: ReactNode; title?: string; className?: string }) {
  return <span className={cx('pill', tone, className)} title={title}>{icon && <Icon name={icon} size={12} />}{children}</span>;
}

export function Flag({ tone, icon = 'flag', children, title }: { tone?: '' | 'info' | 'bad' | 'warn'; icon?: IconName; children: ReactNode; title?: string }) {
  return <span className={cx('tag-flag', tone === 'warn' ? '' : tone)} title={title}><Icon name={icon} size={12} />{children}</span>;
}

/** A progress bar that always carries its number for screen readers; colour follows the 80 and 100 % thresholds. */
export function Bar({ pct, tone, label, className }: { pct: number; tone?: '' | 'warn' | 'bad' | 'pool' | 'priv'; label?: string; className?: string }) {
  const t = tone ?? (pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : '');
  return (
    <div className={cx('bar', t, className)} role="progressbar" aria-valuenow={Math.max(0, Math.min(100, Math.round(pct)))} aria-valuemin={0} aria-valuemax={100}
      aria-valuetext={`${Math.round(pct)}%`} aria-label={label ?? `${Math.round(pct)}%`}>
      <i style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
    </div>
  );
}

/** Budget use in a table: bar and percentage, never colour alone (NFR-09). */
export function Usage({ spent, alloc }: { spent: number; alloc: number | null | undefined }) {
  if (!alloc) return <span className="faint" style={{ fontSize: 12.5 }}>No budget</span>;
  const p = budgetPct(spent, alloc);
  const s = budgetState(spent, alloc);
  return (
    <div className="minibar" style={{ minWidth: 120 }}>
      <Bar pct={p} tone={s === 'over' ? 'bad' : s === 'warn' ? 'warn' : ''} label={`Trip pool ${p}% used${s === 'over' ? ', over budget' : ''}`} />
      <span className="num" style={{ fontSize: 12, fontWeight: 800, minWidth: 38, textAlign: 'right', color: s === 'over' ? 'var(--bad)' : s === 'warn' ? 'var(--warn)' : 'var(--ink-2)' }}>{p}%</span>
    </div>
  );
}

/** Verification progress: "2 of 8 checked · 1 query". */
export function Prog({ done, total, queries }: { done: number; total: number; queries?: number }) {
  if (!total) return <span className="faint">None</span>;
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 110 }}>
      <div className="minibar"><Bar pct={pctOf(done, total)} tone="pool" label={`${done} of ${total} checked`} /></div>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{done} of {total} checked{queries ? ` · ${queries} ${queries === 1 ? 'query' : 'queries'}` : ''}</span>
    </div>
  );
}

export function TripStatusPill({ status, extra }: { status: TripStatus; extra?: string | null }) {
  const s = TRIP_STATUS[status];
  return <>{<Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>}{extra ? <> <Pill tone="line">{extra}</Pill></> : null}</>;
}

export function ClaimStatusPill({ status }: { status: ClaimStatus | 'none' }) {
  if (status === 'none') return <span className="faint">No claim</span>;
  const s = CLAIM_STATUS[status];
  return <Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>;
}

/** Verification state of one expense, in the prototype's words. */
export function VerPill({ v, lowered, company, replied }: { v: Verification; lowered?: boolean; company?: boolean; replied?: boolean }) {
  if (company) return <Pill tone="line">Recorded</Pill>;
  if (v === 'verified') return lowered ? <Pill tone="ok" icon="check">Approved lower</Pill> : <Pill tone="ok" icon="check">Verified</Pill>;
  if (v === 'query') return replied ? <Pill tone="acc" icon="message">Replied</Pill> : <Pill tone="warn" icon="message">Query</Pill>;
  if (v === 'rejected') return <Pill tone="bad" icon="x">Rejected</Pill>;
  return <Pill tone="line">To check</Pill>;
}

/** Budget source pill: shared pool, private individual budget, company-paid or unbudgeted. */
export function SrcPill({ source, paidBy, who }: { source: BudgetSource; paidBy?: PaidBy; who?: string }) {
  if (paidBy === 'company') return <Pill tone="line" icon="building">Company-paid</Pill>;
  if (source === 'pool') return <Pill tone="pool" icon="users">Trip pool</Pill>;
  if (source === 'individual') return <Pill tone="priv" icon="lock">{'Individual' + (who ? ` · ${who}` : '')}</Pill>;
  return <Pill tone="line">Unbudgeted</Pill>;
}

/* ---------------- buttons ---------------- */

export interface BtnProps {
  kind?: 'pri' | 'sec' | 'ghost' | 'danger' | 'dangerfill' | '';
  size?: 'sm' | 'xs';
  block?: boolean;
  icon?: IconName;
  iconSize?: number;
  iconRight?: IconName;
  kbd?: string;
  to?: string;
  state?: unknown;
  onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  disabled?: boolean;
  /** Looks disabled and explains why when pressed (the prototype's .dis buttons). */
  locked?: string | false | null;
  busy?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
  dataKey?: string;
  style?: CSSProperties;
  form?: string;
}

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(p, ref) {
  const cls = cx('btn', p.kind, p.size, p.block && 'block', (p.locked || p.busy) && 'dis', p.className);
  const inner = (
    <>
      {p.busy ? <Icon name="loader" size={p.iconSize ?? 16} className="spin" /> : p.icon && <Icon name={p.icon} size={p.iconSize ?? 16} />}
      {p.children}
      {p.iconRight && <Icon name={p.iconRight} size={p.iconSize ?? 16} />}
      {p.kbd && <span className="kbd">{p.kbd}</span>}
    </>
  );
  if (p.to && !p.locked && !p.disabled) {
    return <Link to={p.to} state={p.state} className={cls} title={p.title} aria-label={p.ariaLabel} style={p.style} onClick={p.onClick as never}>{inner}</Link>;
  }
  return (
    <button
      ref={ref}
      type={p.type ?? 'button'}
      form={p.form}
      className={cls}
      title={p.title ?? (p.locked || undefined)}
      aria-label={p.ariaLabel}
      aria-disabled={p.locked || p.busy ? true : undefined}
      disabled={p.disabled}
      data-key={p.dataKey}
      style={p.style}
      onClick={e => {
        if (p.busy) return;
        if (p.locked) { e.preventDefault(); toast(p.locked, { tone: 'info', icon: 'lock' }); return; }
        p.onClick?.(e);
      }}
    >
      {inner}
    </button>
  );
});

export function Kbd({ children }: { children: ReactNode }) { return <span className="kbd">{children}</span>; }

/* ---------------- surfaces ---------------- */

export function Banner({ tone = 'info', icon = 'info', title, children, actions, className, style }: { tone?: 'info' | 'ok' | 'warn' | 'bad' | 'priv' | 'neutral'; icon?: IconName; title: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx('banner', tone === 'info' ? '' : tone, className)} role={tone === 'bad' || tone === 'warn' ? 'alert' : undefined} style={style}>
      <span className="bi"><Icon name={icon} size={20} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{title}</b>
        {children && <p>{children}</p>}
        {actions && <div className="bact">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, icon, sub, right, flush, className, style, children, id, headingLevel = 2 }: { title?: ReactNode; icon?: IconName; sub?: ReactNode; right?: ReactNode; flush?: boolean; className?: string; style?: CSSProperties; children?: ReactNode; id?: string; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <section className={cx('card', className)} style={style} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {title && (
        <div className="card-h">
          {icon && <Icon name={icon} size={18} />}
          <H>{title}</H>
          {sub && <span className="faint" style={{ fontSize: 12.5 }}>{sub}</span>}
          {right && <div className="r">{right}</div>}
        </div>
      )}
      {flush ? children : <div className="card-b">{children}</div>}
    </section>
  );
}

export function Kpi({ label, value, sub, icon = 'info', tone, to, onClick, state }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: IconName; tone?: 'warn' | 'acc' | ''; to?: string; onClick?: () => void; state?: unknown }) {
  const body = (
    <>
      <small><Icon name={icon} size={14} />{label}</small>
      <b>{value}</b>
      {sub != null && <span>{sub}</span>}
    </>
  );
  if (to) return <Link to={to} state={state} className={cx('kpi', tone)}>{body}</Link>;
  if (onClick) return <button type="button" className={cx('kpi', tone)} onClick={onClick}>{body}</button>;
  return <div className={cx('kpi', tone)}>{body}</div>;
}

const AV_COLORS = ['#6F8BEE', '#A07AD8', '#CC7FB0', '#3C9E86', '#D08A3A', '#5C6BC0', '#C0567A', '#4A90B8'];
export function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
export function Avatar({ name, size }: { name: string; size?: 'sm' | 'lg' }) {
  return <span className={cx('avatar', size)} style={{ background: avatarColor(name) }} aria-hidden="true">{initials(name)}</span>;
}

export function Who({ name, sub, size = 'sm', crown }: { name: string; sub?: ReactNode; size?: 'sm' | 'lg' | ''; crown?: boolean }) {
  return (
    <div className="who">
      <Avatar name={name} size={size || undefined} />
      <div>
        <b>{name}{crown && <> <Icon name="crown" size={12} title="Trip owner" /></>}</b>
        {sub != null && sub !== '' && <small>{sub}</small>}
      </div>
    </div>
  );
}

export function Kvs({ pairs, left }: { pairs: Array<[ReactNode, ReactNode, boolean?] | null | false>; left?: boolean }) {
  return (
    <dl className={cx('wkv', left && 'left')}>
      {pairs.filter(Boolean).map((p, i) => {
        const [k, v, tot] = p as [ReactNode, ReactNode, boolean?];
        return [<dt key={`k${i}`} className={tot ? 'tot' : undefined}>{k}</dt>, <dd key={`v${i}`} className={tot ? 'tot' : undefined}>{v}</dd>];
      })}
    </dl>
  );
}

export function Impact({ title, items }: { title: ReactNode; items: Array<[IconName, ReactNode] | null | false> }) {
  const list = items.filter(Boolean) as Array<[IconName, ReactNode]>;
  if (!list.length) return null;
  return (
    <div className="impact">
      <h4>{title}</h4>
      {list.map(([ic, t], i) => <div className="it" key={i}><Icon name={ic} size={16} /><span>{t}</span></div>)}
    </div>
  );
}

/** Segmented control (aria-pressed buttons, like the prototype's segs). */
export function Segs<T extends string>({ options, value, onChange, label, className }: { options: Array<[T, ReactNode, IconName?]>; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div className={cx('seg2 sm', className)} role="group" aria-label={label}>
      {options.map(([v, l, ic]) => (
        <button type="button" key={v} aria-pressed={v === value} onClick={() => onChange(v)}>{ic && <Icon name={ic} size={14} />}{l}</button>
      ))}
    </div>
  );
}

/** A large radio or checkbox option row. */
/**
 * A radio or checkbox option row (prototype .ropt). `disabled` dims it; `locked` keeps it looking chosen
 * but not changeable (for example the ZIP that "each member" exports always include).
 */
export function Ropt({ on, title, sub, onClick, role = 'radio', extra, disabled, locked, icon, checkbox, name }: { on: boolean; title: ReactNode; sub?: ReactNode; onClick?: () => void; role?: 'radio' | 'checkbox'; extra?: ReactNode; disabled?: boolean; locked?: boolean; icon?: IconName; checkbox?: boolean; name?: string }) {
  const off = disabled || locked;
  return (
    <button type="button" className={cx('ropt', on && 'on')} role={role} aria-checked={on} aria-disabled={off || undefined} name={name}
      onClick={() => { if (!off) onClick?.(); }} style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : locked ? { cursor: 'default' } : undefined}>
      {checkbox ? <Cbx on={on} /> : <span className="rd" />}
      <span style={{ flex: 1, minWidth: 0 }}><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {extra}
      {icon && <Icon name={icon} size={20} />}
    </button>
  );
}

export function Cbx({ on }: { on: boolean }) {
  return <span className={cx('cbx', on && 'on')} aria-hidden="true">{on && <Icon name="check" size={13} />}</span>;
}

/** A keyboard-operable checkbox drawn as the prototype's .cbx. */
export function Check({ checked, onChange, label, disabled, title }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; title?: string }) {
  if (disabled) return <span className="cbx" style={{ opacity: 0.35 }} title={title} aria-hidden="true" />;
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className="cbx-btn" onClick={e => { e.stopPropagation(); onChange(!checked); }}>
      <Cbx on={checked} />
    </button>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch-btn" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="switch" aria-checked={checked} />
    </button>
  );
}

/* ---------------- fields ---------------- */

export function Field({ label, required, error, help, htmlFor, children, className }: { label: ReactNode; required?: boolean; error?: string | null; help?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('w-field', className)}>
      <label htmlFor={htmlFor}>{label}{required && <> <span style={{ color: 'var(--bad)' }} aria-hidden="true">*</span></>}</label>
      {children}
      {error && <div className="errtxt" role="alert"><Icon name="alert" size={14} /><span>{error}</span></div>}
      {help && <div className="help">{help}</div>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { icon?: IconName; prefix?: string; end?: ReactNode; error?: boolean; locked?: boolean; wrapClassName?: string; wrapStyle?: CSSProperties };
export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ icon, prefix, end, error, locked, wrapClassName, wrapStyle, className, ...rest }, ref) {
  return (
    <div className={cx('w-input', error && 'err', locked && 'lock', wrapClassName)} style={wrapStyle}>
      {icon && <Icon name={icon} size={16} />}
      {prefix && <span className="pre">{prefix}</span>}
      <input ref={ref} className={cx('w-in', className)} readOnly={locked || rest.readOnly} aria-invalid={error || undefined} {...rest} />
      {end}
    </div>
  );
});

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean; wrapStyle?: CSSProperties };
export const TextArea = forwardRef<HTMLTextAreaElement, AreaProps>(function TextArea({ error, wrapStyle, className, ...rest }, ref) {
  return (
    <div className={cx('w-input textarea', error && 'err')} style={wrapStyle}>
      <textarea ref={ref} className={cx('w-in', className)} aria-invalid={error || undefined} {...rest} />
    </div>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { icon?: IconName; error?: boolean; wrapStyle?: CSSProperties; options: Array<[string, string]> ; placeholder?: string };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ icon, error, wrapStyle, options, placeholder, className, ...rest }, ref) {
  return (
    <div className={cx('w-input sel', error && 'err')} style={wrapStyle}>
      {icon && <Icon name={icon} size={16} />}
      <select ref={ref} className={cx('w-in', className)} aria-invalid={error || undefined} {...rest}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Icon name="chevronDown" size={16} />
    </div>
  );
});

/** Pairs a label with its control when the control isn't a TextInput. */
export function useFieldId(prefix = 'f') { return prefix + useId().replace(/[^a-zA-Z0-9]/g, ''); }

/* ---------------- lists and states ---------------- */

export function EmptyState({ icon, title, children, actions }: { icon: IconName; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="w-empty">
      <span className="big"><Icon name={icon} size={28} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</div>}
    </div>
  );
}

export function Ibx({ icon, tone, size = 17 }: { icon: IconName; tone?: Tone | ''; size?: number }) {
  return <span className={cx('ibx', tone)}><Icon name={icon} size={size} /></span>;
}

export interface FeedItem {
  key: string | number;
  icon: IconName;
  tone?: Tone | '';
  title: ReactNode;
  sub?: ReactNode;
  time?: ReactNode;
  to?: string;
  state?: unknown;
  onClick?: () => void;
  isNew?: boolean;
}
export function Feed({ items, empty }: { items: FeedItem[]; empty?: ReactNode }) {
  if (!items.length && empty) return <>{empty}</>;
  return (
    <div className="feed">
      {items.map(x => {
        const inner = (
          <>
            <Ibx icon={x.icon} tone={x.tone} />
            <span className="tx"><b>{x.title}</b>{x.sub && <small>{x.sub}</small>}</span>
            <span className="tm">{x.time}</span>
          </>
        );
        const cls = cx('fi', x.isNew && 'new');
        if (x.to) return <Link key={x.key} to={x.to} state={x.state} className={cls}>{inner}</Link>;
        if (x.onClick) return <button type="button" key={x.key} className={cls} onClick={x.onClick}>{inner}</button>;
        return <div key={x.key} className={cls}>{inner}</div>;
      })}
    </div>
  );
}

export type FileKind = 'pdf' | 'xls' | 'zip' | 'img' | 'doc';
export function fileKind(nameOrMime: string): FileKind {
  const s = nameOrMime.toLowerCase();
  if (s.includes('pdf')) return 'pdf';
  if (s.includes('zip')) return 'zip';
  if (/sheet|excel|xlsx?$|csv/.test(s)) return 'xls';
  if (/word|docx?$/.test(s)) return 'doc';
  return 'img';
}
const KIND_LABEL: Record<FileKind, string> = { pdf: 'PDF', xls: 'XLSX', zip: 'ZIP', img: 'JPG', doc: 'DOCX' };
export function FileType({ kind, small, label }: { kind: FileKind; small?: boolean; label?: string }) {
  return <span className={cx('ftype', kind)} style={small ? { width: 30, height: 36, fontSize: 8.5 } : undefined} aria-hidden="true">{label ?? KIND_LABEL[kind]}</span>;
}
export function FileRow({ kind, name, meta, actions, label }: { kind: FileKind; name: ReactNode; meta?: ReactNode; actions?: ReactNode; label?: string }) {
  return (
    <div className="file-row">
      <FileType kind={kind} label={label} />
      <div className="fn"><b>{name}</b>{meta && <small>{meta}</small>}</div>
      {actions}
    </div>
  );
}

/** Tabs that are links (trip page) or buttons (filters), with counts. */
export function Tabs({ items, active, label, onSelect }: { items: Array<{ key: string; label: ReactNode; count?: number | null; to?: string }>; active: string; label: string; onSelect?: (k: string) => void }) {
  return (
    <div className="wtabs" role="tablist" aria-label={label}>
      {items.map(t => {
        const inner = <>{t.label}{t.count != null && <span className="cnt">{t.count}</span>}</>;
        if (t.to) return <NavLink key={t.key} to={t.to} role="tab" aria-selected={t.key === active} className="wtab" end>{inner}</NavLink>;
        return <button type="button" key={t.key} role="tab" aria-selected={t.key === active} className="wtab" onClick={() => onSelect?.(t.key)}>{inner}</button>;
      })}
    </div>
  );
}

/** Claim status steps: Open, Ready for verification, Verified, Part paid, Reimbursed. */
export function Steps({ current, skip }: { current: number; skip?: number }) {
  const st = ['Open', 'Ready for verification', 'Verified', 'Part paid', 'Reimbursed'];
  const out: ReactNode[] = [];
  st.forEach((s, k) => {
    if (k) out.push(<span className="sep" key={`s${k}`} />);
    if (k === skip) out.push(<span className="skip" key={k} title="Not needed: paid in one payment"><i /><s>{s}</s></span>);
    else out.push(<span key={k} className={k < current ? 'on' : k === current ? 'cur' : ''} aria-current={k === current ? 'step' : undefined}><i>{k < current && <Icon name="check" size={11} />}</i>{s}</span>);
  });
  return <div className="wsteps" aria-label="Claim status">{out}</div>;
}

export function Spinner({ size = 18, label = 'Loading' }: { size?: number; label?: string }) {
  return <span role="status" aria-label={label} style={{ display: 'inline-flex' }}><Icon name="loader" size={size} className="spin" /></span>;
}

/** Page-level loading and error states. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="w-loading" role="status"><Icon name="loader" size={22} className="spin" /><span>{label}</span></div>;
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as { status?: number; message?: string; code?: string };
  const title = e?.status === 404 ? 'Not found' : e?.status === 403 ? 'Not available to you' : 'Couldn’t load this';
  return (
    <EmptyState icon={e?.status === 403 ? 'lock' : 'alert'} title={title} actions={onRetry && e?.status !== 404 && e?.status !== 403 ? <Btn kind="sec" size="sm" icon="refresh" onClick={onRetry}>Try again</Btn> : undefined}>
      {e?.message ?? 'Something went wrong.'}
    </EmptyState>
  );
}

/** Heading block of a page: optional pre-line, title, subline and actions (prototype wh1). */
export function PageHead({ title, sub, actions, pre }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; pre?: ReactNode }) {
  return (
    <div className="w-h1">
      <div style={{ minWidth: 0 }}>
        {pre && <div className="pre-h">{pre}</div>}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}

/** Joins inline parts with " · ", skipping empties. */
export function Dots({ children }: { children: ReactNode }) {
  const parts = Children.toArray(children).filter(c => c !== '' && c != null);
  return <>{parts.map((p, i) => <span key={i}>{i > 0 && ' · '}{p}</span>)}</>;
}

/** A table with the prototype's .tbl look; rows are passed as children. */
export function Tbl({ heads, children, maxHeight, label, className }: { heads: Array<[ReactNode, string?, string?]>; children: ReactNode; maxHeight?: number; label?: string; className?: string }) {
  return (
    <div className="tbl-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className={cx('tbl', className)} aria-label={label}>
        <thead><tr>{heads.map((h, i) => <th key={i} scope="col" className={h[1]} style={h[2] ? { width: h[2] } : undefined}>{h[0]}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
