/**
 * events.js — SSE endpoint /api/events for real-time data change push.
 *
 * Pattern theo chat /stream nhưng cho data changes (quote, rfq, sample,
 * library). Auth-required (cookie/Bearer/?t= query param fallback).
 *
 * Events emitted:
 *   - quote.saved        — User vừa save quote → các tab QuoteHistory refetch
 *   - quote.deleted      — Quote bị delete → list refresh
 *   - rfq.updated        — RFQ Tracker change
 *   - sample.updated     — Sample Tracking change
 *   - library.imported   — Bulk import xong
 *   - approval.transition — Approval workflow advance
 *
 * Client side: components/Layout/EventSubscriber.jsx tự handle.
 * EventSource auto-reconnect với Last-Event-ID retry.
 *
 * Heartbeat: server gửi `: keepalive\n\n` mỗi 25s để giữ connection
 * không bị nginx/proxy timeout (default 60s).
 */

import { Router } from 'express';
import { getSessionUser } from '../services/authService.js';
import { subscribeEvents, getSubscriberCount } from '../services/eventBus.js';

const router = Router();

function requireUser(req) {
  const tokenFromHeader = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : null;
  const tokenFromCookie = req.cookies?.ops_session;
  const tokenFromQuery = req.query.t ? String(req.query.t) : null;
  const token = tokenFromHeader || tokenFromCookie || tokenFromQuery;
  if (!token) return null;
  return getSessionUser(token);
}

router.get('/stream', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  // SSE response headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx hint
  res.flushHeaders();

  // Send initial "ready" event so client knows stream is alive
  res.write(`event: ready\ndata: {"userId":${user.id},"ts":"${new Date().toISOString()}"}\n\n`);

  // Heartbeat every 25s — keeps proxy connection from timing out
  const heartbeat = setInterval(() => {
    try { res.write(`: keepalive ${Date.now()}\n\n`); }
    catch { /* stream closed */ }
  }, 25000);

  // Subscribe to event bus
  const send = (event) => {
    try {
      // SSE framing
      const lines = [
        `event: ${event.type}`,
        `id: ${event.seq}`,
        `data: ${JSON.stringify(event)}`,
        '', '',
      ];
      res.write(lines.join('\n'));
    } catch (err) {
      // Stream closed — cleanup
      cleanup();
    }
  };

  const audienceFilter = (event) => {
    // For now: all authenticated users see all events. Future: filter
    // by user's permission groups (e.g. don't push admin-only library
    // changes to viewonly users).
    return true;
  };

  const unsubscribe = subscribeEvents(send, { audienceFilter });

  function cleanup() {
    clearInterval(heartbeat);
    try { unsubscribe(); } catch { /* swallow */ }
  }

  // Cleanup on client disconnect
  req.on('close', cleanup);
  req.on('aborted', cleanup);
});

// Diagnostic: how many subscribers + recent event counts
router.get('/status', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  res.json({ ok: true, subscribers: getSubscriberCount() });
});

export default router;
