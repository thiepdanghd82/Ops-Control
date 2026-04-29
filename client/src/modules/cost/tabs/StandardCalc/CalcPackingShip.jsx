/**
 * CalcPackingShip — Packing & Shipping for Standard Calculator
 * Matches COST V1.0 M05 packing & shipping section
 */
import { useCallback, useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { calcPacking, calcShipping } from '../../../../services/calcEngine';
import { fmtN as _fmtN } from '../../../../utils/format';
import DecimalInput from '../../../../utils/DecimalInput';

// Local wrapper: default 6 decimals for packing/shipping unit costs.
function fmtN(v, d = 6) { return _fmtN(v, d); }

const PACK_METHODS = ['Sheet', 'Roll', 'Tray', 'PE Bag'];

const PACK_LABELS = {
  Sheet: { pcsLabel: 'Pcs/Roll', bagLabel: 'Rolls/Box', containerLabel: 'Core Cost (USD)' },
  Roll: { pcsLabel: 'Pcs/Roll', bagLabel: 'Rolls/Box', containerLabel: 'Core Cost (USD)' },
  Tray: { pcsLabel: 'Pcs/Tray', bagLabel: 'Trays/Box', containerLabel: 'Tray Cost (USD)' },
  'PE Bag': { pcsLabel: 'Pcs/PE Bag', bagLabel: 'Bags/Box', containerLabel: 'PE Bag Cost (USD)' },
};

export default function CalcPackingShip() {
  const { stdState, setStdField } = useCalc();
  const st = stdState;

  const handleField = useCallback((field, value, isNum = false) => {
    setStdField(field, isNum ? (parseFloat(value) || 0) : value);
  }, [setStdField]);

  const packTotal = useMemo(() => {
    try { return calcPacking(st); } catch { return 0; }
  }, [st]);

  const shipTotal = useMemo(() => {
    try { return calcShipping(st); } catch { return 0; }
  }, [st]);

  const labels = PACK_LABELS[st.packing_method] || PACK_LABELS.Sheet;

  return (
    <div className="sc-section">
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
              <select value={st.packing_method || 'Sheet'} onChange={e => handleField('packing_method', e.target.value)} className="sc-input">
                {PACK_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="sc-field">
              <label>{labels.pcsLabel}</label>
              <input type="number" value={st.pcs_per_bag || ''} onChange={e => handleField('pcs_per_bag', e.target.value, true)} placeholder="—" className="sc-input" />
            </div>
            <div className="sc-field">
              <label>{labels.bagLabel}</label>
              <input type="number" value={st.bags_per_box || ''} onChange={e => handleField('bags_per_box', e.target.value, true)} placeholder="—" className="sc-input" />
            </div>
            <div className="sc-field">
              <label>{labels.containerLabel}</label>
              <DecimalInput value={st.container_cost} onChange={v => setStdField('container_cost', v)} placeholder="—" className="sc-input" />
            </div>
            <div className="sc-field">
              <label>Box Cost (USD)</label>
              <DecimalInput value={st.box_cost} onChange={v => setStdField('box_cost', v)} placeholder="—" className="sc-input" />
            </div>
            <div className="sc-field">
              <label>Other Packing/pcs</label>
              <DecimalInput value={st.other_packing} onChange={v => setStdField('other_packing', v)} placeholder="—" className="sc-input" />
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
              <input type="text" value={st.delivery_term || ''} onChange={e => handleField('delivery_term', e.target.value)} className="sc-input" placeholder="FOB, CIF, etc." />
            </div>
            <div className="sc-field">
              <label>Deliver Quantity</label>
              {/* Auto-sync with MOQ: blank input = MOQ (engine fallback on line
                  calcShipping L409). User can type an override; clear to
                  revert. Purple-bold marks override, same pattern as Material
                  Width / Pitch Ovr. */}
              <input type="number"
                value={st.ship_qty > 0 ? st.ship_qty : (st.moq > 0 ? st.moq : '')}
                onChange={e => handleField('ship_qty', e.target.value, true)}
                className="sc-input"
                placeholder="—"
                style={st.ship_qty > 0
                  ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                  : { color: 'var(--color-slate-900)' }}
                title={st.ship_qty > 0 ? 'Override — clear to revert to MOQ' : 'Auto-synced from MOQ'}
              />
            </div>
            <div className="sc-field">
              <label>Shipping Cost (USD total)</label>
              <DecimalInput value={st.shipping_cost} onChange={v => setStdField('shipping_cost', v)} placeholder="—" className="sc-input" />
            </div>
            <div className="sc-field">
              <label>Other Cost/shipment</label>
              <DecimalInput value={st.other_ship} onChange={v => setStdField('other_ship', v)} placeholder="—" className="sc-input" />
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
