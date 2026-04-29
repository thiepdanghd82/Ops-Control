/**
 * FormalQuotation — Formal quote document generator
 * Matches COST V1.0 M20: renderFormalQuotation
 */
import { useState, useCallback } from 'react';
import { costApi } from '../../../services/api';
import DecimalInput from '../../../utils/DecimalInput';
import Modal from '../../../components/Shared/Modal';
import { showToast } from '../../../utils/toast';
import { err as logErr } from '../../../utils/logger';
import './FormalQuotation.css';

const EMPTY_PRODUCT = {
  pn: '', description: '', size: '', material_drawing: '', material_quote: '',
  eau: '', moq: '', price_vnd: '', price_usd: '', tooling_fee: '',
  leadtime_mat: '', leadtime_sample: '', leadtime_po: '', remarks: '',
  process: '', type_material: '', type_ink: '',
};

// Stable client-only id so React keys survive insert/delete/reorder without
// focus or input state bleeding between rows. Not persisted server-side —
// the server strips unknown fields via validateBody.
let _prodUidCounter = 0;
const nextProdUid = () => `p${Date.now().toString(36)}-${++_prodUidCounter}`;

function createEmptyFQState() {
  return {
    company: '', address: '', tel: '', attn: '', job_title: '',
    ref_no: '', rfq_date: '', quotation_date: new Date().toISOString().slice(0, 10),
    expiry_date: '', pic: '',
    products: [{ ...EMPTY_PRODUCT, _uid: nextProdUid() }],
    payment_terms: '', delivery_terms: '',
    extra_terms: [
      'Prices are valid for 30 days from the date of this quotation.',
      'Tooling cost is one-time and non-refundable.',
      'Lead time starts from the date of order confirmation.',
      'All prices are in USD unless otherwise stated.',
      'This quotation is subject to our standard terms and conditions.',
    ],
    exchange_rate: 26291,
    released: false, released_at: null,
  };
}

export default function FormalQuotation() {
  const [fq, setFq] = useState(createEmptyFQState);
  const [saving, setSaving] = useState(false);
  const [confirmKind, setConfirmKind] = useState(null); // 'release' | 'reset' | null

  const setField = useCallback((field, value) => {
    setFq(prev => ({ ...prev, [field]: value }));
  }, []);

  const setProdField = useCallback((idx, field, value) => {
    setFq(prev => ({
      ...prev,
      products: prev.products.map((p, i) => i === idx ? { ...p, [field]: value } : p),
    }));
  }, []);

  const addProduct = useCallback(() => {
    setFq(prev => ({ ...prev, products: [...prev.products, { ...EMPTY_PRODUCT, _uid: nextProdUid() }] }));
  }, []);

  const removeProduct = useCallback((idx) => {
    setFq(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== idx) }));
  }, []);

  const setExtraTerm = useCallback((idx, value) => {
    setFq(prev => ({
      ...prev,
      extra_terms: prev.extra_terms.map((t, i) => i === idx ? value : t),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await costApi.saveQuotation(fq);
      showToast('Quotation saved', 'ok');
    } catch (e) {
      logErr('Failed to save quotation:', e);
      // Fallback: download as JSON so the operator never loses their work
      const blob = new Blob([JSON.stringify(fq, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fq.ref_no || 'quotation'}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Save failed — JSON backup downloaded instead', 'err');
    } finally {
      setSaving(false);
    }
  }, [fq]);

  const handlePrint = useCallback(() => window.print(), []);

  const performRelease = useCallback(() => {
    setFq(prev => ({ ...prev, released: true, released_at: new Date().toISOString() }));
    setConfirmKind(null);
    showToast('Quotation released', 'ok');
  }, []);

  const performReset = useCallback(() => {
    setFq(createEmptyFQState());
    setConfirmKind(null);
    showToast('Quotation reset', 'ok');
  }, []);

  const ro = fq.released;

  return (
    <div className="fq">
      {/* Toolbar */}
      <div className="fq-toolbar">
        <div className="fq-toolbar-title">Formal Quotation</div>
        {fq.released && <span className="fq-released-badge">RELEASED</span>}
        <div style={{ flex: 1 }} />
        <button className="fq-btn fq-btn-reset" onClick={() => setConfirmKind('reset')}>New</button>
        <button className="fq-btn fq-btn-print" onClick={handlePrint}>Print</button>
        {!ro && <button className="fq-btn fq-btn-release" onClick={() => setConfirmKind('release')}>Release</button>}
        <button className="fq-btn fq-btn-save" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <div className="fq-body">
        {/* Customer Info */}
        <div className="fq-card">
          <div className="fq-card-header">Customer Information</div>
          <div className="fq-card-body">
            <div className="fq-grid3">
              <div className="fq-field"><label>Company</label>{ro ? <span className="fq-ro">{fq.company}</span> : <input type="text" value={fq.company} onChange={e => setField('company', e.target.value)} className="fq-input" />}</div>
              <div className="fq-field"><label>Address</label>{ro ? <span className="fq-ro">{fq.address}</span> : <input type="text" value={fq.address} onChange={e => setField('address', e.target.value)} className="fq-input" />}</div>
              <div className="fq-field"><label>Tel</label>{ro ? <span className="fq-ro">{fq.tel}</span> : <input type="text" value={fq.tel} onChange={e => setField('tel', e.target.value)} className="fq-input" />}</div>
              <div className="fq-field"><label>Attention To</label>{ro ? <span className="fq-ro">{fq.attn}</span> : <input type="text" value={fq.attn} onChange={e => setField('attn', e.target.value)} className="fq-input" />}</div>
              <div className="fq-field"><label>Job Title</label>{ro ? <span className="fq-ro">{fq.job_title}</span> : <input type="text" value={fq.job_title} onChange={e => setField('job_title', e.target.value)} className="fq-input" />}</div>
            </div>
          </div>
        </div>

        {/* Quotation Info */}
        <div className="fq-card">
          <div className="fq-card-header">Quotation Details</div>
          <div className="fq-card-body">
            <div className="fq-grid3">
              <div className="fq-field"><label>Ref. No.</label>{ro ? <span className="fq-ro">{fq.ref_no}</span> : <input type="text" value={fq.ref_no} onChange={e => setField('ref_no', e.target.value)} className="fq-input fq-inp-yellow" />}</div>
              <div className="fq-field"><label>RFQ Date</label>{ro ? <span className="fq-ro">{fq.rfq_date}</span> : <input type="date" value={fq.rfq_date} onChange={e => setField('rfq_date', e.target.value)} className="fq-input" />}</div>
              <div className="fq-field"><label>Quotation Date</label>{ro ? <span className="fq-ro">{fq.quotation_date}</span> : <input type="date" value={fq.quotation_date} onChange={e => setField('quotation_date', e.target.value)} className="fq-input" />}</div>
              <div className="fq-field"><label>Expiry Date</label>{ro ? <span className="fq-ro">{fq.expiry_date}</span> : <input type="date" value={fq.expiry_date} onChange={e => setField('expiry_date', e.target.value)} className="fq-input" />}</div>
              <div className="fq-field"><label>PIC</label>{ro ? <span className="fq-ro">{fq.pic}</span> : <input type="text" value={fq.pic} onChange={e => setField('pic', e.target.value)} className="fq-input" />}</div>
              <div className="fq-field"><label>Exchange Rate (VND/USD)</label>{ro ? <span className="fq-ro">{fq.exchange_rate}</span> : <DecimalInput value={fq.exchange_rate} onChange={v => setField('exchange_rate', v)} className="fq-input" />}</div>
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="fq-card">
          <div className="fq-card-header">Products</div>
          <div className="fq-card-body" style={{ overflowX: 'auto' }}>
            <table className="fq-prod-table">
              <thead>
                <tr>
                  <th>No</th><th>P/N</th><th>Description</th><th>Size</th><th>Mat Draw</th><th>Mat Quote</th>
                  <th>EAU</th><th>MOQ</th><th>Price VND</th><th>Price USD</th><th>Tooling</th>
                  <th>LT Mat</th><th>LT Sample</th><th>LT PO</th><th>Remarks</th>
                  {!ro && <th></th>}
                </tr>
              </thead>
              <tbody>
                {fq.products.map((p, i) => (
                  <tr key={p._uid || `p-${i}`}>
                    <td className="fq-td-idx">{i + 1}</td>
                    {Object.keys(EMPTY_PRODUCT).map(k => (
                      <td key={k}>
                        {ro ? <span className="fq-td-ro">{p[k]}</span> : (
                          <input type="text" value={p[k] || ''} onChange={e => setProdField(i, k, e.target.value)} className="fq-prod-input" />
                        )}
                      </td>
                    ))}
                    {!ro && <td><button className="fq-del-btn" onClick={() => removeProduct(i)}>&times;</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!ro && <button className="fq-add-btn" onClick={addProduct}>+ Add Product</button>}
          </div>
        </div>

        {/* Terms */}
        <div className="fq-card">
          <div className="fq-card-header">Terms &amp; Conditions</div>
          <div className="fq-card-body">
            <div className="fq-grid2">
              <div className="fq-field"><label>Payment Terms</label>{ro ? <span className="fq-ro">{fq.payment_terms}</span> : <input type="text" value={fq.payment_terms} onChange={e => setField('payment_terms', e.target.value)} className="fq-input" />}</div>
              <div className="fq-field"><label>Delivery Terms</label>{ro ? <span className="fq-ro">{fq.delivery_terms}</span> : <input type="text" value={fq.delivery_terms} onChange={e => setField('delivery_terms', e.target.value)} className="fq-input" />}</div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Additional Terms</label>
              {fq.extra_terms.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', width: 16 }}>{i + 1}.</span>
                  {ro ? <span className="fq-ro" style={{ flex: 1 }}>{t}</span> : (
                    <input type="text" value={t} onChange={e => setExtraTerm(i, e.target.value)} className="fq-input" style={{ flex: 1 }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={confirmKind === 'release'}
        onClose={() => setConfirmKind(null)}
        size="sm"
        severity="warning"
      >
        <Modal.Header
          title="Release this quotation?"
          subtitle="Released quotations are read-only. Customer-facing pricing should be final before this step."
        />
        <Modal.Body>
          You can still print and save, but you will not be able to edit any field once released. This is intentional — a customer must always see the same numbers as the audit log.
        </Modal.Body>
        <Modal.Footer>
          <button className="op-btn op-btn-ghost" onClick={() => setConfirmKind(null)}>Cancel</button>
          <button className="op-btn op-btn-primary" onClick={performRelease}>Release</button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={confirmKind === 'reset'}
        onClose={() => setConfirmKind(null)}
        size="sm"
        severity="danger"
      >
        <Modal.Header
          title="Start a new quotation?"
          subtitle="All current fields will be cleared."
        />
        <Modal.Body>
          This wipes the customer information, all product rows, and the terms. If you have unsaved work, click Cancel and Save first.
        </Modal.Body>
        <Modal.Footer>
          <button className="op-btn op-btn-ghost" onClick={() => setConfirmKind(null)}>Cancel</button>
          <button className="op-btn op-btn-primary op-btn-danger" onClick={performReset}>Discard &amp; Start New</button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
