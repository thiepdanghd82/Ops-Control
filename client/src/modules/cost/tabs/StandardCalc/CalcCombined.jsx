/**
 * CalcCombined — Phase 1 of the Std-tab consolidation roadmap
 * (S-PRICING-COMBINED-P1, 2026-06-17).
 *
 * Renders the three independent Std calculators — Materials, Inks,
 * Processes — stacked in a single sub-tab so the operator scrolls one
 * scrollable surface instead of clicking 3 tabs sequentially. Mirrors
 * the Cpx SubProductRow layout (Materials block + Inks block +
 * Processes block all in one render).
 *
 * Phase 1 strategy = OPT-IN composition: keep the 3 original sub-tabs
 * (`materials` / `inks` / `processes`) intact for muscle memory + F1
 * deep-links; this combined surface is an ADDITIONAL entry on the
 * sub-tab bar. Phase 2 (post-soak, pre-training) retires the 3
 * originals + flips this to default + redirects F1. Phase 3
 * (MES-3-FIX-56, post-go-live) extracts shared Section components +
 * dedupes ~1,600 LOC from Cpx SubProductRow.
 *
 * Why composition (not extraction) at Phase 1:
 *   - All 3 children already read std-state via useCalc() context —
 *     no prop interface to design, render-as-siblings is byte-equivalent
 *     to render-in-tab.
 *   - Mounting all 3 UNCONDITIONALLY in one render avoids the
 *     focus-loss / DOM-identity trap (Lesson 18 + Sprint S-PACK-SHIP
 *     step 3 R3) — no conditional wrapper churning React reconciliation
 *     between sections.
 *   - Zero state / reducer / calcEngine / Cpx changes — revert is a
 *     1-commit affair (delete this file + SUB_TABS entry + i18n keys).
 *
 * Why sectioning instead of bare stack:
 *   - Operator vocabulary parity: each section heading matches the
 *     original sub-tab label so the cheatsheet + F1 entries still map.
 *   - Visual ranchère ↔ scroll affordance: long combined view needs
 *     in-content anchors so the operator can scan vertically without
 *     getting lost.
 */
import { useI18n } from '../../../../utils/useI18n';
import CalcMaterials from './CalcMaterials';
import CalcInks from './CalcInks';
import CalcProcesses from './CalcProcesses';

export default function CalcCombined() {
  const { t } = useI18n();
  return (
    <div className="sc-combined">
      <section className="sc-combined-section" aria-labelledby="sc-combined-h-materials">
        <h2 id="sc-combined-h-materials" className="sc-combined-section-heading">
          {t('pricing.section.materials')}
        </h2>
        <CalcMaterials />
      </section>
      <section className="sc-combined-section" aria-labelledby="sc-combined-h-inks">
        <h2 id="sc-combined-h-inks" className="sc-combined-section-heading">
          {t('pricing.section.inks')}
        </h2>
        <CalcInks />
      </section>
      <section className="sc-combined-section" aria-labelledby="sc-combined-h-processes">
        <h2 id="sc-combined-h-processes" className="sc-combined-section-heading">
          {t('pricing.section.processes')}
        </h2>
        <CalcProcesses />
      </section>
    </div>
  );
}
