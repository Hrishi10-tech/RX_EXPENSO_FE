import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetBar, BudgetLine } from './BudgetPanel';
import { ClaimStatusPill } from './ui';
import type { BudgetView } from '../api/types';

const bar = () => screen.getByRole('progressbar');

describe('BudgetBar', () => {
  it('uses the shared (pool) tone below 80% and says the percentage', () => {
    render(<BudgetBar spent={1907000} allocated={5000000} kind="pool" />);
    expect(bar()).toHaveClass('bar', 'pool');
    expect(bar()).toHaveAttribute('aria-valuenow', '38');
    expect(bar()).toHaveAccessibleName('38% used');
  });

  it('uses the private tone for an individual budget', () => {
    render(<BudgetBar spent={950000} allocated={5000000} kind="priv" label="Divya’s budget 19% used" />);
    expect(bar()).toHaveClass('priv');
    expect(bar()).toHaveAccessibleName('Divya’s budget 19% used');
  });

  it('turns amber at 80%, stays amber when fully used, and red only once over (exact amounts, like the server)', () => {
    const { rerender } = render(<BudgetBar spent={3999999} allocated={5000000} kind="pool" />);
    expect(bar()).toHaveClass('pool');
    rerender(<BudgetBar spent={4000000} allocated={5000000} kind="pool" />);
    expect(bar()).toHaveClass('warn');
    rerender(<BudgetBar spent={5000000} allocated={5000000} kind="pool" />);
    expect(bar()).toHaveClass('warn');
    expect(bar()).toHaveAttribute('aria-valuenow', '100');
    rerender(<BudgetBar spent={5000001} allocated={5000000} kind="pool" />);
    expect(bar()).toHaveClass('bad');
  });

  it('floors the percentage, so 99.9% never reads as 100%', () => {
    render(<BudgetBar spent={4999500} allocated={5000000} kind="pool" />);
    expect(bar()).toHaveAttribute('aria-valuenow', '99');
    expect(bar()).toHaveClass('warn');
  });

  it('caps the fill at 100% but keeps the real figure for screen readers', () => {
    render(<BudgetBar spent={5600000} allocated={5000000} kind="pool" />);
    expect(bar()).toHaveClass('bad');
    expect(bar()).toHaveAttribute('aria-valuenow', '100');
    expect(bar()).toHaveAttribute('aria-valuetext', '112%');
    expect((bar().firstChild as HTMLElement).style.width).toBe('100%');
  });

  it('shows 0% when nothing is allocated', () => {
    render(<BudgetBar spent={100} allocated={0} kind="pool" />);
    expect(bar()).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('BudgetLine', () => {
  const b = (spent: number, alloc: number): BudgetView => ({ id: 'b', type: 'pool', allocatedPaise: alloc, spentPaise: spent, remainingPaise: alloc - spent, pct: Math.floor((spent * 100) / alloc), setAt: '2026-10-01T06:30:00Z', setBy: 'Meera', note: null } as unknown as BudgetView);

  it('says what is left', () => {
    render(<BudgetLine b={b(1907000, 5000000)} />);
    expect(screen.getByText('Spent ₹19,070 · 38%')).toBeInTheDocument();
    expect(screen.getByText('₹30,930 left')).toBeInTheDocument();
  });

  it('says how much it is over, in words as well as colour', () => {
    render(<BudgetLine b={b(5180000, 5000000)} />);
    expect(screen.getByText('Over by ₹1,800')).toBeInTheDocument();
  });

  it('says “Fully used” at exactly 100%', () => {
    render(<BudgetLine b={b(5000000, 5000000)} />);
    expect(screen.getByText('Fully used')).toBeInTheDocument();
    expect(screen.getByText('Spent ₹50,000 · 100%')).toBeInTheDocument();
  });
});

describe('ClaimStatusPill', () => {
  it.each([
    ['open', 'Open', 'line'],
    ['ready', 'Ready for verification', 'acc'],
    ['verified', 'Verified', 'ok'],
    ['part_paid', 'Part paid', 'info'],
    ['reimbursed', 'Reimbursed', 'ok'],
  ] as const)('shows %s as “%s” with an icon, never colour alone', (status, label, tone) => {
    const { container } = render(<ClaimStatusPill status={status} />);
    const pill = screen.getByText(label);
    expect(pill).toHaveClass('pill', tone);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows “No claim” when there is none', () => {
    render(<ClaimStatusPill status="none" />);
    expect(screen.getByText('No claim')).toHaveClass('faint');
  });
});
