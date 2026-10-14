/**
 * BomTreeView — visual + editable Bill of Materials tree for the Complex
 * product. Consumes v2 shape fields (see cplxMigration.js):
 *   - state.subproducts[i].is_assembly — marks the parent SP
 *   - state.bom[{ sp_index, qty, notes }] — component → assembly edges
 *
 * Sprint 4.1: tab wired, read-only tree render.
 * Sprint 4.2: editable is_assembly toggle + BOM qty input.
 *   - Assembly toggle is exclusive (reducer SET_SP_ASSEMBLY clears others).
 *   - Qty edits go through SET_BOM_ENTRY_FIELD. If a child is shown via the
 *     fallback (no explicit BOM entry), editing qty auto-materializes a
 *     BOM entry via ADD_BOM_ENTRY so the value persists.
 * Sprint 4.3 (this): explicit add/remove of BOM entries.
 *   - Remove button per child row (REMOVE_BOM_ENTRY).
 *   - Orphan SP section: non-assembly SPs not present in bom[] surface
 *     here once bom[] has been materialized; each row offers Add-to-BOM.
 *   - REMOVE_SUBPRODUCT reducer now shifts/drops stale sp_index refs in
 *     both bom and tooling_alloc — tested in bomReducer.test.js.
 * Cost aggregation still ignores BOM qty (Sprint 4.4, feature-flagged).
 */
import { useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { findAssemblyIndex } from '../../../../services/cplxMigration';
import EmptyState from '../../../../components/Shared/EmptyState';
import { useBomQtyFlag } from '../../../../utils/useBomQtyFlag';

export default function BomTreeView() {
  const { cplxState, dispatch } = useCalc();
  const [bomQtyEnabled, toggleBomQty] = useBomQtyFlag();

  const { assembly, assemblyIdx, children, orphans } = useMemo(() => {
    const asmIdx = findAssemblyIndex(cplxState);
    const sps = cplxState?.subproducts || [];
    const bom = cplxState?.bom || [];
    // Build child list from BOM entries when present; otherwise fall
    // back to every non-assembly SP with implicit qty=1 (matches the
    // legacy FG/sum aggregation behavior). Track bomIdx so edits know
    // whether to update-in-place or materialize a new entry.
    let childEntries;
    let orphanList = [];
    if (bom.length > 0) {
      const bomSpSet = new Set(
        bom.map((e) => e && e.sp_index).filter((i) => typeof i === 'number')
      );
      childEntries = bom
        .map((e, bomIdx) => ({ e, bomIdx }))
        .filter(({ e }) => e && typeof e.sp_index === 'number' && sps[e.sp_index])
        .map(({ e, bomIdx }) => ({
          sp: sps[e.sp_index],
          spIdx: e.sp_index,
          qty: e.qty ?? 1,
          notes: e.notes || '',
          bomIdx,
        }));
      orphanList = sps
        .map((sp, i) => ({ sp, i }))
        .filter(({ sp, i }) => sp && i !== asmIdx && !sp.is_assembly && !bomSpSet.has(i));
    } else {
      childEntries = sps
        .map((sp, i) => ({ sp, i }))
        .filter(({ sp, i }) => sp && i !== asmIdx && !sp.is_assembly)
        .map(({ sp, i }) => ({ sp, spIdx: i, qty: 1, notes: '', bomIdx: -1 }));
    }
    return {
      assembly: asmIdx >= 0 ? sps[asmIdx] : null,
      assemblyIdx: asmIdx,
      children: childEntries,
      orphans: orphanList,
    };
  }, [cplxState]);

  const sps = cplxState?.subproducts || [];

  const setAssembly = (spIdx, value) => {
    dispatch({ type: 'SET_SP_ASSEMBLY', payload: { spIdx, value } });
  };

  const setQty = (spIdx, bomIdx, qty) => {
    const q = Number.isFinite(+qty) && +qty >= 0 ? +qty : 1;
    if (bomIdx >= 0) {
      dispatch({ type: 'SET_BOM_ENTRY_FIELD', payload: { idx: bomIdx, field: 'qty', value: q } });
    } else {
      // Fallback child: materialize a BOM entry so the qty sticks.
      dispatch({ type: 'ADD_BOM_ENTRY', payload: { sp_index: spIdx, qty: q, notes: '' } });
    }
  };

  const removeFromBom = (bomIdx) => {
    if (bomIdx < 0) return;
    dispatch({ type: 'REMOVE_BOM_ENTRY', payload: { idx: bomIdx } });
  };

  const addToBom = (spIdx) => {
    dispatch({ type: 'ADD_BOM_ENTRY', payload: { sp_index: spIdx, qty: 1, notes: '' } });
  };

  if (!sps.length) {
    return (
      <div style={{ padding: 32 }}>
        <EmptyState
          icon="🪢"
          title="No sub-products yet"
          hint="Add sub-products in the Calculators tab, then mark one as the assembly here to see the Bill of Materials tree."
        />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#161616' }}>Bill of Materials</div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 10,
            background: '#fef3c7',
            color: '#92400e',
            letterSpacing: 0.3,
          }}
        >
          PREVIEW
        </span>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: '#525252',
            cursor: 'pointer',
            padding: '3px 10px',
            border: '1px solid ' + (bomQtyEnabled ? '#1e40af' : '#c6c6c6'),
            borderRadius: 12,
            background: bomQtyEnabled ? '#eff6ff' : '#fff',
          }}
          title="When on, BOM qty multiplies child SP cost into the aggregate. Default off until Finance signs off on semantics."
        >
          <input
            type="checkbox"
            checked={bomQtyEnabled}
            onChange={(e) => toggleBomQty(e.target.checked)}
            style={{ margin: 0 }}
          />
          qty multiplier
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: bomQtyEnabled ? '#1e40af' : '#8d8d8d',
            }}
          >
            {bomQtyEnabled ? 'ON' : 'OFF'}
          </span>
        </label>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#8d8d8d' }}>
          Shape version: {cplxState?._shape_version || 1}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', padding: 16 }}>
        {/* Assembly (parent) node */}
        {assembly ? (
          <Node
            label={assembly.code || '(unnamed assembly)'}
            subtitle={assembly.description || 'Assembly'}
            isAssembly
            canUnset
            onUnsetAssembly={() => setAssembly(assemblyIdx, false)}
          />
        ) : (
          <div
            style={{
              fontSize: 12,
              color: '#6f6f6f',
              padding: 8,
              background: '#f4f4f4',
              marginBottom: 12,
            }}
          >
            No assembly SP detected. Showing sum-of-children aggregation (legacy behavior). Pick one
            below to mark as the assembly.
          </div>
        )}

        {/* Children connected by vertical rail */}
        {children.length > 0 && (
          <div style={{ position: 'relative', paddingLeft: 24, marginTop: assembly ? 4 : 0 }}>
            <div
              style={{
                position: 'absolute',
                left: 11,
                top: 0,
                bottom: 12,
                width: 2,
                background: '#e0e0e0',
              }}
            />
            {children.map((c, i) => (
              <div key={`${c.spIdx}-${c.bomIdx}`} style={{ position: 'relative', paddingTop: 8 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: -13,
                    top: 24,
                    width: 14,
                    height: 2,
                    background: '#e0e0e0',
                  }}
                />
                <Node
                  label={c.sp.code || `SP ${i + 1}`}
                  subtitle={c.sp.description || c.sp.main_process || '(component)'}
                  qty={c.qty}
                  notes={c.notes}
                  editableQty
                  onQtyChange={(v) => setQty(c.spIdx, c.bomIdx, v)}
                  onMakeAssembly={() => setAssembly(c.spIdx, true)}
                  onRemoveFromBom={c.bomIdx >= 0 ? () => removeFromBom(c.bomIdx) : null}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {orphans.length > 0 && (
        <div style={{ marginTop: 14, border: '1px solid #e0e0e0', background: '#fff' }}>
          <div
            style={{
              padding: '8px 14px',
              fontSize: 11,
              fontWeight: 600,
              color: '#6f6f6f',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              borderBottom: '1px solid #e0e0e0',
              background: '#f4f4f4',
            }}
          >
            Orphan sub-products ({orphans.length})
            <span
              style={{
                fontWeight: 400,
                textTransform: 'none',
                letterSpacing: 0,
                marginLeft: 8,
                color: '#8d8d8d',
              }}
            >
              — not in BOM. Add to attach to the assembly.
            </span>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {orphans.map(({ sp, i }) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 10px',
                  background: '#fafafa',
                  border: '1px dashed #c6c6c6',
                  borderRadius: 2,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#e0e0e0',
                    color: '#525252',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {'\u25E6'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#161616' }}>
                    {sp.code || `SP ${i + 1}`}
                  </div>
                  {(sp.description || sp.main_process) && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#6f6f6f',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {sp.description || sp.main_process}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => addToBom(i)}
                  title="Attach this SP to the BOM with qty=1"
                  style={{
                    fontSize: 10,
                    padding: '3px 10px',
                    border: '1px solid #16a34a',
                    background: '#16a34a',
                    color: '#fff',
                    cursor: 'pointer',
                    borderRadius: 2,
                    fontWeight: 600,
                    letterSpacing: 0.2,
                  }}
                >
                  + Add to BOM
                </button>
                <button
                  type="button"
                  onClick={() => setAssembly(i, true)}
                  title="Mark as assembly (parent) instead"
                  style={{
                    fontSize: 10,
                    padding: '3px 8px',
                    border: '1px solid #1e40af',
                    background: '#fff',
                    color: '#1e40af',
                    cursor: 'pointer',
                    borderRadius: 2,
                    fontWeight: 600,
                    letterSpacing: 0.2,
                  }}
                >
                  Make assembly
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          padding: '10px 14px',
          fontSize: 11,
          color: bomQtyEnabled ? '#1e3a8a' : '#525252',
          background: bomQtyEnabled ? '#eff6ff' : '#f4f4f4',
          border: bomQtyEnabled ? '1px solid #1e40af' : '1px solid transparent',
          lineHeight: 1.5,
        }}
      >
        {bomQtyEnabled ? (
          <>
            <strong>Qty multiplier ACTIVE.</strong> When no assembly SP is selected, the aggregate
            is a BOM-weighted sum — each child SP's cost is multiplied by its BOM qty. Numbers in
            the Summary + Breakdown tabs reflect this. Quotes saved now persist the v2 shape;
            loading them later with the flag off returns to the legacy sum.
          </>
        ) : (
          <>
            <strong>Note:</strong> BOM qty is stored per entry but does
            <em> not </em>multiply cost aggregation yet. Toggle
            <em> qty multiplier </em>above to preview the Sprint 4.4 semantics (default off until
            Finance sign-off).
          </>
        )}
      </div>
    </div>
  );
}

function Node({
  label,
  subtitle,
  qty,
  notes,
  isAssembly,
  editableQty,
  onQtyChange,
  canUnset,
  onUnsetAssembly,
  onMakeAssembly,
  onRemoveFromBom,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: isAssembly ? '#dbeafe' : '#fff',
        border: `1px solid ${isAssembly ? '#1e40af' : '#e0e0e0'}`,
        borderRadius: 2,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isAssembly ? '#1e40af' : '#e0e0e0',
          color: isAssembly ? '#fff' : '#525252',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {isAssembly ? '\u2338' : '\u25E6'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#161616' }}>{label}</div>
        {subtitle && (
          <div
            style={{
              fontSize: 11,
              color: '#6f6f6f',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {editableQty ? (
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#525252' }}
        >
          qty
          <input
            type="number"
            min={0}
            step={1}
            value={qty ?? 1}
            onChange={(e) => onQtyChange(e.target.value)}
            style={{
              width: 56,
              padding: '2px 6px',
              fontSize: 12,
              border: '1px solid #c6c6c6',
              borderRadius: 2,
              fontVariantNumeric: 'tabular-nums',
              textAlign: 'right',
              fontFamily: "'IBM Plex Mono', 'SFMono-Regular', monospace",
            }}
          />
        </label>
      ) : (
        qty != null &&
        !isAssembly && (
          <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#525252' }}>
            qty {qty}
          </div>
        )
      )}
      {notes && (
        <div style={{ fontSize: 11, color: '#6f6f6f', fontStyle: 'italic', maxWidth: 200 }}>
          {notes}
        </div>
      )}
      {!isAssembly && onMakeAssembly && (
        <button
          type="button"
          onClick={onMakeAssembly}
          title="Mark as assembly (parent). Exclusive — clears it on others."
          style={{
            fontSize: 10,
            padding: '3px 8px',
            border: '1px solid #1e40af',
            background: '#fff',
            color: '#1e40af',
            cursor: 'pointer',
            borderRadius: 2,
            fontWeight: 600,
            letterSpacing: 0.2,
          }}
        >
          Make assembly
        </button>
      )}
      {!isAssembly && onRemoveFromBom && (
        <button
          type="button"
          onClick={onRemoveFromBom}
          title="Remove this component from the BOM (keeps the sub-product; you can re-add later)."
          style={{
            width: 22,
            height: 22,
            padding: 0,
            border: '1px solid #e0e0e0',
            background: '#fff',
            color: '#6f6f6f',
            cursor: 'pointer',
            borderRadius: 2,
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      )}
      {isAssembly && canUnset && onUnsetAssembly && (
        <button
          type="button"
          onClick={onUnsetAssembly}
          title="Unset assembly flag. Tree collapses to legacy sum-of-children."
          style={{
            fontSize: 10,
            padding: '3px 8px',
            border: '1px solid #1e40af',
            background: '#1e40af',
            color: '#fff',
            cursor: 'pointer',
            borderRadius: 2,
            fontWeight: 600,
            letterSpacing: 0.2,
          }}
        >
          Unset
        </button>
      )}
    </div>
  );
}
