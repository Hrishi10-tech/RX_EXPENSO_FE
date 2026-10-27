/** NFR-06: the 30-minute idle rule, shortened here through the development override. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIdleSession } from './idle';

describe('useIdleSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem('expenso.idleMs', '9000');
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('expenso.idleMs');
  });

  it('warns a third of the way before the end, then ends the session once', () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleSession(true, onTimeout));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.remaining).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.remaining).toBe(3000);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.remaining).toBe(1000);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.remaining).toBeNull();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('keeps sliding while someone works', () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleSession(true, onTimeout));
    for (let i = 0; i < 6; i++) {
      act(() => { vi.advanceTimersByTime(4000); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); });
    }
    expect(onTimeout).not.toHaveBeenCalled();
    expect(result.current.remaining).toBeNull();
  });

  it('needs “Stay signed in” once the warning shows; a stray mouse move doesn’t count', () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleSession(true, onTimeout));
    act(() => { vi.advanceTimersByTime(7000); });
    expect(result.current.remaining).not.toBeNull();
    act(() => { window.dispatchEvent(new MouseEvent('mousemove')); vi.advanceTimersByTime(1000); });
    expect(result.current.remaining).not.toBeNull();
    act(() => { result.current.stay(); });
    expect(result.current.remaining).toBeNull();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('does nothing while signed out', () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleSession(false, onTimeout));
    act(() => { vi.advanceTimersByTime(20000); });
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
