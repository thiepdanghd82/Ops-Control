/**
 * Which tooltip the EAU cell should carry.
 *
 * This was two nested ternaries inside JSX, and the inner one could never
 * run: it tested `showEauWarn`, which is itself `hasTooling && eau missing`,
 * so by the time it was reached the outer branch had already matched on the
 * missing EAU. The specific message S-INPUT-WARN wrote — the one that names
 * the consequence — was unreachable from the day it shipped, and nothing
 * failed, because an unreachable branch renders no worse than a reachable
 * one: you simply get the other message.
 *
 * Order here is deliberate. When a process carries a tool cost, a blank EAU
 * does not merely block the tab — it makes `calcProcess` amortise tooling
 * over MOQ instead of EAU, which inflated a quote's tooling 20x on
 * 2026-06-12 and read as a product bug for a day. That consequence is worth
 * more to the operator than "required", and the specific string says
 * "required" too, so naming it loses nothing.
 *
 * @param {{annualQty:*, hasTooling:boolean}} o
 * @returns {string|null} i18n key, or null when the cell needs no tooltip
 */
export function eauTooltipKey({ annualQty, hasTooling }) {
  if (Number(annualQty) > 0) return null;
  return hasTooling ? 'moqcard.eau_required' : 'gate.required_tip';
}
