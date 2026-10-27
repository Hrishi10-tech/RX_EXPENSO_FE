import { describe, expect, it } from 'vitest';
import type { AuditItem } from '../api/types';
import { auditCells } from './audit';

const base: AuditItem = { id: 1, at: '2026-10-02T08:35:12Z', actor: 'Meera Krishnan', actorId: 'u1', action: '', entity: '', entityId: null, tripId: 't1', tripRef: 'EXP-2026-00123', tripName: 'MedTech Expo', member: 'Arjun Mehta', before: null, after: null, meta: {} };

describe('audit log cells', () => {
  it('describes a query with its remark and source', () => {
    const c = auditCells({ ...base, action: 'expense.query', entity: 'expense', before: { verification: 'pending' }, after: { verification: 'query' }, meta: { client: 'web', remark: 'Please attach the itemised bill.' } });
    expect(c.before).toBe('To check');
    expect(c.after).toBe('Query · “Please attach the itemised bill.”');
    expect(c.source).toBe('Web');
    expect(c.item).toBe('Expense · Arjun Mehta');
  });

  it('shows the amount, budget and category of a new expense', () => {
    const c = auditCells({ ...base, actor: 'Arjun Mehta', action: 'expense.create', entity: 'expense', after: { description: 'Team lunch', amountPaise: 164000, budgetSource: 'pool', category: 'meals', paidBy: 'self' }, meta: { client: 'mobile' } });
    expect(c.item).toBe('Team lunch · Arjun Mehta');
    expect(c.after).toBe('₹1,640 · Trip pool · Meals');
    expect(c.source).toBe('Mobile');
  });

  it('marks individual budgets as private and shows old and new amounts', () => {
    const c = auditCells({ ...base, action: 'budget.change', entity: 'budget', before: { amountPaise: 5000000 }, after: { amountPaise: 6000000, note: null }, meta: { client: 'web' } });
    expect(c.private).toBe(true);
    expect(c.item).toBe('Individual · Arjun Mehta');
    expect(c.before).toBe('₹50,000');
    expect(c.after).toBe('₹60,000');
    const pool = auditCells({ ...base, member: '', action: 'budget.set', entity: 'budget', after: { amountPaise: 5000000, note: 'Expo' }, meta: { client: 'web' } });
    expect(pool.private).toBe(false);
    expect(pool.item).toBe('Trip pool');
    expect(pool.after).toBe('₹50,000 · “Expo”');
  });

  it('shows the device time of an offline start and the server as source of automatic ones', () => {
    const off = auditCells({ ...base, at: '2026-10-01T03:42:30Z', actor: 'Karthik Iyer', action: 'member.start', entity: 'member', after: { actualStart: '2026-10-01T03:00:00Z' }, meta: { client: 'mobile', offline: true, earlyMinutes: 0 } });
    expect(off.deviceTime).toBe('08:30:00');
    expect(off.after).toContain('Started 08:30:00');
    const auto = auditCells({ ...base, actorId: null, actor: 'Expenso server', action: 'member.auto_start', entity: 'member', after: { actualStart: '2026-10-01T03:30:00Z' }, meta: { client: 'system', method: 'automatic' } });
    expect(auto.source).toBe('Server');
    expect(auto.after).toBe('Started 09:00:00 · automatic');
    expect(auto.deviceTime).toBeNull();
  });

  it('names departments and owners through the lookup', () => {
    const c = auditCells({ ...base, action: 'user.department', entity: 'user', before: { name: 'Sneha Pillai', departmentId: 'd1' }, after: { name: 'Sneha Pillai', departmentId: 'd2' } },
      { dept: id => ({ d1: 'Sales', d2: 'Clinical Applications' } as Record<string, string>)[id] });
    expect(c.item).toBe('Sneha Pillai');
    expect(c.before).toBe('Sales');
    expect(c.after).toBe('Clinical Applications');
  });

  it('prefers the server’s item label and adds whose expense it is', () => {
    const c = auditCells({ ...base, action: 'expense.verify', entity: 'expense', item: 'Team lunch · ₹1,640', client: 'web', before: { verification: 'pending' }, after: { verification: 'verified', approvedPaise: null }, meta: {} });
    expect(c.item).toBe('Team lunch · ₹1,640 · Arjun');
    expect(c.source).toBe('Web');
    const u = auditCells({ ...base, action: 'user.deactivate', entity: 'user', member: '', item: 'Nikhil Verma', client: 'web', before: { active: true }, after: { active: false }, meta: { reason: 'Left the company on 30 Sep 2026', ownedLiveTrips: [] } });
    expect(u.item).toBe('Nikhil Verma');
    expect(u.after).toBe('Deactivated · “Left the company on 30 Sep 2026”');
  });

  it('describes hand-offs between finance users and disputes', () => {
    const h = auditCells({ ...base, actor: 'Vikram Rao', action: 'finance.handoff', entity: 'trip', tripName: 'Supplier audit · Visakhapatnam', member: '', meta: { client: 'web', toName: 'Meera Krishnan', topic: 'budgets', message: null } });
    expect(h.item).toBe('Supplier audit · Visakhapatnam');
    expect(h.after).toBe('Asked Meera Krishnan to set the budgets');
    const d = auditCells({ ...base, actor: 'Arjun Mehta', action: 'expense.dispute', entity: 'expense', item: 'Team lunch · ₹1,640', meta: { client: 'mobile', files: 0 } });
    expect(d.after).toBe('Wrote to finance about the decision');
    expect(d.source).toBe('Mobile');
  });

  it('quotes what finance wrote to the member', () => {
    const c = auditCells({ ...base, action: 'expense.message', entity: 'expense', item: 'Team lunch · ₹1,640', client: 'web', meta: { message: 'Lunch with the hospital team is fine; keep the bill.' } });
    expect(c.item).toBe('Team lunch · ₹1,640 · Arjun');
    expect(c.before).toBe('–');
    expect(c.after).toBe('Wrote to Arjun · “Lunch with the hospital team is fine; keep the bill.”');
    expect(c.source).toBe('Web');
  });
});
