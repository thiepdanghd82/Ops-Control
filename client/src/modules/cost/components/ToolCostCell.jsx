/**
 * ToolCostCell — the Processes-table TOOL COST cell with a pick-once "Sync
 * from Layout" affordance (Sprint S-LAYOUT-TOOLCOST). Shared by Std
 * (CalcProcesses) and Cpx (SubProductRow) so the two surfaces behave
 * identically.
 *
 * States:
 *   • Unassigned (tool_cost_src ''):
 *       editable manual tool_cost input  +  "⇄ Sync from Layout" button.
 *       The button opens a dropdown of Layout sources NOT already taken by
 *       another row (this row's own pick is always listed). Picking one assigns
 *       it. First time the picker opens in a session an info modal explains the
 *       one-source-per-process rule.
 *   • Assigned + present: read-only violet cost + source label + unassign ✕.
 *   • Assigned but source GONE (cutter cleared / plate 0): inline warning +
 *     unassign ✕; effective tool cost is 0 (calcEngine matches).
 *
 * All styling is class-based (Lesson 6). Pure availability + suggestion logic
 * lives in services/layoutToolCost.js (unit-tested).
 */
import { useEffect, useRef, useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import DecimalInput from '../../../utils/DecimalInput';
import { availableToolCostSources, suggestedSrcForProcess } from '../../../services/layoutToolCost';

// Session-scoped: the info modal shows only the FIRST time any picker opens.
let INFO_SHOWN = false;

const fmtCost = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—');

export default function ToolCostCell({
  proc,
  idx,
  processes,
  sources,
  layoutToolCosts,
  onAssign,
  onUnassign,
  onManualChange,
  inputClassName = 'sc-input-sm sc-input-num',
  placeholder = '—',
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close the picker on click-outside / Escape.
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setPickerOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  const src = proc.tool_cost_src || '';
  const assigned = !!src;
  const assignedCost = assigned && layoutToolCosts ? layoutToolCosts[src] : undefined;
  const present = assigned && assignedCost != null;
  const srcMeta = assigned ? (sources || []).find((s) => s.id === src) : null;

  const openSync = () => {
    if (!INFO_SHOWN) {
      INFO_SHOWN = true;
      setInfoOpen(true);
      return;
    }
    setPickerOpen(true);
  };

  const closeInfo = () => {
    setInfoOpen(false);
    setPickerOpen(true); // continue into the picker after acknowledging
  };

  const pick = (id) => {
    setPickerOpen(false);
    onAssign(id);
  };

  // ── Assigned + present → read-only violet cost + label + unassign ──
  if (assigned && present) {
    return (
      <div className="sc-toolsrc-assigned" title={srcMeta ? srcMeta.label : src}>
        <span className="sc-toolsrc-cost">${fmtCost(assignedCost)}</span>
        <span className="sc-toolsrc-label">{srcMeta ? srcMeta.label : src}</span>
        <button
          type="button"
          className="sc-toolsrc-x"
          onClick={onUnassign}
          title="Bỏ gán — trả nguồn Layout về danh sách + về nhập tay"
        >
          &times;
        </button>
      </div>
    );
  }

  // ── Assigned but source disappeared → warning + unassign (effective 0) ──
  if (assigned && !present) {
    return (
      <div
        className="sc-toolsrc-missing"
        title="Nguồn Layout đã biến mất — tool cost = 0 cho đến khi gán lại hoặc bỏ gán"
      >
        <span className="sc-toolsrc-warn">⚠ nguồn Layout mất</span>
        <button
          type="button"
          className="sc-toolsrc-x"
          onClick={onUnassign}
          title="Bỏ gán — về nhập tay"
        >
          &times;
        </button>
      </div>
    );
  }

  // ── Unassigned → manual input + ⇄ Sync button (+ picker dropdown) ──
  const available = availableToolCostSources(sources, processes, idx);
  const suggestedId = suggestedSrcForProcess(proc);

  return (
    <div className="sc-toolsrc-wrap" ref={wrapRef}>
      <div className="sc-toolsrc-manual">
        <DecimalInput
          value={proc.tool_cost}
          onChange={onManualChange}
          placeholder={placeholder}
          className={inputClassName}
        />
        <button
          type="button"
          className="sc-toolsrc-sync"
          onClick={openSync}
          title="Gán chi phí từ Layout (Plate / Cutter) vào Tool Cost"
        >
          ⇄
        </button>
      </div>

      {pickerOpen && (
        <div className="sc-toolsrc-menu" role="listbox">
          {available.length === 0 ? (
            <div className="sc-toolsrc-empty">Không có nguồn Layout khả dụng</div>
          ) : (
            available.map((s) => (
              <button
                type="button"
                key={s.id}
                role="option"
                aria-selected={s.id === suggestedId}
                className={`sc-toolsrc-opt${s.id === suggestedId ? ' sc-toolsrc-opt-suggested' : ''}`}
                onClick={() => pick(s.id)}
                title={s.id === suggestedId ? 'Gợi ý cho process này' : undefined}
              >
                <span className="sc-toolsrc-opt-label">{s.label}</span>
                <span className="sc-toolsrc-opt-cost">${fmtCost(s.cost)}</span>
              </button>
            ))
          )}
        </div>
      )}

      {infoOpen && (
        <Modal open onClose={closeInfo} size="sm" severity="info">
          <Modal.Header title="Gán chi phí Layout vào Tool Cost" />
          <Modal.Body>
            Mỗi nguồn Layout (Plate / Cutter) chỉ gán cho <b>MỘT</b> process; nguồn đã gán sẽ không
            hiện lại ở dòng khác. Bỏ gán để trả nguồn về danh sách.
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="op-btn op-btn-primary" onClick={closeInfo}>
              Đóng
            </button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}
