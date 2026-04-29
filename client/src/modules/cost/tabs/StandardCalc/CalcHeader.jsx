/**
 * CalcHeader — RFQ Information + MOQ Tier Management
 * Matches COST V1.0 M05 header section
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { getDesignProcessList } from '../../../../utils/ddl';
import { genRfqNum } from '../../../../utils/rfqGen';
import { sharedApi } from '../../../../services/api';
import DecimalInput from '../../../../utils/DecimalInput';
import RfqInfoCard from '../../../../components/Shared/RfqInfoCard';

export default function CalcHeader() {
  const { stdState, cplxState, setStdField, dispatch } = useCalc();
  const { lib, setActiveSite } = useCostLib();
  const st = stdState;

  const handleField = useCallback((field, value, isNum = false) => {
    // Accept either a raw string (legacy <input type=text/number>) or a
    // pre-parsed number from DecimalInput via RfqInfoCard. When isNum
    // is true we coerce strings, otherwise pass through.
    const v = isNum
      ? (typeof value === 'number' ? value : (parseFloat(value) || 0))
      : value;
    setStdField(field, v);
    if (field === 'site') setActiveSite(v);
  }, [setStdField, setActiveSite]);

  // Phase 9D.1 — keep CostLibContext.activeSite in lockstep with the
  // quote's own site field so loading a saved quote picks up that site's
  // rates and DDL automatically. Without this, handleField only fires on
  // user input; a freshly-loaded India quote would compute against VN
  // rates until the user touched the dropdown.
  useEffect(() => {
    if (st.site) setActiveSite(st.site);
  }, [st.site, setActiveSite]);

  const npiOwners = useMemo(() => {
    if (!lib?.ddl?.npi_owner) return [];
    return Array.isArray(lib.ddl.npi_owner) ? lib.ddl.npi_owner : [];
  }, [lib]);

  const designProcessOpts = useMemo(() => getDesignProcessList(lib), [lib]);

  const tradeModeOpts = useMemo(() => {
    const list = lib?.ddl?.trade_mode || [];
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }, [lib]);

  const addMoqTier = useCallback(() => {
    // SET_NUM_MOQ expects { value: num } — reducer auto-creates empty tiers
    dispatch({ type: 'SET_NUM_MOQ', payload: { value: (st.num_moq || 1) + 1 } });
  }, [st.num_moq, dispatch]);

  const removeMoqTier = useCallback((idx) => {
    // Remove specific tier by updating both fields atomically via SET_STD_STATE
    const newExtra = (st.extra_moqs || []).filter((_, i) => i !== idx);
    dispatch({ type: 'SET_STD_STATE', payload: {
      num_moq: Math.max(1, (st.num_moq || 1) - 1),
      extra_moqs: newExtra,
    }});
  }, [st.extra_moqs, st.num_moq, dispatch]);

  const updateExtraMoq = useCallback((idx, field, value) => {
    // DecimalInput sends numbers; older callers may still pass strings.
    // Accept either — only coerce when it's not already a finite number.
    const v = typeof value === 'number' && Number.isFinite(value)
      ? value
      : (value === '' || value == null ? 0 : (parseFloat(value) || 0));
    dispatch({ type: 'SET_EXTRA_MOQ', payload: { idx, field, value: v } });
    // Bidirectional USD ↔ VND sync for price/target fields.
    const rate = st.usd_rate || 0;
    if (rate > 0 && typeof v === 'number') {
      let mirrorField, mirrorVal;
      if (field === 'price') { mirrorField = 'price_vnd'; mirrorVal = +(v * rate).toFixed(0); }
      else if (field === 'price_vnd') { mirrorField = 'price'; mirrorVal = +(v / rate).toFixed(4); }
      else if (field === 'target') { mirrorField = 'target_vnd'; mirrorVal = +(v * rate).toFixed(0); }
      else if (field === 'target_vnd') { mirrorField = 'target'; mirrorVal = +(v / rate).toFixed(4); }
      if (mirrorField) dispatch({ type: 'SET_EXTRA_MOQ', payload: { idx, field: mirrorField, value: mirrorVal } });
    }
  }, [dispatch, st.usd_rate]);

  // Bidirectional USD ↔ VND sync helpers for the primary MOQ pricing
  // fields. Typing in a USD field auto-populates the mirrored VND
  // field (and vice-versa) via st.usd_rate. Rate = 0 disables sync.
  const setPriceUsd = useCallback((field, vndField, v) => {
    const updates = { [field]: v };
    const rate = st.usd_rate || 0;
    if (rate > 0 && typeof v === 'number') updates[vndField] = +(v * rate).toFixed(0);
    dispatch({ type: 'SET_STD_STATE', payload: updates });
  }, [dispatch, st.usd_rate]);
  const setPriceVnd = useCallback((field, usdField, v) => {
    const updates = { [field]: v };
    const rate = st.usd_rate || 0;
    if (rate > 0 && typeof v === 'number') updates[usdField] = +(v / rate).toFixed(4);
    dispatch({ type: 'SET_STD_STATE', payload: updates });
  }, [dispatch, st.usd_rate]);

  // Retro-sync VND mirrors when USD values or the rate change. USD is
  // the source of truth; VND follows. This catches the scenarios that
  // per-field onChange can't handle: loading a legacy quote without
  // VND, setting USD before the rate was entered, or changing the
  // rate after values are already typed in. See ComplexCalc for the
  // same effect applied to cplxState.
  const rate = st.usd_rate || 0;
  useEffect(() => {
    if (rate <= 0) return;
    const syncVnd = (usd, vnd) => {
      if (usd == null || usd === 0) return null;
      const expected = +(usd * rate).toFixed(0);
      return Math.abs((vnd || 0) - expected) > 1 ? expected : null;
    };
    const updates = {};
    const sNext = syncVnd(st.selling_price, st.selling_price_vnd);
    if (sNext != null) updates.selling_price_vnd = sNext;
    const tNext = syncVnd(st.target, st.target_vnd);
    if (tNext != null) updates.target_vnd = tNext;
    const nextExtra = (st.extra_moqs || []).map(em => {
      const pNext = syncVnd(em.price, em.price_vnd);
      const ptNext = syncVnd(em.target, em.target_vnd);
      if (pNext == null && ptNext == null) return em;
      return {
        ...em,
        ...(pNext != null ? { price_vnd: pNext } : {}),
        ...(ptNext != null ? { target_vnd: ptNext } : {}),
      };
    });
    if (nextExtra.some((em, i) => em !== (st.extra_moqs || [])[i])) updates.extra_moqs = nextExtra;
    if (Object.keys(updates).length) dispatch({ type: 'SET_STD_STATE', payload: updates });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, st.selling_price, st.target, st.extra_moqs]);

  // ── Per-MOQ setup overrides ──
  // Accept a number (committed override — including explicit 0) or
  // null (clear-override, revert to base). Strings remain tolerated
  // for the legacy <input> call shape. Sprint AT: the explicit null
  // channel is why we kept these inputs off DecimalInput during the
  // initial sweep — DecimalInput's on-blur 0 collapses would have
  // erased the null-vs-0 distinction callers rely on.
  function coerceOverride(input) {
    if (input == null) return null;  // explicit revert-to-base
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (input === '') return null;
    const n = parseFloat(input);
    return Number.isFinite(n) ? n : null;
  }
  function coerceBase(input) {
    if (input == null || input === '') return 0;
    if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
    const n = parseFloat(input);
    return Number.isFinite(n) ? n : 0;
  }

  const setMatSetupForTier = useCallback((tierIdx, matIdx, value) => {
    // tierIdx 0 = base (writes mat.setup_lm); 1+ = override in extra_moqs[tierIdx-1].mat_setup_lm
    if (tierIdx === 0) {
      dispatch({ type: 'SET_MATERIAL_FIELD', payload: { idx: matIdx, field: 'setup_lm', value: coerceBase(value) } });
      return;
    }
    const ei = tierIdx - 1;
    const em = (st.extra_moqs || [])[ei] || {};
    const arr = Array.isArray(em.mat_setup_lm) ? [...em.mat_setup_lm] : [];
    arr[matIdx] = coerceOverride(value);
    dispatch({ type: 'SET_EXTRA_MOQ', payload: { idx: ei, field: 'mat_setup_lm', value: arr } });
  }, [dispatch, st.extra_moqs]);

  const setProcSetupForTier = useCallback((tierIdx, procIdx, value) => {
    if (tierIdx === 0) {
      dispatch({ type: 'SET_PROCESS_FIELD', payload: { idx: procIdx, field: 'setup_h', value: coerceBase(value) } });
      return;
    }
    const ei = tierIdx - 1;
    const em = (st.extra_moqs || [])[ei] || {};
    const arr = Array.isArray(em.proc_setup_h) ? [...em.proc_setup_h] : [];
    arr[procIdx] = coerceOverride(value);
    dispatch({ type: 'SET_EXTRA_MOQ', payload: { idx: ei, field: 'proc_setup_h', value: arr } });
  }, [dispatch, st.extra_moqs]);

  // Build active material/process lists for the Setup Data per MOQ table
  const numMoq = st.num_moq || 1;
  const matsWithCode = useMemo(
    () => (st.materials || []).map((m, i) => ({ m, i })).filter(({ m }) => m.code && !m.hidden),
    [st.materials]
  );
  const procsWithWC = useMemo(
    () => (st.processes || []).map((p, i) => ({ p, i })).filter(({ p }) => p.workcenter && !p.hidden),
    [st.processes]
  );
  const showSetupMoqTable = numMoq > 1 && (matsWithCode.length > 0 || procsWithWC.length > 0);
  const fmtIntLocal = (v) => v == null || v === '' || isNaN(+v) ? '\u2014' : Number(v).toLocaleString('en-US');

  const setActiveMoq = useCallback((idx) => {
    dispatch({ type: 'SET_ACTIVE_MOQ', payload: { idx } });
  }, [dispatch]);

  const generateRfqNumber = useCallback(async () => {
    const quotes = await sharedApi.getQuotes().catch(() => []);
    const num = genRfqNum('S', quotes, stdState, cplxState);
    setStdField('rfq_number', num);
  }, [setStdField, stdState, cplxState]);

  return (
    <div className="sc-section sc-rfq-moq-split">
      <div className="sc-rfq-col">
        <RfqInfoCard
          state={st}
          onChange={handleField}
          onGenerateRfq={generateRfqNumber}
          npiOwners={npiOwners}
          designProcessOpts={designProcessOpts}
          tradeModeOpts={tradeModeOpts}
          datalistId="npi-owners-list"
          // Standard quirk (pre-existing data-shape): End Customer field
          // binds to `project` in stdState. Alias here preserves the
          // legacy field naming without touching saved quotes.
          aliasMap={{ end_cu: 'project' }}
        />
      </div>

      {/* MOQ & Pricing */}
      <div className="sc-moq-col">
      <div className="sc-card sc-moq-card">
        <div className="sc-card-header sc-moq-card-header">
          <span className="sc-card-icon">&#164;</span>
          <span className="sc-card-title">MOQ &amp; Pricing info</span>
          <span className="sc-moq-tier-count">{(st.num_moq || 1)} tier</span>
          <div className="sc-hdr-rate">
            <label>USD Rate</label>
            <DecimalInput
              value={st.usd_rate}
              onChange={v => setStdField('usd_rate', v)}
              className="sc-hdr-rate-inp"
              placeholder="25,000"
              title="VND per 1 USD. Bi-directionally syncs Selling/Target USD ↔ VND. Saved per RFQ."
              thousandSep
            />
          </div>
        </div>
        <div className="sc-card-body sc-moq-body">
          {/* MOQ Pricing table */}
          <div className="sc-moq-table-wrap">
            <table className="sc-moq-table">
              <thead>
                <tr>
                  <th className="sc-moq-th-tier">
                    MOQ <span className="sc-moq-count-pill">{(st.num_moq || 1)}</span>
                  </th>
                  <th className="sc-moq-th-num">MOQ (EA)</th>
                  <th className="sc-moq-th-num">EAU <span className="sc-moq-req">&#9733;</span></th>
                  <th className="sc-moq-th-num sc-moq-th-gold">PRICE $ <span className="sc-moq-req">&#9733;</span></th>
                  <th className="sc-moq-th-num sc-moq-th-gold">PRICE VND</th>
                  <th className="sc-moq-th-num">TARGET $</th>
                  <th className="sc-moq-th-num">TARGET VND</th>
                  <th className="sc-moq-th-act"></th>
                </tr>
              </thead>
              <tbody>
                {/* Primary MOQ */}
                <tr className={`sc-moq-tr ${(st.active_moq_idx || 0) === 0 ? 'active' : ''}`}>
                  <td className="sc-moq-td-tier">
                    <label className="sc-moq-radio">
                      <input
                        type="radio"
                        name="active-moq"
                        checked={(st.active_moq_idx || 0) === 0}
                        onChange={() => setActiveMoq(0)}
                      />
                      <span className="sc-moq-tier-label">MOQ 1</span>
                      <span className="sc-moq-primary-badge">Primary</span>
                    </label>
                  </td>
                  <td><DecimalInput value={st.moq} onChange={v => setStdField('moq', v)} className="sc-moq-inp" thousandSep /></td>
                  <td><DecimalInput value={st.annual_qty} onChange={v => setStdField('annual_qty', v)} className="sc-moq-inp" thousandSep /></td>
                  <td><DecimalInput value={st.selling_price} onChange={v => setPriceUsd('selling_price', 'selling_price_vnd', v)} className="sc-moq-inp sc-moq-inp-gold" /></td>
                  <td><DecimalInput value={st.selling_price_vnd} onChange={v => setPriceVnd('selling_price_vnd', 'selling_price', v)} className="sc-moq-inp sc-moq-inp-gold" thousandSep /></td>
                  <td><DecimalInput value={st.target} onChange={v => setPriceUsd('target', 'target_vnd', v)} className="sc-moq-inp" /></td>
                  <td><DecimalInput value={st.target_vnd} onChange={v => setPriceVnd('target_vnd', 'target', v)} className="sc-moq-inp" thousandSep /></td>
                  <td></td>
                </tr>

                {/* Extra MOQ Tiers */}
                {(st.extra_moqs || []).map((em, idx) => (
                  <tr key={idx} className={`sc-moq-tr ${(st.active_moq_idx || 0) === idx + 1 ? 'active' : ''}`}>
                    <td className="sc-moq-td-tier">
                      <label className="sc-moq-radio">
                        <input
                          type="radio"
                          name="active-moq"
                          checked={(st.active_moq_idx || 0) === idx + 1}
                          onChange={() => setActiveMoq(idx + 1)}
                        />
                        <span className="sc-moq-tier-label">MOQ {idx + 2}</span>
                      </label>
                    </td>
                    <td><DecimalInput value={em.moq} onChange={v => updateExtraMoq(idx, 'moq', v)} className="sc-moq-inp" thousandSep /></td>
                    <td><DecimalInput value={em.eau} onChange={v => updateExtraMoq(idx, 'eau', v)} className="sc-moq-inp" thousandSep /></td>
                    <td><DecimalInput value={em.price} onChange={v => updateExtraMoq(idx, 'price', v)} className="sc-moq-inp sc-moq-inp-gold" /></td>
                    <td><DecimalInput value={em.price_vnd} onChange={v => updateExtraMoq(idx, 'price_vnd', v)} className="sc-moq-inp sc-moq-inp-gold" thousandSep /></td>
                    <td><DecimalInput value={em.target} onChange={v => updateExtraMoq(idx, 'target', v)} className="sc-moq-inp" /></td>
                    <td><DecimalInput value={em.target_vnd} onChange={v => updateExtraMoq(idx, 'target_vnd', v)} className="sc-moq-inp" thousandSep /></td>
                    <td className="sc-moq-td-act">
                      <button className="sc-btn-del-circle" onClick={() => removeMoqTier(idx)} title="Remove MOQ tier">&times;</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="sc-moq-add-btn" onClick={addMoqTier}>
            <span className="sc-moq-add-icon">+</span> Add MOQ Tier
          </button>

          {/* ── Setup Data per MOQ ── */}
          {showSetupMoqTable && (
            <div className="sc-setup-moq-card">
              <div className="sc-setup-moq-hdr">
                <span className="sc-setup-moq-icon">&#8801;</span>
                <span className="sc-setup-moq-title">Setup Data per MOQ</span>
                <span className="sc-setup-moq-legend">
                  <span className="sc-legend-amber"></span> amber = MOQ override
                  &nbsp;&nbsp;
                  <span className="sc-legend-white"></span> white = base (MOQ 1)
                </span>
              </div>
              <div className="sc-setup-moq-wrap">
                <table className="sc-setup-moq-table">
                  <thead>
                    <tr>
                      <th className="sc-smt-th-l">Field</th>
                      <th className="sc-smt-th-l">DB</th>
                      {Array.from({ length: numMoq }, (_, ti) => {
                        const qty = ti === 0 ? (st.moq || 0) : ((st.extra_moqs[ti - 1] || {}).moq || 0);
                        return (
                          <th key={ti} className="sc-smt-th-r">
                            MOQ {ti + 1}
                            <div className="sc-smt-th-sub">{fmtIntLocal(qty)}</div>
                          </th>
                        );
                      })}
                      <th className="sc-smt-th-l">UOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* MOQ row (display only) */}
                    <tr className="sc-smt-row-moq">
                      <td className="sc-smt-td-field"><b>MOQ</b></td>
                      <td className="sc-smt-td-db">MOQ &amp; Pricing info</td>
                      {Array.from({ length: numMoq }, (_, ti) => {
                        const qty = ti === 0 ? (st.moq || 0) : ((st.extra_moqs[ti - 1] || {}).moq || 0);
                        return <td key={ti} className="sc-smt-td-num sc-smt-td-moq">{fmtIntLocal(qty)}</td>;
                      })}
                      <td className="sc-smt-td-uom">Qty</td>
                    </tr>
                    {/* Material rows */}
                    {matsWithCode.map(({ m, i }) => {
                      const lbl = m.desc ? (m.desc.length > 22 ? m.desc.substring(0, 22) + '\u2026' : m.desc) : (m.code || `Mat ${i + 1}`);
                      return (
                        <tr key={`m${i}`}>
                          <td className="sc-smt-td-field" title={`${m.code || ''} - ${m.desc || ''}`}>{lbl}</td>
                          <td className="sc-smt-td-db">Materials</td>
                          {Array.from({ length: numMoq }, (_, ti) => {
                            const isBase = ti === 0;
                            const em = isBase ? null : (st.extra_moqs[ti - 1] || {});
                            const baseVal = m.setup_lm != null ? m.setup_lm : 0;
                            const ovrVal = !isBase && em.mat_setup_lm && em.mat_setup_lm[i] != null ? em.mat_setup_lm[i] : null;
                            const isOvr = ovrVal != null;
                            // Sprint 1.7 — match COST V1.0 behaviour. Base column shows
                            // the base value; override columns show the override OR
                            // EMPTY when no override is set (NOT the base as a fake
                            // placeholder). Empty cells make it obvious which tiers
                            // have explicit per-MOQ data and which inherit. The calc
                            // engine still falls back to base under the hood via
                            // getActiveTierState — display ≠ effective value.
                            const shown = isBase ? baseVal : (isOvr ? ovrVal : null);
                            return (
                              <td key={ti} className="sc-smt-td-ovr-cell">
                                {/* Sprint 1.7c — inner wrapper handles flex; the
                                    <td> stays display:table-cell so the cells
                                    occupy their own columns (MOQ 1/2/3) instead
                                    of stacking vertically inside MOQ 1. */}
                                <div className="sc-smt-td-ovr-wrap">
                                  <DecimalInput value={shown}
                                    className={`sc-smt-inp ${isOvr ? 'sc-smt-inp-ovr' : ''}`}
                                    title={isBase ? 'Base (MOQ 1) value'
                                      : isOvr ? `MOQ ${ti + 1} override — click ⟲ to revert to base`
                                      : `Inherits MOQ 1 base (${baseVal}). Type to override.`}
                                    onChange={v => setMatSetupForTier(ti, i, v)} />
                                  {!isBase && isOvr && (
                                    <button
                                      type="button"
                                      className="sc-smt-revert"
                                      title="Revert to base (MOQ 1) value"
                                      onClick={() => setMatSetupForTier(ti, i, null)}
                                      aria-label={`Revert MOQ ${ti + 1} material ${i + 1} to base`}
                                    >⟲</button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="sc-smt-td-uom sc-smt-td-uom-mat">LM</td>
                        </tr>
                      );
                    })}
                    {/* Process rows */}
                    {procsWithWC.map(({ p, i }) => {
                      const lbl = p.label ? (p.label.length > 22 ? p.label.substring(0, 22) + '\u2026' : p.label) : `Process ${i + 1}`;
                      return (
                        <tr key={`p${i}`}>
                          <td className="sc-smt-td-field">{lbl}</td>
                          <td className="sc-smt-td-db">Processes</td>
                          {Array.from({ length: numMoq }, (_, ti) => {
                            const isBase = ti === 0;
                            const em = isBase ? null : (st.extra_moqs[ti - 1] || {});
                            const baseVal = p.setup_h != null ? p.setup_h : 0;
                            const ovrVal = !isBase && em.proc_setup_h && em.proc_setup_h[i] != null ? em.proc_setup_h[i] : null;
                            const isOvr = ovrVal != null;
                            // Sprint 1.7 — empty when no override (matches COST V1.0).
                            const shown = isBase ? baseVal : (isOvr ? ovrVal : null);
                            return (
                              <td key={ti} className="sc-smt-td-ovr-cell">
                                {/* Sprint 1.7c — same wrapper fix as the material row above. */}
                                <div className="sc-smt-td-ovr-wrap">
                                  <DecimalInput value={shown}
                                    className={`sc-smt-inp ${isOvr ? 'sc-smt-inp-ovr' : ''}`}
                                    title={isBase ? 'Base (MOQ 1) value'
                                      : isOvr ? `MOQ ${ti + 1} override — click ⟲ to revert to base`
                                      : `Inherits MOQ 1 base (${baseVal}). Type to override.`}
                                    onChange={v => setProcSetupForTier(ti, i, v)} />
                                  {!isBase && isOvr && (
                                    <button
                                      type="button"
                                      className="sc-smt-revert"
                                      title="Revert to base (MOQ 1) value"
                                      onClick={() => setProcSetupForTier(ti, i, null)}
                                      aria-label={`Revert MOQ ${ti + 1} process ${i + 1} to base`}
                                    >⟲</button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="sc-smt-td-uom sc-smt-td-uom-proc">Hrs</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
      </div>
    </div>
  );
}
