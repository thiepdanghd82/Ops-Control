/**
 * Planning Module Routes (Node.js native)
 * Handles orders, work orders, WIP tracking, capacity
 */

import { Router } from 'express';
import { requireModule, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as store from '../services/planningStore.js';

const router = Router();

// Schemas — intentionally lenient on the nested order/WO shapes since
// those evolved from the v1 JSON files and carry ~20 columns of
// metadata. We only enforce the identifying fields + sensible string
// bounds so a typo client can't write a 10 MB record.
const orderSchema = {
  orderNumber: { type: 'string', required: true, min: 1, max: 64 },
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
