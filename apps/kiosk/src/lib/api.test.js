// api.js unit tests — Sprint MES-3-V2 KIOSK-004.
// Covers: newIdemKey shape, request URL building, idempotency-key
// header propagation, JWT rotation, RFC-7807 envelope parsing,
// network-error path, 401 session-clear recovery.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as api from './api.js';
import * as session from './session.js';

beforeEach(() => {
  // Default — every test sets up its own behaviour.
  globalThis.fetch = vi.fn();
  // Seed a kiosk session so the Authorization header gets attached.
  session.save({
    machine_code: 'M-01',
    session_jwt: 'jwt-abc',
    expires_at_utc: new Date(Date.now() + 3600_000).toISOString(),
  });
});

function makeFetchOk(body, headers = {}) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json', ...headers }),
    text: async () => JSON.stringify(body),
  }));
}
function makeFetchErr(status, body, headers = {}) {
  return vi.fn(async () => ({
    ok: false,
    status,
    headers: new Headers({ 'Content-Type': 'application/problem+json', ...headers }),
    text: async () => JSON.stringify(body),
  }));
}

describe('newIdemKey', () => {
  test('returns a non-empty string', () => {
    const k = api.newIdemKey();
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(8);
  });
  test('two calls produce different keys', () => {
    const a = api.newIdemKey();
    const b = api.newIdemKey();
    expect(a).not.toBe(b);
  });
});

describe('getDispatch', () => {
  test('hits /v2/operations/dispatch with the machine_code query', async () => {
    globalThis.fetch = makeFetchOk({ items: [{ id: 1 }] });
    const r = await api.getDispatch('M-01');
    expect(r.ok).toBe(true);
    expect(r.body.items).toHaveLength(1);
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/api/planning/v2/operations/dispatch?machine_code=M-01');
  });

  test('attaches Bearer token from session', async () => {
    globalThis.fetch = makeFetchOk({ items: [] });
    await api.getDispatch('M-01');
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer jwt-abc');
  });
});

describe('getReasonCodes', () => {
  test('returns body.items on success', async () => {
    globalThis.fetch = makeFetchOk({
      items: [{ code: 'MACHINE_DOWN', label_en: 'Machine down', label_vn: 'Máy hỏng' }],
    });
    const r = await api.getReasonCodes();
    expect(r.ok).toBe(true);
    expect(r.body.items[0].code).toBe('MACHINE_DOWN');
  });
});

describe('postPause', () => {
  test('sends Idempotency-Key header + reason_code in body', async () => {
    globalThis.fetch = makeFetchOk({ ok: true });
    await api.postPause(42, 'MACHINE_DOWN', 'idem-1');
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/v2/operations/42/pause');
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe('idem-1');
    expect(JSON.parse(init.body).reason_code).toBe('MACHINE_DOWN');
  });
});

describe('JWT rotation via X-Kiosk-Session-Refresh', () => {
  test('on 200, refreshes session_jwt when header present', async () => {
    globalThis.fetch = makeFetchOk({}, { 'X-Kiosk-Session-Refresh': 'jwt-NEW' });
    await api.getDispatch('M-01');
    const sess = session.load();
    expect(sess.session_jwt).toBe('jwt-NEW');
  });

  test('no rotation when header absent', async () => {
    globalThis.fetch = makeFetchOk({});
    await api.getDispatch('M-01');
    const sess = session.load();
    expect(sess.session_jwt).toBe('jwt-abc');
  });
});

describe('RFC-7807 error envelope parsing', () => {
  test('non-2xx returns { ok:false, status, problem }', async () => {
    globalThis.fetch = makeFetchErr(409, {
      type: 'urn:ops:op-invalid-transition',
      status: 409,
      from: 'PENDING',
      allowed_from: ['DISPATCHED'],
    });
    const r = await api.postStart(7, 'idem-x');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.problem.type).toBe('urn:ops:op-invalid-transition');
    expect(r.problem.allowed_from).toEqual(['DISPATCHED']);
  });

  test('non-JSON body lands in problem.detail with type=urn:ops:unknown', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 502,
      headers: new Headers(),
      text: async () => '<html>bad gateway</html>',
    }));
    const r = await api.postStart(7, 'idem-x');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
    expect(r.problem.type).toBe('urn:ops:unknown');
    expect(r.problem.detail).toContain('bad gateway');
  });
});

describe('network error', () => {
  test('returns { ok:false, networkError:true } when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network fail');
    });
    const r = await api.getDispatch('M-01');
    expect(r.ok).toBe(false);
    expect(r.networkError).toBe(true);
    expect(r.error).toBe('network fail');
  });
});

describe('401 stale-session recovery', () => {
  test('clears session when problem.type === kiosk-session-invalid', async () => {
    globalThis.fetch = makeFetchErr(401, { type: 'urn:ops:kiosk-session-invalid', status: 401 });
    // jsdom's window.location is non-configurable; use vi.stubGlobal to
    // swap the whole object with a minimal stub for this test only.
    const replaceSpy = vi.fn();
    vi.stubGlobal('window', {
      ...window,
      location: { pathname: '/', replace: replaceSpy },
    });
    await api.postStart(7, 'idem-x');
    expect(session.load()).toBeNull();
    expect(replaceSpy).toHaveBeenCalledWith('/kiosk/pair');
    vi.unstubAllGlobals();
  });

  test('non-stale 401 (different `type`) does NOT clear the session', async () => {
    globalThis.fetch = makeFetchErr(401, { type: 'urn:ops:something-else', status: 401 });
    await api.postStart(7, 'idem-x');
    const sess = session.load();
    expect(sess?.session_jwt).toBe('jwt-abc');
  });
});
