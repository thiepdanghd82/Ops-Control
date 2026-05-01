/**
 * MES-1.5 client-side constants — mirror of
 * domains/planning/shared/constants/workOrderStates.js.
 *
 * Duplicated rather than aliased because Vite only resolves
 * client/src/* without extra config; the v1.3 cross-package alias setup
 * is deferred to the migration sprint per MIGRATION.md. Drift is
 * caught by the i18n parity lint (every WO_STATUSES entry must have a
 * `planning.workOrder.status.<X>` i18n key in EN+VN).
 */
export const WO_STATUSES = Object.freeze([
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

export const WO_OP_TYPES = Object.freeze([
  'PRE_PRESS',
  'FLEXO',
  'DIE_CUT_FLATBED',
  'DIE_CUT_ROTARY',
  'LAMINATE',
  'PACK',
  'OUTSOURCE',
]);
