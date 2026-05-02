// Reason-code reference endpoint — Sprint MES-2.6b (Patch N1).
// Public, unauthenticated reference data; cache 5 min. Kiosk caches in
// localStorage so a paused-with-reason flow works offline.
import { Router } from 'express';

export function createReasonCodesV2Router({ db }) {
  const router = Router();
  const stmt = db.prepare(
    `SELECT code, label_en, label_vn, category, sort_order
     FROM reason_code WHERE active = 1 ORDER BY sort_order ASC, code ASC`
  );
  router.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ items: stmt.all() });
  });
  return router;
}
