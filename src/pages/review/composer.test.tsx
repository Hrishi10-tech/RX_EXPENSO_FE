/** W06: finance answers a member's question on an expense thread without changing the decision. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { api, queryClient } from '../../app/core';
import { keys } from '../../api/keys';
import type { ClaimReview, ReviewExpense } from '../../api/types';
import { ApiError } from '../../lib/api';
import { getDraft } from '../../lib/drafts';
import { ThreadComposer, composerHelp } from './ThreadComposer';

const me = { id: 'u-meera', name: 'Meera Krishnan' };
const expense = {
  id: 'e-stall', description: 'Expo stall supplies', amountPaise: 184000, approvedPaise: null, verification: 'rejected',
  thread: [{ id: 'm1', side: 'member', kind: 'dispute', body: 'These were for the stand; the receipt is attached.', authorName: 'Rohan Das', createdAt: '2026-09-23T06:00:00Z', attachments: [] }],
} as unknown as ReviewExpense;

function show(answering: boolean, e = expense) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ThreadComposer e={e} tripId="t-medtech" memberId="u-rohan" first="Rohan" me={me} answering={answering} />
    </QueryClientProvider>,
  );
}

afterEach(() => { vi.restoreAllMocks(); queryClient.clear(); localStorage.clear(); });

describe('composerHelp', () => {
  it('says what stays as it is', () => {
    expect(composerHelp({ verification: 'rejected', approvedPaise: null, amountPaise: 100 }, 'Rohan')).toContain('stays rejected unless you verify it');
    expect(composerHelp({ verification: 'verified', approvedPaise: 150000, amountPaise: 184000 }, 'Rohan')).toContain('stays approved at ₹1,500');
    expect(composerHelp({ verification: 'query', approvedPaise: null, amountPaise: 100 }, 'Rohan')).toContain('The query stays open');
    expect(composerHelp({ verification: 'pending', approvedPaise: null, amountPaise: 100 }, 'Rohan')).toContain('use Query');
  });
});

describe('ThreadComposer', () => {
  it('opens for an answer, sends it, and shows it in the thread at once', async () => {
    const u = userEvent.setup();
    queryClient.setQueryData<ClaimReview>(keys.claim('t-medtech', 'u-rohan'), { expenses: [expense] } as unknown as ClaimReview);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'm2', body: 'Stand material is on the company account.', createdAt: '2026-09-23T07:00:00Z' });
    show(true);
    const box = screen.getByLabelText('Answer Rohan');
    await u.type(box, 'Stand material is on the company account.');
    expect(getDraft(me.id, 'msg:e-stall')).toBe('Stand material is on the company account.');
    await u.click(screen.getByRole('button', { name: /Send answer/ }));
    expect(post).toHaveBeenCalledWith('/finance/expenses/e-stall/messages', { body: 'Stand material is on the company account.' });
    expect(await screen.findByRole('button', { name: 'Write to Rohan' })).toBeInTheDocument();
    const thread = queryClient.getQueryData<ClaimReview>(keys.claim('t-medtech', 'u-rohan'))!.expenses[0].thread;
    expect(thread.at(-1)).toMatchObject({ id: 'm2', side: 'finance', kind: 'note', authorName: 'Meera Krishnan' });
    expect(getDraft(me.id, 'msg:e-stall')).toBe('');
  });

  it('starts closed on other expenses and keeps the text when the server refuses', async () => {
    const u = userEvent.setup();
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(403, 'own_claim', 'This is your own claim. Another finance user must answer it.'));
    show(false, { ...expense, verification: 'pending', thread: [] } as unknown as ReviewExpense);
    await u.click(screen.getByRole('button', { name: 'Write to Rohan' }));
    await u.click(screen.getByRole('button', { name: /^Send/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write the message first.');
    await u.type(screen.getByLabelText('Write to Rohan'), 'Please keep the parking stubs next time.');
    await u.click(screen.getByRole('button', { name: /^Send/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another finance user must answer it.');
    expect(screen.getByLabelText('Write to Rohan')).toHaveValue('Please keep the parking stubs next time.');
  });
});
