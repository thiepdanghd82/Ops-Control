/**
 * CalcPackingShip — Packing & Shipping for Standard Calculator
 * Matches COST V1.0 M05 packing & shipping section.
 *
 * Sprint S-PACK-SHIP-PER-TIER (2026-06-16) — 10 pack/ship fields now
 * route by active MOQ tier:
 *   tier 0 → top-level stdState[field] (unchanged behavior)
 *   tier>0 → stdState.extra_moqs[idx-1].packing[field] (sparse override)
 *
 * Binding is presence-based (`resolveTierField`, NOT `value || ''`)
 * so an explicit 0 override surfaces as 0 rather than silently falling
 * back to base. Clear-input on raw inputs fires `''` → reducer deletes
 * the override key → revert to base; the 5 DecimalInput-wrapped fields
 * opt into `preserveEmpty` so blur-empty has the same revert semantic.
 * The ↻ button is the explicit revert affordance, visible only when
 * the field has an active override.
 */
import { useCallback, useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { calcPacking, calcShipping, getActiveTierState } from '../../../../services/calcEngine';
import { resolveTierField } from '../../../../services/packingTierField';
import { fmtN as _fmtN, parseLocaleNumber } from '../../../../utils/format';
import DecimalInput from '../../../../utils/DecimalInput';

function fmtN(v, d = 6) {
  return _fmtN(v, d);
}

const PACK_METHODS = ['Sheet', 'Roll', 'Tray', 'PE Bag'];

const PACK_LABELS = {
  Sheet: { pcsLabel: 'Pcs/Roll', bagLabel: 'Rolls/Box', containerLabel: 'Core Cost (USD)' },
  Roll: { pcsLabel: 'Pcs/Roll', bagLabel: 'Rolls/Box', containerLabel: 'Core Cost (USD)' },
  Tray: { pcsLabel: 'Pcs/Tray', bagLabel: 'Trays/Box', containerLabel: 'Tray Cost (USD)' },
  'PE Bag': { pcsLabel: 'Pcs/PE Bag', bagLabel: 'Bags/Box', containerLabel: 'PE Bag Cost (USD)' },
};

// Presence-aware string for raw <input> value. Shows 0 as "0" (not '');
// shows '' for undefined/null. Mirror of CalcInks Width/Pitch override.
function presence(v) {
  return v === undefined || v === null ? '' : v;
}

// Module-scope wrapper for input + optional ↻ reset button. Reset only
// renders when isTier && isOverride; otherwise children pass through
// unchanged so tier 0 keeps the original single-input layout. Module
// scope (not inline) per react-hooks/static-components lint.
function PackRow({ isTier, isOverride, activeIdx, onReset, children }) {
  if (!isTier || !isOverride) return children;
  return (
    <div className="sc-pack-row">
      {children}
      <button
        type="button"
        className="sc-pack-reset"
        title={`Reset MOQ ${activeIdx + 1} override → MOQ 1 base`}
        onClick={onReset}
      >
        ↻
      </button>
    </div>
  );
}

export default function CalcPackingShip() {
  const { stdState, dispatch } = useCalc();
  const st = stdState;
  const activeIdx = st.active_moq_idx || 0;
  const em = activeIdx > 0 ? (st.extra_moqs || [])[activeIdx - 1] : null;
  const isTier = activeIdx > 0;

  const f = useCallback((field) => resolveTierField(em, st, field), [em, st]);

  const setField = useCallback(
    (field, value) => dispatch({ type: 'SET_STD_TIER_PACKING_FIELD', payload: { field, value } }),
    [dispatch]
  );
  const resetField = useCallback((field) => setField(field, ''), [setField]);

  // Totals reflect the active tier (post packing merge from
  // getActiveTierState). On tier 0 this is a no-op.
  const tierSt = useMemo(() => getActiveTierState(st), [st]);
  const packTotal = useMemo(() => {
    try {
      return calcPacking(tierSt);
    } catch {
      return 0;
    }
  }, [tierSt]);
  const shipTotal = useMemo(() => {
    try {
      return calcShipping(tierSt);
    } catch {
      return 0;
    }
  }, [tierSt]);

  const methodValue = f('packing_method').value || 'Sheet';
  const labels = PACK_LABELS[methodValue] || PACK_LABELS.Sheet;

  // CSS class for tier visual state: violet+bold on override, italic gray
  // on inherited, plain on tier 0 (no override concept).
  const cls = useCallback(
    (field) => {
      if (!isTier) return '';
      const { isOverride } = f(field);
      return isOverride ? 'sc-pack-tier-ovr' : 'sc-pack-tier-inherit';
    },
    [isTier, f]
  );

  // Per-field <PackRow> props builder. Closes over the per-render
  // active-tier flags so callsites stay terse.
  const rowProps = useCallback(
    (field) => ({
      isTier,
      isOverride: f(field).isOverride,
      activeIdx,
      onReset: () => resetField(field),
    }),
    [isTier, f, activeIdx, resetField]
  );

  return (
    <div className="sc-section">
      {isTier && (
        <div className="sc-pack-tier-hint" role="note">
          ▣ Editing <b>MOQ {activeIdx + 1}</b> override. Clear an input or click ↻ to revert that
          field to MOQ 1 base.
        </div>
      )}
      <div className="sc-pack-grid">
        {/* Packing */}
        <div className="sc-card">
          <div className="sc-card-header sc-header-emerald">
            <span className="sc-card-icon">&#9635;</span>
            <span className="sc-card-title">Packing</span>
          </div>
          <div className="sc-card-body">
            <div className="sc-field">
              <label>Packing Method</label>
              <PackRow {...rowProps('packing_method')}>
                <select
                  value={methodValue}
                  onChange={(e) => setField('packing_method', e.target.value)}
                  className={`sc-input ${cls('packing_method')}`}
                >
                  {PACK_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </PackRow>
            </div>
            <div className="sc-field">
              <label>{labels.pcsLabel}</label>
              <PackRow {...rowProps('pcs_per_bag')}>
                <input
                  type="number"
                  value={presence(f('pcs_per_bag').value)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setField('pcs_per_bag', raw === '' ? '' : parseLocaleNumber(raw) || 0);
                  }}
                  placeholder="—"
                  className={`sc-input ${cls('pcs_per_bag')}`}
                />
              </PackRow>
            </div>
            <div className="sc-field">
              <label>{labels.bagLabel}</label>
              <PackRow {...rowProps('bags_per_box')}>
                <input
                  type="number"
                  value={presence(f('bags_per_box').value)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setField('bags_per_box', raw === '' ? '' : parseLocaleNumber(raw) || 0);
                  }}
                  placeholder="—"
                  className={`sc-input ${cls('bags_per_box')}`}
                />
              </PackRow>
            </div>
            <div className="sc-field">
              <label>{labels.containerLabel}</label>
              <PackRow {...rowProps('container_cost')}>
                <DecimalInput
                  value={f('container_cost').value}
                  onChange={(v) => setField('container_cost', v)}
                  preserveEmpty={isTier}
                  placeholder="—"
                  className={`sc-input ${cls('container_cost')}`}
                />
              </PackRow>
            </div>
            <div className="sc-field">
              <label>Box Cost (USD)</label>
              <PackRow {...rowProps('box_cost')}>
                <DecimalInput
                  value={f('box_cost').value}
                  onChange={(v) => setField('box_cost', v)}
                  preserveEmpty={isTier}
                  placeholder="—"
                  className={`sc-input ${cls('box_cost')}`}
                />
              </PackRow>
            </div>
            <div className="sc-field">
              <label>Other Packing/pcs</label>
              <PackRow {...rowProps('other_packing')}>
                <DecimalInput
                  value={f('other_packing').value}
                  onChange={(v) => setField('other_packing', v)}
                  preserveEmpty={isTier}
                  placeholder="—"
                  className={`sc-input ${cls('other_packing')}`}
                />
              </PackRow>
            </div>
            <div className="sc-pack-total">
              Total Packing/pcs: <b>{fmtN(packTotal)} USD</b>
            </div>
          </div>
        </div>

        {/* Shipping */}
        <div className="sc-card">
          <div className="sc-card-header sc-header-sky">
            <span className="sc-card-icon">&#8680;</span>
            <span className="sc-card-title">Shipping</span>
          </div>
          <div className="sc-card-body">
            <div className="sc-field">
              <label>Delivery Term</label>
              <PackRow {...rowProps('delivery_term')}>
                <input
                  type="text"
                  value={presence(f('delivery_term').value)}
                  onChange={(e) => setField('delivery_term', e.target.value)}
                  className={`sc-input ${cls('delivery_term')}`}
                  placeholder="FOB, CIF, etc."
                />
              </PackRow>
            </div>
            <div className="sc-field">
              <label>Deliver Quantity</label>
              {/* On tier 0 keep the auto-sync-from-MOQ behavior. On tier>0
                  the field is purely override (explicit value or fall back
                  to base ship_qty / base MOQ via calcShipping). */}
              <PackRow {...rowProps('ship_qty')}>
                <input
                  type="number"
                  value={
                    isTier
                      ? presence(f('ship_qty').value)
                      : st.ship_qty > 0
                        ? st.ship_qty
                        : st.moq > 0
                          ? st.moq
                          : ''
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    setField('ship_qty', raw === '' ? '' : parseLocaleNumber(raw) || 0);
                  }}
                  className={`sc-input ${cls('ship_qty')}`}
                  placeholder="—"
                  title={
                    isTier
                      ? f('ship_qty').isOverride
                        ? `MOQ ${activeIdx + 1} override — click ↻ to revert`
                        : 'Inherits MOQ 1 base — type to override'
                      : st.ship_qty > 0
                        ? 'Override — clear to revert to MOQ'
                        : 'Auto-synced from MOQ'
                  }
                />
              </PackRow>
            </div>
            <div className="sc-field">
              <label>Shipping Cost (USD total)</label>
              <PackRow {...rowProps('shipping_cost')}>
                <DecimalInput
                  value={f('shipping_cost').value}
                  onChange={(v) => setField('shipping_cost', v)}
                  preserveEmpty={isTier}
                  placeholder="—"
                  className={`sc-input ${cls('shipping_cost')}`}
                />
              </PackRow>
            </div>
            <div className="sc-field">
              <label>Other Cost/shipment</label>
              <PackRow {...rowProps('other_ship')}>
                <DecimalInput
                  value={f('other_ship').value}
                  onChange={(v) => setField('other_ship', v)}
                  preserveEmpty={isTier}
                  placeholder="—"
                  className={`sc-input ${cls('other_ship')}`}
                />
              </PackRow>
            </div>
            <div className="sc-ship-total">
              Total Shipping/pcs: <b>{fmtN(shipTotal)} USD</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
