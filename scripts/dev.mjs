#!/usr/bin/env node
/**
 * Zero-dependency dev runner: starts the API and the Vite client together,
 * prefixes their output, and shuts both down on Ctrl-C.
 * (Avoids adding `concurrently` for something this small, and works on Windows.)
 */
import { spawn } from 'node:child_process';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const COLORS = { server: '\x1b[36m', client: '\x1b[35m', reset: '\x1b[0m' };

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

function run(label, workspace) {
  const child = spawn(NPM, ['run', 'dev', '-w', workspace], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    shell: process.platform === 'win32',
  });
  const prefix = `${COLORS[label]}[${label}]${COLORS.reset} `;
  const pipe = (stream) => {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) process.stdout.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stdout.write(`${prefix}exited with code ${code}\n`);
      shutdown(code);
    }
  });
  children.push(child);
}

function shutdown(code = 0) {
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('server', '@mrd/server');
run('client', '@mrd/client');

process.stdout.write('\n  API    → http://localhost:3000/api/health\n  Client → http://localhost:5173\n\n');
