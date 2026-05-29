// @ts-check
/**
 * Quotes router — sales-domain CRUD for quote records.
 *
 * v1.3 L2. 8th domain extraction. Owns the full quote lifecycle:
 *
 *   POST   /api/sales/quotes                    — create new quote
 *   PATCH  /api/sales/quotes/:id                — update existing
 *   DELETE /api/sales/quotes/:id                — soft-delete (sets deleted_at)
 *   DELETE /api/sales/quotes/:id?purge=1        — sys-only hard delete
 *   POST   /api/sales/quotes/:id/restore        — un-delete
 *
 * Legacy URLs (kept dual-mounted per ADR-0009):
 *   POST   /api/quotes
 *   DELETE /api/quotes/:id
 *   POST   /api/quotes/:id/restore
 *   PATCH  /api/quotes/:id
 *
 * Pattern: factory + injected deps per ADR-0011. Heavy injection
 * surface (~12 deps) because this router touches versioning, audit,
 * eventbus, permission groups, soft-delete tombstones — every
 * cross-cutting concern shows up here. The trade-off is that each
 * concern stays unit-testable with stubs.
 *
 * NOT MOUNTED YET (extract-first per ADR-0008). Awaiting:
 *   - quotesStore deps surfaced as named exports (already are; just
 *     need to wire in server/index.js).
 *   - permissionService.resolveTabAccess wrapped as injectable dep.
 * Mounting is a follow-up PR per CONTRIBUTING.md §F1.
 */

import express from 'express';

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.auth
 * @param {(reqUser: any) => boolean} deps.canWrite
 * @param {(reqUser: any) => boolean} deps.isSys
 * @param {(quote: any) => Promise<any>} deps.upsertQuote
 * @param {(id: number) => any} deps.getQuoteById
 * @param {() => any[]} deps.loadQuotes
 * @param {(quotes: any[]) => void} deps.saveQuotes
 * @param {Function} deps.VersionConflictError
 * @param {(user: any, tabId: string) => 'edit'|'read'|'hidden'} deps.resolveTabAccess
 * @param {(event: string, data: any) => void} deps.emitDataChange
 * @param {(action: string, user: string, ip: string, detail: string) => void} deps.audit
 * @param {(req: any) => string} deps.clientIp
 * @param {(req: any, label: string, err: Error) => void} deps.logErr
 * @param {(err: Error) => string} deps.redactErrorMessage
 * @param {import('express').RequestHandler} [deps.saveRateLimit]
 */
export function createQuotesRouter(deps) {
  const router = express.Router();
  const noopLimit = (_req, _res, next) => next();
  const limit = deps.saveRateLimit || noopLimit;

  const requireWriter = (req, res) => {
    if (!deps.canWrite(req.user)) {
      res.status(403).json({ ok: false, msg: 'View Only' });
      return false;
    }
    return true;
  };

  // POST / — create new quote
  router.post('/', deps.auth, limit, async (req, res) => {
    if (!requireWriter(req, res)) return;
    const cu = req.user?.user || req.user;
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ ok: false, error: 'Body must be a quote object' });
    }
    const quoteType = body.type === 'complex' ? 'complex' : 'standard';
    const access = deps.resolveTabAccess(cu, quoteType);
    if (access !== 'edit') {
      return res.status(403).json({
        error: 'permission_denied',
        tab: quoteType,
        current: access,
      });
    }
    try {
      // Drop client-provided id + _version on POST — server assigns next-free.
      const saved = await deps.upsertQuote({ ...body, id: undefined, _version: undefined });
      deps.emitDataChange('quote.saved', {
        id: saved?.id,
        version: saved?._version,
        type: quoteType,
        savedBy: cu.username,
      });
      res.json({ ok: true, quote: saved });
    } catch (err) {
      deps.logErr(req, 'quotes_post', err);
      res.status(500).json({ ok: false, error: deps.redactErrorMessage(err) });
    }
  });

  // PATCH /:id — partial update
  router.patch('/:id', deps.auth, limit, async (req, res) => {
    if (!requireWriter(req, res)) return;
    const cu = req.user?.user || req.user;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'id must be numeric' });
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ ok: false, error: 'Body must be a quote patch object' });
    }
    try {
      const saved = await deps.upsertQuote({ ...body, id });
      deps.emitDataChange('quote.saved', {
        id: saved?.id,
        version: saved?._version,
        patch: true,
        savedBy: cu.username,
      });
      res.json({ ok: true, quote: saved });
    } catch (err) {
      if (err instanceof deps.VersionConflictError) {
        return res.status(409).json({
          ok: false,
          error: 'version_conflict',
          actual_version: err.actualVersion,
          current: err.current,
        });
      }
      deps.logErr(req, 'quote_patch', err);
      res.status(500).json({ ok: false, error: deps.redactErrorMessage(err) });
    }
  });

  // DELETE /:id  — soft (default) or hard (?purge=1, sys-only)
  router.delete('/:id', deps.auth, limit, async (req, res) => {
    if (!requireWriter(req, res)) return;
    const cu = req.user?.user || req.user;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'id must be numeric' });
    }

    const purge = req.query.purge === '1' || req.query.purge === 'true';
    if (purge) {
      // Hard delete — sys-only. Audit row survives so ops can trace.
      if (!deps.isSys(cu)) {
        return res.status(403).json({ ok: false, error: 'sys role required for permanent delete' });
      }
      try {
        const before = deps.loadQuotes();
        const after = before.filter((q) => !(q && q.id === id));
        if (after.length === before.length) {
          return res.status(404).json({ ok: false, error: 'not_found' });
        }
        deps.saveQuotes(after);
        const tomb = before.find((q) => q.id === id)?.deleted_at || 'null';
        deps.audit(
          'QUOTE_PURGE',
          cu.username,
          deps.clientIp(req),
          `purged quote #${id} (deleted_at=${tomb})`
        );
        deps.emitDataChange('quote.deleted', { id, purged: true, savedBy: cu.username });
        return res.json({ ok: true, purged: true });
      } catch (err) {
        deps.logErr(req, 'quote_purge', err);
        return res.status(500).json({ ok: false, error: deps.redactErrorMessage(err) });
      }
    }

    // Soft-delete: verify exists FIRST so upsertQuote can't create
    // a brand-new tombstoned row (ghost-quote bug fixed in v1.2).
    try {
      const existing = deps.getQuoteById(id);
      if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });
      const saved = await deps.upsertQuote({
        id,
        deleted_at: new Date().toISOString(),
        deleted_by: cu.username,
      });
      deps.audit('QUOTE_TRASH', cu.username, deps.clientIp(req), `trashed quote #${id}`);
      deps.emitDataChange('quote.deleted', { id, purged: false, savedBy: cu.username });
      res.json({ ok: true, quote: saved });
    } catch (err) {
      if (err instanceof deps.VersionConflictError) {
        return res.status(409).json({
          ok: false,
          error: 'version_conflict',
          actual_version: err.actualVersion,
          current: err.current,
        });
      }
      deps.logErr(req, 'quote_trash', err);
      res.status(500).json({ ok: false, error: deps.redactErrorMessage(err) });
    }
  });

  // POST /:id/restore — un-delete
  router.post('/:id/restore', deps.auth, limit, async (req, res) => {
    if (!requireWriter(req, res)) return;
    const cu = req.user?.user || req.user;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'id must be numeric' });
    }
    try {
      const existing = deps.getQuoteById(id);
      if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });
      const saved = await deps.upsertQuote({
        id,
        deleted_at: null,
        deleted_by: null,
        restored_at: new Date().toISOString(),
        restored_by: cu.username,
      });
      deps.audit('QUOTE_RESTORE', cu.username, deps.clientIp(req), `restored quote #${id}`);
      deps.emitDataChange('quote.saved', {
        id,
        version: saved?._version,
        restored: true,
        savedBy: cu.username,
      });
      res.json({ ok: true, quote: saved });
    } catch (err) {
      deps.logErr(req, 'quote_restore', err);
      res.status(500).json({ ok: false, error: deps.redactErrorMessage(err) });
    }
  });

  return router;
}

export default createQuotesRouter;
