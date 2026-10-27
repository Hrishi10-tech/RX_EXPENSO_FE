/**
 * Budgets panel (prototype budPanel): the shared trip pool and every private individual budget, with the
 * percentage always written beside the bar (never colour alone, NFR-09), unbudgeted and company-paid totals.
 */
import type { ReactNode } from 'react';
import type { BudgetView, IndividualBudget } from '../api/types';
import { Icon } from './Icon';
import { Banner, Bar, Btn, Kvs, Pill } from './ui';
import { budgetPct, budgetState, firstName, fmtDayTimeComma, inr, joinNames } from '../lib/format';

/** One budget's bar: amber from 80% used, red once over; shared (pool) or private (individual) tone below 80%. */
export function BudgetBar({ spent, allocated, kind, label }: { spent: number; allocated: number; kind: 'pool' | 'priv'; label?: string }) {
  const p = budgetPct(spent, allocated);
  const s = budgetState(spent, allocated);
  return <Bar pct={p} tone={s === 'over' ? 'bad' : s === 'warn' ? 'warn' : kind} label={label ?? `${p}% used`} />;
}

/** "Spent ₹19,070 · 38%" and "₹30,930 left" or "Over by ₹1,800" in red. */
export function BudgetLine({ b }: { b: BudgetView }) {
  const over = b.spentPaise > b.allocatedPaise;
  const full = !over && b.allocatedPaise > 0 && b.spentPaise === b.allocatedPaise;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-2)', gap: 10 }}>
      <span>Spent {inr(b.spentPaise)} · {b.pct}%</span>
      <b style={{ color: over ? 'var(--bad)' : full ? 'var(--warn)' : 'var(--ink)' }}>{over ? `Over by ${inr(b.spentPaise - b.allocatedPaise)}` : full ? 'Fully used' : `${inr(b.remainingPaise)} left`}</b>
    </div>
  );
}

export function BudgetPanel({ pool, individuals, poolOnly, unbudgeted, unbudgetedNote, companyPaise, onRemoveIndividual, footer }: {
  pool: BudgetView | null;
  individuals: IndividualBudget[];
  /** Members holding only the pool, for the "… hold only the trip pool" note. */
  poolOnly: string[];
  unbudgeted: number;
  unbudgetedNote?: string;
  companyPaise: number;
  onRemoveIndividual?: (b: IndividualBudget) => void;
  footer?: ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {pool ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="users" size={16} /><b>Trip pool</b><Pill tone="pool">Shared</Pill>
            <span className="budget-amt" style={{ marginLeft: 'auto' }}>{inr(pool.allocatedPaise)}</span>
          </div>
          <BudgetBar spent={pool.spentPaise} allocated={pool.allocatedPaise} kind="pool" label={`Trip pool ${pool.pct}% used`} />
          <BudgetLine b={pool} />
          <div className="sm-note">Set on {fmtDayTimeComma(pool.setAt)} · every member sees it live</div>
        </div>
      ) : (
        <Banner tone="neutral" icon="wallet" title="No trip pool">Expenses are logged without a limit and paid on verified actuals.</Banner>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        <div className="sm-note" style={{ fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', fontSize: 11 }}>Individual budgets</div>
        {individuals.length === 0 && <span className="sm-note">None set</span>}
        {individuals.map(b => (
          <div key={b.id} style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 12, background: 'var(--priv-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="lock" size={14} /><b>{b.memberName}</b><span className="sm-note">private</span>
              <span className="budget-amt" style={{ marginLeft: 'auto' }}>{inr(b.allocatedPaise)}</span>
            </div>
            <BudgetBar spent={b.spentPaise} allocated={b.allocatedPaise} kind="priv" label={`${b.memberName}’s individual budget ${b.pct}% used`} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-2)', gap: 8, alignItems: 'center' }}>
              <span>Spent {inr(b.spentPaise)} · {b.pct}%{b.spentPaise > b.allocatedPaise && <b style={{ color: 'var(--bad)' }}> · over by {inr(b.spentPaise - b.allocatedPaise)}</b>}</span>
              <span>Only {firstName(b.memberName)} and finance see this</span>
            </div>
            {onRemoveIndividual && <div><Btn kind="ghost" size="xs" icon="trash" onClick={() => onRemoveIndividual(b)}>{`Remove ${firstName(b.memberName)}’s budget…`}</Btn></div>}
          </div>
        ))}
        {pool && poolOnly.length > 0 && individuals.length > 0 && <span className="sm-note">{joinNames(poolOnly.map(firstName))} hold{poolOnly.length === 1 ? 's' : ''} only the trip pool.</span>}
      </div>
      <Kvs pairs={[
        ['Unbudgeted', <span className="money" key="u">{inr(unbudgeted)}{unbudgetedNote ? <span className="sm-note" style={{ fontFamily: 'var(--f-body)' }}> · {unbudgetedNote}</span> : null}</span>],
        ['Company-paid, draws no budget', <span className="money" key="c">{inr(companyPaise)}</span>],
      ]} />
      {footer}
    </div>
  );
}
