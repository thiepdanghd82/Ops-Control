// @ts-check
/**
 * Backup-schedule router contract tests.
 *
 * v1.3 O2 (closes ADR-0013 debt). Drives `createBackupRouter` through
 * stubbed deps so the schedule-update + run-now lifecycle is pinned
 * without booting a real `backupScheduler.js`.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBackupRouter } from './backup.js';

let scheduler;
let auditEvents;

beforeEach(() => {
  scheduler = {
    getStatus: () => ({ enabled: true, hour: 2, retentionDays: 30 }),
    setSchedule: (patch) => ({ ok: true, applied: patch }),
    runBackupCycle: async () => ({ ok: true, durationMs: 123 }),
  };
  auditEvents = [];
});

function buildApp() {
  const app = express();
  app.use(express.json());
  const stubAuth = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'unauth' });
    req.user = { user: { username: 'tester', role }, role };
    next();
  };
  const router = createBackupRouter({
    auth: stubAuth,
    isAdminPlus: (u) => ['admin', 'sys'].includes(u?.user?.role || u?.role),
    audit: (action, user, ip, detail) => auditEvents.push({ action, user, ip, detail }),
    clientIp: () => '127.0.0.1',
    writeRateLimit: (_req, _res, next) => next(),
    validateBody: () => (_req, _res, next) => next(), // identity validator for tests
    loadScheduler: async () => scheduler,
  });
  app.use('/api/basis/backup', router);
  return app;
}

async function request(app, opts) {
  const { method = 'GET', path, headers = {}, body } = opts;
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

describe('basis/backup router — ADR-0013 minimum coverage', () => {
  test('GET /schedule unauth → 401', async () => {
    const r = await request(buildApp(), { path: '/api/basis/backup/schedule' });
    assert.equal(r.status, 401);
  });

  test('GET /schedule non-admin → 403', async () => {
    const r = await request(buildApp(), {
      path: '/api/basis/backup/schedule',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 403);
  });

  test('GET /schedule admin → 200 with status', async () => {
    const r = await request(buildApp(), {
      path: '/api/basis/backup/schedule',
      headers: { 'x-test-role': 'admin' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status.enabled, true);
    assert.equal(r.body.status.hour, 2);
  });

  test('PUT /schedule admin → updates + audit row', async () => {
    const r = await request(buildApp(), {
      method: 'PUT',
      path: '/api/basis/backup/schedule',
      headers: { 'x-test-role': 'admin' },
      body: { enabled: false, hour: 3, retentionDays: 60 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.applied.hour, 3);
    assert.equal(auditEvents[0].action, 'BACKUP_SCHEDULE_UPDATE');
    assert.match(auditEvents[0].detail, /hour=3/);
  });

  test('POST /run-now sys → triggers cycle + audit row', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/basis/backup/run-now',
      headers: { 'x-test-role': 'sys' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.summary.durationMs, 123);
    assert.equal(auditEvents[0].action, 'BACKUP_RUN_NOW');
  });

  test('PUT /schedule scheduler throws → 400 (validation-style)', async () => {
    scheduler.setSchedule = () => {
      throw new Error('hour out of range');
    };
    const r = await request(buildApp(), {
      method: 'PUT',
      path: '/api/basis/backup/schedule',
      headers: { 'x-test-role': 'admin' },
      body: { hour: 99 },
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /hour out of range/);
  });

  test('POST /run-now non-admin → 403', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/basis/backup/run-now',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 403);
  });
});
