import type { CircuitState, MetricsResponse } from '@mrd/shared';

const SAMPLE_LIMIT = 500;

class Samples {
  private readonly values: number[] = [];

  add(ms: number): void {
    this.values.push(ms);
    if (this.values.length > SAMPLE_LIMIT) this.values.shift();
  }

  percentile(p: number): number {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return Math.round(sorted[index] ?? 0);
  }

  get max(): number {
    return this.values.length === 0 ? 0 : Math.round(Math.max(...this.values));
  }

  get count(): number {
    return this.values.length;
  }
}

interface RouteStat {
  count: number;
  errors: number;
  samples: Samples;
}

/**
 * In-process counters and latency samples. Exposed at GET /api/metrics —
 * the "lightweight instrumentation" stretch goal, and the thing the UI's
 * metrics panel reads.
 */
export class MetricsRegistry {
  private readonly routes = new Map<string, RouteStat>();
  private readonly upstreamLatency = new Samples();
  private readonly startedAt = Date.now();

  upstreamCalls = 0;
  upstreamFailures = 0;
  upstreamTimeouts = 0;
  upstreamRetries = 0;
  cacheHits = 0;
  cacheMisses = 0;

  recordRequest(route: string, durationMs: number, isError: boolean): void {
    let stat = this.routes.get(route);
    if (stat === undefined) {
      stat = { count: 0, errors: 0, samples: new Samples() };
      this.routes.set(route, stat);
    }
    stat.count += 1;
    if (isError) stat.errors += 1;
    stat.samples.add(durationMs);
  }

  recordUpstream(durationMs: number, outcome: 'success' | 'failure' | 'timeout'): void {
    this.upstreamCalls += 1;
    this.upstreamLatency.add(durationMs);
    if (outcome === 'failure') this.upstreamFailures += 1;
    if (outcome === 'timeout') {
      this.upstreamFailures += 1;
      this.upstreamTimeouts += 1;
    }
  }

  recordRetry(): void {
    this.upstreamRetries += 1;
  }

  recordCache(hit: boolean): void {
    if (hit) this.cacheHits += 1;
    else this.cacheMisses += 1;
  }

  snapshot(circuitState: CircuitState, circuitOpenedCount: number): MetricsResponse {
    const requests: MetricsResponse['requests'] = {};
    for (const [route, stat] of this.routes) {
      requests[route] = {
        count: stat.count,
        errors: stat.errors,
        p50Ms: stat.samples.percentile(50),
        p95Ms: stat.samples.percentile(95),
        maxMs: stat.samples.max,
      };
    }
    const lookups = this.cacheHits + this.cacheMisses;
    return {
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      requests,
      upstream: {
        calls: this.upstreamCalls,
        failures: this.upstreamFailures,
        timeouts: this.upstreamTimeouts,
        retries: this.upstreamRetries,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        cacheHitRate: lookups === 0 ? 0 : Math.round((this.cacheHits / lookups) * 100) / 100,
        circuitState,
        circuitOpenedCount,
        p50Ms: this.upstreamLatency.percentile(50),
        p95Ms: this.upstreamLatency.percentile(95),
      },
    };
  }
}
