/**
 * RfqInfoCard — shared RFQ Information card used by both Standard and
 * Complex calculators. Extracted in Sprint 5.1 from CalcHeader.jsx and
 * CplxHeader.jsx which previously held ~95% identical markup.
 *
 * Props:
 *   state               — the calculator state object (stdState | cplxState)
 *   onChange(field, value, isNum)
 *                       — called on every input change. `field` is the
 *                         state key (already un-aliased). `isNum=true`
 *                         means caller should parseFloat before storing.
 *   onGenerateRfq()     — async; caller owns the RFQ prefix ('S' vs 'C').
 *   npiOwners           — string[] for the NPI Owner datalist.
 *   designProcessOpts   — string[] for the Design Process select.
 *   tradeModeOpts       — string[]; when empty, render a free-text input.
 *   datalistId          — REQUIRED, must be unique per instance (two
 *                         calculators can render on the same page only
 *                         one at a time in practice, but using a unique
 *                         id prevents <datalist> collision if that
 *                         ever changes).
 *   aliasMap            — optional; maps a logical field key to the
 *                         caller's actual state key. Standard aliases
 *                         `end_cu → project` for the legacy field-name
 *                         quirk. Complex passes no alias (keys match
 *                         state 1:1).
 */

import { SITES as SITE_OPTIONS } from '../../utils/sites';
import DecimalInput from '../../utils/DecimalInput';

export default function RfqInfoCard({
  state,
  onChange,
  onGenerateRfq,
  npiOwners = [],
  designProcessOpts = [],
  tradeModeOpts = [],
  datalistId,
  aliasMap,
}) {
  const realKey = (k) => (aliasMap && aliasMap[k]) || k;
  const get = (k) => state?.[realKey(k)] ?? '';
  const set = (k, value, isNum = false) => onChange(realKey(k), value, isNum);
  // Stable per-instance id so multiple RfqInfoCards on one page never
  // collide, and labels always associate with the right input (WCAG 1.3.1).
  const fid = (k) => `rfq-${datalistId || 'x'}-${k}`;

  // Phase 9E.4 + Sprint S-QUOTE-PROGRESS-V2 — once a quote is
  // price_approved the pricing basis is committed. Changing site
  // would retroactively shift the cost stack because a different
  // site's rate table / SGA rate applies. Operator must transition
  // back to draft / quote_to_sale to unlock. Legacy quote data with
  // 'pending_finance' or 'approved' still locks (back-compat).
  const approvalStatus = state?.approval?.status || 'draft';
  const siteLocked =
    approvalStatus === 'price_approved' ||
    approvalStatus === 'pending_finance' ||
    approvalStatus === 'approved';

  return (
    <div className="sc-card">
      <div className="sc-card-header sc-header-navy">
        <span className="sc-card-icon">&#128203;</span>
        <span className="sc-card-title">RFQ Information</span>
      </div>
      <div className="sc-card-body sc-rfq-body">
        <div className="sc-rfq-section-title">Identification</div>
        <div className="sc-grid4">
          <div className="sc-field">
            <label htmlFor={fid('site')}>
              Site{' '}
              {siteLocked && (
                <span
                  title={`Locked after ${approvalStatus} — revoke to change`}
                  style={{ fontSize: 10, color: '#8d8d8d', marginLeft: 4 }}
                >
                  🔒
                </span>
              )}
            </label>
            <select
              id={fid('site')}
              value={get('site') || 'VN'}
              onChange={(e) => set('site', e.target.value)}
              className="sc-input sc-inp-yellow"
              disabled={siteLocked}
              title={
                siteLocked
                  ? `Site is locked after ${approvalStatus}. REVOKE the approval to unlock.`
                  : undefined
              }
            >
              {SITE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="sc-field">
            <label htmlFor={fid('ccl_pn')}>CCL PN (80#)</label>
            <input
              id={fid('ccl_pn')}
              type="text"
              value={get('ccl_pn')}
              onChange={(e) => set('ccl_pn', e.target.value)}
              className="sc-input sc-inp-yellow"
            />
          </div>
          <div className="sc-field">
            <label htmlFor={fid('npi_owner')}>NPI Owner</label>
            <input
              id={fid('npi_owner')}
              type="text"
              list={datalistId}
              value={get('npi_owner')}
              onChange={(e) => set('npi_owner', e.target.value)}
              className={`sc-input sc-inp-yellow ${!get('npi_owner') ? 'sc-input-warn' : ''}`}
            />
            <datalist id={datalistId}>
              {npiOwners.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="sc-field">
            <label htmlFor={fid('sale_owner')}>Sale Owner</label>
            <input
              id={fid('sale_owner')}
              type="text"
              value={get('sale_owner')}
              onChange={(e) => set('sale_owner', e.target.value)}
              className="sc-input"
            />
          </div>
        </div>

        <div className="sc-rfq-section-title">Customer</div>
        <div className="sc-grid4">
          <div className="sc-field">
            <label htmlFor={fid('direct_cu')}>Direct Customer</label>
            <input
              id={fid('direct_cu')}
              type="text"
              value={get('direct_cu')}
              onChange={(e) => set('direct_cu', e.target.value)}
              className="sc-input"
            />
          </div>
          <div className="sc-field">
            <label htmlFor={fid('direct_cu_pn')}>Direct CU PN</label>
            <input
              id={fid('direct_cu_pn')}
              type="text"
              value={get('direct_cu_pn')}
              onChange={(e) => set('direct_cu_pn', e.target.value)}
              className="sc-input"
            />
          </div>
          <div className="sc-field">
            <label htmlFor={fid('end_cu')}>End Customer</label>
            <input
              id={fid('end_cu')}
              type="text"
              value={get('end_cu')}
              onChange={(e) => set('end_cu', e.target.value)}
              className="sc-input"
            />
          </div>
          <div className="sc-field">
            <label htmlFor={fid('end_cu_pn')}>End CU PN</label>
            <input
              id={fid('end_cu_pn')}
              type="text"
              value={get('end_cu_pn')}
              onChange={(e) => set('end_cu_pn', e.target.value)}
              className="sc-input"
            />
          </div>
        </div>

        <div className="sc-rfq-section-title">Product</div>
        <div className="sc-grid4">
          <div className="sc-field sc-field-span2">
            <label htmlFor={fid('project_name')}>Project</label>
            <input
              id={fid('project_name')}
              type="text"
              value={get('project_name')}
              onChange={(e) => set('project_name', e.target.value)}
              className="sc-input"
            />
          </div>
          <div className="sc-field sc-field-span2">
            <label htmlFor={fid('description')}>Description</label>
            <input
              id={fid('description')}
              type="text"
              value={get('description')}
              onChange={(e) => set('description', e.target.value)}
              className="sc-input"
            />
          </div>
          <div className="sc-field">
            <label htmlFor={fid('product_lifetime')}>Product Life Time</label>
            <DecimalInput
              id={fid('product_lifetime')}
              value={get('product_lifetime')}
              onChange={(v) => set('product_lifetime', v, true)}
              className="sc-input"
              placeholder="years"
            />
          </div>
          <div className="sc-field">
            <label htmlFor={fid('trade_mode')}>Trade Mode</label>
            {tradeModeOpts.length > 0 ? (
              <select
                id={fid('trade_mode')}
                value={get('trade_mode')}
                onChange={(e) => set('trade_mode', e.target.value)}
                className="sc-input"
              >
                <option value="">-- Select --</option>
                {tradeModeOpts.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={fid('trade_mode')}
                type="text"
                value={get('trade_mode')}
                onChange={(e) => set('trade_mode', e.target.value)}
                className="sc-input"
                placeholder="USD / VND"
              />
            )}
          </div>
          <div className="sc-field sc-field-span2">
            <label htmlFor={fid('design_process')}>Design Process</label>
            <select
              id={fid('design_process')}
              value={get('design_process')}
              onChange={(e) => set('design_process', e.target.value)}
              className={`sc-input ${!get('design_process') ? 'sc-input-warn' : ''}`}
            >
              <option value="">-- Select --</option>
              {designProcessOpts.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sc-rfq-section-title">RFQ &amp; Certification</div>
        <div className="sc-grid4">
          <div className="sc-field">
            <label htmlFor={fid('rfq_number')}>RFQ Number</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                id={fid('rfq_number')}
                type="text"
                value={get('rfq_number')}
                readOnly
                className="sc-input"
                style={{ background: '#eff6ff', flex: 1 }}
              />
              <button
                className="sc-btn-sm"
                onClick={onGenerateRfq}
                title="Generate"
                aria-label="Generate RFQ number"
              >
                &#8635;
              </button>
            </div>
          </div>
          <div className="sc-field">
            <label htmlFor={fid('options')}>Options</label>
            <textarea
              id={fid('options')}
              value={get('options')}
              onChange={(e) => set('options', e.target.value)}
              className="sc-input"
              rows={1}
              style={{ resize: 'vertical', minHeight: '2.2em', fontFamily: 'inherit' }}
            />
          </div>
          <div className="sc-field">
            <label htmlFor={fid('request_ul')}>Request UL</label>
            <select
              id={fid('request_ul')}
              value={get('request_ul') || 'N'}
              onChange={(e) => set('request_ul', e.target.value)}
              className="sc-input"
            >
              <option value="N">N</option>
              <option value="Y">Y</option>
            </select>
          </div>
          <div className="sc-field">
            <label htmlFor={fid('ul_description')}>UL Description</label>
            <input
              id={fid('ul_description')}
              type="text"
              value={get('ul_description')}
              onChange={(e) => set('ul_description', e.target.value)}
              className="sc-input"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
