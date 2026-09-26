// tsc does not copy non-TS assets; the catalog JSON has to land in dist/.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../src/data');
const to = resolve(here, '../dist/data');
mkdirSync(dirname(to), { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`[build] copied ${from} -> ${to}`);
