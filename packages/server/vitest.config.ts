import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Deterministic upstream: no artificial latency, no random failures.
    // Individual tests opt back in by building an app with their own config.
    env: {
      NODE_ENV: 'test',
      UPSTREAM_FAILURE_RATE: '0',
      UPSTREAM_BASE_LATENCY_MS: '0',
      UPSTREAM_JITTER_MS: '0',
      UPSTREAM_SLOW_RATE: '0',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
