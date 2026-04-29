/**
 * ProcessFlowChart — BOM + Routing diagram for Complex quotes.
 *
 * Sprint S-PFC-v2: adds vertical assembly arrows, Same-Process
 * brackets, and a library-backed process dropdown for extending the
 * chart (operators pick from real workcenters instead of free-typing).
 *
 * Admin-only edit mode (role ≥ admin) via useAuth().
 *
 * Data model — `cplxState.flow_chart_overrides`:
 *   {
 *     labels:           { [key]: "custom label" },
 *     hidden:           { [key]: true },
 *     extraNodes:       { [groupKey]: [{ key, label, type, workcenter? }] },
 *     groupTitles:      { [groupKey]: "UPPERCASE NAME" },
 *     assembly_links:   [{ from_key, to_key, id }],        // vertical arrows
 *     same_process_groups: [{ id, label, node_keys: [] }], // dashed brackets
 *   }
 */
import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useAuth } from '../../../../context/AuthContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { getProcessOptions, getWCOptionsByType } from '../../../../services/calcEngine';
// PFC-specific styles (.pfc-*, .cc-card shell) live in ComplexCalc.css.
// We side-effect-import it here so the chart works anywhere it's rendered
// — ComplexCalc already pulled this CSS in; re-importing is a no-op.
// Without this, rendering PFC from StandardCalc ships the JSX without
// the styles and the chart collapses to unstyled inline text.
import './ComplexCalc.css';

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

function procKey(spIdx, p, i) {
  return `p_${spIdx}_${i}_${(p.workcenter || p.label || 'proc').replace(/\W/g, '')}`;
}
function matKey(spIdx, m, i) {
  return `m_${spIdx}_${i}_${(m.code || m.desc || 'mat').replace(/\W/g, '')}`;
}
function mkId() {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Build one group (row) from any shape that has `materials[]` +
// `processes[]`. Used for both Complex sub-products AND the whole
// Standard quote (treated as a single group).
//
// kind semantics:
//   'cplx' — Main.Mat items render as leading [mp] boxes before the
//            first process; other materials render as an attached
//            vertical list next to the first process.
//   'std'  — ALL materials (Main.Mat + other) render as a single
//            attached list next to the first process. This matches
//            the Complex visual the operator is used to. Falls back
//            to the legacy leading-boxes layout only when there is
//            no process to attach to.
function deriveGroup(src, spIdx, fallbackTitle, kind = 'cplx') {
  const visibleMats = (src.materials || []).filter(m => m && !m.hidden);
  const mainMats = visibleMats
    .filter(m => m.row_type === 'Main.Mat')
    .map((m, i) => ({
      key: matKey(spIdx, m, i),
      label: m.desc || m.code || `Material ${i + 1}`,
      code: m.code || '',
      type: 'mp',
    }));
  const otherMats = visibleMats
    .filter(m => m.row_type !== 'Main.Mat')
    .map((m, i) => ({
      key: `x_${spIdx}_${i}_${(m.code || 'x').replace(/\W/g, '')}`,
      label: m.desc || m.code || `Extra ${i + 1}`,
      code: m.code || '',
      type: 'o',
    }));
  const procs = (src.processes || [])
    .filter(p => p && !p.hidden && p.workcenter)
    .map((p, i) => ({
      key: procKey(spIdx, p, i),
      label: p.workcenter,
      workcenter: p.workcenter,
      process_type: p.process_type,
      extras: [],
    }));

  let mats, firstProcExtras;
  if (kind === 'std' && procs.length > 0) {
    mats = [];
    firstProcExtras = [...mainMats, ...otherMats];
  } else {
    mats = mainMats;
    firstProcExtras = otherMats;
  }
  if (procs.length > 0) procs[0].extras = firstProcExtras;

  return {
    groupKey: `g_${spIdx}`,
    spIdx,
    title: src.label || src.code || fallbackTitle,
    mats,
    procs,
  };
}

function deriveGroups(state, kind) {
  if (kind === 'std') {
    // Standard quote = single-row flow. Title from CCL PN or project.
    const title = state?.ccl_pn || state?.project_name || state?.rfq_number || 'Product';
    const g = deriveGroup(state || {}, 0, title, 'std');
    // Override title to prefer ccl_pn when available (single-product UX)
    g.title = title;
    const hasExtras = (g.procs[0]?.extras?.length || 0) > 0;
    return (g.mats.length || g.procs.length || hasExtras) ? [g] : [];
  }
  // Complex: one group per sub-product
  const sps = Array.isArray(state?.subproducts) ? state.subproducts : [];
  return sps.map((sp, spIdx) =>
    deriveGroup(sp, spIdx, `SP ${String.fromCharCode(65 + spIdx)}`, 'cplx'),
  );
}

function mergeOverrides(groups, ov) {
  const labels = ov?.labels || {};
  const hidden = ov?.hidden || {};
  const extraNodes = ov?.extraNodes || {};
  const groupTitles = ov?.groupTitles || {};
  // Per-quote view toggle. When true, the leading Material nodes are
  // collapsed out of the chart entirely (the existing Arrow guard on
  // `mats.length > 0 && procs.length > 0` then drops the leading arrow
  // automatically). Persisted so the view follows the quote.
  const hideMaterials = !!ov?.hide_materials;

  return groups.map(g => {
    const filterHidden = (list) => list.filter(n => !hidden[n.key]);
    const applyLabel = (n) => labels[n.key] ? { ...n, label: labels[n.key] } : n;
    return {
      ...g,
      title: groupTitles[g.groupKey] || g.title,
      mats: hideMaterials ? [] : filterHidden(g.mats).map(applyLabel),
      procs: filterHidden(g.procs).map(p => ({
        ...applyLabel(p),
        // Extras = the vertical material list attached to the first
        // proc. Hide them alongside mats when the toggle is off so the
        // full "NVL list" disappears, not just the leading boxes.
        extras: hideMaterials ? [] : filterHidden(p.extras || []).map(applyLabel),
      })),
      _adminExtras: (extraNodes[g.groupKey] || []).filter(n => !hidden[n.key]).map(applyLabel),
    };
  });
}

// Walk a merged group and yield every visible node that can be an
// arrow endpoint or group member. Returns a flat array of
// { key, label, groupKey }.
function flattenNodes(groups) {
  const out = [];
  for (const g of groups) {
    for (const m of g.mats) out.push({ key: m.key, label: m.label, groupKey: g.groupKey });
    for (const p of g.procs) out.push({ key: p.key, label: p.label, groupKey: g.groupKey });
    for (const n of (g._adminExtras || [])) out.push({ key: n.key, label: n.label, groupKey: g.groupKey });
  }
  return out;
}

/**
 * @param {object} props
 * @param {'std' | 'cplx'} props.kind — which calc state to read from.
 *   Defaults to 'cplx' for backward-compat with existing usage.
 */
export default function ProcessFlowChart({ kind = 'cplx' } = {}) {
  const { stdState, cplxState, setStdField, setCplxField } = useCalc();
  const state = kind === 'std' ? stdState : cplxState;
  const setField = kind === 'std' ? setStdField : setCplxField;
  const auth = useAuth();
  const { lib } = useCostLib();
  const role = auth?.user?.role || 'user';
  const isAdmin = (ROLE_LEVELS[role] || 0) >= ROLE_LEVELS.admin;

  const overrides = state?.flow_chart_overrides || {};
  const autoGroups = useMemo(() => deriveGroups(state, kind), [state, kind]);
  const groups = useMemo(() => mergeOverrides(autoGroups, overrides), [autoGroups, overrides]);
  const flatNodes = useMemo(() => flattenNodes(groups), [groups]);

  const [editMode, setEditMode] = useState(false);
  const [linkMode, setLinkMode] = useState(null);   // null | { stage: 'pick-from' | 'pick-to', from_key? }
  const [groupMode, setGroupMode] = useState(null); // null | { selected: Set<key> }

  // ── Override writers ──
  // Kind-aware: writes land in stdState or cplxState depending on which
  // calculator rendered us. Previously these hardcoded cplxState, so
  // Standard-side edits silently no-op'd (and worse, overwrote complex
  // flow-chart state when both were open in the same session).
  const updateOverrides = useCallback((patch) => {
    const cur = state?.flow_chart_overrides || {};
    setField('flow_chart_overrides', { ...cur, ...patch });
  }, [state, setField]);

  const setLabel = useCallback((key, label) => {
    const cur = overrides.labels || {};
    updateOverrides({ labels: { ...cur, [key]: label } });
  }, [overrides, updateOverrides]);

  const setGroupTitle = useCallback((groupKey, title) => {
    const cur = overrides.groupTitles || {};
    updateOverrides({ groupTitles: { ...cur, [groupKey]: title } });
  }, [overrides, updateOverrides]);

  const toggleHidden = useCallback((key) => {
    const cur = overrides.hidden || {};
    const next = { ...cur };
    if (next[key]) delete next[key]; else next[key] = true;
    updateOverrides({ hidden: next });
  }, [overrides, updateOverrides]);

  // View-only toggle (available to all roles — it's a visibility
  // preference, not a structural edit). Persists to the quote so a
  // re-opened quote remembers the user's last view.
  const hideMaterials = !!overrides.hide_materials;
  const toggleHideMaterials = useCallback(() => {
    updateOverrides({ hide_materials: !hideMaterials });
  }, [hideMaterials, updateOverrides]);

  const addExtraNode = useCallback((groupKey, spec) => {
    const cur = overrides.extraNodes || {};
    const existing = cur[groupKey] || [];
    const key = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const node = { key, ...spec };
    updateOverrides({
      extraNodes: { ...cur, [groupKey]: [...existing, node] },
    });
  }, [overrides, updateOverrides]);

  const addAssemblyLink = useCallback((from_key, to_key) => {
    if (!from_key || !to_key || from_key === to_key) return;
    const cur = overrides.assembly_links || [];
    // De-dup: skip if link already exists
    if (cur.some(l => l.from_key === from_key && l.to_key === to_key)) return;
    updateOverrides({
      assembly_links: [...cur, { id: mkId(), from_key, to_key }],
    });
  }, [overrides, updateOverrides]);

  const removeAssemblyLink = useCallback((id) => {
    const cur = overrides.assembly_links || [];
    updateOverrides({ assembly_links: cur.filter(l => l.id !== id) });
  }, [overrides, updateOverrides]);

  const addSameProcessGroup = useCallback((node_keys, label) => {
    if (!node_keys || node_keys.length < 2) return;
    const cur = overrides.same_process_groups || [];
    updateOverrides({
      same_process_groups: [
        ...cur,
        { id: mkId(), label: label || 'Same Process', node_keys: Array.from(node_keys) },
      ],
    });
  }, [overrides, updateOverrides]);

  const removeSameProcessGroup = useCallback((id) => {
    const cur = overrides.same_process_groups || [];
    updateOverrides({ same_process_groups: cur.filter(g => g.id !== id) });
  }, [overrides, updateOverrides]);

  const resetAllOverrides = useCallback(() => {
    if (!window.confirm('Reset tất cả chỉnh sửa chart về auto-generated?')) return;
    setField('flow_chart_overrides', {});
    setEditMode(false); setLinkMode(null); setGroupMode(null);
  }, [setField]);

  // ── Node click handler when in link-mode or group-mode ──
  const handleNodeClick = useCallback((key) => {
    if (linkMode) {
      if (!linkMode.from_key) {
        setLinkMode({ stage: 'pick-to', from_key: key });
      } else {
        addAssemblyLink(linkMode.from_key, key);
        setLinkMode(null);
      }
    } else if (groupMode) {
      const next = new Set(groupMode.selected);
      if (next.has(key)) next.delete(key); else next.add(key);
      setGroupMode({ selected: next });
    }
  }, [linkMode, groupMode, addAssemblyLink]);

  // ── Geometry tracking for arrows + brackets ──
  // Each node registers its DOM ref under its key. We snapshot each
  // node's bounding rect relative to the chart container on every
  // render + window resize so SVG overlay can draw lines.
  const chartRef = useRef(null);
  const nodeRefs = useRef({}); // { [key]: HTMLElement }
  const [positions, setPositions] = useState({});  // { [key]: { top, left, right, bottom, cx, cy, w, h } }

  const registerNodeRef = useCallback((key, el) => {
    if (el) nodeRefs.current[key] = el;
    else delete nodeRefs.current[key];
  }, []);

  const measurePositions = useCallback(() => {
    const c = chartRef.current;
    if (!c) return;
    const cRect = c.getBoundingClientRect();
    const next = {};
    for (const [key, el] of Object.entries(nodeRefs.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next[key] = {
        top: r.top - cRect.top,
        left: r.left - cRect.left,
        right: r.right - cRect.left,
        bottom: r.bottom - cRect.top,
        cx: r.left - cRect.left + r.width / 2,
        cy: r.top - cRect.top + r.height / 2,
        w: r.width,
        h: r.height,
      };
    }
    setPositions(next);
  }, []);

  useLayoutEffect(() => {
    // Canonical "measure DOM after paint, store positions" pattern.
    // The setState inside `measurePositions` is precisely why this lives
    // in useLayoutEffect (not useEffect) — we want the second render to
    // happen synchronously before paint so SVG connectors don't flash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measurePositions();
    const ro = new ResizeObserver(measurePositions);
    if (chartRef.current) ro.observe(chartRef.current);
    window.addEventListener('resize', measurePositions);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measurePositions);
    };
  }, [measurePositions, groups]);

  if (!groups.length) {
    return (
      <div className="cc-card" style={{ marginTop: 14 }}>
        <div className="cc-card-hdr">🔀 Process Flow Chart · Sơ đồ quy trình</div>
        <div className="cc-card-body">
          <div style={{ padding: 24, color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
            Chưa có sub-product. Thêm sub-product ở tab Calculators để tự động tạo flow chart.
          </div>
        </div>
      </div>
    );
  }

  const assemblyLinks = overrides.assembly_links || [];
  const sameProcessGroups = overrides.same_process_groups || [];

  return (
    <div className="cc-card pfc-card" style={{ marginTop: 14 }}>
      <div className="cc-card-hdr pfc-hdr">
        <span>🔀 Process Flow Chart · Sơ đồ quy trình sản xuất</span>
        <span className="pfc-legend">
          <span className="pfc-legend-item pfc-mp" title="Material — Vật liệu chính">[mp] Material · Vật liệu</span>
          <span className="pfc-legend-item pfc-p" title="Process — Công đoạn">[p] Process · Công đoạn</span>
          <span className="pfc-legend-item pfc-o" title="Other material — Vật liệu phụ">[o] Other · VL phụ</span>
          <span className="pfc-legend-item pfc-h" title="Half-finished — Bán thành phẩm">[h] Half-finished · Bán TP</span>
        </span>
        {isAdmin && (
          <span className="pfc-admin-bar">
            <button
              className={`pfc-edit-btn ${editMode ? 'active' : ''}`}
              onClick={() => { setEditMode(m => !m); setLinkMode(null); setGroupMode(null); }}>
              {editMode ? '✓ Done editing' : '✏ Edit chart'}
            </button>
            {editMode && Object.keys(overrides).length > 0 && (
              <button className="pfc-reset-btn" onClick={resetAllOverrides} title="Xoá tất cả chỉnh sửa, quay về auto-generated">
                ↺ Reset
              </button>
            )}
          </span>
        )}
      </div>

      {editMode && (
        <EditToolbar
          linkMode={linkMode} setLinkMode={setLinkMode}
          groupMode={groupMode} setGroupMode={setGroupMode}
          onCommitGroup={(label) => {
            if (groupMode && groupMode.selected.size >= 2) {
              addSameProcessGroup(groupMode.selected, label);
              setGroupMode(null);
            }
          }}
          assemblyLinks={assemblyLinks}
          sameProcessGroups={sameProcessGroups}
          onRemoveLink={removeAssemblyLink}
          onRemoveGroup={removeSameProcessGroup}
          flatNodes={flatNodes}
        />
      )}

      <div className="cc-card-body pfc-body">
        <div className="pfc-chart" ref={chartRef}>
          {groups.map(g => (
            <FlowRow
              key={g.groupKey}
              group={g}
              editMode={editMode && isAdmin}
              linkMode={linkMode}
              groupMode={groupMode}
              lib={lib}
              hideMaterials={hideMaterials}
              onToggleHideMaterials={toggleHideMaterials}
              onSetLabel={setLabel}
              onSetGroupTitle={setGroupTitle}
              onToggleHidden={toggleHidden}
              onAddNode={addExtraNode}
              onNodeClick={handleNodeClick}
              registerNodeRef={registerNodeRef}
            />
          ))}

          {/* ── SVG overlay for vertical assembly arrows ────────── */}
          {assemblyLinks.length > 0 && (
            <svg className="pfc-svg-overlay" aria-hidden>
              <defs>
                <marker id="pfc-arrowhead" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
                </marker>
              </defs>
              {assemblyLinks.map(l => {
                const a = positions[l.from_key];
                const b = positions[l.to_key];
                if (!a || !b) return null;
                // Start: bottom-center of source; End: top-center of
                // target. Path: vertical drop, horizontal run, vertical
                // approach (3-segment staircase). Works for rows above
                // or below and columns left/right.
                const x1 = a.cx;
                const y1 = a.bottom;
                const x2 = b.cx;
                const y2 = b.top;
                const midY = y1 < y2 ? y1 + (y2 - y1) / 2 : y2 + (y1 - y2) / 2;
                const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
                return (
                  <g key={l.id}>
                    <path d={d} stroke="#475569" strokeWidth="1.5" fill="none" markerEnd="url(#pfc-arrowhead)" />
                  </g>
                );
              })}
            </svg>
          )}

          {/* ── Same-Process brackets (dashed) ────────────────── */}
          {sameProcessGroups.map(sg => {
            const keys = sg.node_keys || [];
            const rects = keys.map(k => positions[k]).filter(Boolean);
            if (rects.length < 2) return null;
            const pad = 8;
            const top = Math.min(...rects.map(r => r.top)) - pad;
            const left = Math.min(...rects.map(r => r.left)) - pad;
            const right = Math.max(...rects.map(r => r.right)) + pad;
            const bottom = Math.max(...rects.map(r => r.bottom)) + pad;
            return (
              <div key={sg.id} className="pfc-same-bracket"
                style={{
                  top: top + 'px', left: left + 'px',
                  width: (right - left) + 'px', height: (bottom - top) + 'px',
                }}>
                <span className="pfc-same-label">{sg.label || 'Same Process'}</span>
              </div>
            );
          })}
        </div>

        {!isAdmin && Object.keys(overrides).length === 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
            ℹ Chart này tự động tạo từ dữ liệu tab Processes + Materials của từng sub-product. Admin có thể chỉnh sửa nội dung.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit toolbar ──────────────────────────────────────────────
function EditToolbar({
  linkMode, setLinkMode, groupMode, setGroupMode, onCommitGroup,
  assemblyLinks, sameProcessGroups, onRemoveLink, onRemoveGroup, flatNodes,
}) {
  const [groupLabel, setGroupLabel] = useState('Same Process');
  const labelFor = (key) => {
    const n = flatNodes.find(x => x.key === key);
    return n ? n.label : key;
  };
  return (
    <div className="pfc-edit-toolbar">
      <div className="pfc-edit-actions">
        <button
          className={`pfc-edit-mode-btn ${linkMode ? 'active' : ''}`}
          onClick={() => {
            setGroupMode(null);
            setLinkMode(linkMode ? null : { from_key: null });
          }}>
          🔗 {linkMode
            ? (linkMode.from_key ? `Click target node... (source: ${labelFor(linkMode.from_key)})` : 'Click source node...')
            : 'Add vertical arrow'}
        </button>
        <button
          className={`pfc-edit-mode-btn ${groupMode ? 'active' : ''}`}
          onClick={() => {
            setLinkMode(null);
            setGroupMode(groupMode ? null : { selected: new Set() });
          }}>
          📦 {groupMode ? `Group mode — ${groupMode.selected.size} nodes selected` : 'Add Same-Process bracket'}
        </button>
        {groupMode && groupMode.selected.size >= 2 && (
          <>
            <input className="pfc-group-label-input"
              value={groupLabel}
              onChange={e => setGroupLabel(e.target.value)}
              placeholder="Label (default: Same Process)" />
            <button className="pfc-commit-btn" onClick={() => onCommitGroup(groupLabel)}>
              ✓ Create group
            </button>
          </>
        )}
      </div>

      {(assemblyLinks.length > 0 || sameProcessGroups.length > 0) && (
        <div className="pfc-edit-lists">
          {assemblyLinks.length > 0 && (
            <div className="pfc-edit-list">
              <b>Vertical arrows:</b>
              {assemblyLinks.map(l => (
                <span key={l.id} className="pfc-edit-item">
                  {labelFor(l.from_key)} → {labelFor(l.to_key)}
                  <button className="pfc-del-mini" onClick={() => onRemoveLink(l.id)}>×</button>
                </span>
              ))}
            </div>
          )}
          {sameProcessGroups.length > 0 && (
            <div className="pfc-edit-list">
              <b>Groups:</b>
              {sameProcessGroups.map(g => (
                <span key={g.id} className="pfc-edit-item">
                  {g.label} ({g.node_keys.length} nodes)
                  <button className="pfc-del-mini" onClick={() => onRemoveGroup(g.id)}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FlowRow({
  group, editMode, linkMode, groupMode, lib,
  hideMaterials, onToggleHideMaterials,
  onSetLabel, onSetGroupTitle, onToggleHidden, onAddNode,
  onNodeClick, registerNodeRef,
}) {
  return (
    <div className="pfc-row">
      <div className="pfc-group-title">
        <EditableText
          value={group.title}
          editable={editMode}
          onCommit={(v) => onSetGroupTitle(group.groupKey, v)}
        />
      </div>
      <div className="pfc-row-flow">
        {group.mats.map(m => (
          <FlowNode key={m.key} nodeKey={m.key} type="mp"
            label={m.label} code="mp"
            editMode={editMode}
            linkMode={linkMode}
            groupMode={groupMode}
            onSetLabel={(v) => onSetLabel(m.key, v)}
            onDelete={() => onToggleHidden(m.key)}
            onClick={() => onNodeClick(m.key)}
            registerRef={registerNodeRef} />
        ))}
        {group.mats.length > 0 && group.procs.length > 0 && <Arrow />}
        {group.procs.map((p, idx) => (
          <div key={p.key} className="pfc-proc-cluster">
            {/* First proc gets its node + the Material-visibility
                checkbox stacked vertically. All other procs render
                the node alone (no wrapper) so the existing flex-row
                layout is untouched. */}
            {idx === 0 ? (
              <div className="pfc-node-stack">
                <FlowNode nodeKey={p.key} type="p"
                  label={p.label} code="p"
                  editMode={editMode}
                  linkMode={linkMode}
                  groupMode={groupMode}
                  onSetLabel={(v) => onSetLabel(p.key, v)}
                  onDelete={() => onToggleHidden(p.key)}
                  onClick={() => onNodeClick(p.key)}
                  registerRef={registerNodeRef} />
                <label className="pfc-mat-toggle" title="Ẩn/hiện danh sách Material ở đầu flow">
                  <input type="checkbox"
                    checked={!hideMaterials}
                    onChange={onToggleHideMaterials} />
                  <span>Hiện Material list</span>
                </label>
              </div>
            ) : (
              <FlowNode nodeKey={p.key} type="p"
                label={p.label} code="p"
                editMode={editMode}
                linkMode={linkMode}
                groupMode={groupMode}
                onSetLabel={(v) => onSetLabel(p.key, v)}
                onDelete={() => onToggleHidden(p.key)}
                onClick={() => onNodeClick(p.key)}
                registerRef={registerNodeRef} />
            )}
            {p.extras && p.extras.length > 0 && (
              <div className="pfc-extras">
                {p.extras.map(x => {
                  const typeCode = x.type || 'o';
                  return (
                    <div key={x.key} className={`pfc-extra-line pfc-extra-${typeCode}`}>
                      <EditableText
                        value={x.label.startsWith('+') ? x.label : `+${x.label} [${typeCode}]`}
                        editable={editMode}
                        onCommit={(v) => onSetLabel(x.key, v)}
                      />
                      {editMode && (
                        <button className="pfc-del-mini" onClick={() => onToggleHidden(x.key)}>×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {idx < group.procs.length - 1 && <Arrow />}
          </div>
        ))}
        {group._adminExtras && group._adminExtras.length > 0 && (
          <>
            {(group.mats.length > 0 || group.procs.length > 0) && <Arrow />}
            {group._adminExtras.map(n => (
              <FlowNode key={n.key} nodeKey={n.key} type={n.type || 'p'}
                label={n.label} code={n.type || 'p'}
                editMode={editMode}
                linkMode={linkMode}
                groupMode={groupMode}
                onSetLabel={(v) => onSetLabel(n.key, v)}
                onDelete={() => onToggleHidden(n.key)}
                onClick={() => onNodeClick(n.key)}
                registerRef={registerNodeRef} />
            ))}
          </>
        )}
        {editMode && (
          <AddProcessDropdown
            lib={lib}
            onAdd={(spec) => onAddNode(group.groupKey, spec)}
          />
        )}
      </div>
    </div>
  );
}

// Process dropdown — library-backed. Two-step: pick Process Type →
// pick Workcenter from the rate table. User can also pick [mp], [o],
// [h] as simple typed nodes (no workcenter resolution).
function AddProcessDropdown({ lib, onAdd }) {
  const [open, setOpen] = useState(false);
  const [processType, setProcessType] = useState('');
  const processTypes = useMemo(() => getProcessOptions(), []);
  const workcenters = useMemo(() => {
    if (!lib || !processType) return [];
    try { return getWCOptionsByType(lib, processType); } catch { return []; }
  }, [lib, processType]);

  const addNonProcess = (type) => {
    const label = type === 'mp' ? 'New Material' : type === 'o' ? '+new extra' : 'Half-finished';
    onAdd({ label, type });
    setOpen(false); setProcessType('');
  };
  const addProcess = (wc) => {
    onAdd({ label: wc, type: 'p', process_type: processType, workcenter: wc });
    setOpen(false); setProcessType('');
  };

  return (
    <span className="pfc-add-bar">
      <button className="pfc-add-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '× Close' : '+ Add node'}
      </button>
      {open && (
        <span className="pfc-add-panel">
          {!processType && (
            <>
              <span className="pfc-add-label">Process type:</span>
              <select value="" onChange={e => setProcessType(e.target.value)} className="pfc-add-select">
                <option value="">(pick process type)</option>
                {processTypes.map(pt => <option key={pt} value={pt}>{pt}</option>)}
              </select>
              <span className="pfc-add-or">or</span>
              <button className="pfc-add-btn pfc-add-mp" onClick={() => addNonProcess('mp')}>+mp</button>
              <button className="pfc-add-btn pfc-add-o"  onClick={() => addNonProcess('o')}>+o</button>
              <button className="pfc-add-btn pfc-add-h"  onClick={() => addNonProcess('h')}>+h</button>
            </>
          )}
          {processType && (
            <>
              <span className="pfc-add-label">{processType} workcenter:</span>
              <select value="" onChange={e => e.target.value && addProcess(e.target.value)} className="pfc-add-select">
                <option value="">(pick workcenter)</option>
                {workcenters.map(wc => <option key={wc} value={wc}>{wc}</option>)}
              </select>
              <button className="pfc-add-btn-back" onClick={() => setProcessType('')}>← back</button>
            </>
          )}
        </span>
      )}
    </span>
  );
}

function FlowNode({
  nodeKey, type, label, code, editMode,
  linkMode, groupMode,
  onSetLabel, onDelete, onClick, registerRef,
}) {
  const ref = useRef(null);
  useEffect(() => {
    registerRef(nodeKey, ref.current);
    return () => registerRef(nodeKey, null);
  }, [nodeKey, registerRef]);

  const interactive = !!(linkMode || groupMode);
  const highlighted = groupMode?.selected?.has?.(nodeKey)
    || (linkMode?.from_key === nodeKey);

  const handleNodeClick = (e) => {
    if (interactive) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={ref}
      className={`pfc-node pfc-node-${type} ${interactive ? 'pfc-node-clickable' : ''} ${highlighted ? 'pfc-node-selected' : ''}`}
      onClick={handleNodeClick}>
      <div className="pfc-node-label">
        <EditableText value={label} editable={editMode && !interactive} onCommit={onSetLabel} />
        <span className="pfc-node-code">[{code}]</span>
      </div>
      {editMode && !interactive && (
        <button className="pfc-del-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Ẩn node này">×</button>
      )}
    </div>
  );
}

function Arrow() {
  return <span className="pfc-arrow" aria-hidden>→</span>;
}

function EditableText({ value, editable, onCommit }) {
  const ref = useRef(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (ref.current && !isEditing) {
      ref.current.textContent = value;
    }
  }, [value, isEditing]);

  if (!editable) return <span className="pfc-text">{value}</span>;

  const handleBlur = () => {
    setIsEditing(false);
    const next = ref.current?.textContent?.trim() || '';
    if (next && next !== value) onCommit(next);
    else if (ref.current) ref.current.textContent = value;
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ref.current?.blur(); }
    if (e.key === 'Escape') {
      if (ref.current) ref.current.textContent = value;
      setIsEditing(false);
      ref.current?.blur();
    }
  };

  return (
    <span
      ref={ref}
      className="pfc-text pfc-text-edit"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onFocus={() => setIsEditing(true)}
      onBlur={handleBlur}
      onKeyDown={handleKey}
    />
  );
}
