#!/usr/bin/env node
/**
 * Regenerates the four README screenshots from the running app.
 *
 * The point of scripting this rather than reaching for Cmd-Shift-4 is that the
 * interesting shots are the *degraded* ones, and those depend on upstream luck.
 * Pinning UPSTREAM_SEED makes them reproducible, so a rerun after a UI change
 * produces the same page in the same state and the diff is honest.
 *
 * Usage:
 *   npm run build          # the server serves the built client in production
 *   node scripts/screenshots.mjs
 *
 * Requires Playwright's chromium once:
 *   npm i -D playwright && npx playwright install chromium
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/screenshots');
const SERVER = resolve(ROOT, 'packages/server/dist/index.js');
const PORT = 3210;
const BASE = `http://localhost:${PORT}`;

/** Viewport wide enough for the three-column grid, 2x for a crisp retina PNG. */
const VIEWPORT = { width: 1280, height: 900 };

const SCENARIOS = [
  {
    file: '01-browse.png',
    // 15% failure rate with a pinned seed: most cards enrich, a couple degrade,
    // which is the state worth showing - the page stays useful either way.
    env: { UPSTREAM_FAILURE_RATE: '0.15', UPSTREAM_SEED: '7' },
    colorScheme: 'light',
    async act(page) {
      await page.waitForSelector('.card');
      await page.waitForTimeout(900); // let enrichment settle in
    },
  },
  {
    file: '02-typeahead.png',
    env: { UPSTREAM_FAILURE_RATE: '0.15', UPSTREAM_SEED: '7' },
    colorScheme: 'light',
    async act(page) {
      await page.waitForSelector('.card');
      await page.click('#search-input');
      // Typed, not filled: the debounce only fires on real input events.
      await page.type('#search-input', 'pi', { delay: 110 });
      await page.waitForSelector('#suggestion-list [role="option"]', { timeout: 5000 });
      await page.waitForTimeout(300);
    },
  },
  {
    file: '03-degraded.png',
    // Every upstream call fails. The API still answers 200 and every card
    // renders with its reason code - that is the whole thesis of the build.
    env: { UPSTREAM_FAILURE_RATE: '1', UPSTREAM_SEED: '3' },
    colorScheme: 'light',
    async act(page) {
      await page.waitForSelector('.card');
      await page.waitForTimeout(1200);
    },
  },
  {
    file: '04-dark.png',
    env: { UPSTREAM_FAILURE_RATE: '0.15', UPSTREAM_SEED: '7' },
    colorScheme: 'dark',
    async act(page) {
      await page.waitForSelector('.card');
      await page.waitForTimeout(900);
    },
  },
];

/** Poll /api/health rather than sleeping a guessed number of milliseconds. */
async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not come up on ${BASE}`);
}

function startServer(env) {
  const child = spawn(process.execPath, [SERVER], {
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), LOG_LEVEL: 'silent', ...env },
  });
  return child;
}

async function main() {
  if (!existsSync(SERVER)) {
    console.error('Build first:  npm run build');
    process.exit(1);
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright missing:  npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });

  for (const scenario of SCENARIOS) {
    const server = startServer(scenario.env);
    try {
      await waitForServer();
      const browser = await chromium.launch();
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        colorScheme: scenario.colorScheme,
        reducedMotion: 'reduce', // no half-finished transitions in the PNG
      });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await scenario.act(page);
      await page.screenshot({ path: resolve(OUT, scenario.file) });
      await browser.close();
      console.log(`captured  docs/screenshots/${scenario.file}`);
    } finally {
      server.kill();
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log('\nAll four screenshots regenerated.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
