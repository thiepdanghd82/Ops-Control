/**
 * Planning Module Routes (Node.js native)
 * Handles orders, work orders, WIP tracking, capacity
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { requireModule, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as store from '../services/planningStore.js';
import { getProducts } from '../services/dataSync.js';

const router = Router();

// Schemas — intentionally lenient on the nested order/WO shapes since
// those evolved from the v1 JSON files and carry ~20 columns of
// metadata. We only enforce the identifying fields + sensible string
// bounds so a typo client can't write a 10 MB record.
//
// `orderNumber` is OPTIONAL — server auto-generates `ORD-{nextId}` when
// omitted (createOrder in planningStore). Bulk Excel-import does not
// know IDs ahead of time and the single-form flow doesn't need the
// operator to invent one.
const orderSchema = {
  orderNumber: { type: 'string', max: 64 },
  customerName: { type: 'string', max: 128 },
  partNumber: { type: 'string', max: 64 },
  quantity: { type: 'number', min: 0, max: 1e9 },
  status: { type: 'string', max: 32 },
};
const orderUpdateSchema = {
  // updates may omit orderNumber — only whatever the user changes
  orderNumber: { type: 'string', max: 64 },
  customerName: { type: 'string', max: 128 },
  partNumber: { type: 'string', max: 64 },
  quantity: { type: 'number', min: 0, max: 1e9 },
  status: { type: 'string', max: 32 },
};
const workOrderSchema = {
  woNumber: { type: 'string', required: true, min: 1, max: 64 },
  partNumber: { type: 'string', max: 64 },
  quantity: { type: 'number', min: 0, max: 1e9 },
  workCenter: { type: 'string', max: 64 },
  status: { type: 'string', max: 32 },
  estimatedHours: { type: 'number', min: 0, max: 1e6 },
};
const woUpdateSchema = {
  woNumber: { type: 'string', max: 64 },
  partNumber: { type: 'string', max: 64 },
  quantity: { type: 'number', min: 0, max: 1e9 },
  workCenter: { type: 'string', max: 64 },
  status: { type: 'string', max: 32 },
  estimatedHours: { type: 'number', min: 0, max: 1e6 },
};

// ─── Order-import upload config ───
//
// Uses a private tmp dir + magic-byte check, mirroring the IFS import
// flow (server/routes/import.js). Two-step preview → confirm UX so
// operators see what they're about to insert before any disk write.
const ORDER_UPLOAD_TMP = path.join(
  process.env.OPS_UPLOAD_TMPDIR || os.tmpdir(),
  'ops-control-order-imports'
);
try {
  fs.mkdirSync(ORDER_UPLOAD_TMP, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(ORDER_UPLOAD_TMP, 0o700); } catch { /* windows */ }
} catch (err) {
  console.warn('[planning import] failed to prepare tmp dir:', err?.message || err);
}

const orderImportUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ORDER_UPLOAD_TMP),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${process.pid}-${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB — orders sheets are tiny
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only .xlsx / .xls / .csv files are accepted'));
  },
});

function verifyOrderUploadMagic(filePath, ext) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    if (ext === '.xlsx') {
      return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    }
    if (ext === '.xls') {
      return buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
    }
    if (ext === '.csv') {
      let nul = 0;
      for (let i = 0; i < 8; i++) if (buf[i] === 0) nul++;
      return nul <= 2;
    }
    return false;
  } catch { return false; } finally {
    if (fd) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/**
 * Coerce an Excel cell value into ISO-8601 (YYYY-MM-DD).
 * Handles: Excel serial number, "dd/mm/yy", "dd/mm/yyyy", already-ISO.
 * Returns '' when the value cannot be parsed (caller treats as invalid row).
 *
 * Exported for unit tests — used internally by parseOrdersFile.
 */
export function coerceDueDate(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number') {
    // Excel epoch Dec 30 1899 → 25569 days to 1970-01-01.
    const ms = (raw - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Last-ditch: let Date parse it
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

/**
 * Parse the first sheet of an xlsx/xls/csv into rows of
 * { productCode, quantity, dueDate } enriched with FG lookup
 * (description, customer, found). Header row is detected by
 * presence of any non-numeric first cell — operators sometimes
 * paste data without a header.
 */
async function parseOrdersFile(filePath, ext) {
  const XLSX = await import('xlsx');
  const wb = ext === '.csv'
    ? XLSX.read(fs.readFileSync(filePath, 'utf-8'), { type: 'string' })
    : XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Empty workbook');
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

  // Skip header if first cell is non-numeric (e.g. "Product Code")
  const startIdx = aoa.length > 0 && aoa[0][0] && Number.isNaN(parseInt(aoa[0][0], 10)) ? 1 : 0;

  const products = getProducts();
  const lookup = new Map(products.map(p => [String(p.partNo), p]));

  const rows = [];
  let skipped = 0;
  for (let i = startIdx; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || !row[0]) continue;
    const code = String(row[0]).trim();
    const qty = parseInt(row[1], 10) || 0;
    const dueDate = coerceDueDate(row[2]);
    if (qty <= 0 || !dueDate) { skipped++; continue; }
    const fg = lookup.get(code);
    rows.push({
      productCode: code,
      quantity: qty,
      dueDate,
      description: fg?.description || '(Unknown)',
      customer: fg?.customer || '',
      priority: 'Normal',
      found: !!fg,
    });
  }
  return {
    rows,
    summary: {
      total: rows.length,
      found: rows.filter(r => r.found).length,
      notFound: rows.filter(r => !r.found).length,
      skipped,
    },
  };
}

// All planning routes require planning module access
router.use(requireModule('planning'));

// ─── Orders ───

// GET /api/planning/orders
router.get('/orders', (req, res) => {
  try {
    const orders = store.getOrders();
    res.json(orders);
  } catch (err) {
    console.error('Error loading orders:', err);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

// POST /api/planning/orders
router.post('/orders', requireRole(2), validateBody(orderSchema), async (req, res) => {
  try {
    const order = await store.createOrder(req.body);
    res.status(201).json(order);
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// PUT /api/planning/orders/:id
router.put('/orders/:id', requireRole(2), validateBody(orderUpdateSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await store.updateOrder(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Order not found' });
    res.json(updated);
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// DELETE /api/planning/orders/:id
router.delete('/orders/:id', requireRole(3), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await store.deleteOrder(id);
    if (!deleted) return res.status(404).json({ error: 'Order not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// POST /api/planning/orders/import-preview
//
// Multipart upload of an xlsx/xls/csv with columns
// `Product Code | Quantity | Due Date`. Returns parsed rows with
// description + customer auto-filled from Finished Goods. Rows with
// missing/invalid qty or date are counted as `skipped` (operator can
// fix the source file and retry); rows with unknown codes are kept
// with `found: false` so the operator can decide whether to confirm.
//
// Stateless — nothing is written until the operator hits import-confirm.
router.post(
  '/orders/import-preview',
  requireRole(2),
  orderImportUpload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    try {
      if (!verifyOrderUploadMagic(req.file.path, ext)) {
        return res.status(400).json({
          error: 'file_content_mismatch',
          message: `Uploaded file contents don't match the declared ${ext} format`,
        });
      }
      const result = await parseOrdersFile(req.file.path, ext);
      res.json(result);
    } catch (err) {
      console.error('Order import preview failed:', err);
      res.status(500).json({ error: 'import_preview_failed', message: err.message });
    } finally {
      // Always unlink — even on error — so a flood of bad uploads
      // can't fill /tmp.
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }
  }
);

// POST /api/planning/orders/import-confirm
//
// Body: { rows: [{productCode, quantity, dueDate, description, customer, priority}] }
// Creates one order per row using the same store.createOrder used by
// the single-form path (so audit + auto-id behave identically). Reports
// per-row success/error so a partial import doesn't masquerade as
// success.
router.post('/orders/import-confirm', requireRole(2), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows || rows.length === 0) {
    return res.status(400).json({ error: 'no_rows' });
  }
  if (rows.length > 1000) {
    return res.status(413).json({ error: 'too_many_rows', max: 1000 });
  }
  const created = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const qty = parseInt(r?.quantity, 10);
    if (!r?.productCode || !Number.isFinite(qty) || qty <= 0 || !r?.dueDate) {
      errors.push({ index: i, productCode: r?.productCode, error: 'invalid_row' });
      continue;
    }
    try {
      const order = await store.createOrder({
        productCode: String(r.productCode),
        partNumber: String(r.productCode),
        description: r.description || '',
        quantity: qty,
        dueDate: String(r.dueDate),
        customer: r.customer || '',
        customerName: r.customer || '',
        priority: r.priority || 'Normal',
        notes: r.notes || '',
      });
      created.push(order);
    } catch (err) {
      errors.push({ index: i, productCode: r.productCode, error: err.message });
    }
  }
  res.status(errors.length === 0 ? 201 : 207).json({ created, errors });
});

// ─── Work Orders ───

// GET /api/planning/work-orders
router.get('/work-orders', (req, res) => {
  try {
    const workOrders = store.getWorkOrders();
    res.json(workOrders);
  } catch (err) {
    console.error('Error loading work orders:', err);
    res.status(500).json({ error: 'Failed to load work orders' });
  }
});

// POST /api/planning/work-orders
router.post('/work-orders', requireRole(3), validateBody(workOrderSchema), async (req, res) => {
  try {
    const wo = await store.createWorkOrder(req.body);
    res.status(201).json(wo);
  } catch (err) {
    console.error('Error creating work order:', err);
    res.status(500).json({ error: 'Failed to create work order' });
  }
});

// PUT /api/planning/work-orders/:id
router.put('/work-orders/:id', requireRole(2), validateBody(woUpdateSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await store.updateWorkOrder(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Work order not found' });
    res.json(updated);
  } catch (err) {
    console.error('Error updating work order:', err);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});

// ─── WIP Tracking ───

// GET /api/planning/wip
router.get('/wip', (req, res) => {
  try {
    const wip = store.getWIPTracking();
    res.json(wip);
  } catch (err) {
    console.error('Error loading WIP:', err);
    res.status(500).json({ error: 'Failed to load WIP data' });
  }
});

// PUT /api/planning/wip/:woId
router.put('/wip/:woId', requireRole(2), async (req, res) => {
  try {
    const woId = parseInt(req.params.woId);
    const updated = await store.updateWIP(woId, req.body);
    res.json(updated);
  } catch (err) {
    console.error('Error updating WIP:', err);
    res.status(500).json({ error: 'Failed to update WIP' });
  }
});

// ─── Capacity ───

// GET /api/planning/capacity
router.get('/capacity', (req, res) => {
  try {
    // Calculate capacity from work orders and routing data
    const workOrders = store.getWorkOrders();
    const activeWOs = workOrders.filter(wo =>
      wo.status === 'New' || wo.status === 'In Progress'
    );

    // Group by work center
    const capacityMap = {};
    for (const wo of activeWOs) {
      if (wo.workCenter) {
        if (!capacityMap[wo.workCenter]) {
          capacityMap[wo.workCenter] = { scheduled: 0, orders: [] };
        }
        capacityMap[wo.workCenter].scheduled += wo.estimatedHours || 0;
        capacityMap[wo.workCenter].orders.push(wo.woNumber);
      }
    }

    res.json(capacityMap);
  } catch (err) {
    console.error('Error loading capacity:', err);
    res.status(500).json({ error: 'Failed to load capacity data' });
  }
});

// ─── Planning Metadata ───

// GET /api/planning/meta
router.get('/meta', (req, res) => {
  try {
    const meta = store.getPlanningMeta();
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load planning metadata' });
  }
});

export default router;
