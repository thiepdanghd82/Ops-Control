// @ts-check
/**
 * Quote export route — POST /api/quotes/:id/export
 *
 * Factory pattern per ADR-0011 (matches createQuotesRouter). Returns
 * an Express Router that gets mounted alongside the existing legacy
 * /api/quotes routes in server/index.js.
 *
 * Permission gate: requireTabAccess('quote-history', 'read') —
 * exporting is a read operation. Edit-level (apply-import / restore)
 * arrives in MVP-3.
 */

import express from 'express';
import { exportQuote, QuoteExportError } from '../services/quoteExport/index.js';

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.auth
 * @param {(id: number) => any} deps.getQuoteById
 * @param {(user: any, tabId: string) => 'edit'|'read'|'hidden'} deps.resolveTabAccess
 * @param {(action: string, user: string, ip: string, detail: string) => void} deps.audit
 * @param {(req: any) => string} deps.clientIp
 * @param {(req: any, label: string, err: Error) => void} deps.logErr
 * @param {(err: Error) => string} deps.redactErrorMessage
 * @param {(wc: string) => any} [deps.rateLookup]   library workcenter → {machine_rate, labor_rate, crew, speed_uom}
 * @param {string} [deps.engineSha]
 */
export function createQuoteExportRouter(deps) {
  const router = express.Router();

  router.post('/:id/export', deps.auth, async (req, res) => {
    const cu = req.user?.user || req.user;
    if (!cu) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const access = deps.resolveTabAccess(cu, 'quote-history');
    if (access === 'hidden') {
      return res.status(403).json({
        error: 'permission_denied',
        tab: 'quote-history',
        required: 'read',
        current: access,
      });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({
        type: '/errors/bad-id',
        title: 'id must be numeric',
        status: 400,
      });
    }

    const body = req.body || {};
    if (body.variant !== 'customer' && body.variant !== 'internal') {
      return res.status(400).json({
        type: '/errors/missing-field',
        title: 'variant required',
        field: 'variant',
        status: 400,
      });
    }
    const lang = body.lang || 'bilingual';
    if (!['en', 'vi', 'bilingual'].includes(lang)) {
      return res.status(400).json({
        type: '/errors/bad-value',
        title: `lang must be en|vi|bilingual`,
        field: 'lang',
        status: 400,
      });
    }

    const quote = deps.getQuoteById(id);
    if (!quote) {
      return res.status(404).json({
        type: '/errors/not-found',
        title: 'Quote not found',
        status: 404,
        id,
      });
    }

    try {
      const out = await exportQuote(quote, {
        variant: body.variant,
        lang,
        tiers: body.tiers,
        exportedBy: cu.username || '-',
        engineSha: deps.engineSha,
        rateLookup: deps.rateLookup,
        // MVP-2: override env-derived HMAC key when deps supplies one
        // (tests inject; prod relies on env via assertHmacKey fallback).
        hmacKey: deps.hmacKey,
        lib: deps.lib,
      });

      // Audit emit BEFORE setHeader — audit failures must not break
      // the response stream, but we want the event recorded. MVP-2
      // adds two forensic fields per tier:
      //   - wb_password_hash: sha256(per-export password). NEVER log
      //     the raw password — operators must not be able to re-print
      //     a customer copy from the audit trail.
      //   - schema_sha256: hash of decoded _Schema payload bytes. The
      //     MVP-3 importer cross-checks this against the xlsx's
      //     embedded sha256 to detect post-export tampering.
      try {
        const tierAudit = (out.auditMeta || []).map((m) => ({
          tier_idx: m.tierIdx,
          filename: m.filename,
          wb_password_hash: m.wbPasswordHash,
          schema_sha256: m.schemaSha256,
          hmac: m.hmac,
        }));
        deps.audit(
          'QUOTE_EXPORT',
          cu.username || '-',
          deps.clientIp(req),
          JSON.stringify({
            quote_id: id,
            version: quote._version ?? null,
            variant: body.variant,
            lang,
            tiers: body.tiers ?? 'all',
            kind: out.kind,
            filename: out.filename,
            size: out.buffer.length,
            // MVP-2 forensic trace — one entry per tier in zip case
            tier_audit: tierAudit,
          })
        );
      } catch (auditErr) {
        deps.logErr?.(req, 'quote_export_audit', auditErr);
      }

      const contentType =
        out.kind === 'zip'
          ? 'application/zip'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      if (out.kind === 'zip') {
        res.setHeader('X-Ops-Export-Format', 'zip');
      }
      res.setHeader('Content-Length', String(out.buffer.length));
      return res.status(200).end(out.buffer);
    } catch (err) {
      if (err instanceof QuoteExportError) {
        return res.status(err.status).json({
          type: `/errors/${err.code}`,
          title: err.message,
          status: err.status,
        });
      }
      deps.logErr?.(req, 'quote_export', err);
      return res.status(500).json({
        type: '/errors/internal',
        title: deps.redactErrorMessage(err),
        status: 500,
      });
    }
  });

  return router;
}
