import express from 'express';
import cors from 'cors';
import compression from 'compression';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { describeEnvSources } from './utils/envSources.js';
import { resolveUpdatesDir } from './utils/updatesDir.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Snapshot OS env BEFORE dotenv merges .env so we can report
// per-variable provenance at boot (Sprint S-P0-FIX-7, Step B).
const _envSnapshotBeforeDotenv = new Set(Object.keys(process.env));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TRACKED_ENV = [
  'NODE_ENV',
  'OPS_PORT',
  'PORT',
  'DATA_DIR',
  'OPS_CORS_ORIGINS',
  'OPS_TOTP_KEY',
  'OPS_KIOSK_KEY',
  'OPS_ALLOW_SAME_ORIGIN',
];
if (process.env.NODE_ENV !== 'test') {
  console.log('🌱 [env] resolved sources:');
  for (const line of describeEnvSources(_envSnapshotBeforeDotenv, TRACKED_ENV)) {
    console.log(line);
  }
}

// ─── Process-level safety net (Phase 10H) ───
// An uncaughtException or unhandledRejection in a route handler can
// leave the event loop in an undefined state — best practice is to
// log the error + exit non-zero so the supervisor (systemd/PM2)
// restarts a fresh process. In production the graceful shutdown
// handler below fires first; in dev we just exit hard.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[fatal] unhandledRejection:', reason);
  console.error('  at:', promise);
  // Don't exit immediately — give in-flight responses 2s to drain.
  setTimeout(() => process.exit(1), 2000).unref();
});
process.on('uncaughtException', (err, origin) => {
  console.error(`[fatal] uncaughtException (origin: ${origin}):`, err);
  setTimeout(() => process.exit(1), 2000).unref();
});

const app = express();
const PORT = process.env.OPS_PORT || process.env.PORT || 3000;

// ─── Production-mode preflight (Phase 10H hardening) ───
// In production we enforce that operators have set the secrets that
// otherwise silently fall back to weaker defaults. Failing loud here
// beats discovering degraded security in an incident post-mortem.
if (process.env.NODE_ENV === 'production') {
  const missing = [];
  const HEX64 = /^[0-9a-fA-F]{64}$/;
  const genHint = `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")`;
  if (!process.env.OPS_TOTP_KEY || process.env.OPS_TOTP_KEY.length !== 64) {
    missing.push('OPS_TOTP_KEY (64-char hex; generate with: ' + genHint);
  }
  // Parity with scripts/preflight-env.js (the deploy gate): boot also
  // refuses to start without the kiosk JWT key + the export-HMAC key.
  // Pre-fix, a `npm start` that skipped preflight would boot with these
  // unset and only fail at runtime — kiosk pairing broke and quote xlsx
  // export threw 500 on first use. Same 64-hex shape + preservation
  // semantics; deploy.sh / deploy.ps1 carry all three across releases.
  if (!process.env.OPS_KIOSK_KEY || process.env.OPS_KIOSK_KEY.length !== 64) {
    missing.push('OPS_KIOSK_KEY (64-char hex; generate with: ' + genHint);
  }
  if (!process.env.OPS_EXPORT_HMAC_KEY || !HEX64.test(process.env.OPS_EXPORT_HMAC_KEY)) {
    missing.push('OPS_EXPORT_HMAC_KEY (64-char hex; generate with: ' + genHint);
  }
  // CORS: empty is OK only if the client + API are same-origin. If
  // operators explicitly set OPS_ALLOW_SAME_ORIGIN=1 we accept that.
  const corsSet = (process.env.OPS_CORS_ORIGINS || '').trim();
  if (!corsSet && process.env.OPS_ALLOW_SAME_ORIGIN !== '1') {
    missing.push(
      'OPS_CORS_ORIGINS (comma-separated origins) or explicit ' +
        'OPS_ALLOW_SAME_ORIGIN=1 to acknowledge same-origin deploy'
    );
  }
  if (missing.length > 0) {
    console.error('\n❌  Ops Control refuses to start in production:');
    for (const m of missing) console.error('    • ' + m);
    console.error('\n    See .env.example for defaults.\n');
    process.exit(1);
  }
  console.log('✅  production preflight passed: TOTP/KIOSK/HMAC keys set, CORS configured');
}

// Trust the first reverse-proxy hop (nginx, ALB, Cloudflare). Express
// then populates req.ip from X-Forwarded-For when the hop is trusted,
// and rateLimit.js reads req.ip rather than the raw header — stopping
// direct-to-app clients from spoofing IPs to bypass per-IP counters.
// If the deployment has more than one proxy hop, raise this count or
// switch to an explicit subnet allowlist.
app.set('trust proxy', 1);

// ─── Resolve DATA_DIR ───
let DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
// Support relative paths
if (!path.isAbsolute(DATA_DIR)) {
  DATA_DIR = path.resolve(path.join(__dirname, '..'), DATA_DIR);
}

// ─── Initialize complete DB schema (F-BOOT-2 fix) ───
// Without this, audit_log + other tables are only created lazily when
// quoteVersions.js / shadowWrite.js first touch the DB. Until then,
// every audit write silently no-ops because auditStore.js catches the
// "no such table: audit_log" error and falls through. The TOTP boot
// probe + auth service below could fire before that lazy init runs,
// losing forensic trail. initSchema() is idempotent (CREATE TABLE
// IF NOT EXISTS for everything in schema.sql), so calling it eagerly
// here is safe regardless of DB state.
import { initSchema } from './db/init.js';
initSchema();

// ─── Initialize auth service ───
import {
  init as initAuth,
  getSessionUser,
  getTokenFromHeader,
  loadTotpSecrets,
  isTotpSecretsUnavailable,
  getTotpKeyFingerprint,
} from './services/authService.js';
initAuth(DATA_DIR);

// ─── Startup TOTP health probe ───
// Try a dry-run decrypt at boot so an OPS_TOTP_KEY mismatch surfaces
// IMMEDIATELY in the startup log rather than silently at the first user
// login (where it becomes a production outage — Sprint 40 fail-CLOSED).
try {
  const fpHex = getTotpKeyFingerprint();
  const probe = loadTotpSecrets();
  if (isTotpSecretsUnavailable(probe)) {
    console.error(
      `  🚨  TOTP BOOT PROBE FAILED — 2FA wall is active. Resolve before users log in.`
    );
    console.error(`       Key fingerprint now:   ${fpHex || '(no key configured)'}`);
    console.error(`       Expected recovery:     (a) restore the .env with the old OPS_TOTP_KEY`);
    console.error(
      `                              (b) npm run reset-totp   (wipes file, all users re-enroll)`
    );
  } else {
    const users = Object.keys(probe).length;
    console.log(
      `  🔐  TOTP boot probe OK — ${users} user(s) enrolled, key fp ${fpHex?.slice(0, 16) || 'n/a'}…`
    );
  }
} catch (e) {
  console.error(`  ⚠️   TOTP boot probe threw: ${e.message}`);
}

// ─── Middleware ───
// CORS: default closed in production, permissive for dev. Override via
// OPS_CORS_ORIGINS="https://foo,https://bar" comma-separated allowlist.
// Empty env var = same-origin only (recommended for single-box deploy).
const corsAllowlist = (process.env.OPS_CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (corsAllowlist.length > 0) {
  app.use(
    cors({
      origin: (origin, cb) => {
        // Same-origin (no Origin header) or allowlisted
        if (!origin) return cb(null, true);
        if (corsAllowlist.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    })
  );
} else if (process.env.NODE_ENV !== 'production') {
  // Dev convenience — Vite on :5174/:5175 needs to hit :3000 API.
  // Phase 9H — credentials:true + reflect-origin so the new cookie
  // auth flow works across the dev proxy. Default cors() with
  // wildcard * would reject credentialed requests per spec.
  app.use(
    cors({
      origin: (origin, cb) => cb(null, origin || true),
      credentials: true,
    })
  );
} // production + empty allowlist → CORS disabled (same-origin only)

// Request ID middleware — every request gets an ID so logs can be correlated.
// Passed through X-Request-Id header if client sent one, else generated.
app.use((req, res, next) => {
  req.id =
    (req.headers['x-request-id'] || '').toString().slice(0, 64) ||
    crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Security headers — conservative defaults. We don't ship a CSP yet
// because Vite dev injects inline scripts and the production bundle
// uses a single JS chunk; adding CSP here without a nonce helper would
// break HMR. The headers below are safe on every request.
//   X-Content-Type-Options: nosniff  — stops MIME-sniffing attacks.
//   X-Frame-Options: SAMEORIGIN      — prevents cross-origin clickjacking.
//   Referrer-Policy                  — leaks only origin cross-site.
// Phase 9G.2 additions:
//   Strict-Transport-Security — forces HTTPS for 1 year + subdomains.
//       Only emitted when NODE_ENV=production; dev over http://localhost
//       would get locked into https:// and break.
//   Permissions-Policy — opt out of browser APIs we don't use. Reduces
//       attack surface from third-party scripts (if any ever load) +
//       limits browser fingerprinting vectors.
const IS_PROD = process.env.NODE_ENV === 'production';
// F-BOOT-4 (resurrects MES-3-FIX-14 from the v1.4.3 stash) — when the
// operator opts into a plain-HTTP same-origin deploy via
// OPS_ALLOW_SAME_ORIGIN=1, suppress HSTS and the CSP
// upgrade-insecure-requests directive. Otherwise WebKit / Chromium
// rewrite every JS module fetch to https://, the upgraded URLs 404
// against the http-only Express server, and the page renders blank.
// Caught during the v1.5.1 LAN smoke test on a Windows browser hitting
// http://10.102.3.61:3000.
const ALLOW_HTTP = process.env.OPS_ALLOW_SAME_ORIGIN === '1';
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), xr-spatial-tracking=()'
  );
  if (IS_PROD && !ALLOW_HTTP) {
    // 1 year, include all subdomains, eligible for HSTS preload.
    // Skipped under OPS_ALLOW_SAME_ORIGIN=1 — HSTS over plain HTTP would
    // pin the browser into HTTPS forever, breaking the next dev visit.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  if (IS_PROD) {
    // Phase 9G.9 — Content-Security-Policy in production ONLY. Dev mode
    // skips CSP because Vite injects inline scripts/styles for HMR
    // that a strict CSP would block. The production Vite build is a
    // single hashed JS + CSS chunk with no inline handlers — those hit
    // 'self' cleanly.
    //
    // Policy rationale (tightest that still works with the current bundle):
    //   default-src 'self'                — only same-origin by default
    //   script-src  'self'                — no inline, no eval, no external CDNs
    //   style-src   'self' 'unsafe-inline' — React inline style={{}} is
    //       used extensively (Dashboard, LibFinance banner, etc.).
    //   img-src     'self' data: blob:   — data: for EmptyState icons,
    //       blob: for PDF/image uploads in FileUploadZone previews.
    //   connect-src 'self'                — fetch/XHR same-origin only.
    //   font-src    'self' data:          — IBM Plex fonts are self-hosted.
    //   frame-ancestors 'none'            — stronger than X-Frame-Options.
    //   base-uri    'self'                — can't redirect base tag.
    //   form-action 'self'                — forms only POST to same origin.
    //   object-src  'none'                — no Flash/plugin embeds.
    //   upgrade-insecure-requests         — force any http:// asset to https.
    //                                       SUPPRESSED under ALLOW_HTTP so
    //                                       plain-HTTP same-origin deploys
    //                                       don't have their JS module
    //                                       imports rewritten to https.
    const cspParts = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ];
    if (!ALLOW_HTTP) cspParts.push('upgrade-insecure-requests');
    // Phase 9M.3 — violations POST to /api/csp-report.
    cspParts.push('report-uri /api/csp-report');
    res.setHeader('Content-Security-Policy', cspParts.join('; '));
    // Modern browsers prefer Report-To header + `report-to` directive
    // over deprecated `report-uri`. Both shipped for broadest coverage.
    res.setHeader(
      'Report-To',
      JSON.stringify({
        group: 'csp',
        max_age: 10886400,
        endpoints: [{ url: '/api/csp-report' }],
      })
    );
  }
  next();
});

// ─── HTTP compression (Sprint S-P0-FIX-2, 2026-05-03) ───
// Gzip-encodes responses ≥ 1024 B for compressible MIME types. Phase 3
// audit measured 419 KB initial JS + 102 KB CSS going over the wire raw
// — gzip cuts both ~70 % on the LAN deploy at http://10.102.3.61:3000
// (no reverse proxy currently in front of Express).
//
// SSE / streaming endpoints (`server/routes/events.js`,
// `server/routes/chat.js`) MUST be excluded — the middleware buffers
// until threshold and the SSE keepalive frames would never reach the
// client. The filter checks both the request `Accept` header (covers
// well-behaved EventSource clients) AND the response `Content-Type`
// (defensive — covers any future route that calls `res.type('text/
// event-stream')` instead of negotiating). The `x-no-compression`
// header is a debug bypass.
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers.accept === 'text/event-stream') return false;
      const ct = res.getHeader('Content-Type');
      if (ct && String(ct).includes('text/event-stream')) return false;
      if (req.headers['x-no-compression']) return false;
      // Phase A.4 — auto-update artifacts (/updates/*.exe, .dmg, .nupkg,
      // .yml manifests). Binary installers are already compressed by
      // electron-builder's NSIS/DMG packaging, so re-gzipping them just
      // burns CPU for no win. Manifests are tiny enough to leave raw.
      if (req.path.startsWith('/updates/')) return false;
      return compression.filter(req, res);
    },
    threshold: 1024,
    level: 6,
  })
);

// Lightweight request log — one JSON line per response. Not Pino-grade but
// zero-dependency and structured enough for grep/jq/CloudWatch ingestion.
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    // Skip the noisy static/asset paths (keep auth/api/data for audit)
    if (req.path.startsWith('/assets/')) return;
    const entry = {
      t: new Date().toISOString(),
      id: req.id,
      m: req.method,
      p: req.path,
      s: res.statusCode,
      ms: Date.now() - started,
    };
    console.log(JSON.stringify(entry));
  });
  next();
});

// Rate limit for bulk write ops — extracted to middleware/rateLimit.js.
import { writeRateLimit, saveRateLimit } from './middleware/rateLimit.js';

// ─── Health & readiness ───
// Enriched shape lets ops correlate incident timing with process state:
// a memory leak shows up as rss climbing between probes, and a rolling
// restart is visible as uptime_sec reset without downtime. All fields
// are non-PII, cheap to compute, and stable schema — safe to expose
// unauthenticated behind the reverse proxy.
import { readFileSync } from 'fs';
const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
})();
// Both `/health` (load-balancer convention) and `/api/health` (the
// desktop client probe path) share the same handler. The desktop
// app's NetworkMonitor calls /api/health every 30s; without the
// alias it would 404 and the offline banner would never clear.
app.get(['/health', '/api/health'], (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    uptime_sec: Math.floor(process.uptime()),
    version: PKG_VERSION,
    node: process.version,
    pid: process.pid,
    memory_mb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
  });
});

// /api/runtime-config — exposes server-side feature flags to the client
// (Sprint S-ALT-MAT, PR #A). Client fetches once at app boot, stashes in
// AppConfigContext, and gates UI affordances behind the appropriate flag.
// alt_materials: default ON post-hardware-test 2026-05-11 (MES-3-FIX-27
// closed). Operator can still emergency-disable via OPS_FEATURE_ALT_MATERIALS=0
// (or 'false'/'off'/'no'). Anything else, including absent env var, leaves
// the feature enabled.
// Feature flags — Kiosk + Planning ship HIDDEN by default (opt-in). They
// gate at the composition root (here + the mount/serve sites below), NOT
// inside mountPlanning, so the planning/kiosk test harnesses that call
// mountPlanning directly keep exercising the real routes. Enable with
// OPS_FEATURE_PLANNING / OPS_FEATURE_KIOSK = 1 | true | on | yes.
const featureOn = (v) => v === '1' || v === 'true' || v === 'on' || v === 'yes';
const FEATURE_PLANNING = featureOn(process.env.OPS_FEATURE_PLANNING);
const FEATURE_KIOSK = featureOn(process.env.OPS_FEATURE_KIOSK);

app.get('/api/runtime-config', (req, res) => {
  const falsy = (v) => v === '0' || v === 'false' || v === 'off' || v === 'no';
  res.set('Cache-Control', 'no-cache');
  res.json({
    ok: true,
    version: PKG_VERSION,
    features: {
      alt_materials: !falsy(process.env.OPS_FEATURE_ALT_MATERIALS),
      planning: FEATURE_PLANNING,
      kiosk: FEATURE_KIOSK,
    },
  });
});

// /api/version — version probe consumed by client <ClientUpdateIndicator>
// (P0 visibility-only nudge). Distinct from /health (which is the LB +
// network reachability probe) so callers don't have to parse the bigger
// payload. `min_supported_client` is informational at P0 — present so a
// P1 flip to enforce doesn't break the API contract.
//
// `released_at` = server boot time. Across version bumps this is the
// deploy timestamp; within a single version a restart will move it, but
// the banner compares `version` only, so the drift is irrelevant.
// `audit`, `getSessionUser`, `getTokenFromHeader` are already imported
// elsewhere in this module; ESM hoists all top-level imports before any
// statement runs, so the route mount below sees them at runtime.
import { createVersionHandler, createClientEventHandler } from './routes/clientVersionRoutes.js';
const SERVER_BOOTED_AT = new Date().toISOString();
app.get(
  '/api/version',
  createVersionHandler({
    version: PKG_VERSION,
    minSupportedClient: '1.5.0',
    releasedAt: SERVER_BOOTED_AT,
  })
);
// POST /api/audit/client-event — allowlisted client-originated audit
// emission. The only place client code is permitted to write to the
// audit log. Allowlist + session + JSON.stringify(detail) enforced in
// createClientEventHandler. See server/routes/clientVersionRoutes.js
// for the security contract.
app.post(
  '/api/audit/client-event',
  createClientEventHandler({ audit, getSessionUser, getTokenFromHeader })
);

app.get('/ready', async (req, res) => {
  // Phase 10H deep probe: ready iff (a) data dir R+W, (b) SQLite
  // responds to SELECT 1, (c) the critical tables exist. A corrupt
  // or mid-migration DB used to return 200 OK from the shallow probe
  // and let the load balancer route traffic into a broken instance.
  try {
    fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
    const { getDb } = await import('./db/connection.js');
    const db = getDb();
    // Confirm the DB accepts queries. SELECT 1 is the cheapest
    // liveness check and catches "file exists but corrupt" (would
    // throw) as well as "connection lost" (would also throw).
    db.prepare('SELECT 1 AS ok').get();
    // Tables are created lazily on first real op, so we don't demand
    // their presence here — a clean first-boot ready state is OK.
    // The probe's contract: "the DB responds; app is safe to serve".
    return res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ─── Observability (Phase 9N.3) ───
//
// GET /metrics — Prometheus exposition format. Intended for an internal
// scraper; NOT exposed to the internet (private by convention, not by
// route-level auth — reverse proxy should allowlist the scrape source).
// When we move to a real Prometheus deployment, add an `if req.ip not
// in allowlist` gate here. For now, unauthenticated is consistent with
// /health + /ready.
//
// Exposes: deprecated_calls_total (9M.2), http_requests_total (below),
// http_request_duration_ms (histogram).
import { renderPrometheus, inc as incMetric, observeLatency } from './utils/metrics.js';
app.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(renderPrometheus());
});

// Instrument every request with a counter + latency observation. The
// existing JSON access log already captures this, but metrics shape
// it for alerts (`rate(http_requests_total{status=~"5.."}[5m]) > 0.1`)
// which jq over log files can't do.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    // Route template — avoid unbounded cardinality from /api/foo/123.
    // We use path buckets: /api/<first-2-segments>.
    const segs = req.path.split('/').filter(Boolean).slice(0, 2);
    const route = '/' + segs.join('/');
    const statusBand = `${Math.floor(res.statusCode / 100)}xx`;
    incMetric('http_requests_total', {
      method: req.method,
      route,
      status: statusBand,
    });
    observeLatency('http_request_duration_ms', ms, { route, method: req.method });
  });
  next();
});

// ─── CSP violation reporting (Phase 9M.3) ───
//
// POST /api/csp-report — browsers POST a JSON body when content-security-policy
// blocks a resource. We log the violation (no persistence) + bump a
// metric. Helps spot misconfigured inline handlers, rogue third-party
// CDN attempts, and (rarely) successful XSS attempts that hit the CSP
// wall. Intentionally UNAUTH'd: the browser sends these without cookies.
// Body is untrusted; we cap size + pluck just the fields we want.
app.post(
  '/api/csp-report',
  express.json({
    // CSP reports are always < 2 KB. Tight limit guards against abuse.
    type: ['application/csp-report', 'application/json', 'application/reports+json'],
    limit: '4kb',
  }),
  (req, res) => {
    try {
      const report = req.body?.['csp-report'] || req.body?.[0]?.body || req.body || {};
      const entry = {
        t: new Date().toISOString(),
        level: 'warn',
        msg: 'csp_violation',
        directive: String(report['violated-directive'] || report.effectiveDirective || '').slice(
          0,
          80
        ),
        blocked: String(report['blocked-uri'] || report.blockedURL || '').slice(0, 200),
        document: String(report['document-uri'] || report.documentURL || '').slice(0, 200),
        sample: String(report['script-sample'] || '').slice(0, 160),
      };
      console.warn(JSON.stringify(entry));
      incMetric('csp_violations_total', { directive: entry.directive || 'unknown' });
    } catch {
      /* malformed report — ignore */
    }
    res.status(204).end();
  }
);

// ─── Client error beacon (Sprint T) ──────────────────────────────────
// POST /api/telemetry/client-error — called by the ErrorBoundary when
// it catches a render crash. Intentionally UNAUTH'd + 204 response so
// `navigator.sendBeacon` (which can't read replies) still works and
// doesn't keep the page alive waiting for JSON. Body is untrusted,
// capped + scrubbed; we keep only the bucket dimensions the metrics
// store can summarize without leaking PII.
app.post('/api/telemetry/client-error', express.json({ limit: '4kb' }), (req, res) => {
  try {
    const b = req.body || {};
    // Clamp string fields so a malicious client can't push 1 MB of text
    // into our log file via a single beacon. Metric labels get an
    // aggressive cap because Prometheus cardinality explodes otherwise.
    const boundary = String(b.boundary || 'unknown').slice(0, 40);
    const message = String(b.message || '').slice(0, 200);
    const url = String(b.url || '').slice(0, 200);
    const entry = {
      t: new Date().toISOString(),
      level: 'warn',
      msg: 'client_error',
      req_id: req.id,
      boundary,
      message,
      url,
      // first 5 stack frames is enough to locate in source, much smaller
      // than a full stack, and bounded so a huge paste can't blow up logs
      stack: String(b.stack || '')
        .split('\n')
        .slice(0, 5)
        .join(' | ')
        .slice(0, 600),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 160),
    };
    console.warn(JSON.stringify(entry));
    incMetric('client_errors_total', { boundary });
  } catch {
    /* malformed beacon — ignore */
  }
  res.status(204).end();
});

// ─── Client web-vitals beacon (Sprint AW) ────────────────────────────
// POST /api/telemetry/web-vitals — called by the client once per page
// when PerformanceObserver emits an LCP / CLS / INP / FCP / TTFB mark.
// Values land in the same metrics store as HTTP latency so ops can
// see real user perf next to server-side numbers in AdminMetrics.
//
// 204 + sendBeacon contract mirrors /client-error — the browser fires
// this at tab-hide time and cannot read a response. Untrusted body:
// name whitelist enforced, numeric value clamped, optional route label
// (path template, NOT full URL) for per-route breakdowns.
const VITAL_NAMES = new Set(['LCP', 'CLS', 'INP', 'FCP', 'TTFB', 'FID']);
app.post('/api/telemetry/web-vitals', express.json({ limit: '2kb' }), (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '')
      .toUpperCase()
      .slice(0, 8);
    if (!VITAL_NAMES.has(name)) {
      res.status(204).end();
      return;
    }
    // CLS is a unitless ratio ~ [0, 1]; others are milliseconds.
    // Clamp to a sane ceiling so an outlier (or malicious) beacon
    // can't pollute the histogram tails. 60s covers the worst legit
    // LCP even on slow rural connections.
    const raw = Number(b.value);
    if (!Number.isFinite(raw) || raw < 0) {
      res.status(204).end();
      return;
    }
    const ms = name === 'CLS' ? Math.min(raw, 5) * 1000 : Math.min(raw, 60_000);
    const route = String(b.route || '/').slice(0, 80);
    observeLatency('web_vitals_ms', ms, { name, route });
    // Also log structured so grep "web_vitals" shows the raw stream
    // for ad-hoc investigation without scraping /metrics.
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        msg: 'web_vitals',
        req_id: req.id,
        name,
        route,
        value_ms: Math.round(ms),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 160),
      })
    );
  } catch {
    /* malformed — ignore */
  }
  res.status(204).end();
});

// ─── Routes ───
import costApiRouter from './routes/costApi.js';
// Legacy iframe route removed — all tabs now run natively in React
import planningRouter from './routes/planning.js';
import { mountPlanning } from '../domains/planning/server/index.js'; // v1.3 MES-1.4 — WO v2 routes
import sharedRouter from './routes/shared.js';
import importRouter from './routes/import.js';
import importWizardRouter from './routes/importWizard.js';
import chatRouter from './routes/chat.js';
import syncRouter from './routes/sync.js';
import eventsRouter from './routes/events.js';
import { authMiddleware, requireRole } from './middleware/auth.js';
import auditRouter from './domains/security/routes/audit.js'; // v1.3 P3.1 — domain extraction
import { createLicenseRouter } from './domains/security/routes/license.js'; // v1.3 P5.1
import { createBackupRouter } from './domains/basis/routes/backup.js'; // v1.3 F1
import { createRateRouter } from './domains/library/routes/rate.js'; // v1.3 J1 — go-live
import { createDdlRouter } from './domains/library/routes/ddl.js'; // v1.3 J1 — go-live
import { createReleasedQuotationRouter } from './domains/sales/routes/released-quotation.js'; // v1.3 K2
import { createQuotesRouter } from './domains/sales/routes/quotes.js'; // v1.3 M1 — go-live
import { createQuoteExportRouter } from './routes/quoteExport.js'; // Quote-export MVP-1
import {
  upsertQuote,
  loadQuotes,
  saveQuotes,
  getQuoteById,
  VersionConflictError,
} from './repositories/quotesStore.js';
import { emitDataChange } from './services/eventBus.js';
import { resolveTabAccess } from './services/permissionService.js';
import { redactErrorMessage, logErr } from './utils/safeError.js';
import { isSys } from './services/authService.js';
import { rateRows, ddlToCsvRows } from './platform/csv/index.js'; // v1.3 J1
import {
  isAdminPlus,
  canWrite,
  audit,
  getLibDir,
  safeFn,
  siteToCsvKey,
  toCsvBytes,
} from './services/authService.js';
import { validateBody } from './middleware/validate.js';
import { atomicWriteFileSync } from './services/atomicWrite.js';

// Cost API: auth, data CRUD, library management (replaces Python server)
// These must come BEFORE express.json() body parsing to handle raw bodies for some endpoints
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Phase 9H.4 — CSRF middleware for state-changing requests. Applied
// GLOBALLY but no-op for requests that use Authorization-header auth
// (pre-9H legacy path is immune to CSRF because browsers don't attach
// Bearer tokens cross-origin). When the new cookie-based session flow
// is in use, this middleware enforces the X-CSRF-Token double-submit.
//
// Exempt endpoints:
//   POST /api/auth/login  — no cookie yet at login time; validated by
//       rate-limiter + password + TOTP instead. Login is the ONLY
//       state-changing request that enters without an existing session,
//       so a CSRF exemption is safe (there's no authenticated state
//       to forge against yet).
//   POST /api/totp/verify — completes login when TOTP is enabled; the
//       pre-auth session token is sent via Authorization header by
//       the login-in-progress UI, so CSRF cookie may not exist yet.
//   POST /api/totp/enroll — first-time enrollment (atomic verify+save).
//       Same preauth context as /totp/verify: the session is only
//       totp_enrollment_pending, CSRF cookie not yet issued. The
//       endpoint's own auth gate (session token + enrollment_pending
//       flag + same-user match + correct OTP) provides equivalent
//       protection against forged cross-origin requests.
import { checkCsrf } from './utils/authCookie.js';
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/totp/verify', '/api/totp/enroll']);
app.use((req, res, next) => {
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();
  const r = checkCsrf(req);
  if (!r.ok) {
    return res.status(403).json({
      ok: false,
      error: 'csrf_failed',
      reason: r.reason,
      request_id: req.id,
    });
  }
  next();
});

// v1.3 P3.1 — security/audit router (extracted from this file).
// Mounted BEFORE costApiRouter so this explicit route wins over the
// wildcard handler. Pattern to follow for all future domain routers.
app.use('/api/audit', auditRouter);
app.use('/api/v1/audit', auditRouter);

// v1.3 P5.1 — security/license-status router (extracted from costApi.js).
// `countActiveUsers` is injected so the route stays decoupled from the
// data-dir resolution that lives in costApi.js / DATA_DIR.
const licenseStatusCount = () => {
  try {
    const usersFile = path.join(DATA_DIR, 'Library', 'Users', 'users.json');
    if (!fs.existsSync(usersFile)) return 0;
    const arr = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    if (!Array.isArray(arr)) return 0;
    return arr.filter((u) => u && !u.deleted_at && u.role !== 'sys').length;
  } catch {
    return 0;
  }
};
app.use('/api/license', createLicenseRouter({ countActiveUsers: licenseStatusCount }));
app.use('/api/v1/license', createLicenseRouter({ countActiveUsers: licenseStatusCount }));

// v1.3 F1 — basis/backup-schedule router (extracted from costApi.js).
// Both new path (/api/basis/backup/{schedule,run-now}) AND legacy
// (/api/admin/backup-schedule*) coexist until client UI migrates.
const backupRouterDeps = {
  auth: (req, res, next) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!u) return res.status(401).json({ error: 'Authentication required' });
    req.user = { user: u, role: u.role };
    next();
  },
  isAdminPlus: (reqUser) => isAdminPlus(reqUser?.user || reqUser),
  audit,
  clientIp: (req) => req.ip || req.connection?.remoteAddress || '-',
  writeRateLimit,
  validateBody,
  loadScheduler: () => import('./services/backupScheduler.js'),
};
app.use('/api/basis/backup', createBackupRouter(backupRouterDeps));
app.use('/api/v1/basis/backup', createBackupRouter(backupRouterDeps));

// v1.3 J1 — library/rate + library/ddl routers go LIVE.
// Helpers are now in platform/csv (rateRows, ddlToCsvRows) so the
// domain routers boot without coupling to costApi.js. Legacy
// /api/rate/* + /api/ddl/* in costApi continue to serve until the
// client UI migrates (dual-mount per ADR-0009).
const libRouterDeps = {
  auth: (req, res, next) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!u) return res.status(401).json({ error: 'Authentication required' });
    req.user = { user: u, role: u.role };
    next();
  },
  isAdminPlus: (reqUser) => isAdminPlus(reqUser?.user || reqUser),
  canWrite: (reqUser) => canWrite(reqUser?.user || reqUser),
  getLibDir,
  safeFn,
  readJson: (fp, def = null) => {
    try {
      if (!fs.existsSync(fp)) return def;
      return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch {
      return def;
    }
  },
  writeJson: (fp, data) => {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    atomicWriteFileSync(fp, JSON.stringify(data, null, 2));
  },
  atomicWriteFileSync,
  siteToCsvKey,
  toCsvBytes,
  validateBackupBody: validateBody({
    site: { type: 'string', max: 32 },
    data: { type: 'array', max: 500 }, // rate uses array; ddl router validates with object via second factory call
  }),
  validateRestoreBody: validateBody({
    filename: { type: 'string', required: true, max: 128 },
    site: { type: 'string', max: 32 },
  }),
};
app.use('/api/library/rate', createRateRouter({ ...libRouterDeps, rateRows }));
app.use('/api/v1/library/rate', createRateRouter({ ...libRouterDeps, rateRows }));
app.use(
  '/api/library/ddl',
  createDdlRouter({
    ...libRouterDeps,
    ddlToCsvRows,
    // DDL backup body is an object, not an array
    validateBackupBody: validateBody({
      site: { type: 'string', max: 32 },
      data: { type: 'object' },
    }),
  })
);
app.use(
  '/api/v1/library/ddl',
  createDdlRouter({
    ...libRouterDeps,
    ddlToCsvRows,
    validateBackupBody: validateBody({
      site: { type: 'string', max: 32 },
      data: { type: 'object' },
    }),
  })
);

// v1.3 K2 — sales/released-quotation router (extracted from costApi.js).
// Legacy /api/released-quotation* + /api/save-quotation in costApi.js
// continue to serve until UI migrates (dual-mount per ADR-0009).
const releasedQuoteDeps = {
  auth: libRouterDeps.auth,
  canWrite: libRouterDeps.canWrite,
  getLibDir,
  safeFn,
  readJson: libRouterDeps.readJson,
  writeJson: libRouterDeps.writeJson,
  saveRateLimit,
};
app.use('/api/sales/quotations', createReleasedQuotationRouter(releasedQuoteDeps));
app.use('/api/v1/sales/quotations', createReleasedQuotationRouter(releasedQuoteDeps));

// v1.3 M1 — sales/quotes CRUD router goes LIVE.
// All deps now surfaced as named exports from quotesStore + eventBus +
// permissionService + safeError + authService. Legacy /api/quotes/* in
// costApi.js continues to serve until UI migrates (dual-mount per ADR-0009).
const quotesDeps = {
  auth: libRouterDeps.auth,
  canWrite: libRouterDeps.canWrite,
  isSys: (reqUser) => isSys(reqUser?.user || reqUser),
  upsertQuote,
  loadQuotes,
  saveQuotes,
  getQuoteById,
  VersionConflictError,
  resolveTabAccess: (user, tabId) => resolveTabAccess(user?.user || user, tabId),
  emitDataChange,
  audit,
  clientIp: (req) => req.ip || req.connection?.remoteAddress || '-',
  logErr,
  redactErrorMessage,
  saveRateLimit,
};
app.use('/api/sales/quotes', createQuotesRouter(quotesDeps));
app.use('/api/v1/sales/quotes', createQuotesRouter(quotesDeps));

// Quote export MVP-1 — POST /api/quotes/:id/export
// Mounted on legacy + v1 prefixes per ADR-0009 dual-mount convention.
// Read-only (no state mutation), so it shares the `quote-history` tab
// permission and reuses the same auth/getQuoteById/audit/etc deps.
const quoteExportDeps = {
  auth: libRouterDeps.auth,
  getQuoteById,
  resolveTabAccess: (user, tabId) => resolveTabAccess(user?.user || user, tabId),
  audit,
  clientIp: (req) => req.ip || req.connection?.remoteAddress || '-',
  logErr,
  redactErrorMessage,
  // engineSha + rateLookup are optional; populated when available so
  // exported workbooks can stamp Engine SHA on the Cover sheet and
  // surface machine_rate / labor_rate / crew on the Processes sheet.
  engineSha: process.env.OPS_BUILD_SHA || undefined,
};
app.use('/api/quotes', createQuoteExportRouter(quoteExportDeps));
app.use('/api/v1/quotes', createQuoteExportRouter(quoteExportDeps));

// Cost API routes (auth + all cost endpoints)
// Sprint 39 — API versioning: every router mounts at BOTH the legacy
// prefix `/api/...` AND the explicit `/api/v1/...`. Existing clients
// keep working; new clients pin `/api/v1/` to lock against a future v2.
// When v2 ships, v1 stays at the mounted path and v2 mounts alongside.
app.use('/api', costApiRouter);
app.use('/api/v1', costApiRouter);

// Legacy iframe route removed — all COST V1.0 tabs now run natively

// Also serve data files at /data/* (the HTML references /data/Library/...)
app.get('/data/*', (req, res) => {
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : '';
  const queryToken = (req.query.t || '').toString();
  const token = headerToken || queryToken;

  // Phase 9F.5 — deprecation warning for query-param token auth.
  // `?t=<token>` is readable in proxy access logs, browser history,
  // and third-party analytics. We still honor it for back-compat
  // with the legacy /data/* call sites but emit a structured log and
  // a Deprecation/Sunset header so operators can find + migrate
  // callers. After 30 days of zero usage, this branch can be removed.
  if (!headerToken && queryToken) {
    console.warn(
      JSON.stringify({
        t: new Date().toISOString(),
        id: req.id,
        level: 'warn',
        msg: 'deprecated_query_param_token',
        p: req.path,
        ua: String(req.headers['user-agent'] || '').slice(0, 120),
      })
    );
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Sat, 01 Nov 2026 00:00:00 GMT');
    res.setHeader(
      'Warning',
      '299 - "Query-param token auth deprecated; use Authorization: Bearer header"'
    );
  }

  const u = getSessionUser(token);
  if (!u) return res.status(401).json({ error: 'Unauthorized' });

  const relParts = req.params[0].split('/').filter((p) => p && p !== '..');
  const fpath = path.resolve(path.join(DATA_DIR, ...relParts));
  if (!fpath.startsWith(path.resolve(DATA_DIR))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!fs.existsSync(fpath)) return res.status(404).json({ error: 'not found' });
  const ext = path.extname(fpath).toLowerCase();
  const mime =
    {
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      // Illustrator files embed a PDF stream when "PDF-compatible" is
      // enabled (Illustrator's default since CS) — mapping to application/
      // pdf lets the browser + pdf.js render them transparently. Legacy
      // .ai files without PDF compat will fail at the pdf.js stage, not
      // here, and the user can just re-export as PDF.
      '.ai': 'application/pdf',
    }[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.send(fs.readFileSync(fpath));
});

// Shared data endpoints (Node.js native, reads from Library data).
// Site access check runs after auth — users with restricted `sites`
// array can only query their own sites; unrestricted users see all.
import { enforceSiteAccess } from './middleware/siteAccess.js';
app.use('/api/shared', authMiddleware, enforceSiteAccess, sharedRouter);
app.use('/api/v1/shared', authMiddleware, enforceSiteAccess, sharedRouter);

// Planning v1.3 (MES-1.4): /api/planning/v2/work-orders/* — gated by
// the mes.workOrder.enabled feature flag. Mount BEFORE the legacy
// /api/planning router so v2 prefix matches win on registration order.
// Planning is gated at the composition root by OPS_FEATURE_PLANNING
// (default off). Flag off → neither the v2 nor the legacy router mounts
// and /api/planning/* fails closed with 404. mountPlanning is untouched
// internally so its own mes.workOrder.enabled gate + the planning test
// harness (which calls mountPlanning directly) behave exactly as before.
if (FEATURE_PLANNING) {
  mountPlanning(app);
  // Planning module: Node.js native endpoints
  app.use('/api/planning', authMiddleware, enforceSiteAccess, planningRouter);
  app.use('/api/v1/planning', authMiddleware, enforceSiteAccess, planningRouter);
} else {
  app.use(['/api/planning', '/api/v1/planning'], (_req, res) =>
    res.status(404).json({ ok: false, error: 'feature_disabled', feature: 'planning' })
  );
}

// IFS Data import endpoints (admin+ only). Rate-limited to prevent
// accidental or malicious disk-thrashing by repeated large imports.
app.use('/api/import', authMiddleware, writeRateLimit, importRouter);
app.use('/api/v1/import', authMiddleware, writeRateLimit, importRouter);

// Import Wizard — modern dataset-driven import with preview/commit,
// templates, exports, and restore. Same auth + rate-limit posture.
app.use('/api/import-wizard', authMiddleware, writeRateLimit, importWizardRouter);
app.use('/api/v1/import-wizard', authMiddleware, writeRateLimit, importWizardRouter);

// ─── Auto-update artifact distribution (Phase A.4) ───
// electron-builder generic provider hits this URL to fetch latest.yml
// + the per-platform installer (.exe / .dmg / .nupkg). Public — no
// auth — because the same URL is consumed by 50 client machines that
// are not yet logged into the app on first launch. Path traversal is
// blocked by express.static, dotfiles are denied, and directory
// listing is disabled.
//
// Cache strategy:
//   .yml manifests → 5 min (electron-updater polls these to find a new
//                    version — too short and we ddos ourselves; too
//                    long and a release rolls out slowly).
//   everything else (binaries) → 1 year immutable, since file names
//                                contain the version (e.g.
//                                OpsControl-1.5.1-Setup.exe).
//
// Compression is intentionally skipped for /updates/* (see compression
// filter above) — installers are already compressed.
const updatesDir = resolveUpdatesDir(process.env, DATA_DIR);
if (fs.existsSync(updatesDir)) {
  app.use(
    '/updates',
    express.static(updatesDir, {
      dotfiles: 'deny',
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.yml')) {
          res.setHeader('Cache-Control', 'public, max-age=300');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  // Defensive 404 guard for any /updates/* path the static didn't
  // serve (dotfiles, missing files, directory roots). Without this the
  // request falls through to the SPA catch-all and the client gets
  // index.html with status 200, which would crash electron-updater
  // when it tries to parse it as YAML. Mirrors the /assets/* and
  // /kiosk/assets/* stale-chunk guards lower in this file.
  app.use('/updates', (req, res) => {
    res.status(404).type('text/plain').send('updates: not found');
  });
  console.log(`📦 [updates] serving from ${updatesDir}`);
} else {
  console.log(`📦 [updates] dir not found at ${updatesDir} — endpoint disabled`);
}

// Phase 10A — chat routes. Feature-gated per-route via
// `requireChatEnabled` so the router stays mounted even when
// OPS_CHAT_ENABLED=0. Auth happens inside the route (session user
// looked up from the cookie/token); we skip authMiddleware wrapping
// here because the SSE stream needs to set custom response headers
// BEFORE authMiddleware could fail-fast.
app.use('/api/chat', chatRouter);
app.use('/api/v1/chat', chatRouter);

// v1.1 — Smart-client sync endpoints (Sprint 3). Auth-required:
// Tier 1 (Electron) phải có session token y như call REST thường.
app.use('/api/sync', authMiddleware, syncRouter);
app.use('/api/v1/sync', authMiddleware, syncRouter);

// v1.3 Sprint 2.2 — SSE event stream cho real-time data push.
// Auth handled inside events.js (cookie/Bearer/?t= fallback).
app.use('/api/events', eventsRouter);
app.use('/api/v1/events', eventsRouter);

// Phase 10G — opt-in chat retention. `OPS_CHAT_PRUNE_DAYS=180` runs a
// prune at boot then every 24h. Skipped entirely when unset so the
// default deploy never drops chat history by surprise.
{
  const ttlDays = Number(process.env.OPS_CHAT_PRUNE_DAYS);
  if (Number.isFinite(ttlDays) && ttlDays > 0 && process.env.NODE_ENV !== 'test') {
    const { pruneOldMessages } = await import('./repositories/chatStore.js');
    const { inc: metricsInc } = await import('./utils/metrics.js');
    const runPrune = () => {
      try {
        const r = pruneOldMessages({ ttlDays });
        if (r.pruned > 0) {
          console.log(`  🧹  chat: pruned ${r.pruned} message(s) older than ${ttlDays}d`);
          metricsInc('chat_messages_pruned_total', {}, r.pruned);
        }
      } catch (e) {
        console.warn('  ⚠️   chat prune failed:', e.message);
      }
    };
    runPrune();
    setInterval(runPrune, 24 * 3600 * 1000).unref();
  }
}

// ─── Serve React SPA in production ───
//
// Two-tier caching policy:
//   (a) /assets/* — content-hashed filenames (Vite emits e.g.
//       RFQTracker-DzjBscF-.css). The hash changes on every content
//       change, so it is safe — and desirable — to tell the browser
//       these files never change. `immutable` + 1-year max-age means
//       the browser won't even revalidate, saving network round-trips.
//   (b) everything else (index.html, .ico, /help/*.docx) — no-cache so
//       a new deploy is visible without a hard-refresh.
// ─── Kiosk PWA (MES-2.6a) — mounted BEFORE the planner SPA ───
//
// Served from apps/kiosk/dist. Same two-tier caching policy as the
// planner: hashed /kiosk/assets/* are immutable; everything else
// (index.html, manifest, sw.js) revalidates on every request — sw.js
// MUST always revalidate so a deploy isn't held up by an old SW.
//
// Mounted before the planner's express.static so /kiosk/* requests
// don't fall through into clientDist (which would 404 instead of
// serving the kiosk shell).
const kioskDist = path.join(__dirname, '..', 'apps', 'kiosk', 'dist');
// Kiosk PWA serving is gated by OPS_FEATURE_KIOSK (default off). Flag off
// → the whole /kiosk/* subtree fails closed with a plain-text 404 instead
// of serving the shell. (The kiosk API lives under planning's v2 router,
// so it is governed by OPS_FEATURE_PLANNING above — gating it separately
// would mean reaching inside mountPlanning, which we deliberately don't.)
if (FEATURE_KIOSK) {
  app.use(
    '/kiosk',
    express.static(kioskDist, {
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          // index.html, manifest.webmanifest, sw.js — always revalidate.
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );
  // Kiosk asset 404 guard — clones the planner pattern below for the
  // /kiosk/ subtree. Without this, a stale kiosk client requesting a
  // no-longer-extant chunk would fall through to the kiosk SPA catch-all
  // and load index.html with `text/html`, crashing the browser with the
  // MIME-type error documented in CLAUDE.md "Stale-chunk crash recovery".
  app.get(['/kiosk/assets/*', '/kiosk/*.js', '/kiosk/*.css', '/kiosk/*.map'], (req, res) => {
    res.status(404).type('text/plain').send('kiosk asset not found — stale chunk');
  });
  // Kiosk SPA catch-all — anything under /kiosk/ that wasn't matched by
  // the static handler or the 404 guard above falls through to here and
  // gets index.html (so client-side routes like /kiosk/pair work on hard
  // reload).
  app.get('/kiosk/*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(kioskDist, 'index.html'));
  });
} else {
  app.get(['/kiosk', '/kiosk/*'], (_req, res) =>
    res.status(404).type('text/plain').send('Kiosk is not enabled on this server.')
  );
}

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(
  express.static(clientDist, {
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        // Hashed immutable bundle.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // index.html, favicon, /help/*.docx — always revalidate.
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);
// Stale-chunk protection. When a browser holds an old `index.js` after
// a new deploy, it tries to import chunks at hashes that no longer
// exist on disk. Without this guard, the `express.static` miss falls
// through to the SPA catch-all below which returns `index.html` with
// `text/html` — the browser then crashes with
//   "'text/html' is not a valid JavaScript MIME type"
// when trying to execute the HTML as JS. Returning a REAL 404 here
// lets the client's chunk-load error handler kick in (force-reload) and
// shows the right error message in browser devtools.
app.get(['/assets/*', '/*.js', '/*.css', '/*.map'], (req, res) => {
  res.status(404).type('text/plain').send('asset not found — stale chunk');
});

app.get('*', (req, res) => {
  // Don't serve index.html for API or data routes
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/data/') ||
    req.path.startsWith('/legacy/')
  ) {
    return res.status(404).json({ error: 'not found' });
  }
  // Force index.html revalidation so a fresh deploy is visible on reload.
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ─── Global error handler ───
// Must be registered LAST, after all routes. Express detects the
// 4-argument signature and routes thrown / next(err) errors here
// instead of the default HTML error page. We normalize the response
// shape so the client can parse it uniformly and log the request_id
// so the server log's correlation ID matches what the client sees.
// Stack traces are NOT returned to the client (only logged).
// Phase 9F.2 — whitelist err.message. Prior version returned
// `err.message` unconditionally to the client. SQLite/fs errors often
// embed file paths, schema names, or internal stack fragments; those
// leak the server's internal structure to anyone who can trigger a
// 500. Policy now:
//   - 4xx: still surface err.message (client-caused errors are safe to
//     echo — the client sent the bad input and deserves to know why).
//   - 5xx: generic "Internal server error" UNLESS the thrower marks
//     `err.safe = true` (opt-in for messages the route author has
//     confirmed contain no internal detail). The request_id is
//     always returned so support can correlate with the server log.
// Stack traces are logged server-side only.

app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(
      JSON.stringify({
        t: new Date().toISOString(),
        id: req.id,
        level: 'error',
        m: req.method,
        p: req.path,
        msg: err.message,
        stack: err.stack?.split('\n').slice(0, 5).join(' | '),
      })
    );
  }
  if (res.headersSent) return;

  const isClientError = status >= 400 && status < 500;
  const messageSafeToLeak = isClientError || err.safe === true;
  const outMessage = messageSafeToLeak ? err.message || 'Request failed' : 'Internal server error';

  res.status(status).json({
    ok: false,
    error: outMessage,
    request_id: req.id,
  });
});

// ─── Start ───
// Only call listen() when this file is the entry point. Tests import
// `app` directly and run their own listener on an ephemeral port, so
// auto-listening here would cause an EADDRINUSE.
const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isEntryPoint) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Ops Control server running at http://localhost:${PORT}`);
    console.log(`📁 Data directory: ${DATA_DIR}`);
    console.log(`🔧 No Python dependency required`);
    console.log(`📦 [compression] enabled (threshold=1024, level=6, sse-excluded)\n`);
    // Critical-1 audit: log count of users still on the legacy jsHash
    // so ops see at a glance whether password migration is complete.
    // Does not block startup — users auto-upgrade on next login.
    import('./services/authService.js')
      .then((m) => m.auditLegacyPasswords?.())
      .catch(() => {
        /* non-fatal */
      });

    // v1.3 — pick up admin user written by setupWizard. Idempotent
    // (no-op if no seed file). Runs in background so listen isn't
    // blocked by the file IO + argon2 hash.
    import('child_process').then(({ spawn }) => {
      const child = spawn(process.execPath, [path.resolve(__dirname, '../scripts/seed-admin.js')], {
        stdio: 'inherit',
        env: process.env,
      });
      child.on('exit', (code) => {
        if (code !== 0) console.warn(`[seed-admin] exited with ${code}`);
      });
    });

    // v1.3 P0 — Daily backup scheduler. OFF by default (dev); enable
    // in production via OPS_BACKUP_SCHEDULE=1. Runs daily at 02:00,
    // takes SQLite backup + Library tarball + verifies + alerts on fail.
    import('./services/backupScheduler.js')
      .then((m) => {
        const r = m.startBackupScheduler();
        if (r?.ok) console.log(`💾 Backup scheduler armed`);
        else if (r?.skipped)
          console.log(`💾 Backup scheduler disabled (set OPS_BACKUP_SCHEDULE=1 to enable)`);
      })
      .catch((err) => console.warn('[backup] scheduler init failed:', err.message));

    // v1.3 P0 — Audit log retention (rotation + monthly archive).
    // Prevents audit_log.json from growing unbounded. Default OFF.
    import('./services/auditRetention.js')
      .then((m) => {
        const r = m.startAuditRetention();
        if (r?.ok) console.log(`📜 Audit retention armed`);
      })
      .catch((err) => console.warn('[audit-retention] init failed:', err.message));
  });

  // ─── Double-run guard (headless daemon ↔ app embedded server) ───
  // If another Ops Control server already owns this port, listen() emits
  // EADDRINUSE. Exit with a clear, actionable message instead of dumping a
  // raw stack trace. This prevents the confusing "two servers" state and,
  // when both point at the same DATA_DIR, guards the SQLite file from two
  // writers. The headless service binds a fixed OPS_PORT (default 3000); the
  // desktop app picks a free port, so this mainly fires when a second daemon
  // or a manual `node server/index.js` races the running service.
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(
        `\n❌  Ops Control: cổng ${PORT} đang bận — Server đang chạy ở process khác ` +
          `(daemon/service hoặc app SERVER).`
      );
      console.error(
        `    Không khởi động bản thứ hai để tránh hỏng DATA_DIR. Dừng tiến trình cũ ` +
          `(xem script status/stop) hoặc đổi OPS_PORT rồi thử lại.\n`
      );
      process.exit(1);
    }
    console.error('[fatal] server listen error:', err);
    process.exit(1);
  });

  // Phase 9G.5 — graceful shutdown. SIGTERM is what PM2/systemd/Docker
  // sends on deploy rolling-restart; SIGINT is Ctrl+C. Without this
  // handler, in-flight /save-all requests can be killed mid-write and
  // leave half-written JSON files. The contract:
  //   1. Stop accepting new connections.
  //   2. Let existing requests complete within SHUTDOWN_TIMEOUT_MS.
  //   3. Flush pending session persistence synchronously.
  //   4. Close the SQLite connection (WAL checkpoint before exit).
  //   5. Exit cleanly.
  // If deadline hits before drain, force-exit with a non-zero code so
  // orchestrators log the timeout.
  const SHUTDOWN_TIMEOUT_MS = 15_000;
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n📥 ${signal} received — graceful shutdown…`);

    // (1) Stop accepting new requests. existing ones keep their handler.
    const closed = new Promise((resolve) => server.close(resolve));
    const deadline = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('shutdown timeout')), SHUTDOWN_TIMEOUT_MS)
    );
    try {
      await Promise.race([closed, deadline]);
      console.log('  ✅ HTTP server drained');
    } catch {
      console.warn(`  ⚠️  Shutdown timeout after ${SHUTDOWN_TIMEOUT_MS}ms — forcing exit`);
    }

    // (3) Flush debounced session writes synchronously. Without this
    // step, a logout right before SIGTERM could be lost if the 2 s
    // debounce timer hadn't fired.
    try {
      const { persistSessionsNow } = await import('./services/authService.js');
      persistSessionsNow();
      console.log('  ✅ sessions flushed');
    } catch (err) {
      console.warn('  ⚠️  sessions flush failed:', err.message);
    }

    // (4) Close SQLite. WAL checkpoint happens on close() so the .db
    // file is consistent for the next boot.
    try {
      const { closeDb } = await import('./db/connection.js');
      closeDb();
      console.log('  ✅ SQLite closed');
    } catch (err) {
      console.warn('  ⚠️  SQLite close failed:', err.message);
    }

    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
