// Pure helpers for MarginPriceCells (split out so the .jsx exports only
// components — react-refresh/only-export-components).
import { MARGIN_POLICY } from '../../../services/priceSolver';

export const FLOORS = {
  va: MARGIN_POLICY.va,
  contribution: MARGIN_POLICY.contr,
  gm: MARGIN_POLICY.gm,
};

/** True when this metric's value is below its policy floor. */
export function metricWarn(metric, value) {
  const floor = FLOORS[metric];
  return typeof value === 'number' && Number.isFinite(value) && value < floor - 1e-9;
}

/** Human hint for the suggested default price (GM 25%, noting any raise). */
export function formatDefaultHint(def) {
  if (!def || !(def.price > 0)) return null;
  const p = '$' + def.price.toFixed(4);
  if (def.boundBy === 'va') return `GM 25% → ${p} · raised to keep VA ≥ 30%`;
  if (def.boundBy === 'contribution') return `GM 25% → ${p} · raised to keep Contr ≥ 25%`;
  return `GM 25% → ${p}`;
}
