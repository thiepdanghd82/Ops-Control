/**
 * netProbe — Phase A.3a server reachability probe.
 *
 * Pure async function (no Electron, no IPC), so it can be unit-tested
 * with node --test against a localhost http server. Mirrors the
 * implementation that previously lived inline inside the
 * 'ops:setup.testServer' handler in setupWizard.js — extracted so
 * both the setup wizard AND ModeSection's "Test Connection" button
 * can route through the same probe via IPC.
 *
 * Returns { ok, version?, ms?, error? } — never throws.
 *
 * Path semantics: `new URL('/health', url)` replaces the path of
 * `url` entirely (per WHATWG URL with leading-slash relative refs),
 * so any user-entered base path is ignored. Intentional — /health is
 * a fixed server endpoint, not configurable.
 */

'use strict';

const TIMEOUT_MS = 4000;

async function probeServer(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, error: 'url is required' };
  }
  let target;
  try {
    target = new URL('/health', url);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const http = target.protocol === 'https:' ? require('node:https') : require('node:http');
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.get(target, { timeout: TIMEOUT_MS }, (r) => {
      let body = '';
      r.on('data', (d) => (body += d));
      r.on('end', () => {
        const ms = Date.now() - start;
        let parsed = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          /* health body may be empty / non-JSON — ignore */
        }
        resolve({
          ok: r.statusCode === 200,
          version: parsed && parsed.version,
          ms,
        });
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

module.exports = { probeServer, TIMEOUT_MS };
