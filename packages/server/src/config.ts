import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export interface UpstreamConfig {
  /** Floor latency of every simulated upstream call. */
  baseLatencyMs: number;
  /** Uniform jitter added on top of the floor. */
  jitterMs: number;
  /** Probability [0..1] that a call takes the slow path instead. */
  slowRate: number;
  slowLatencyMs: number;
  /** Probability [0..1] that a call throws. */
  failureRate: number;
  /** Fixed seed makes failures/latency reproducible; 0 = use Math.random. */
  seed: number;
}

export interface ResilienceConfig {
  timeoutMs: number;
  /** Additional attempts after the first one. */
  retries: number;
  retryBackoffMs: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  breakerThreshold: number;
  breakerResetMs: number;
  /**
   * Largest result set we are willing to enrich in full so that a live-value
   * sort (price / delivery) is correct. Above this we fall back to catalog
   * values and flag `meta.enrichment.sortDegraded`.
   */
  enrichSortLimit: number;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  catalogPath: string;
  /** Built client to serve in production; undefined disables static serving. */
  staticDir: string | undefined;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  upstream: UpstreamConfig;
  resilience: ResilienceConfig;
}

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${key}: "${raw}"`);
  }
  return parsed;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  const level = (env['LOG_LEVEL'] ?? (nodeEnv === 'test' ? 'silent' : 'info')) as AppConfig['logLevel'];

  return {
    port: num(env, 'PORT', 3000),
    nodeEnv,
    catalogPath: env['CATALOG_PATH'] ?? resolve(here, 'data/catalog.json'),
    staticDir: env['STATIC_DIR'] ?? (nodeEnv === 'production' ? resolve(here, '../../client/dist') : undefined),
    logLevel: level,
    upstream: {
      baseLatencyMs: num(env, 'UPSTREAM_BASE_LATENCY_MS', 90),
      jitterMs: num(env, 'UPSTREAM_JITTER_MS', 140),
      slowRate: num(env, 'UPSTREAM_SLOW_RATE', 0.12),
      slowLatencyMs: num(env, 'UPSTREAM_SLOW_LATENCY_MS', 1200),
      failureRate: num(env, 'UPSTREAM_FAILURE_RATE', 0.15),
      seed: num(env, 'UPSTREAM_SEED', 0),
    },
    resilience: {
      timeoutMs: num(env, 'UPSTREAM_TIMEOUT_MS', 700),
      retries: num(env, 'UPSTREAM_RETRIES', 1),
      retryBackoffMs: num(env, 'UPSTREAM_RETRY_BACKOFF_MS', 60),
      cacheTtlMs: num(env, 'ENRICHMENT_CACHE_TTL_MS', 20_000),
      cacheMaxEntries: num(env, 'ENRICHMENT_CACHE_MAX', 500),
      breakerThreshold: num(env, 'BREAKER_THRESHOLD', 4),
      breakerResetMs: num(env, 'BREAKER_RESET_MS', 8_000),
      enrichSortLimit: num(env, 'ENRICH_SORT_LIMIT', 48),
    },
  };
}
