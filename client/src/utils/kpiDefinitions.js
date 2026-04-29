/**
 * KPI tooltip text — single source of truth so Cost Breakdown, Summary
 * Bar, Cost Card, and QuoteAnalysis all surface the same definition.
 *
 * Sprint 8 (Phase 8 B.2). Audit §2.4 flagged that Contribution% uses
 * the CCL convention (includes tooling) which differs from the
 * textbook definition. Rather than silently renaming the metric we
 * expose the definition on hover so Finance readers know what's
 * counted before they quote from it.
 */

export const KPI_TOOLTIPS = {
  gm:
    'Gross Margin % = 1 − (Total Cost ÷ Selling Price). Total Cost includes Material, Overhead, Labor, Tooling, Packing + Ship, and VAT loss.',
  va:
    'Value Add % = 1 − (Material + Tooling + Packing/Ship) ÷ Price. Excludes labor — a "how much does the process add beyond bought-in material?" view.',
  contribution:
    'Contribution % = 1 − (Material + Tooling + Packing/Ship + Labor) ÷ Price. CCL convention INCLUDES tooling (amortized per order). This differs from the accounting textbook definition where tooling is a fixed/period cost and excluded. Do not compare across companies without adjusting — compare Ops Control numbers to Ops Control numbers.',
};
