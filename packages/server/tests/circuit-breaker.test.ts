import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/lib/circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('stays closed while calls succeed', () => {
    const breaker = new CircuitBreaker(3, 1000);
    for (let i = 0; i < 10; i += 1) {
      expect(breaker.canAttempt()).toBe(true);
      breaker.onSuccess();
    }
    expect(breaker.currentState).toBe('closed');
  });

  it('opens after the configured number of consecutive failures', () => {
    let now = 0;
    const breaker = new CircuitBreaker(3, 1000, () => now);
    for (let i = 0; i < 3; i += 1) {
      breaker.canAttempt();
      breaker.onFailure();
    }
    expect(breaker.currentState).toBe('open');
    expect(breaker.canAttempt()).toBe(false);
    expect(breaker.openedCount).toBe(1);
  });

  it('resets its failure count on an intervening success', () => {
    const breaker = new CircuitBreaker(3, 1000);
    breaker.canAttempt(); breaker.onFailure();
    breaker.canAttempt(); breaker.onFailure();
    breaker.canAttempt(); breaker.onSuccess();
    breaker.canAttempt(); breaker.onFailure();
    expect(breaker.currentState).toBe('closed');
  });

  it('half-opens after the reset window and allows exactly one probe', () => {
    let now = 0;
    const breaker = new CircuitBreaker(2, 1000, () => now);
    breaker.canAttempt(); breaker.onFailure();
    breaker.canAttempt(); breaker.onFailure();
    expect(breaker.canAttempt()).toBe(false);

    now = 1000;
    expect(breaker.canAttempt()).toBe(true);   // the probe
    expect(breaker.canAttempt()).toBe(false);  // everything else waits
  });

  it('closes when the probe succeeds', () => {
    let now = 0;
    const breaker = new CircuitBreaker(2, 1000, () => now);
    breaker.canAttempt(); breaker.onFailure();
    breaker.canAttempt(); breaker.onFailure();
    now = 1000;
    breaker.canAttempt();
    breaker.onSuccess();
    expect(breaker.currentState).toBe('closed');
  });

  it('re-opens immediately when the probe fails', () => {
    let now = 0;
    const breaker = new CircuitBreaker(2, 1000, () => now);
    breaker.canAttempt(); breaker.onFailure();
    breaker.canAttempt(); breaker.onFailure();
    now = 1000;
    breaker.canAttempt();
    breaker.onFailure();
    expect(breaker.currentState).toBe('open');
    expect(breaker.openedCount).toBe(2);
  });
});
