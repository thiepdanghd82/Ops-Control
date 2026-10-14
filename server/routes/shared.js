/**
 * Shared Data Routes
 * Provides shared data from COST V1.0's data/Library/ to both modules
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import multer from 'multer';
import { atomicWriteFileSync } from '../services/atomicWrite.js';
import { sendJsonWithEtag } from '../utils/etag.js';
import {
  getManufacturingStructures,
  getBOMForPart,
  getRoutingOperations,
  getRoutingForPart,
  getWorkCenters,
  getNpiParts,
  clearCache,
} from '../services/dataSync.js';
import * as repo from '../repositories/index.js';
import {
  audit,
  getSessionUser,
  getTokenFromHeader,
  loadUsers,
  isAdminPlus,
  canWrite,
  requireWriter,
} from '../services/authService.js';
import { withLock } from '../utils/asyncLock.js';
import { requireTabAccess } from '../services/permissionService.js';
import {
  transition as approvalTransition,
  countActionable,
} from '../repositories/approvalWorkflow.js';
import { validateBody } from '../middleware/validate.js';
import { toCsvRow } from '../utils/csvSafe.js';
import { sanitizeReason } from '../utils/sanitize.js';
import { inc as incMetric } from '../utils/metrics.js';
import { redactErrorMessage, logErr } from '../utils/safeError.js';
import { validateRows, machineProfileSchema } from '../services/librarySchema.js';

// Target statuses the quote-progress state machine accepts as the
// `action` field of POST /approvals/:id/transition. Mirrored into
// validation so the router rejects garbage before it reaches the
// state machine — the 400 response then lists valid statuses instead
// of surfacing the internal machine error.
//
// Sprint S-QUOTE-PROGRESS-V2 (2026-06-15) — the field name `action`
// is kept for callsite compatibility with v1 clients still in flight,
// but the values are now target statuses, not workflow verbs.
const APPROVAL_ACTIONS = ['draft', 'quote_to_sale', 'price_approved', 'cancelled', 'rejected'];

// sanitizeReason moved to utils/sanitize.js (Phase 9E.2) so it's
// unit-testable without booting the router. Imported above.
import {
  enqueue as enqueueNotifications,
  listPendingFor as listPendingNotificationsFor,
  runDigest as runNotificationDigest,
  markDelivered as markNotificationsDelivered,
} from '../services/notifications.js';
import {
  loadQuotes,
  saveQuotes,
  getQuoteById,
  quotesBackendStatus,
} from '../repositories/quotesStore.js';
import { pickLatestUsdRate } from '../utils/latestUsdRate.js';
import { fillCreatedBy } from '../utils/quoteCreator.js';
import { quoteCreators } from '../repositories/auditStore.js';
import { emitDataChange } from '../services/eventBus.js';

import { fileURLToPath } from 'url';
const __filename_s = fileURLToPath(import.meta.url);
const __dirname_s = path.dirname(__filename_s);

let DATA_DIR = process.env.DATA_DIR || path.join(__dirname_s, '..', 'data');
if (!path.isAbsolute(DATA_DIR)) {
  DATA_DIR = path.resolve(path.join(__dirname_s, '..', '..'), DATA_DIR);
}
const LIB = path.join(DATA_DIR, 'Library');

/** Read JSON file safely */
function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

const router = Router();

// GET /api/shared/bom - All manufacturing structures
// Routed through repository so OPS_DATA_BACKEND=sqlite picks up indexed
// reads. Default env → file backend, identical pre-migration behavior.
router.get('/bom', (req, res) => {
  try {
    const data = repo.listBom();
    // Sprint 1.7h — ETag for the 6 MB Mfg Structures payload.
    sendJsonWithEtag(req, res, data);
  } catch (err) {
    console.error('Error loading BOM:', err);
    res.status(500).json({ error: 'Failed to load BOM data' });
  }
});

// GET /api/shared/bom/:partNo - BOM for specific part
router.get('/bom/:partNo', (req, res) => {
  try {
    const data = repo.listBomForPart(req.params.partNo);
    res.json(data);
  } catch (err) {
    console.error('Error loading BOM for part:', err);
    res.status(500).json({ error: 'Failed to load BOM data' });
  }
});

// GET /api/shared/routing - All routing operations
router.get('/routing', (req, res) => {
  try {
    const data = repo.listRouting();
    // Sprint 1.7h — ETag for the 16 MB Routing Ops payload (biggest win).
    sendJsonWithEtag(req, res, data);
  } catch (err) {
    console.error('Error loading routing:', err);
    res.status(500).json({ error: 'Failed to load routing data' });
  }
});

// GET /api/shared/routing/:partNo - Routing for specific part
router.get('/routing/:partNo', (req, res) => {
  try {
    const data = repo.listRoutingForPart(req.params.partNo);
    res.json(data);
  } catch (err) {
    console.error('Error loading routing for part:', err);
    res.status(500).json({ error: 'Failed to load routing data' });
  }
});

// GET /api/shared/npi-parts - NPI Parts List (registry dataset 'npi-parts').
// Reads the live Library file (seeded once from the bundled snapshot); the
// tab used a static /npi-parts/parts-snapshot.json before import shipped.
// File-only (no SQLite mirror) → read via dataSync directly, not the repo layer.
router.get('/npi-parts', (req, res) => {
  try {
    const data = getNpiParts();
    // ETag for the ~15-25 MB payload (25k×64), same pattern as BOM/Routing.
    sendJsonWithEtag(req, res, data);
  } catch (err) {
    console.error('Error loading npi-parts:', err);
    res.status(500).json({ error: 'Failed to load npi-parts data' });
  }
});

// GET /api/shared/work-centers - All work centers
router.get('/work-centers', (req, res) => {
  try {
    const data = getWorkCenters();
    res.json(data);
  } catch (err) {
    console.error('Error loading work centers:', err);
    res.status(500).json({ error: 'Failed to load work centers' });
  }
});

// ─── Direct file-based data (no Python dependency) ───

// GET /api/shared/materials - Material cost DB
router.get('/materials', (req, res) => {
  try {
    const matDB = readJson(path.join(LIB, 'MaterialCost', 'materials.json')) || [];
    const npiDB = readJson(path.join(LIB, 'MaterialCost', 'npi_materials.json')) || [];
    const ifsDB = readJson(path.join(LIB, 'MaterialCost', 'ifs_materials.json')) || [];
    const sourcingDB = readJson(path.join(LIB, 'MaterialCost', 'sourcing_db.json')) || [];
    res.json({ matDB, npiDB, ifsDB, sourcingDB });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load materials' });
  }
});

// GET /api/shared/dashboard?days=30|90|365  (omit/all = full history)
// Aggregated KPIs for the enterprise dashboard. Read-only, computed from
// the `quotes` table. Safe to call per page load (~15ms warm on 10k
// quotes). Cached per-request only — not memoized across requests
// because the data changes on every /save-all.
//
// Auth: canWrite+ (role ≥ user). viewonly users do not see revenue or
// customer lists — this is corporate pricing data. Admins see all; CSV
// export is gated separately in /dashboard/export below.
router.get('/dashboard', async (req, res) => {
  const user = getSessionUser(getTokenFromHeader(req));
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!canWrite(user)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    const {
      collectMetrics,
      getOverview,
      getWinRate,
      getApprovalFunnel,
      getTopCustomers,
      getMonthlyQuoteCount,
      getMarginHistogram,
      getMarginTrend,
    } = await import('../repositories/dashboardStats.js');
    // Validate days: 30 | 90 | 365 | omitted/'all' (all history). Any
    // other value is ignored (falls through to all-history) rather than
    // 400'd — the client dropdown only emits the four values, but a
    // bookmarked URL with junk shouldn't break the page.
    const raw = req.query.days;
    const days = raw === '30' || raw === '90' || raw === '365' ? Number(raw) : null;
    const opts = days ? { days } : {};

    // Phase 9F.3 + 9N.1 — single-scan-per-window optimization. We do
    // AT MOST two full-table scans per /dashboard request:
    //   (1) `metrics`    — filtered by `days` (empty = all history)
    //   (2) `metricsAll` — full history, shared between the 12-month
    //                     monthly series + margin-trend series which
    //                     always span a full year regardless of filter.
    // When `days` is null (all-time range) these are the same array and
    // we avoid double-scanning by reusing the reference. 10k quote DB:
    // 3 scans → 1-2 scans; 100k DB: ~350ms → ~70-140ms.
    const metrics = collectMetrics(opts);
    const metricsAll = opts.days ? collectMetrics() : metrics;
    const aggOpts = { ...opts, _metrics: metrics };

    res.json({
      ok: true,
      overview: getOverview(aggOpts),
      win_rate: getWinRate(aggOpts),
      approval_funnel: getApprovalFunnel(aggOpts),
      top_customers: getTopCustomers(10, aggOpts),
      // Monthly series intentionally spans the full 12-month window
      // regardless of the range filter. They share metricsAll via the
      // new `_metrics` param so no extra scan per call.
      monthly_quotes: getMonthlyQuoteCount({ months: 12, _metrics: metricsAll }),
      margin_trend: getMarginTrend({ months: 12, _metrics: metricsAll }),
      margin_histogram: getMarginHistogram(aggOpts),
      range: { days, since: days ? new Date(Date.now() - days * 86400000).toISOString() : null },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    logErr(req, 'dashboard_compute', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// GET /api/shared/dashboard/export?days=30  — CSV of top customers + KPIs.
// admin+ only (corporate revenue data). Returns a single CSV document
// with two sections: KPIs and per-customer breakdown.
router.get('/dashboard/export', async (req, res) => {
  const user = getSessionUser(getTokenFromHeader(req));
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!isAdminPlus(user))
    return res.status(403).json({ ok: false, error: 'Forbidden — admin only' });
  try {
    const { collectMetrics, getOverview, getWinRate, getTopCustomers } =
      await import('../repositories/dashboardStats.js');
    const raw = req.query.days;
    const days = raw === '30' || raw === '90' || raw === '365' ? Number(raw) : null;
    const opts = days ? { days } : {};
    // 9F.3 — share one scan across overview/winRate/topCustomers.
    const metrics = collectMetrics(opts);
    const aggOpts = { ...opts, _metrics: metrics };
    const ov = getOverview(aggOpts);
    const wr = getWinRate(aggOpts);
    const tc = getTopCustomers(50, aggOpts);

    // Phase 9G.8 — stream the CSV with res.write() row-by-row instead
    // of concatenating a full string in memory. At 50 customers the
    // savings are minor; at 5000 (future expansion) buffering the
    // whole response costs MBs of RAM per concurrent export.
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dashboard_${stamp}.csv"`);
    // Connection: close so ALB/nginx don't try to reuse the socket
    // mid-stream on network flakiness.
    res.setHeader('Transfer-Encoding', 'chunked');

    const rangeLabel = days ? `last ${days} days` : 'all time';
    const writeRow = (cells) => res.write(toCsvRow(cells) + '\r\n');

    // BOM + header metadata block (still tiny, fits in one chunk).
    res.write('\uFEFF');
    writeRow(['# Ops Control Dashboard Export']);
    writeRow(['# Range', rangeLabel]);
    writeRow(['# Generated', new Date().toISOString()]);
    writeRow(['# Exported by', user.username || '']);
    res.write('\r\n');

    // KPI block
    writeRow(['Metric', 'Value']);
    writeRow(['Total quotes', ov.total]);
    writeRow(['Pending count', ov.pending_count]);
    writeRow(['Revenue total', ov.revenue_total]);
    writeRow(['Avg gross margin', ov.avg_gm == null ? '' : (ov.avg_gm * 100).toFixed(2) + '%']);
    writeRow(['Avg value-add', ov.avg_va == null ? '' : (ov.avg_va * 100).toFixed(2) + '%']);
    writeRow(['Wins', wr.won]);
    writeRow(['Losses', wr.lost]);
    writeRow(['Pending', wr.pending]);
    writeRow(['Draft', wr.draft]);
    writeRow(['Win rate', wr.rate == null ? '' : (wr.rate * 100).toFixed(2) + '%']);
    res.write('\r\n');

    // Per-customer block — streamed one row at a time so a 1000-row
    // export never materializes as one giant string.
    writeRow(['Customer', 'Quote count', 'Revenue', 'Avg GM', 'Won', 'Lost', 'Win rate']);
    for (const c of tc) {
      writeRow([
        c.customer,
        c.quote_count,
        c.revenue,
        c.avg_gm == null ? '' : (c.avg_gm * 100).toFixed(2) + '%',
        c.won,
        c.lost,
        c.win_rate == null ? '' : (c.win_rate * 100).toFixed(2) + '%',
      ]);
    }
    res.end();
  } catch (err) {
    logErr(req, 'dashboard_export', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// POST /api/shared/approval/transition
// DEPRECATED (Sprint 6.2): compute-only, client must re-save via /save-all.
// Susceptible to load-modify-save race when two reviewers act concurrently.
// New callers should use POST /api/shared/approvals/:quoteId/transition
// which applies + persists the transition atomically. This endpoint
// is kept for backwards compatibility with clients still on v1.
router.post(
  '/approval/transition',
  validateBody({
    action: { type: 'enum', required: true, values: APPROVAL_ACTIONS },
    reason: { type: 'string', max: 500 },
    current_approval: { type: 'object' },
  }),
  async (req, res) => {
    // Phase 9M.2 — deprecation metric. Counts every call to the legacy
    // v1 endpoint so ops can see usage trend. When this drops to 0 for
    // a full week, we delete the route. Labels capture the actor so we
    // can tell which client / integration is still using it.
    const actorName = req.user?.user?.username || req.user?.username || 'unknown';
    incMetric('deprecated_calls_total', {
      endpoint: '/api/shared/approval/transition',
      actor: actorName,
    });
    try {
      const userWrapper = req.user;
      const actorUser = userWrapper?.user || userWrapper;
      const { current_approval, action, reason } = req.body;
      const result = approvalTransition({
        approval: current_approval,
        action: String(action).toLowerCase(),
        actorUser,
        reason: sanitizeReason(reason),
      });
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (err) {
      logErr(req, 'legacy_approval_transition', err);
      res.status(500).json({ ok: false, error: redactErrorMessage(err) });
    }
  }
);

// ── Atomic quote-progress endpoint (Sprint 6.2 + V2 rewrite) ─────────
//
// POST /api/shared/approvals/:quoteId/transition
// Body: { action: 'draft'|'quote_to_sale'|'price_approved'|'cancelled'|'rejected', reason?: string }
//   (Sprint S-QUOTE-PROGRESS-V2 — `action` is now a target status,
//   not a workflow verb. `reason` required when action ∈ {cancelled,
//   rejected}.)
//
// Reads the current quote from quote_history.json, applies the state
// machine transition, writes the file atomically, appends a quote
// version, and emits an audit log entry — all under an in-process
// mutex keyed by quote id so concurrent reviewers can't race.
//
// Rationale for the lock (vs client-driven /save-all re-save):
//   1. Two reviewers clicking APPROVE at the same second would both
//      read `pending_sales`, both produce `pending_finance`, and the
//      server would record two transitions with the same from/to —
//      or worse, an APPROVE by the finance director could be lost
//      behind a sales-manager REJECT if the REJECT's /save-all fires
//      second.
//   2. Client-side persistence also forces every reviewer to re-send
//      the ENTIRE quote history to /save-all, which is ~5 MB of JSON
//      for the current dataset. The atomic endpoint touches only
//      one quote's approval object.
//
// Auth: requires a valid session; the state machine itself enforces
// role requirements per action.
//
// Quote IO is routed through `quotesStore` (Sprint 7.2) so the
// file JSON + SQLite mirror stay in sync without each caller
// duplicating the write logic.
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '-')
    .toString()
    .split(',')[0]
    .trim();
}

// ── Approval → notification routing (Sprint 6.6) ─────────────────────
// Returns [{ recipient, reason }] for a given transition. Used inline
// after a successful transition to enqueue notification records.
// Approval-role lookups scan users.json on each call — cheap for <1k
// users; if that grows we'll cache with an mtime check.
function notificationRecipients({ toStatus, prevApproval, actorUsername }) {
  const users = loadUsers();
  const usersWithSalesRole = () =>
    users
      .filter(
        (u) =>
          u &&
          Array.isArray(u.approval_roles) &&
          u.approval_roles.some((r) => r === 'sales' || r === 'sales_mgr')
      )
      .map((u) => u.username);

  // Sprint S-QUOTE-PROGRESS-V2 — submitter / approver attribution
  // collapsed into the single changed_by field. Legacy v1 records may
  // still carry submitted_by / sales_approved_by / finance_approved_by;
  // we fall back through them so notifications keep flowing for
  // pre-rewrite quote data.
  const lastActor =
    prevApproval?.changed_by ||
    prevApproval?.submitted_by ||
    prevApproval?.sales_approved_by ||
    prevApproval?.finance_approved_by;
  const out = [];
  const addDistinct = (username, reason) => {
    if (!username || username === actorUsername) return; // never notify the actor
    if (out.some((r) => r.recipient === username)) return;
    out.push({ recipient: username, recipient_reason: reason });
  };

  if (toStatus === 'quote_to_sale') {
    for (const u of usersWithSalesRole()) addDistinct(u, 'sales review queue');
  } else if (toStatus === 'price_approved') {
    if (lastActor) addDistinct(lastActor, 'your quote is now price-approved');
  } else if (toStatus === 'rejected') {
    if (lastActor) addDistinct(lastActor, 'your quote was rejected — please revise');
  } else if (toStatus === 'cancelled') {
    if (lastActor) addDistinct(lastActor, 'your quote was cancelled');
  } else if (toStatus === 'draft') {
    if (lastActor) addDistinct(lastActor, 'quote returned to draft');
  }
  return out;
}

// ── Approval inbox count (Sprint 6.5) ────────────────────────────────
// GET /api/shared/approvals/my-count
// Returns { ok, count } — how many quotes are currently waiting on the
// authenticated user's action. Used by the Sidebar nav badge; polled
// at 30s intervals so reviewers see new items without reloading.
router.get('/approvals/my-count', (req, res) => {
  const user = getSessionUser(getTokenFromHeader(req));
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try {
    const count = countActionable(loadQuotes(), user);
    res.json({ ok: true, count });
  } catch (err) {
    logErr(req, 'approval_count', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

router.post(
  '/approvals/:quoteId/transition',
  validateBody({
    action: { type: 'enum', required: true, values: APPROVAL_ACTIONS },
    reason: { type: 'string', max: 500 },
  }),
  async (req, res) => {
    const quoteId = parseInt(req.params.quoteId, 10);
    if (!Number.isFinite(quoteId)) {
      return res.status(400).json({ ok: false, error: 'invalid quote id' });
    }
    const actorUser = getSessionUser(getTokenFromHeader(req));
    if (!actorUser) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const { action, reason: rawReason } = req.body;
    const reason = sanitizeReason(rawReason);
    // Sprint S-QUOTE-PROGRESS-V2 — `action` is now a target status
    // string ('draft' / 'quote_to_sale' / 'price_approved' /
    // 'cancelled' / 'rejected'). Lowercase per the new enum.
    const normalizedAction = String(action).toLowerCase();

    try {
      const result = await withLock(`quote:${quoteId}`, async () => {
        const quotes = loadQuotes();
        const idx = quotes.findIndex((q) => q && q.id === quoteId);
        if (idx === -1) {
          return { status: 404, body: { ok: false, error: `Quote ${quoteId} not found` } };
        }
        const quote = quotes[idx];
        const prevApproval = quote.state?.approval || null;

        // rates_snapshot (Phase 9E.4 — freeze Finance SGA at
        // APPROVE_FINANCE) was dropped in V2: Phase 5 Pricing Snapshot
        // already freezes the entire pricing basis on every Save,
        // which is broader coverage than the single-rate snapshot.
        const tr = approvalTransition({
          approval: prevApproval,
          action: normalizedAction,
          actorUser,
          reason,
        });
        if (!tr.ok) {
          return { status: 400, body: tr };
        }

        if (!quote.state || typeof quote.state !== 'object') quote.state = {};
        quote.state.approval = tr.approval;
        // saveQuotes handles atomic JSON write + SQLite shadow mirror.
        saveQuotes(quotes);

        // Append a version row so the full approval trail is queryable
        // via GET /api/shared/quotes/:id/versions. Non-fatal: a failed
        // version append should not rollback the approval — the JSON
        // file is already the source of truth.
        try {
          const { appendQuoteVersion } = await import('../repositories/quoteVersions.js');
          appendQuoteVersion(quoteId, quote.state, {
            savedAt: new Date().toISOString(),
            savedBy: actorUser.username,
          });
        } catch (e) {
          console.warn('  ⚠️  approvals append version:', e.message);
        }

        audit(
          'APPROVAL_TRANSITION',
          actorUser.username,
          clientIp(req),
          `quote=${quoteId} ${prevApproval?.status || 'draft'}→${tr.approval.status}${reason ? ' reason=' + String(reason).slice(0, 200) : ''}`
        );

        // Sprint 6.6: enqueue notification records for the next reviewer
        // (or the submitter on terminal transitions). Best-effort —
        // notification IO failures must not fail the transition, which
        // is already durable on disk + audited above.
        try {
          const label = quote.state?.ccl_pn || quote.state?.rfq_number || `#${quoteId}`;
          const recipients = notificationRecipients({
            toStatus: tr.approval.status,
            prevApproval,
            actorUsername: actorUser.username,
          });
          if (recipients.length > 0) {
            await enqueueNotifications(
              recipients.map((r) => ({
                quote_id: quoteId,
                quote_label: label,
                action: normalizedAction,
                from_status: prevApproval?.status || 'draft',
                to_status: tr.approval.status,
                actor: actorUser.username,
                ...(reason ? { reason } : {}),
                recipient: r.recipient,
                recipient_reason: r.recipient_reason,
              }))
            );
          }
        } catch (notifyErr) {
          console.warn('  ⚠️  notification enqueue failed:', notifyErr?.message || notifyErr);
        }

        return {
          status: 200,
          body: { ok: true, approval: tr.approval, quote_id: quoteId },
          emit: {
            quoteId,
            from: prevApproval?.status || 'draft',
            to: tr.approval.status,
            action: normalizedAction,
            by: actorUser.username,
          },
        };
      });
      if (result?.emit) {
        try {
          emitDataChange('approval.transition', result.emit);
          emitDataChange('quote.saved', {
            id: result.emit.quoteId,
            savedBy: result.emit.by,
            approval: true,
          });
        } catch {
          /* event bus best-effort */
        }
      }
      return res.status(result.status).json(result.body);
    } catch (err) {
      logErr(req, 'approval_transition', err);
      return res.status(500).json({ ok: false, error: redactErrorMessage(err) });
    }
  }
);

// ── Notification inbox + digest (Sprint 6.6) ─────────────────────────
// GET /api/shared/notifications/my — pending records for the current
// session user. UI wire-up is optional; useful for surfacing an
// in-app bell once Phase 7 ships.
router.get('/notifications/my', (req, res) => {
  const user = getSessionUser(getTokenFromHeader(req));
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try {
    const list = listPendingNotificationsFor(user.username);
    res.json({ ok: true, notifications: list });
  } catch (err) {
    logErr(req, 'notifications_list', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// POST /api/shared/notifications/digest/run — admin-only trigger.
// Produces a digest grouped by recipient; POSTs to OPS_NOTIFY_WEBHOOK
// if configured, else dry-runs (logs to server stdout). On successful
// delivery the returned ids are marked delivered so repeat runs don't
// re-notify the same items.
//
// Meant to be invoked by a cron / scheduled trigger; also callable
// manually from an admin tool.
router.post('/notifications/digest/run', async (req, res) => {
  const user = getSessionUser(getTokenFromHeader(req));
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!isAdminPlus(user)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    const r = await runNotificationDigest();
    let ackCount = 0;
    if (Array.isArray(r.delivered_ids) && r.delivered_ids.length > 0) {
      ackCount = await markNotificationsDelivered(r.delivered_ids);
    }
    audit(
      'NOTIFICATION_DIGEST',
      user.username,
      clientIp(req),
      `mode=${r.mode} recipients=${r.digests?.length || 0} delivered=${ackCount}` +
        (r.error ? ' error=' + String(r.error).slice(0, 200) : '') +
        (r.status ? ' status=' + r.status : '')
    );
    res.json({ ok: true, ...r, delivered: ackCount });
  } catch (err) {
    logErr(req, 'notification_digest', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// GET /api/shared/admin/quotes-backend — observability endpoint (Sprint 7.3).
// Admin-only. Reports which backend is currently serving quote reads
// and whether the file + SQLite rows are in sync. Useful during the
// cutover window so ops can quickly sanity-check "am I on file or
// SQLite, and do they agree?" without running verify-parity.js.
router.get('/admin/quotes-backend', (req, res) => {
  const user = getSessionUser(getTokenFromHeader(req));
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!isAdminPlus(user)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    const status = quotesBackendStatus();
    res.json({ ok: true, ...status, checked_at: new Date().toISOString() });
  } catch (err) {
    logErr(req, 'quotes_backend_status', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// GET /api/shared/quotes - Quote history
// GET /api/shared/latest-usd-rate — the rate a NEW quote should start from.
//
// Its own route rather than something the client derives from GET /quotes,
// because that list returns the full quote objects: 26.6 MB to read one
// number. Answers `{ rate: null }` when nothing is inheritable (fresh
// install, or every quote saved without a rate) — the client keeps the
// blank-field navigation block for exactly that case.
router.get('/latest-usd-rate', (req, res) => {
  try {
    res.json(pickLatestUsdRate(loadQuotes()) || { rate: null });
  } catch (err) {
    console.error('  ❌  latest usd rate failed:', err);
    res.status(500).json({ error: 'Failed to read latest USD rate' });
  }
});

router.get('/quotes', (req, res) => {
  try {
    // "Quoted by": quotes saved before created_by existed take it from the
    // audit record of their creation (utils/quoteCreator.js).
    const all = fillCreatedBy(loadQuotes(), quoteCreators());
    // Sprint 13 — soft-delete. Default response excludes trashed
    // quotes (deleted_at is set); pass `?include=deleted` to list
    // both, or `?trashed=1` for just the bin (Trash tab).
    const include = (req.query.include || '').toString().toLowerCase();
    const trashed = req.query.trashed === '1' || req.query.trashed === 'true';
    if (trashed) {
      res.json(all.filter((q) => q && q.deleted_at));
    } else if (include === 'deleted' || include === 'all') {
      res.json(all);
    } else {
      res.json(all.filter((q) => q && !q.deleted_at));
    }
  } catch (err) {
    console.error('  ❌  load quotes failed:', err);
    res.status(500).json({ error: 'Failed to load quotes' });
  }
});

// GET /api/shared/quotes/:id — single quote lookup. Sprint 7.2: routed
// through `quotesStore.getQuoteById` so the cutover flip is local.
router.get('/quotes/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const q = getQuoteById(id);
    if (!q) return res.status(404).json({ error: 'not found' });
    res.json(fillCreatedBy([q], quoteCreators())[0]);
  } catch (err) {
    console.error('  ❌  get quote failed:', err);
    res.status(500).json({ error: 'Failed to load quote' });
  }
});

// GET /api/shared/quotes/:id/versions - list saved versions (newest first)
router.get('/quotes/:id/versions', async (req, res) => {
  try {
    const { listQuoteVersions } = await import('../repositories/quoteVersions.js');
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
    res.json({ ok: true, quote_id: id, versions: listQuoteVersions(id, { limit }) });
  } catch (err) {
    logErr(req, 'quote_versions_list', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// GET /api/shared/quotes/:id/versions/diff?from=N&to=M
// Returns field-level diff between two versions. `to` defaults to latest
// version when omitted, letting the UI call "diff against current".
router.get('/quotes/:id/versions/diff', async (req, res) => {
  try {
    const { getQuoteVersion, diffQuoteStates, listQuoteVersions } =
      await import('../repositories/quoteVersions.js');
    const id = parseInt(req.params.id, 10);
    const fromNum = parseInt(req.query.from, 10);
    let toNum = req.query.to != null ? parseInt(req.query.to, 10) : null;
    if (!Number.isFinite(id) || !Number.isFinite(fromNum)) {
      return res.status(400).json({ error: 'id and from=N required' });
    }
    if (toNum == null) {
      const list = listQuoteVersions(id, { limit: 1 });
      if (!list.length) return res.status(404).json({ error: 'no versions for this quote' });
      toNum = list[0].version_num;
    }
    const fromRow = getQuoteVersion(id, fromNum);
    const toRow = getQuoteVersion(id, toNum);
    if (!fromRow || !toRow) return res.status(404).json({ error: 'version not found' });
    const changes = diffQuoteStates(fromRow.state, toRow.state);
    res.json({
      ok: true,
      quote_id: id,
      from: {
        version_num: fromRow.version_num,
        saved_at: fromRow.saved_at,
        saved_by: fromRow.saved_by,
      },
      to: { version_num: toRow.version_num, saved_at: toRow.saved_at, saved_by: toRow.saved_by },
      change_count: changes.length,
      changes,
    });
  } catch (err) {
    logErr(req, 'quote_versions_diff', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// GET /api/shared/quotes/:id/versions/:versionNum - fetch full state for one version
router.get('/quotes/:id/versions/:versionNum', async (req, res) => {
  try {
    const { getQuoteVersion } = await import('../repositories/quoteVersions.js');
    const id = parseInt(req.params.id, 10);
    const ver = parseInt(req.params.versionNum, 10);
    if (!Number.isFinite(id) || !Number.isFinite(ver)) {
      return res.status(400).json({ error: 'invalid id or versionNum' });
    }
    const row = getQuoteVersion(id, ver);
    if (!row) return res.status(404).json({ error: 'version not found' });
    res.json({ ok: true, quote_id: id, ...row });
  } catch (err) {
    logErr(req, 'quote_version_get', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// GET /api/shared/rates - Rate data
router.get('/rates', (req, res) => {
  try {
    const rateSites = readJson(path.join(LIB, 'Rate', 'rate_sites.json')) || {};
    const rate = readJson(path.join(LIB, 'Rate', 'rate.json')) || [];
    res.json({ rateSites, rate });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load rates' });
  }
});

// GET /api/shared/ddl - Drop-down lists
router.get('/ddl', (req, res) => {
  try {
    const ddlSitesPath = path.join(LIB, 'DDL', 'ddl_sites.json');
    const ddlSites = readJson(ddlSitesPath) || {};
    const ddl = readJson(path.join(LIB, 'DDL', 'ddl.json')) || {};
    // _rev — content hash of ddl_sites.json (derived, NOT a stored field, so no
    // schema change). The client echoes it back on /save-all so the server can
    // reject a stale overwrite (two clients editing DDL) with 409. Empty when
    // the file doesn't exist yet (first save always allowed).
    let _rev = '';
    try {
      if (fs.existsSync(ddlSitesPath)) {
        _rev = crypto
          .createHash('sha256')
          .update(fs.readFileSync(ddlSitesPath))
          .digest('hex')
          .slice(0, 16);
      }
    } catch {
      /* hash best-effort — empty _rev just means "no concurrency check" */
    }
    res.json({ ddlSites, ddl, _rev });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load DDL' });
  }
});

// GET /api/shared/summarize - Summarize DB
router.get('/summarize', (req, res) => {
  try {
    const data = readJson(path.join(LIB, 'SummarizeDB', 'summarize_db.json')) || [];
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load summarize data' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Machine Profiles — press library for Layout Optimizer.
// ═══════════════════════════════════════════════════════════════════
// Stores profiles keyed by `id` (slug). Operators can:
//   GET    /api/shared/machine-profiles           → list all
//   POST   /api/shared/machine-profiles           → add new (admin-gated)
//   PUT    /api/shared/machine-profiles/:id       → update
//   DELETE /api/shared/machine-profiles/:id       → remove
// Seed ships with Gallus 135T / Brotech 192T / Bayro 200T / HP Indigo.
// File location: Library/MachineProfiles/profiles.json — same shape
// as loaded via GET { profiles: [...] }.

const MP_FILE = path.join(LIB, 'MachineProfiles', 'profiles.json');

function mpRead() {
  try {
    const data = readJson(MP_FILE);
    const rawProfiles = Array.isArray(data?.profiles) ? data.profiles : [];
    // Validate on read so a corrupt/hostile Library/MachineProfiles/
    // profiles.json can't inject unexpected fields. Passthrough mode
    // (not strict) preserves unknown keys for forward-compat with
    // client-side additions; required fields (id/name) filter out
    // blank rows.
    const { rows } = validateRows(rawProfiles, machineProfileSchema, {
      source: 'MachineProfiles/profiles.json',
    });
    return rows;
  } catch {
    return [];
  }
}

function mpWrite(profiles) {
  fs.mkdirSync(path.dirname(MP_FILE), { recursive: true });
  atomicWriteFileSync(MP_FILE, JSON.stringify({ profiles }, null, 2));
}

function mpNormalizeDieList(list) {
  // A die list is an array of { tooth, qty }. Accept either the new
  // object form OR legacy bare-number form for backward-compat
  // ([60, 72, 90] → [{tooth:60,qty:1}, ...]).
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    let tooth, qty;
    if (typeof item === 'number') {
      tooth = item;
      qty = 1;
    } else if (item && typeof item === 'object') {
      tooth = Number(item.tooth) || 0;
      qty = Number(item.qty) || 1;
    } else continue;
    if (!tooth || tooth <= 0) continue;
    if (seen.has(tooth)) continue; // dedupe
    seen.add(tooth);
    out.push({ tooth, qty: Math.max(1, qty) });
  }
  return out.sort((a, b) => a.tooth - b.tooth);
}

function mpNormalize(p) {
  // Coerce incoming payloads to the canonical shape. Callers that only
  // send partial fields get the rest filled with sensible defaults.
  //
  // v2 schema (2026-04-23): plate_dies and magnetic_dies separately.
  // Legacy common_dies (single flat list) is accepted for read-only
  // compatibility but writes always persist the new shape.
  const plate_dies = mpNormalizeDieList(
    p?.plate_dies || (Array.isArray(p?.common_dies) ? p.common_dies : [])
  );
  const magnetic_dies = mpNormalizeDieList(p?.magnetic_dies || []);
  return {
    id: String(p?.id || '')
      .trim()
      .slice(0, 64),
    name: String(p?.name || '')
      .trim()
      .slice(0, 120),
    press_type: p?.press_type === 'flat' ? 'flat' : 'rotary',
    tooth_count_max: Number(p?.tooth_count_max) || 0,
    tooth_pitch_mm: Number(p?.tooth_pitch_mm) || 3.175,
    web_width_min_mm: Number(p?.web_width_min_mm) || 0,
    web_width_max_mm: Number(p?.web_width_max_mm) || 0,
    max_pitch_mm: Number(p?.max_pitch_mm) || 0,
    speed_max_m_min: Number(p?.speed_max_m_min) || 0,
    num_stations: Number(p?.num_stations) || 0,
    num_print_stations: Number(p?.num_print_stations) || 0,
    num_diecut_stations: Number(p?.num_diecut_stations) || 0,
    plate_dies,
    magnetic_dies,
    // Preserve legacy field for older clients: intersection (tooth
    // counts where BOTH a plate + magnetic cylinder are in stock).
    common_dies: plate_dies
      .filter((d) => magnetic_dies.some((m) => m.tooth === d.tooth))
      .map((d) => d.tooth),
    notes: String(p?.notes || '').slice(0, 500),
  };
}

router.get('/machine-profiles', (_req, res) => {
  try {
    res.json(mpRead());
  } catch (err) {
    logErr(_req, 'mp:list', err);
    res.status(500).json({ error: 'Failed to load profiles' });
  }
});

router.post('/machine-profiles', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  const profile = mpNormalize(req.body);
  if (!profile.id || !profile.name) return res.status(400).json({ error: 'id_and_name_required' });
  try {
    await withLock('machine-profiles', async () => {
      const profiles = mpRead();
      if (profiles.some((p) => p.id === profile.id)) {
        throw Object.assign(new Error('duplicate_id'), { safe: true });
      }
      profiles.push(profile);
      mpWrite(profiles);
    });
    res.json({ ok: true, profile });
  } catch (err) {
    if (err.message === 'duplicate_id') return res.status(409).json({ error: 'duplicate_id' });
    logErr(req, 'mp:create', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

router.put('/machine-profiles/:id', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  const id = String(req.params.id);
  const profile = mpNormalize({ ...req.body, id });
  if (!profile.name) return res.status(400).json({ error: 'name_required' });
  try {
    let found = false;
    await withLock('machine-profiles', async () => {
      const profiles = mpRead();
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx >= 0) {
        profiles[idx] = profile;
        found = true;
        mpWrite(profiles);
      }
    });
    if (!found) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, profile });
  } catch (err) {
    logErr(req, 'mp:update', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

router.delete('/machine-profiles/:id', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  const id = String(req.params.id);
  try {
    let removed = false;
    await withLock('machine-profiles', async () => {
      const profiles = mpRead();
      const next = profiles.filter((p) => p.id !== id);
      if (next.length !== profiles.length) {
        removed = true;
        mpWrite(next);
      }
    });
    if (!removed) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    logErr(req, 'mp:delete', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Permission Groups — SAP-style authorization profiles (Sprint S1).
// ═══════════════════════════════════════════════════════════════════
//
// Each group defines per-tab access ('hidden' | 'read' | 'edit').
// Operators assign a group + department to each user. Client filters
// sidebar + disables inputs accordingly; server middleware (Pha 3)
// enforces writes. Seed ships with 7 defaults (leader/sales/cs/npi/
// purchasing/production/quality) + `all_access` fallback.

const PG_FILE = path.join(LIB, 'PermissionGroups', 'groups.json');

function pgRead() {
  try {
    const data = readJson(PG_FILE);
    if (data && typeof data === 'object') {
      return {
        groups: Array.isArray(data.groups) ? data.groups : [],
        tab_catalog: Array.isArray(data._tab_catalog) ? data._tab_catalog : [],
        departments: Array.isArray(data._departments) ? data._departments : [],
      };
    }
    return { groups: [], tab_catalog: [], departments: [] };
  } catch {
    return { groups: [], tab_catalog: [], departments: [] };
  }
}

function pgWrite(next) {
  const current = readJson(PG_FILE) || {};
  const out = {
    ...current,
    groups: Array.isArray(next.groups) ? next.groups : current.groups || [],
  };
  fs.mkdirSync(path.dirname(PG_FILE), { recursive: true });
  atomicWriteFileSync(PG_FILE, JSON.stringify(out, null, 2));
}

const VALID_PERM_VALUES = new Set(['hidden', 'read', 'edit']);
function pgNormalize(g) {
  const tabPerms = {};
  if (g?.tab_permissions && typeof g.tab_permissions === 'object') {
    for (const [k, v] of Object.entries(g.tab_permissions)) {
      if (!VALID_PERM_VALUES.has(v)) continue;
      tabPerms[String(k).slice(0, 40)] = v;
    }
  }
  return {
    id: String(g?.id || '')
      .trim()
      .slice(0, 64),
    name: String(g?.name || '')
      .trim()
      .slice(0, 120),
    default_department: String(g?.default_department || '')
      .trim()
      .slice(0, 40),
    is_system: !!g?.is_system,
    tab_permissions: tabPerms,
    notes: String(g?.notes || '').slice(0, 500),
  };
}

// GET /api/shared/permission-groups — returns { groups, tab_catalog, departments }
router.get('/permission-groups', (_req, res) => {
  try {
    res.json(pgRead());
  } catch (err) {
    logErr(_req, 'pg:list', err);
    res.status(500).json({ error: 'Failed to load groups' });
  }
});

// POST /api/shared/permission-groups — create new group.
router.post('/permission-groups', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  if (!isAdminPlus(cu)) return res.status(403).json({ error: 'admin_or_sys_required' });
  const group = pgNormalize(req.body);
  if (!group.id || !group.name) return res.status(400).json({ error: 'id_and_name_required' });
  try {
    await withLock('permission-groups', async () => {
      const data = pgRead();
      if (data.groups.some((g) => g.id === group.id)) {
        throw Object.assign(new Error('duplicate_id'), { safe: true });
      }
      data.groups.push(group);
      pgWrite(data);
      audit('PG_CREATE', cu.username, req.ip, group.id);
    });
    res.json({ ok: true, group });
  } catch (err) {
    if (err.message === 'duplicate_id') return res.status(409).json({ error: 'duplicate_id' });
    logErr(req, 'pg:create', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// PUT /api/shared/permission-groups/:id — update.
router.put('/permission-groups/:id', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  if (!isAdminPlus(cu)) return res.status(403).json({ error: 'admin_or_sys_required' });
  const id = String(req.params.id);
  const group = pgNormalize({ ...req.body, id });
  if (!group.name) return res.status(400).json({ error: 'name_required' });
  try {
    let found = false;
    await withLock('permission-groups', async () => {
      const data = pgRead();
      const idx = data.groups.findIndex((g) => g.id === id);
      if (idx >= 0) {
        // Preserve is_system flag — can't be flipped via PUT.
        const prev = data.groups[idx];
        data.groups[idx] = { ...group, is_system: !!prev.is_system };
        found = true;
        pgWrite(data);
        audit('PG_UPDATE', cu.username, req.ip, id);
      }
    });
    if (!found) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, group });
  } catch (err) {
    logErr(req, 'pg:update', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// DELETE /api/shared/permission-groups/:id — remove. System groups protected.
router.delete('/permission-groups/:id', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  if (!isAdminPlus(cu)) return res.status(403).json({ error: 'admin_or_sys_required' });
  const id = String(req.params.id);
  try {
    let removed = false;
    let wasSystem = false;
    await withLock('permission-groups', async () => {
      const data = pgRead();
      const g = data.groups.find((x) => x.id === id);
      if (g && g.is_system) {
        wasSystem = true;
        return;
      }
      const next = data.groups.filter((x) => x.id !== id);
      if (next.length !== data.groups.length) {
        removed = true;
        pgWrite({ ...data, groups: next });
        audit('PG_DELETE', cu.username, req.ip, id);
      }
    });
    if (wasSystem) return res.status(403).json({ error: 'system_group_protected' });
    if (!removed) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    logErr(req, 'pg:delete', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Machine Technical — Library > Machine Technical (Sprint S-MTECH).
// ═══════════════════════════════════════════════════════════════════
// Two kinds of machines tracked separately in the same JSON file:
//   - printing: ink-on-web press equipment (screen, flexo, HP, offset)
//   - cutting:  die-cut / flatbed / rotary / power-press / CNC
//
// Exposes:
//   GET    /machine-technical?kind=printing|cutting            → list
//   POST   /machine-technical/:kind                            → create
//   PUT    /machine-technical/:kind/:id                        → update
//   DELETE /machine-technical/:kind/:id                        → remove
//   GET    /machine-technical/:kind/export                     → xlsx download
//   POST   /machine-technical/:kind/import                     → xlsx / csv upload
// Writes require admin/sys role. Imports MERGE on `id` (upsert), logging
// create vs update count.

const MT_FILE = path.join(LIB, 'MachineTechnical', 'machines.json');

function mtRead() {
  try {
    const data = readJson(MT_FILE);
    return {
      printing: Array.isArray(data?.printing) ? data.printing : [],
      cutting: Array.isArray(data?.cutting) ? data.cutting : [],
      _meta: data || {},
    };
  } catch {
    return { printing: [], cutting: [], _meta: {} };
  }
}

function mtWrite(next) {
  fs.mkdirSync(path.dirname(MT_FILE), { recursive: true });
  const current = readJson(MT_FILE) || {};
  atomicWriteFileSync(MT_FILE, JSON.stringify({ ...current, ...next }, null, 2));
}

function mtKindOk(kind) {
  return kind === 'printing' || kind === 'cutting';
}

function mtNormalize(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const id = String(rec.id || '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80);
  if (!id) return null;
  const out = { ...rec, id };
  // Trim long strings + coerce numeric-looking fields
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && v.length > 500) out[k] = v.slice(0, 500);
  }
  return out;
}

router.get('/machine-technical', (req, res) => {
  try {
    const kind = req.query?.kind;
    const data = mtRead();
    if (kind && mtKindOk(kind)) return res.json({ items: data[kind], kind });
    // Default: return both lists + meta (field catalogs, cutting_types enum)
    res.json(data._meta);
  } catch (err) {
    logErr(req, 'mt:list', err);
    res.status(500).json({ error: 'Failed to load machines' });
  }
});

router.post('/machine-technical/:kind', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  if (!isAdminPlus(cu)) return res.status(403).json({ error: 'admin_or_sys_required' });
  const kind = req.params.kind;
  if (!mtKindOk(kind)) return res.status(400).json({ error: 'bad_kind' });
  const rec = mtNormalize(req.body);
  if (!rec) return res.status(400).json({ error: 'bad_payload' });
  try {
    await withLock('machine-technical', async () => {
      const data = mtRead();
      const list = data[kind];
      if (list.some((x) => x.id === rec.id))
        throw Object.assign(new Error('duplicate_id'), { safe: true });
      list.push(rec);
      mtWrite({ [kind]: list });
      audit('MT_CREATE', cu.username, req.ip, `${kind}:${rec.id}`);
    });
    res.json({ ok: true, machine: rec });
  } catch (err) {
    if (err.message === 'duplicate_id') return res.status(409).json({ error: 'duplicate_id' });
    logErr(req, 'mt:create', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// PUT /machine-technical/enums/:key — update an enum list in the meta
// (e.g. _cutting_types). Admin-only. Used by the UI when operators
// want to add/rename/remove a cutting type option.
//
// Allowed keys are whitelisted so we can't accidentally nuke the
// schema-version or field catalog by sending key='printing_fields'.
//
// MUST be registered BEFORE the generic `/:kind/:id` PUT below,
// otherwise Express matches first and interprets kind="enums" → 400.
const MT_ENUM_KEYS = new Set(['_cutting_types', '_departments']);
router.put('/machine-technical/enums/:key', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  if (!isAdminPlus(cu)) return res.status(403).json({ error: 'admin_or_sys_required' });
  const key = String(req.params.key || '').trim();
  if (!MT_ENUM_KEYS.has(key))
    return res.status(400).json({ error: 'bad_enum_key', allowed: [...MT_ENUM_KEYS] });
  const values = Array.isArray(req.body?.values)
    ? req.body.values
        .map((v) =>
          String(v || '')
            .trim()
            .slice(0, 60)
        )
        .filter(Boolean)
    : null;
  if (!values) return res.status(400).json({ error: 'values_array_required' });
  // Dedupe while preserving order (first occurrence wins).
  const seen = new Set();
  const deduped = [];
  for (const v of values) {
    const norm = v.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    deduped.push(v);
  }
  try {
    await withLock('machine-technical', async () => {
      mtWrite({ [key]: deduped });
      audit('MT_ENUM_UPDATE', cu.username, req.ip, `${key}: ${deduped.length} values`);
    });
    res.json({ ok: true, key, values: deduped });
  } catch (err) {
    logErr(req, 'mt:enum:update', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// PUT /machine-technical/:kind/:id — update a machine record.
// Registered AFTER /enums/:key so the specific route wins.
router.put('/machine-technical/:kind/:id', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  if (!isAdminPlus(cu)) return res.status(403).json({ error: 'admin_or_sys_required' });
  const kind = req.params.kind;
  const id = String(req.params.id);
  if (!mtKindOk(kind)) return res.status(400).json({ error: 'bad_kind' });
  const rec = mtNormalize({ ...req.body, id });
  if (!rec) return res.status(400).json({ error: 'bad_payload' });
  try {
    let found = false;
    await withLock('machine-technical', async () => {
      const data = mtRead();
      const list = data[kind];
      const idx = list.findIndex((x) => x.id === id);
      if (idx >= 0) {
        list[idx] = rec;
        found = true;
        mtWrite({ [kind]: list });
        audit('MT_UPDATE', cu.username, req.ip, `${kind}:${id}`);
      }
    });
    if (!found) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, machine: rec });
  } catch (err) {
    logErr(req, 'mt:update', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

router.delete('/machine-technical/:kind/:id', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  if (!isAdminPlus(cu)) return res.status(403).json({ error: 'admin_or_sys_required' });
  const kind = req.params.kind;
  const id = String(req.params.id);
  if (!mtKindOk(kind)) return res.status(400).json({ error: 'bad_kind' });
  try {
    let removed = false;
    await withLock('machine-technical', async () => {
      const data = mtRead();
      const list = data[kind];
      const next = list.filter((x) => x.id !== id);
      if (next.length !== list.length) {
        removed = true;
        mtWrite({ [kind]: next });
        audit('MT_DELETE', cu.username, req.ip, `${kind}:${id}`);
      }
    });
    if (!removed) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    logErr(req, 'mt:delete', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// GET /machine-technical/:kind/export — streams an xlsx with the canonical
// transposed layout (attribute × machine) matching the original CCL file.
router.get('/machine-technical/:kind/export', async (req, res) => {
  const kind = req.params.kind;
  if (!mtKindOk(kind)) return res.status(400).json({ error: 'bad_kind' });
  try {
    const XLSX = (await import('xlsx')).default;
    const data = mtRead();
    const items = data[kind];
    const fields = data._meta[`_${kind}_fields`] || Object.keys(items[0] || {});
    // Transposed sheet: first column = field name, then one column per machine.
    const sheet = [];
    sheet.push(['Attribute', ...items.map((m) => m.model || m.id)]);
    for (const f of fields) {
      if (f === 'notes') continue;
      const row = [
        f,
        ...items.map((m) => {
          const v = m[f];
          if (v === null || v === undefined) return '';
          if (Array.isArray(v)) return v.join(', ');
          if (typeof v === 'boolean') return v ? 'Yes' : 'No';
          return v;
        }),
      ];
      sheet.push(row);
    }
    const ws = XLSX.utils.aoa_to_sheet(sheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      kind === 'printing' ? 'Printing Equipment' : 'Cutting Equipment'
    );
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname = `machine-technical-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  } catch (err) {
    logErr(req, 'mt:export', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// POST /machine-technical/:kind/import — multipart xlsx/csv upload.
// Accepts the canonical transposed shape (attribute rows × machine cols)
// OR a flat rows-are-machines shape. UPSERTs by id (or brand-model slug).
const mtImportTmp = path.join(LIB, 'MachineTechnical', '_import_tmp');
try {
  fs.mkdirSync(mtImportTmp, { recursive: true, mode: 0o700 });
} catch {
  /* ignore */
}
const mtUpload = multer({
  dest: mtImportTmp,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Sprint B3e / A4-02 (2026-06-19) — defense-in-depth: bulk-import
// is operator-impactful (replaces machine technical data wholesale)
// so symmetric `requireTabAccess('lib-machine-tech')` matches the
// guard pattern the (since removed) tracker attachment routes used.
// The handler's inline `requireWriter` still runs (defense in depth,
// not a replacement) — a viewer who somehow bypasses the middleware
// still gets 401/403 from the inline check.
router.post(
  '/machine-technical/:kind/import',
  requireTabAccess('lib-machine-tech'),
  mtUpload.single('file'),
  async (req, res) => {
    const cu = requireWriter(req, res);
    if (!cu) {
      if (req.file)
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      return;
    }
    if (!isAdminPlus(cu)) {
      if (req.file)
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      return res.status(403).json({ error: 'admin_or_sys_required' });
    }
    const kind = req.params.kind;
    if (!mtKindOk(kind)) {
      if (req.file)
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      return res.status(400).json({ error: 'bad_kind' });
    }
    if (!req.file) return res.status(400).json({ error: 'no_file' });

    try {
      const XLSX = (await import('xlsx')).default;
      // xlsx ESM build (xlsx.mjs) has no fs wired → readFile throws
      // "Cannot access file"; read bytes + XLSX.read(buffer) instead.
      const wb = XLSX.read(fs.readFileSync(req.file.path));
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Detect shape: if first col header is 'Attribute' or contains all
      // attribute names → transposed (attribute × machine).
      // Else → rows-are-machines with first row as header.
      let imported = [];
      const FIELD_LIST = mtRead()._meta[`_${kind}_fields`] || [];
      if (rows.length > 0 && FIELD_LIST.includes(String(rows[1]?.[0] || ''))) {
        // Transposed — rebuild records.
        const numCols = Math.max(...rows.map((r) => r.length));
        for (let col = 1; col < numCols; col++) {
          const rec = {};
          for (let r = 1; r < rows.length; r++) {
            const key = String(rows[r]?.[0] || '').trim();
            if (!FIELD_LIST.includes(key)) continue;
            let val = rows[r]?.[col];
            if (val === '' || val === undefined) continue;
            if (key.startsWith('has_')) val = val === 'Yes' || val === true;
            rec[key] = val;
          }
          if (rec.brand || rec.model) imported.push(rec);
        }
      } else {
        // Flat rows — header row + data rows.
        const header = rows[0].map((h) => String(h || '').trim());
        for (let r = 1; r < rows.length; r++) {
          const rec = {};
          header.forEach((h, i) => {
            const v = rows[r]?.[i];
            if (v !== '' && v !== undefined) rec[h] = v;
          });
          if (rec.brand || rec.model) imported.push(rec);
        }
      }

      // Upsert by id (or synthesize id from brand-model).
      const slug = (s) =>
        String(s || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 80);
      let created = 0,
        updated = 0;
      await withLock('machine-technical', async () => {
        const data = mtRead();
        const list = data[kind];
        for (const incoming of imported) {
          const rec = { ...incoming };
          if (!rec.id) rec.id = slug(`${rec.brand || 'unknown'}-${rec.model || Date.now()}`);
          const idx = list.findIndex((x) => x.id === rec.id);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...rec };
            updated++;
          } else {
            list.push(rec);
            created++;
          }
        }
        mtWrite({ [kind]: list });
        audit(
          'MT_IMPORT',
          cu.username,
          req.ip,
          `${kind}: +${created} created, ~${updated} updated`
        );
      });

      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      res.json({ ok: true, created, updated, total: imported.length });
    } catch (err) {
      if (req.file)
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      logErr(req, 'mt:import', err);
      res.status(500).json({ error: redactErrorMessage(err) });
    }
  }
);
// GET /api/shared/ink-calc - Ink calculator data
router.get('/ink-calc', (req, res) => {
  try {
    const data = readJson(path.join(LIB, 'InkCalc', 'ink_calc.json')) || [];
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load ink calc' });
  }
});

/** Parse window._VAR_NAME={...} from .js data file */
function parseJsDataFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/window\.\w+\s*=\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*;?\s*$/);
    if (match) return JSON.parse(match[1]);
    return null;
  } catch {
    return null;
  }
}

// GET /api/shared/finance - Finance data (reads both .json and .js data files)
router.get('/finance', (req, res) => {
  try {
    const finDir = path.join(LIB, 'Finance');
    const wc = readJson(path.join(finDir, 'finance_wc.json')) || [];
    const summary = readJson(path.join(finDir, 'finance_sum.json')) || {};

    // Parse .js baseline data files (Finance DB, WC by year, Summary by year)
    const years = {};
    const jsFiles = fs.existsSync(finDir)
      ? fs.readdirSync(finDir).filter((f) => f.endsWith('_data.js'))
      : [];
    for (const f of jsFiles) {
      const data = parseJsDataFile(path.join(finDir, f));
      if (!data) continue;
      // finance_db_2025_data.js → { year: '2025', type: 'db', data }
      const m = f.match(/finance_(db|wc|sum)_(\d{4})_data\.js/);
      if (m) {
        const [, type, year] = m;
        if (!years[year]) years[year] = {};
        if (type === 'db' && data) {
          // Normalize: flatten nested expenses → expenses_operations, expenses_production, etc.
          const normalized = { ...data };
          if (data.expenses && typeof data.expenses === 'object' && !Array.isArray(data.expenses)) {
            for (const [ek, ev] of Object.entries(data.expenses)) {
              if (!normalized[`expenses_${ek}`]) normalized[`expenses_${ek}`] = ev;
            }
            delete normalized.expenses;
          }
          years[year][type] = normalized;
        } else {
          years[year][type] = data;
        }
      }
    }

    res.json({ wc, summary, years });
  } catch (err) {
    console.error('Finance load error:', err);
    res.status(500).json({ error: 'Failed to load finance' });
  }
});

// POST /api/shared/refresh-cache - Clear data cache (after import)
router.post('/refresh-cache', (req, res) => {
  clearCache();
  res.json({ ok: true, message: 'Cache cleared successfully' });
});

export default router;
