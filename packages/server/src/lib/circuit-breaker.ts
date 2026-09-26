export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Three-state breaker.
 *
 *   closed     — calls pass through; N consecutive failures trip it
 *   open       — calls are rejected immediately for `resetMs`
 *   half_open  — one probe call is allowed; success closes, failure re-opens
 *
 * The point is not to retry harder during an outage, it is to stop paying the
 * timeout on every single request while the upstream is down.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private openedCountValue = 0;
  private probeInFlight = false;

  constructor(
    private readonly threshold: number,
    private readonly resetMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Call before attempting the protected operation. */
  canAttempt(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      if (this.now() - this.openedAt >= this.resetMs) {
        this.state = 'half_open';
        this.probeInFlight = false;
      } else {
        return false;
      }
    }

    // half_open: exactly one probe at a time.
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  onSuccess(): void {
    this.consecutiveFailures = 0;
    this.probeInFlight = false;
    this.state = 'closed';
  }

  onFailure(): void {
    this.probeInFlight = false;
    if (this.state === 'half_open') {
      this.trip();
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.threshold) this.trip();
  }

  private trip(): void {
    this.state = 'open';
    this.openedAt = this.now();
    this.openedCountValue += 1;
    this.consecutiveFailures = 0;
  }

  get currentState(): CircuitState {
    // Surface the half-open transition even if nothing has called canAttempt().
    if (this.state === 'open' && this.now() - this.openedAt >= this.resetMs) return 'half_open';
    return this.state;
  }

  get openedCount(): number {
    return this.openedCountValue;
  }

  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.probeInFlight = false;
  }
}
