/**
 * Work Order state-machine constants — Sprint MES-1.
 *
 * All exports are Object.freeze'd so callers cannot mutate the enum at
 * runtime. These mirror the inline CHECK constraints in
 * server/db/schema.sql (work_order.status, work_order_op.op_type) — drift
 * between this file and the SQL CHECK is a real bug and should be caught
 * by the integration tests.
 *
 * WO_OP_STATUSES is exported now for MES-2 reuse — operation-level
 * transitions are not implemented in MES-1 (no /start /pause /complete
 * endpoints yet), but landing the enum here lets MES-1.4 contract tests
 * reference it when seeding ops in PENDING and avoids a churn commit.
 */

export const WO_STATES = Object.freeze([
  'CREATED',
  'RELEASED',
  'SCHEDULED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'QC_RELEASED',
  'CLOSED',
  'CANCELLED',
]);

export const WO_TERMINAL = Object.freeze(['CLOSED', 'CANCELLED']);

export const WO_OP_TYPES = Object.freeze([
  'PRE_PRESS',
  'FLEXO',
  'DIE_CUT_FLATBED',
  'DIE_CUT_ROTARY',
  'LAMINATE',
  'PACK',
  'OUTSOURCE',
]);

export const WO_OP_STATUSES = Object.freeze([
  'PENDING',
  'DISPATCHED',
  'SETUP',
  'RUNNING',
  'PAUSED',
  'DONE',
  'ACCEPTED',
]);
