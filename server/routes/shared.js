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
  getInventory,
  getManufacturingStructures,
  getBOMForPart,
  getRoutingOperations,
  getRoutingForPart,
  getWorkCenters,
  getProducts,
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

// Actions the approval state machine accepts. Mirrored into validation
// so the router rejects garbage before it reaches the state machine —
// the 400 response then lists valid actions instead of surfacing the
// internal machine error.
const APPROVAL_ACTIONS = [
  'SUBMIT',
  'APPROVE_SALES',
  'APPROVE_FINANCE',
  'APPROVE',
  'REJECT',
  'REVOKE',
];

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

// GET /api/shared/inventory - Full IFS inventory data
// Repo returns the same { inventory, finishedGoods, rawMaterials } shape
// dataSync.getInventory() did, so clients see no change.
router.get('/inventory', (req, res) => {
  try {
    const data = repo.listInventoryAll();
    // Sprint 1.7h Phase 1 — ETag short-circuit: 2nd+ visits get 304 in
    // ~5ms instead of re-downloading the 2.8 MB JSON.
    sendJsonWithEtag(req, res, data);
  } catch (err) {
    console.error('Error loading inventory:', err);
    res.status(500).json({ error: 'Failed to load inventory data' });
  }
});

// GET /api/shared/products - Product catalog from IFS finished goods
router.get('/products', (req, res) => {
  try {
    const data = getProducts();
    res.json(data);
  } catch (err) {
    console.error('Error loading products:', err);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

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
    const sourcingDB = readJson(path.join(LIB, 'MaterialCost', 'sourcing_db.json')) || [];
    res.json({ matDB, npiDB, sourcingDB });
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
    // Range filter precedence: from/to > month > year > days > all-history.
    // `days` is preset (30 | 90 | 365). `month` is YYYY-MM, `year` is YYYY,
    // `from`/`to` are ISO YYYY-MM-DD. Any malformed value is ignored
    // rather than 400'd — bookmarked URLs with junk shouldn't break the page.
    const raw = req.query.days;
    const days = raw === '30' || raw === '90' || raw === '365' ? Number(raw) : null;
    const month =
      typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
        ? req.query.month
        : null;
    const year =
      typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year) ? req.query.year : null;
    const from =
      typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
        ? req.query.from
        : null;
    const to =
      typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
        ? req.query.to
        : null;
    const opts = {
      ...(days ? { days } : {}),
      ...(month ? { month } : {}),
      ...(year ? { year } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };

    // Phase 9F.3 + 9N.1 — single-scan-per-window optimization. We do
    // AT MOST two full-table scans per /dashboard request:
    //   (1) `metrics`    — filtered by `days` (empty = all history)
    //   (2) `metricsAll` — full history, shared between the 12-month
    //                     monthly series + margin-trend series which
    //                     always span a full year regardless of filter.
    // When `days` is null (all-time range) these are the same array and
    // we avoid double-scanning by reusing the reference. 10k quote DB:
    // 3 scans → 1-2 scans; 100k DB: ~350ms → ~70-140ms.
    const hasFilter = !!(days || month || year || from || to);
    const metrics = collectMetrics(opts);
    const metricsAll = hasFilter ? collectMetrics() : metrics;
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
      range: {
        days,
        month,
        year,
        from,
        to,
        since: days ? new Date(Date.now() - days * 86400000).toISOString() : null,
      },
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
        action: String(action).toUpperCase(),
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

// ── Atomic approval endpoint (Sprint 6.2) ────────────────────────────
//
// POST /api/shared/approvals/:quoteId/transition
// Body: { action: 'SUBMIT'|'APPROVE_SALES'|'APPROVE_FINANCE'|'APPROVE'|'REJECT'|'REVOKE', reason?: string }
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
  const usersWithRole = (role) =>
    users
      .filter((u) => u && Array.isArray(u.approval_roles) && u.approval_roles.includes(role))
      .map((u) => u.username);

  const submitter = prevApproval?.submitted_by;
  const out = [];
  const addDistinct = (username, reason) => {
    if (!username || username === actorUsername) return; // never notify the actor
    if (out.some((r) => r.recipient === username)) return;
    out.push({ recipient: username, recipient_reason: reason });
  };

  if (toStatus === 'pending_sales') {
    for (const u of usersWithRole('sales_mgr')) addDistinct(u, 'sales_mgr review queue');
  } else if (toStatus === 'pending_finance') {
    for (const u of usersWithRole('finance_dir')) addDistinct(u, 'finance_dir review queue');
  } else if (toStatus === 'approved') {
    if (submitter) addDistinct(submitter, 'your quote was approved');
  } else if (toStatus === 'rejected') {
    if (submitter) addDistinct(submitter, 'your quote was rejected — please revise');
  } else if (toStatus === 'draft') {
    // REVOKE path — tell the submitter + previous approvers their sign-off is cleared.
    if (submitter) addDistinct(submitter, 'approval revoked — quote returned to draft');
    if (prevApproval?.sales_approved_by)
      addDistinct(prevApproval.sales_approved_by, 'sales approval revoked');
    if (prevApproval?.finance_approved_by)
      addDistinct(prevApproval.finance_approved_by, 'finance approval revoked');
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
    const normalizedAction = String(action).toUpperCase();

    try {
      const result = await withLock(`quote:${quoteId}`, async () => {
        const quotes = loadQuotes();
        const idx = quotes.findIndex((q) => q && q.id === quoteId);
        if (idx === -1) {
          return { status: 404, body: { ok: false, error: `Quote ${quoteId} not found` } };
        }
        const quote = quotes[idx];
        const prevApproval = quote.state?.approval || null;

        // Phase 9E.4 — when APPROVE_FINANCE fires, freeze the pricing
        // basis (site + live SGA rate) into the approval record. Read
        // live Finance config on the server so we don't trust a client-
        // provided value; this guarantees the snapshot reflects what
        // Finance actually had at the approval moment.
        let snapshot = null;
        if (normalizedAction === 'APPROVE_FINANCE' || normalizedAction === 'APPROVE') {
          const site = quote.state?.site || 'VN';
          try {
            const finSum = readJson(path.join(LIB, 'Finance', 'finance_sum.json')) || {};
            const ratesBySite = finSum?.sga_rate_pct_by_site || {};
            // Case-insensitive lookup matches client computeSga behavior.
            let rate = ratesBySite[site];
            if (rate == null) {
              const nkey = String(site).trim().toLowerCase();
              for (const [k, v] of Object.entries(ratesBySite)) {
                if (String(k).trim().toLowerCase() === nkey) {
                  rate = v;
                  break;
                }
              }
            }
            snapshot = { site, sga_rate_pct: Number(rate) || 0 };
          } catch (err) {
            // Finance config unreadable → graceful-degrade to 0% so the
            // approval isn't blocked. Sprint 12: log loudly so Ops sees
            // the silent fallback. Without this the margin reporting on
            // the approved quote looks fine to the user but uses 0% SGA
            // when the live rate might have been 5%.
            console.error(
              `  ❌  APPROVE_FINANCE snapshot read failed (quote=${quoteId}, site=${site}): ${err?.message || err}. Falling back to 0% SGA.`
            );
            snapshot = { site, sga_rate_pct: 0 };
          }
        }

        const tr = approvalTransition({
          approval: prevApproval,
          action: normalizedAction,
          actorUser,
          reason,
          snapshot,
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

        // Sprint 12: include the frozen SGA snapshot in the audit entry
        // when APPROVE_FINANCE fires. The snapshot is ALSO persisted on
        // the quote (approval.rates_snapshot), but Finance/compliance
        // auditors typically look at the append-only audit log first —
        // having the rate inline makes "who signed off at what rate"
        // traceable without cross-referencing quote state that could
        // later be REVOKEd.
        const snapSuffix = snapshot ? ` sga=${snapshot.sga_rate_pct}% site=${snapshot.site}` : '';
        audit(
          'APPROVAL_TRANSITION',
          actorUser.username,
          clientIp(req),
          `quote=${quoteId} ${normalizedAction} ${prevApproval?.status || 'draft'}→${tr.approval.status}${snapSuffix}${reason ? ' reason=' + String(reason).slice(0, 200) : ''}`
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
router.get('/quotes', (req, res) => {
  try {
    const all = loadQuotes();
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
    res.json(q);
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
    const ddlSites = readJson(path.join(LIB, 'DDL', 'ddl_sites.json')) || {};
    const ddl = readJson(path.join(LIB, 'DDL', 'ddl.json')) || {};
    res.json({ ddlSites, ddl });
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

// GET /api/shared/rfq-tracker - RFQ Tracker
router.get('/rfq-tracker', (req, res) => {
  try {
    const data = readJson(path.join(LIB, 'RFQTracker', 'rfq_tracker.json')) || [];
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load RFQ data' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// RFQ Tracker — audit log (append-only) + attachments.
// ═══════════════════════════════════════════════════════════════════
// Audit entries are stored in Library/RFQTracker/rfq_audit.json keyed
// by RFQ id. The server REJECTS any PUT/DELETE to audit entries — only
// POST (append) is allowed. This is the SAP-style immutable log.
//
// Attachment files are content-addressed by sha1 under
// Library/RFQTracker/attachments/<sha1>.<ext>. The per-RFQ pointer list
// (with original filename, uploaded_by, uploaded_at, version) lives in
// rfq_attachments.json. Re-uploading an identical file is a no-op on
// disk; a new pointer entry is still written so the audit trail shows
// the re-upload event.

const RFQ_DIR = path.join(LIB, 'RFQTracker');
const RFQ_AUDIT_FILE = path.join(RFQ_DIR, 'rfq_audit.json');
const RFQ_ATTACH_FILE = path.join(RFQ_DIR, 'rfq_attachments.json');
const RFQ_ATTACH_DIR = path.join(RFQ_DIR, 'attachments');
const RFQ_ATTACH_TMP = path.join(RFQ_DIR, '_attach_tmp');

function rfqEnsureDirs() {
  fs.mkdirSync(RFQ_DIR, { recursive: true });
  fs.mkdirSync(RFQ_ATTACH_DIR, { recursive: true });
  try {
    fs.mkdirSync(RFQ_ATTACH_TMP, { recursive: true, mode: 0o700 });
  } catch {
    /* ignore */
  }
}

function rfqReadAudit() {
  try {
    rfqEnsureDirs();
    return readJson(RFQ_AUDIT_FILE) || {};
  } catch {
    return {};
  }
}

function rfqWriteAudit(obj) {
  rfqEnsureDirs();
  atomicWriteFileSync(RFQ_AUDIT_FILE, JSON.stringify(obj, null, 2));
}

function rfqReadAttachments() {
  try {
    rfqEnsureDirs();
    return readJson(RFQ_ATTACH_FILE) || {};
  } catch {
    return {};
  }
}

function rfqWriteAttachments(obj) {
  rfqEnsureDirs();
  atomicWriteFileSync(RFQ_ATTACH_FILE, JSON.stringify(obj, null, 2));
}

// GET /api/shared/rfq-tracker/audit/:id — full audit trail for one RFQ.
router.get('/rfq-tracker/audit/:id', (req, res) => {
  try {
    const all = rfqReadAudit();
    res.json(all[req.params.id] || []);
  } catch (err) {
    logErr(req, 'rfq:audit:read', err);
    res.status(500).json({ error: 'Failed to read audit' });
  }
});

// POST /api/shared/rfq-tracker/audit/:id — append an audit entry.
// Body: { kind, field?, from?, to?, meta? }. Server stamps user +
// ts — clients can't forge either. We use a lock so concurrent
// appends don't lose each other under load.
router.post('/rfq-tracker/audit/:id', requireTabAccess('rfq-tracker'), async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  const rfqId = String(req.params.id);
  const body = req.body || {};
  const kind = typeof body.kind === 'string' ? body.kind.slice(0, 40) : '';
  if (!kind) return res.status(400).json({ error: 'kind_required' });
  const entry = {
    ts: new Date().toISOString(),
    user: cu.username || '-',
    kind,
    ...(body.field ? { field: String(body.field).slice(0, 80) } : {}),
    ...(body.from !== undefined
      ? { from: typeof body.from === 'string' ? body.from.slice(0, 200) : body.from }
      : {}),
    ...(body.to !== undefined
      ? { to: typeof body.to === 'string' ? body.to.slice(0, 200) : body.to }
      : {}),
    ...(body.meta && typeof body.meta === 'object' ? { meta: body.meta } : {}),
  };
  try {
    await withLock('rfq:audit', async () => {
      const all = rfqReadAudit();
      if (!Array.isArray(all[rfqId])) all[rfqId] = [];
      all[rfqId].push(entry);
      // Hard cap per RFQ so a runaway script can't balloon the file.
      if (all[rfqId].length > 5000) all[rfqId] = all[rfqId].slice(-5000);
      rfqWriteAudit(all);
    });
    try {
      emitDataChange('rfq.updated', { id: rfqId, kind, savedBy: cu.username });
    } catch {
      /* event bus best-effort */
    }
    res.json({ ok: true, entry });
  } catch (err) {
    logErr(req, 'rfq:audit:append', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// Multer instance for RFQ attachments. 15 MB cap; broad file filter
// (ops genuinely need to attach PDFs, images, emails, xlsx).
const rfqUpload = multer({
  dest: RFQ_ATTACH_TMP,
  limits: { fileSize: (Number(process.env.OPS_RFQ_ATTACH_MAX_MB) || 15) * 1024 * 1024 },
});

function rfqHashFile(filePath) {
  const hash = crypto.createHash('sha1');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

// GET /api/shared/rfq-tracker/attachments/:id — list entries for one RFQ.
router.get('/rfq-tracker/attachments/:id', (req, res) => {
  try {
    const all = rfqReadAttachments();
    res.json(all[req.params.id] || []);
  } catch (err) {
    logErr(req, 'rfq:attach:list', err);
    res.status(500).json({ error: 'Failed to list attachments' });
  }
});

// POST /api/shared/rfq-tracker/attachments/:id — upload one file.
// Multipart with field name "file". Returns the saved pointer entry.
router.post(
  '/rfq-tracker/attachments/:id',
  requireTabAccess('rfq-tracker'),
  rfqUpload.single('file'),
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
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const rfqId = String(req.params.id);
    try {
      rfqEnsureDirs();
      const sha = rfqHashFile(req.file.path);
      const ext = (path.extname(req.file.originalname || '') || '').toLowerCase().slice(0, 8);
      const finalName = sha + ext;
      const finalPath = path.join(RFQ_ATTACH_DIR, finalName);
      if (!fs.existsSync(finalPath)) {
        try {
          fs.renameSync(req.file.path, finalPath);
        } catch {
          fs.copyFileSync(req.file.path, finalPath);
          try {
            fs.unlinkSync(req.file.path);
          } catch {
            /* ignore */
          }
        }
      } else {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      }
      const entry = {
        id: crypto.randomBytes(6).toString('hex'),
        original: String(req.file.originalname || 'file').slice(0, 200),
        stored: finalName,
        size: req.file.size,
        uploaded_by: cu.username || '-',
        uploaded_at: new Date().toISOString(),
      };
      await withLock('rfq:attach', async () => {
        const all = rfqReadAttachments();
        if (!Array.isArray(all[rfqId])) all[rfqId] = [];
        all[rfqId].push(entry);
        rfqWriteAttachments(all);
      });
      try {
        emitDataChange('rfq.updated', { id: rfqId, attachment: 'add', savedBy: cu.username });
      } catch {
        /* event bus best-effort */
      }
      res.json({ ok: true, entry });
    } catch (err) {
      if (req.file)
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      logErr(req, 'rfq:attach:upload', err);
      res.status(500).json({ error: redactErrorMessage(err) });
    }
  }
);

// GET /api/shared/rfq-tracker/attachments/:id/:attId/download — stream file.
router.get('/rfq-tracker/attachments/:id/:attId/download', (req, res) => {
  try {
    const all = rfqReadAttachments();
    const entries = all[req.params.id] || [];
    const entry = entries.find((e) => e.id === req.params.attId);
    if (!entry) return res.status(404).json({ error: 'not_found' });
    const filePath = path.join(RFQ_ATTACH_DIR, entry.stored);
    // path-traversal guard — stored names are sha1 + safe ext only,
    // but belt-and-braces: must resolve inside RFQ_ATTACH_DIR.
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(RFQ_ATTACH_DIR) + path.sep)) {
      return res.status(400).json({ error: 'bad_path' });
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'missing_file' });
    res.download(resolved, entry.original);
  } catch (err) {
    logErr(req, 'rfq:attach:download', err);
    res.status(500).json({ error: 'download_failed' });
  }
});

// DELETE /api/shared/rfq-tracker/attachments/:id/:attId — unlink pointer.
// (Physical file is left on disk so other RFQs sharing the same sha1
// aren't broken. A nightly GC job could sweep orphans; out of scope.)
router.delete(
  '/rfq-tracker/attachments/:id/:attId',
  requireTabAccess('rfq-tracker'),
  async (req, res) => {
    const cu = requireWriter(req, res);
    if (!cu) return;
    try {
      await withLock('rfq:attach', async () => {
        const all = rfqReadAttachments();
        const entries = all[req.params.id] || [];
        all[req.params.id] = entries.filter((e) => e.id !== req.params.attId);
        rfqWriteAttachments(all);
      });
      try {
        emitDataChange('rfq.updated', {
          id: req.params.id,
          attachment: 'remove',
          savedBy: cu.username,
        });
      } catch {
        /* event bus best-effort */
      }
      res.json({ ok: true });
    } catch (err) {
      logErr(req, 'rfq:attach:delete', err);
      res.status(500).json({ error: redactErrorMessage(err) });
    }
  }
);

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

router.post('/machine-technical/:kind/import', mtUpload.single('file'), async (req, res) => {
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
    const wb = XLSX.readFile(req.file.path);
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
      audit('MT_IMPORT', cu.username, req.ip, `${kind}: +${created} created, ~${updated} updated`);
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
});

// GET /api/shared/sample-tracking - Sample tracking
router.get('/sample-tracking', (req, res) => {
  try {
    const data = readJson(path.join(LIB, 'SampleTracking', 'sample_tracking.json')) || [];
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load sample tracking' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Sample Tracking — audit log (append-only) + attachments.
// Parallel implementation to the RFQ endpoints above; sharing a single
// helper would save ~30 lines but couple two unrelated domains (RFQ
// deletions would be able to walk sample attachments and vice versa).
// The duplication is deliberate — keep the surfaces isolated.
// ═══════════════════════════════════════════════════════════════════

const ST_DIR = path.join(LIB, 'SampleTracking');
const ST_AUDIT_FILE = path.join(ST_DIR, 'sample_audit.json');
const ST_ATTACH_FILE = path.join(ST_DIR, 'sample_attachments.json');
const ST_ATTACH_DIR = path.join(ST_DIR, 'attachments');
const ST_ATTACH_TMP = path.join(ST_DIR, '_attach_tmp');

function stEnsureDirs() {
  fs.mkdirSync(ST_DIR, { recursive: true });
  fs.mkdirSync(ST_ATTACH_DIR, { recursive: true });
  try {
    fs.mkdirSync(ST_ATTACH_TMP, { recursive: true, mode: 0o700 });
  } catch {
    /* ignore */
  }
}

function stReadAudit() {
  try {
    stEnsureDirs();
    return readJson(ST_AUDIT_FILE) || {};
  } catch {
    return {};
  }
}
function stWriteAudit(obj) {
  stEnsureDirs();
  atomicWriteFileSync(ST_AUDIT_FILE, JSON.stringify(obj, null, 2));
}
function stReadAttachments() {
  try {
    stEnsureDirs();
    return readJson(ST_ATTACH_FILE) || {};
  } catch {
    return {};
  }
}
function stWriteAttachments(obj) {
  stEnsureDirs();
  atomicWriteFileSync(ST_ATTACH_FILE, JSON.stringify(obj, null, 2));
}

router.get('/sample-tracking/audit/:id', (req, res) => {
  try {
    const all = stReadAudit();
    res.json(all[req.params.id] || []);
  } catch (err) {
    logErr(req, 'sample:audit:read', err);
    res.status(500).json({ error: 'Failed to read audit' });
  }
});

router.post('/sample-tracking/audit/:id', requireTabAccess('sample-tracking'), async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  const stId = String(req.params.id);
  const body = req.body || {};
  const kind = typeof body.kind === 'string' ? body.kind.slice(0, 40) : '';
  if (!kind) return res.status(400).json({ error: 'kind_required' });
  const entry = {
    ts: new Date().toISOString(),
    user: cu.username || '-',
    kind,
    ...(body.field ? { field: String(body.field).slice(0, 80) } : {}),
    ...(body.from !== undefined
      ? { from: typeof body.from === 'string' ? body.from.slice(0, 200) : body.from }
      : {}),
    ...(body.to !== undefined
      ? { to: typeof body.to === 'string' ? body.to.slice(0, 200) : body.to }
      : {}),
    ...(body.meta && typeof body.meta === 'object' ? { meta: body.meta } : {}),
  };
  try {
    await withLock('sample:audit', async () => {
      const all = stReadAudit();
      if (!Array.isArray(all[stId])) all[stId] = [];
      all[stId].push(entry);
      if (all[stId].length > 5000) all[stId] = all[stId].slice(-5000);
      stWriteAudit(all);
    });
    try {
      emitDataChange('sample.updated', { id: stId, kind, savedBy: cu.username });
    } catch {
      /* event bus best-effort */
    }
    res.json({ ok: true, entry });
  } catch (err) {
    logErr(req, 'sample:audit:append', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

const stUpload = multer({
  dest: ST_ATTACH_TMP,
  limits: { fileSize: (Number(process.env.OPS_SAMPLE_ATTACH_MAX_MB) || 15) * 1024 * 1024 },
});

function stHashFile(filePath) {
  const hash = crypto.createHash('sha1');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

router.get('/sample-tracking/attachments/:id', (req, res) => {
  try {
    const all = stReadAttachments();
    res.json(all[req.params.id] || []);
  } catch (err) {
    logErr(req, 'sample:attach:list', err);
    res.status(500).json({ error: 'Failed to list attachments' });
  }
});

router.post(
  '/sample-tracking/attachments/:id',
  requireTabAccess('sample-tracking'),
  stUpload.single('file'),
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
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const stId = String(req.params.id);
    try {
      stEnsureDirs();
      const sha = stHashFile(req.file.path);
      const ext = (path.extname(req.file.originalname || '') || '').toLowerCase().slice(0, 8);
      const finalName = sha + ext;
      const finalPath = path.join(ST_ATTACH_DIR, finalName);
      if (!fs.existsSync(finalPath)) {
        try {
          fs.renameSync(req.file.path, finalPath);
        } catch {
          fs.copyFileSync(req.file.path, finalPath);
          try {
            fs.unlinkSync(req.file.path);
          } catch {
            /* ignore */
          }
        }
      } else {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      }
      const entry = {
        id: crypto.randomBytes(6).toString('hex'),
        original: String(req.file.originalname || 'file').slice(0, 200),
        stored: finalName,
        size: req.file.size,
        uploaded_by: cu.username || '-',
        uploaded_at: new Date().toISOString(),
      };
      await withLock('sample:attach', async () => {
        const all = stReadAttachments();
        if (!Array.isArray(all[stId])) all[stId] = [];
        all[stId].push(entry);
        stWriteAttachments(all);
      });
      try {
        emitDataChange('sample.updated', { id: stId, attachment: 'add', savedBy: cu.username });
      } catch {
        /* event bus best-effort */
      }
      res.json({ ok: true, entry });
    } catch (err) {
      if (req.file)
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      logErr(req, 'sample:attach:upload', err);
      res.status(500).json({ error: redactErrorMessage(err) });
    }
  }
);

router.get('/sample-tracking/attachments/:id/:attId/download', (req, res) => {
  try {
    const all = stReadAttachments();
    const entries = all[req.params.id] || [];
    const entry = entries.find((e) => e.id === req.params.attId);
    if (!entry) return res.status(404).json({ error: 'not_found' });
    const filePath = path.join(ST_ATTACH_DIR, entry.stored);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(ST_ATTACH_DIR) + path.sep)) {
      return res.status(400).json({ error: 'bad_path' });
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'missing_file' });
    res.download(resolved, entry.original);
  } catch (err) {
    logErr(req, 'sample:attach:download', err);
    res.status(500).json({ error: 'download_failed' });
  }
});

router.delete(
  '/sample-tracking/attachments/:id/:attId',
  requireTabAccess('sample-tracking'),
  async (req, res) => {
    const cu = requireWriter(req, res);
    if (!cu) return;
    try {
      await withLock('sample:attach', async () => {
        const all = stReadAttachments();
        const entries = all[req.params.id] || [];
        all[req.params.id] = entries.filter((e) => e.id !== req.params.attId);
        stWriteAttachments(all);
      });
      try {
        emitDataChange('sample.updated', {
          id: req.params.id,
          attachment: 'remove',
          savedBy: cu.username,
        });
      } catch {
        /* event bus best-effort */
      }
      res.json({ ok: true });
    } catch (err) {
      logErr(req, 'sample:attach:delete', err);
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

// ═══════════════════════════════════════════════════════════════════
// Print Area Calculator — SKU-keyed measurements + artwork uploads
// ═══════════════════════════════════════════════════════════════════
// Storage:
//   - Metadata:  Library/PrintArea/print_area_jobs.json  ({ jobs: [...] })
//   - Artworks:  Library/PrintArea/artworks/<sha1>.<ext>
// Jobs are keyed by `sku`. Saving the same SKU upserts in-place.
// Artwork files are content-addressed (sha1) so re-uploading the same
// file for a different SKU shares storage and never duplicates.

const PA_DIR = path.join(LIB, 'PrintArea');
const PA_ARTWORK_DIR = path.join(PA_DIR, 'artworks');
const PA_JOBS_FILE = path.join(PA_DIR, 'print_area_jobs.json');

function paEnsureDirs() {
  try {
    fs.mkdirSync(PA_ARTWORK_DIR, { recursive: true });
  } catch (e) {
    /* racing mkdir under concurrent first-boot — ignore */ void e;
  }
}

// Safe read — returns { jobs: [] } on missing/corrupt file so downstream
// handlers never branch on null.
function paReadJobs() {
  const raw = readJson(PA_JOBS_FILE);
  if (raw && Array.isArray(raw.jobs)) return raw;
  return { jobs: [] };
}

// Atomic write via the shared helper — other tabs use the same writer
// so a crash mid-save can't leave a truncated JSON.
function paWriteJobs(data) {
  paEnsureDirs();
  atomicWriteFileSync(PA_JOBS_FILE, JSON.stringify(data, null, 2));
}

// Artwork uploads — own multer instance (small size cap, image-only
// filter). Tmp dir lives INSIDE the app data dir (under PA_DIR) so
// the final rename never crosses a filesystem boundary. On macOS,
// /tmp is on /System/Volumes/Data while user data is often on a
// separate volume (/Volumes/Macintosh Data/…), and `fs.renameSync`
// across volumes throws EXDEV. Co-locating tmp + final dir removes
// the footgun; the upload handler also has a copy+unlink fallback
// for defense-in-depth when admins override OPS_UPLOAD_TMPDIR to a
// path on a different disk.
const PA_TMP_DIR = process.env.OPS_PRINT_AREA_TMPDIR || path.join(PA_DIR, '_uploads_tmp');
try {
  fs.mkdirSync(PA_TMP_DIR, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(PA_TMP_DIR, 0o700);
  } catch {
    /* windows no-op */
  }
} catch (e) {
  console.warn('[print-area] tmp dir prepare failed:', e?.message || e);
}
const paUpload = multer({
  dest: PA_TMP_DIR,
  limits: { fileSize: (Number(process.env.OPS_PRINT_AREA_MAX_MB) || 30) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept raster + svg images, plus PDF and Adobe Illustrator.
    // .ai files arrive with MIME application/postscript (most browsers)
    // or application/illustrator (rare); some browsers hand them over
    // with an empty type, so we fall back to the extension. Magic-byte
    // check later still gates what actually lands on disk.
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    if (/^image\//.test(mime)) return cb(null, true);
    if (
      mime === 'application/pdf' ||
      mime === 'application/illustrator' ||
      mime === 'application/postscript' ||
      mime === '' ||
      mime === 'application/octet-stream'
    ) {
      if (/\.(pdf|ai|png|jpe?g|webp|gif|bmp|svg)$/.test(name)) return cb(null, true);
    }
    cb(new Error('Unsupported file type'));
  },
});

// Magic-byte verification mirrors import.js's approach. Files that
// don't match their claimed type get unlinked and rejected — an
// attacker-controlled extension never lands in the artwork store.
function paVerifyImageMagic(filePath, ext) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    if (ext === '.png')
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (ext === '.jpg' || ext === '.jpeg')
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    if (ext === '.gif') return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
    if (ext === '.webp')
      return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[8] === 0x57;
    if (ext === '.bmp') return buf[0] === 0x42 && buf[1] === 0x4d;
    if (ext === '.svg') {
      const head = buf.toString('utf-8').trim().toLowerCase();
      return head.startsWith('<svg') || head.startsWith('<?xml');
    }
    if (ext === '.pdf') {
      // "%PDF-" signature — first 4 bytes 0x25 0x50 0x44 0x46.
      return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    }
    if (ext === '.ai') {
      // Modern PDF-compatible Illustrator saves start with "%PDF-";
      // legacy pure-PostScript .ai files start with "%!PS-Adobe".
      if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return true;
      const head = buf.toString('utf-8');
      return head.startsWith('%!PS');
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined)
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
  }
}

// Sha1 file hash — streaming so a 15 MB upload doesn't blow memory.
function paHashFile(filePath) {
  const hash = crypto.createHash('sha1');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

// GET /api/shared/print-area — list jobs keyed by SKU
router.get('/print-area', (req, res) => {
  try {
    res.json(paReadJobs());
  } catch (err) {
    logErr(req, 'print-area:list', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// POST /api/shared/print-area — upsert a job by SKU. Body is the full
// job payload the client built (validated minimally here; the client
// owns the measurement math so we trust its shape).
router.post('/print-area', async (req, res) => {
  if (!requireWriter(req, res)) return;
  const sku = typeof req.body?.sku === 'string' ? req.body.sku.trim() : '';
  if (!sku) return res.status(400).json({ error: 'sku_required' });
  if (sku.length > 128) return res.status(400).json({ error: 'sku_too_long' });
  if (!Number.isFinite(req.body.width_mm) || !Number.isFinite(req.body.height_mm)) {
    return res.status(400).json({ error: 'invalid_dimensions' });
  }
  try {
    await withLock('print-area', async () => {
      const store = paReadJobs();
      const now = new Date().toISOString();
      const existing = store.jobs.find((j) => j.sku === sku);
      const id = existing?.id || `pa_${String(store.jobs.length + 1).padStart(5, '0')}`;
      // Pull only the fields we persist — prevents the client from
      // injecting arbitrary keys into the stored record.
      // Sanitize manual_roi: must be 4 finite non-negative numbers or
      // null. Anything else is silently dropped — we don't want a
      // malformed ROI to crash the analyse pipeline on reload.
      let manualRoi = null;
      const r = req.body.manual_roi;
      if (
        r &&
        typeof r === 'object' &&
        Number.isFinite(r.x) &&
        Number.isFinite(r.y) &&
        Number.isFinite(r.w) &&
        Number.isFinite(r.h) &&
        r.w > 0 &&
        r.h > 0
      ) {
        manualRoi = { x: r.x, y: r.y, w: r.w, h: r.h };
      }
      const printMethod =
        typeof req.body.print_method === 'string' ? req.body.print_method.slice(0, 32) : null;
      const scaleRatio =
        Number.isFinite(req.body.scale_ratio) && req.body.scale_ratio > 0
          ? Number(req.body.scale_ratio)
          : 1;
      const record = {
        id,
        sku,
        created_at: existing?.created_at || now,
        updated_at: now,
        product_name: req.body.product_name ?? null,
        width_mm: Number(req.body.width_mm),
        height_mm: Number(req.body.height_mm),
        dpi: Number(req.body.dpi) || 300,
        print_method: printMethod ?? existing?.print_method ?? 'flexo',
        scale_ratio: scaleRatio,
        manual_roi: manualRoi,
        artwork_file: req.body.artwork_file ?? existing?.artwork_file ?? null,
        artwork_mime: req.body.artwork_mime ?? existing?.artwork_mime ?? null,
        detection_config: req.body.detection_config ?? null,
        colors: Array.isArray(req.body.colors) ? req.body.colors : [],
        totals: req.body.totals ?? null,
        notes: req.body.notes ?? null,
      };
      store.jobs = store.jobs.filter((j) => j.sku !== sku).concat(record);
      paWriteJobs(store);
      res.json({ ok: true, job: record });
    });
  } catch (err) {
    logErr(req, 'print-area:save', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// DELETE /api/shared/print-area/:sku — remove one job by SKU. Artwork
// file is kept on disk (it may be referenced by another SKU via the
// content-address hash); a future cleanup sweep can garbage-collect
// orphans.
router.delete('/print-area/:sku', async (req, res) => {
  if (!requireWriter(req, res)) return;
  const sku = req.params.sku || '';
  try {
    await withLock('print-area', async () => {
      const store = paReadJobs();
      const before = store.jobs.length;
      store.jobs = store.jobs.filter((j) => j.sku !== sku);
      if (store.jobs.length === before) {
        return res.status(404).json({ error: 'not_found' });
      }
      paWriteJobs(store);
      res.json({ ok: true, deleted: sku });
    });
  } catch (err) {
    logErr(req, 'print-area:delete', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// POST /api/shared/print-area/upload — multipart artwork upload.
// Returns { artwork_file, hash, size } so the client can reference it
// when calling POST /print-area to save the job metadata. File is
// content-addressed: re-uploading an identical image is a no-op on
// disk (hash collision → existing file is reused).
router.post('/print-area/upload', paUpload.single('artwork'), (req, res) => {
  if (!requireWriter(req, res)) {
    // We've consumed a multipart upload — best-effort cleanup of the
    // disk artifact so a viewonly probe can't fill the tmpdir.
    try {
      if (req.file?.path) fs.unlinkSync(req.file.path);
    } catch {
      /* ignore */
    }
    return;
  }
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const tmpPath = req.file.path;
  const ext = path.extname(req.file.originalname || '').toLowerCase() || '.png';
  try {
    if (!paVerifyImageMagic(tmpPath, ext)) {
      return res.status(400).json({ error: 'file_type_mismatch' });
    }
    paEnsureDirs();
    const hash = paHashFile(tmpPath);
    const finalName = `${hash}${ext}`;
    const finalPath = path.join(PA_ARTWORK_DIR, finalName);
    if (!fs.existsSync(finalPath)) {
      // Move tmp → final. `renameSync` is atomic within a single
      // filesystem but throws EXDEV across volumes (common on macOS
      // where /tmp and user data live on different disks). Fall back
      // to copy-then-unlink — not atomic but still safe because the
      // content-addressed `finalName` makes the write idempotent.
      try {
        fs.renameSync(tmpPath, finalPath);
      } catch (err) {
        if (err?.code === 'EXDEV') {
          fs.copyFileSync(tmpPath, finalPath);
          try {
            fs.unlinkSync(tmpPath);
          } catch {
            /* ignore cleanup */
          }
        } else {
          throw err;
        }
      }
    } else {
      // File is already stored — discard the upload's tmp copy.
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
    res.json({
      ok: true,
      artwork_file: path.join('Library', 'PrintArea', 'artworks', finalName),
      hash,
      size: req.file.size,
      mime: req.file.mimetype,
    });
  } catch (err) {
    // Always try to clean up tmp on error — a failed handler should
    // not leave artifacts under /tmp.
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    logErr(req, 'print-area:upload', err);
    res.status(500).json({ error: redactErrorMessage(err) });
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

// ═══════════════════════════════════════════════════════════════
// DESIGN TOOLS LIBRARY (Sprint 14e)
// ═══════════════════════════════════════════════════════════════
//   GET    /api/shared/design-tools[?press=gallus]  → list (newest first)
//   POST   /api/shared/design-tools                  → create
//   DELETE /api/shared/design-tools/:id              → remove (admin+)
//
// File: Library/DesignTools/designs.json — append-only ish; each
// record carries { id, press, end_cu_pn, project, designer_note,
// inputs, result, saved_at, saved_by }. The Gallus calculator + any
// future per-press calculator share this single store, partitioned by
// the `press` field. Engineers can recall prior designs and either
// re-edit them in the calculator or push them across into Pricing
// (Std/Cpx) via the existing pendingQuote handoff (rfq-sync action).

const DT_FILE = path.join(LIB, 'DesignTools', 'designs.json');

function dtRead() {
  try {
    if (!fs.existsSync(DT_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(DT_FILE, 'utf-8'));
    return Array.isArray(raw?.designs) ? raw.designs : [];
  } catch (e) {
    console.error('  ⚠  designs.json parse failed:', e.message);
    return [];
  }
}
function dtWrite(designs) {
  fs.mkdirSync(path.dirname(DT_FILE), { recursive: true });
  atomicWriteFileSync(DT_FILE, JSON.stringify({ designs }, null, 2));
}

router.get('/design-tools', (req, res) => {
  try {
    const press = (req.query.press || '').toString().toLowerCase();
    let list = dtRead();
    if (press) list = list.filter((d) => (d.press || '').toLowerCase() === press);
    // Newest first.
    list.sort((a, b) => String(b.saved_at || '').localeCompare(String(a.saved_at || '')));
    res.json(list);
  } catch (err) {
    logErr(req, 'design_tools_list', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

router.post('/design-tools', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  const body = req.body || {};
  // Minimal validation — `press` and `end_cu_pn` are the only hard
  // requirements. Inputs / result are stored as-is so future schema
  // bumps can add fields without server changes.
  if (!body.press) return res.status(400).json({ error: 'press_required' });
  if (!body.end_cu_pn || !String(body.end_cu_pn).trim()) {
    return res.status(400).json({ error: 'end_cu_pn_required' });
  }
  // Sprint 14k+ — Design Change Notice. When the new record is a
  // BRANCH from an existing record (parent_id present), the operator
  // must justify why the branch was created. First-time saves of a
  // brand-new design accept an empty notice (default "Initial").
  const parentId = Number(body.parent_id) || 0;
  const notice = String(body.design_change_notice || '').trim();
  if (parentId > 0 && notice.length < 3) {
    return res.status(400).json({
      error: 'change_notice_required',
      msg: 'Design change notice is required when branching from an existing version (≥ 3 chars).',
    });
  }
  try {
    const saved = await withLock('design-tools', async () => {
      const list = dtRead();
      const maxId = list.reduce((m, d) => Math.max(m, Number(d.id) || 0), 0);
      const nowIso = new Date().toISOString();
      const initialNotice =
        notice || (parentId > 0 ? `Branched from #${parentId}` : 'Initial version');
      const record = {
        id: maxId + 1,
        press: String(body.press).toLowerCase(),
        end_cu_pn: String(body.end_cu_pn).trim().slice(0, 80),
        project: String(body.project || '')
          .trim()
          .slice(0, 120),
        designer_note: String(body.designer_note || '').slice(0, 500),
        inputs: body.inputs && typeof body.inputs === 'object' ? body.inputs : {},
        result: body.result && typeof body.result === 'object' ? body.result : null,
        version: 1,
        parent_id: parentId || null,
        design_change_notice: initialNotice.slice(0, 1000),
        change_log: [
          {
            version: 1,
            notice: initialNotice.slice(0, 1000),
            saved_at: nowIso,
            saved_by: cu.username,
            op: parentId > 0 ? 'branch' : 'create',
            parent_id: parentId || null,
          },
        ],
        saved_at: nowIso,
        saved_at_first: nowIso,
        saved_by: cu.username,
      };
      list.push(record);
      dtWrite(list);
      return record;
    });
    audit(
      'DESIGN_TOOLS_SAVE',
      cu.username,
      clientIp(req),
      `${saved.press} · ${saved.end_cu_pn} (#${saved.id}${parentId ? ` ← branch of #${parentId}` : ''}) · algo_v=${saved.result?._algo_v || 'v1-implicit'}`
    );
    res.json({ ok: true, design: saved });
  } catch (err) {
    logErr(req, 'design_tools_save', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

// PUT /api/shared/design-tools/:id — update in place (overwrite).
// Sprint 14k. Bumps a `version` counter so the operator can see which
// records have been edited vs originals; preserves the original id +
// saved_at_first so the historical anchor doesn't shift, and stamps
// a fresh `saved_at` for the latest revision. Used by the Save Choice
// dialog's "Update existing" path; "Save as new version" still POSTs
// a fresh row.
router.put('/design-tools/:id', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  const body = req.body || {};
  if (!body.end_cu_pn || !String(body.end_cu_pn).trim()) {
    return res.status(400).json({ error: 'end_cu_pn_required' });
  }
  // Sprint 14k+ — every overwrite MUST carry a Design Change Notice.
  // This is the audit-trail record: future engineers reviewing the
  // change log need to know WHY each version exists. Empty/short
  // notices are blocked at the wire level (3-char minimum guards
  // against "ok" / "fix" sentinel typing without thought).
  const notice = String(body.design_change_notice || '').trim();
  if (notice.length < 3) {
    return res.status(400).json({
      error: 'change_notice_required',
      msg: 'Design change notice is required (min 3 chars) for every overwrite. Document WHY this change.',
    });
  }
  try {
    const updated = await withLock('design-tools', async () => {
      const list = dtRead();
      const idx = list.findIndex((d) => Number(d.id) === id);
      if (idx === -1) return null;
      const prev = list[idx];
      const nowIso = new Date().toISOString();
      const newVersion = (Number(prev.version) || 1) + 1;
      const log = Array.isArray(prev.change_log) ? prev.change_log : [];
      const next = {
        ...prev,
        end_cu_pn: String(body.end_cu_pn).trim().slice(0, 80),
        project: String(body.project || '')
          .trim()
          .slice(0, 120),
        designer_note: String(body.designer_note || '').slice(0, 500),
        inputs: body.inputs && typeof body.inputs === 'object' ? body.inputs : prev.inputs,
        result: body.result && typeof body.result === 'object' ? body.result : prev.result,
        version: newVersion,
        // Latest notice surfaced for the History list "why was this
        // changed?" column. Full audit lineage lives in change_log.
        design_change_notice: notice.slice(0, 1000),
        change_log: [
          ...log,
          {
            version: newVersion,
            notice: notice.slice(0, 1000),
            saved_at: nowIso,
            saved_by: cu.username,
            op: 'update',
          },
        ],
        saved_at_first: prev.saved_at_first || prev.saved_at,
        saved_at: nowIso,
        saved_by: cu.username,
      };
      list[idx] = next;
      dtWrite(list);
      return next;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    audit(
      'DESIGN_TOOLS_UPDATE',
      cu.username,
      clientIp(req),
      `${updated.press} · ${updated.end_cu_pn} (#${updated.id} → v${updated.version}) · ${notice.slice(0, 80)}`
    );
    res.json({ ok: true, design: updated });
  } catch (err) {
    logErr(req, 'design_tools_update', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

router.delete('/design-tools/:id', async (req, res) => {
  const cu = requireWriter(req, res);
  if (!cu) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  try {
    const removed = await withLock('design-tools', async () => {
      const list = dtRead();
      const before = list.length;
      const filtered = list.filter((d) => Number(d.id) !== id);
      if (filtered.length === before) return null;
      dtWrite(filtered);
      return id;
    });
    if (!removed) return res.status(404).json({ error: 'not_found' });
    audit('DESIGN_TOOLS_DELETE', cu.username, clientIp(req), `#${id}`);
    res.json({ ok: true });
  } catch (err) {
    logErr(req, 'design_tools_delete', err);
    res.status(500).json({ error: redactErrorMessage(err) });
  }
});

export default router;
