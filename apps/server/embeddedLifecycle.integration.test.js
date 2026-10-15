/**
 * The embedded server lives and dies with the desktop app (2026-10-15).
 *
 * The SERVER build spawns this file with an IPC channel. When the app goes
 * away without a clean SIGTERM (crash, force quit) the channel closes and
 * the server must stop instead of running on alone. And a normal SIGTERM
 * must not sit out the 15 s drain timeout because some connection never
 * finishes on its own (SSE streams, idle keep-alives of LAN clients).
 *
 * Spawns the real server entry point on a free port with a throwaway
 * DATA_DIR.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js');
const dirs = [];
const children = [];
// A server that fails to stop must not outlive the test run.
test.after(() => {
  for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL');
  dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
});

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function spawnServer({ users } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-lifecycle-it-'));
  dirs.push(dataDir);
  if (users) {
    const usersDir = path.join(dataDir, 'Library', 'Users');
    fs.mkdirSync(usersDir, { recursive: true });
    fs.writeFileSync(path.join(usersDir, 'users.json'), JSON.stringify(users));
  }
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      OPS_DB_PATH: path.join(dataDir, 'ops.db'),
      OPS_PORT: String(port),
      PORT: String(port),
      OPS_TOTP_KEY: crypto.randomBytes(32).toString('hex'),
      OPS_REQUIRE_2FA_ROLES: '',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (c) => (output += c));
  child.stderr.on('data', (c) => (output += c));
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );
  return { child, port, exited, log: () => output };
}

async function startServer(opts) {
  const s = await spawnServer(opts);
  const { child, port } = s;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return s;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill('SIGKILL');
  throw new Error(`server did not start:\n${s.log()}`);
}

async function within(p, ms, what) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('the server stops when the app that spawned it goes away', async () => {
  const s = await startServer();
  s.child.disconnect(); // what the OS does to the channel when the app dies
  const { code } = await within(s.exited, 10_000, 'still running');
  assert.equal(code, 0, s.log());
  assert.match(s.log(), /app exited received — graceful shutdown/);
});

test('shutdown does not wait out a connection that never finishes', async () => {
  const s = await startServer();
  // A request whose headers never complete keeps its socket busy, like a
  // live SSE stream does.
  const sock = net.connect(s.port, '127.0.0.1');
  sock.on('error', () => {});
  await new Promise((r) => sock.once('connect', r));
  sock.write('GET /api/health HTTP/1.1\r\nHost: x\r\n');
  const t0 = Date.now();
  s.child.kill('SIGTERM');
  const { code } = await within(s.exited, 10_000, 'still running');
  const took = Date.now() - t0;
  sock.destroy();
  assert.equal(code, 0, s.log());
  assert.ok(took < 8000, `shutdown took ${took} ms`);
  assert.match(s.log(), /HTTP server drained/);
});

test('the server stops even if the app vanished while it was still booting', async () => {
  const s = await spawnServer();
  s.child.disconnect(); // before the server has registered its listener
  const { code } = await within(s.exited, 15_000, 'still running');
  assert.equal(code, 0, s.log());
  assert.match(s.log(), /app exited received — graceful shutdown/);
});

test('a live SSE stream is ended at shutdown instead of holding it open', async () => {
  const password = 'Lifecycle-Pass-2026!';
  const { bcryptHash } = await import('./services/authService.js');
  const s = await startServer({
    users: [
      {
        id: 1,
        username: 'Administrator',
        role: 'sys',
        pwd_bcrypt: await bcryptHash(password),
        permissions: {},
      },
    ],
  });
  const base = `http://127.0.0.1:${s.port}`;
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Administrator', password }),
  }).then((r) => r.json());
  assert.ok(login.token, `login failed: ${JSON.stringify(login)}`);
  const stream = await fetch(`${base}/api/events/stream?t=${encodeURIComponent(login.token)}`);
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  await reader.read(); // the "ready" event: the stream is live
  const ended = (async () => {
    while (!(await reader.read()).done);
  })().catch(() => {});
  const t0 = Date.now();
  s.child.kill('SIGTERM');
  const { code } = await within(s.exited, 10_000, 'still running');
  const took = Date.now() - t0;
  await within(ended, 2_000, 'stream not ended');
  assert.equal(code, 0, s.log());
  assert.ok(took < 2500, `shutdown took ${took} ms with an SSE client connected`);
});
