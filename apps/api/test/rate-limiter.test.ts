import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter } from '../src/auth/rate-limiter.ts';
import { FakeClock } from './helpers.ts';

describe('SlidingWindowLimiter', () => {
  it('allows up to the limit, then reports how long to wait', () => {
    const clock = new FakeClock();
    const limiter = new SlidingWindowLimiter(3, 60_000, clock.nowMs);
    for (let i = 0; i < 3; i++) {
      expect(limiter.retryAfter('k')).toBe(0);
      limiter.recordFailure('k');
      clock.advance(1_000);
    }
    // Oldest attempt was 3s ago, so 57s remain in its window.
    expect(limiter.retryAfter('k')).toBe(57);
  });

  it('slides: old attempts stop counting once they leave the window', () => {
    const clock = new FakeClock();
    const limiter = new SlidingWindowLimiter(2, 10_000, clock.nowMs);
    limiter.recordFailure('k');
    clock.advance(6_000);
    limiter.recordFailure('k');
    expect(limiter.retryAfter('k')).toBeGreaterThan(0);
    clock.advance(4_001);
    expect(limiter.retryAfter('k')).toBe(0);
  });

  it('keeps keys independent and supports reset', () => {
    const limiter = new SlidingWindowLimiter(1, 10_000);
    limiter.recordFailure('a');
    expect(limiter.retryAfter('a')).toBeGreaterThan(0);
    expect(limiter.retryAfter('b')).toBe(0);
    limiter.reset('a');
    expect(limiter.retryAfter('a')).toBe(0);
  });

  it('sweep releases memory for keys whose attempts have expired', () => {
    const clock = new FakeClock();
    const limiter = new SlidingWindowLimiter(5, 1_000, clock.nowMs);
    for (let i = 0; i < 100; i++) limiter.recordFailure(`ip-${i}`);
    expect(limiter.size).toBe(100);
    clock.advance(1_001);
    limiter.sweep();
    expect(limiter.size).toBe(0);
  });
});
