/**
 * PP-07 — Printable Work Order document.
 *
 * Renders a print-optimized view of a single Work Order: header, BOM pick
 * list, routing operations with computeOpHours-derived runtime columns,
 * and a production summary footer (total hrs → shift estimate).
 *
 * Data sources:
 *   - WO header + attached ops: passed in via `wo` prop (parent already
 *     fetched via fetchWorkOrderDetail)
 *   - BOM rows: sharedApi.getBOM filtered by parent_part === wo.ccl_pn
 *   - Routing rows: sharedApi.getRouting filtered by part_no === wo.ccl_pn
 *
 * Print stylesheet (WorkOrderPrintable.css) hides app shell so
 * window.print() yields a single A4-portrait sheet shop-floor operators
 * can read at a glance.
 */
import { useEffect, useState } from 'react';
import { sharedApi } from '../../../services/api';
import { useI18n } from '../../../utils/useI18n';
import { getField, getNumField } from '../../../utils/fieldMap';
import { computeOpHours } from '../../../utils/routingHours';
import { err as logErr } from '../../../utils/logger';
import './WorkOrderPrintable.css';

export default function WorkOrderPrintable({ wo, onClose }) {
  const { t } = useI18n();
  const [bom, setBom] = useState([]);
  const [routing, setRouting] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bomRes, routingRes] = await Promise.all([
          sharedApi.getBOM(),
          sharedApi.getRouting(),
        ]);
        if (cancelled) return;
        // IFS-sourced rows store Part No / Parent Part No as numbers when
        // the PN is purely numeric (e.g. 80644500); wo.ccl_pn is always
        // a string. Coerce both sides for the comparison.
        const targetPn = String(wo.ccl_pn);
        const bomFiltered = (bomRes || []).filter(
          (b) => String(getField(b, 'parentPartNo')) === targetPn
        );
        const routingFiltered = (routingRes || []).filter(
          (r) => String(getField(r, 'partNo')) === targetPn
        );
        setBom(bomFiltered);
        setRouting(routingFiltered);
      } catch (e) {
        if (!cancelled) {
          logErr('WorkOrderPrintable load failed', e);
          setLoadError(e.message || 'Failed to load print data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wo.ccl_pn]);

  const fmtQty = (n) =>
    n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toFixed(4);

  // Trim trailing zeros after toFixed for clean QPA display.
  // 1 → "1", 0.000011 → "0.000011", 0.0098929999999999 → "0.009893".
  const fmtQpa = (n) => {
    if (!Number.isFinite(n)) return '0';
    return parseFloat(Number(n).toFixed(6)).toString();
  };
  // Scrap always 1 decimal: 2.4000000000000004 → "2.4", 5 → "5.0".
  const fmtScrap = (n) => (Number.isFinite(n) ? Number(n).toFixed(1) : '0.0');

  // Compute routing summary
  const routingRows = routing.map((op) => {
    const setupTime = getNumField(op, 'setupTime');
    const runFactor = getNumField(op, 'runFactor');
    const factorUnit = getField(op, 'factorUnit');
    const hours = computeOpHours({
      setupTime,
      runFactor,
      factorUnit,
      quantity: wo.qty_planned,
    });
    return {
      operationNo: getField(op, 'operationNo'),
      operationDesc: getField(op, 'operationDesc'),
      workCenter: getField(op, 'workCenter'),
      setupHrs: hours.setupHrs,
      runFactor,
      runHrs: hours.runHrs,
      totalHrs: hours.totalHrs,
      isFixedHours: hours.isFixedHours,
    };
  });

  const totalSetup = routingRows.reduce((s, r) => s + r.setupHrs, 0);
  const totalRun = routingRows.reduce((s, r) => s + r.runHrs, 0);
  const grandTotal = totalSetup + totalRun;
  const shifts = Math.ceil(grandTotal / 8);

  return (
    <div className="wo-printable" role="document">
      <div className="wo-printable-toolbar no-print">
        <button type="button" className="op-btn op-btn-ghost" onClick={onClose}>
          {t('planning.workOrder.print.close')}
        </button>
        <button type="button" className="op-btn op-btn-primary" onClick={() => window.print()}>
          {t('planning.workOrder.print.print_btn')}
        </button>
      </div>

      <div className="wo-printable-doc">
        <header className="wo-printable-header">
          <div className="wo-printable-title">
            <h1>WORK ORDER</h1>
            <span className="wo-printable-code">{wo.code}</span>
          </div>
          <div className="wo-printable-status">
            <span className={`wo-status-pill wo-status-${wo.status}`}>{wo.status}</span>
          </div>
        </header>

        <section className="wo-printable-info">
          <div className="wo-printable-info-grid">
            <div>
              <span className="wo-printable-label">{t('planning.workOrder.col.customer')}</span>
              <span className="wo-printable-value">{wo.customer}</span>
            </div>
            <div>
              <span className="wo-printable-label">{t('planning.workOrder.col.ccl_pn')}</span>
              <span className="wo-printable-value">{wo.ccl_pn}</span>
            </div>
            <div>
              <span className="wo-printable-label">{t('planning.workOrder.col.qty_planned')}</span>
              <span className="wo-printable-value">
                {wo.qty_planned?.toLocaleString()} {wo.uom}
              </span>
            </div>
            <div>
              <span className="wo-printable-label">{t('planning.workOrder.col.due_date')}</span>
              <span className="wo-printable-value">{wo.due_date}</span>
            </div>
            <div>
              <span className="wo-printable-label">
                {t('planning.workOrder.detail.created_by')}
              </span>
              <span className="wo-printable-value">{wo.created_by}</span>
            </div>
            <div>
              <span className="wo-printable-label">
                {t('planning.workOrder.detail.created_at')}
              </span>
              <span className="wo-printable-value">{wo.created_at}</span>
            </div>
          </div>
        </section>

        {loadError && (
          <div className="wo-printable-error">
            {t('planning.workOrder.print.load_failed')}: {loadError}
          </div>
        )}

        <section className="wo-printable-section">
          <h2>{t('planning.workOrder.print.bom_picklist')}</h2>
          {loading ? (
            <p className="wo-printable-loading">…</p>
          ) : bom.length === 0 ? (
            <p className="wo-printable-empty">{t('planning.workOrder.print.bom_empty')}</p>
          ) : (
            <table className="wo-printable-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('planning.workOrder.print.bom_component')}</th>
                  <th>{t('planning.workOrder.print.bom_description')}</th>
                  <th>{t('planning.workOrder.col.qty_planned')}/Asm</th>
                  <th>UOM</th>
                  <th>Scrap %</th>
                  <th className="wo-printable-num">{t('planning.workOrder.print.bom_required')}</th>
                </tr>
              </thead>
              <tbody>
                {bom.map((b, i) => {
                  const qtyPer = getNumField(b, 'qtyPerAssembly', 1);
                  const scrapPct = getNumField(b, 'componentScrap');
                  const required = wo.qty_planned * qtyPer * (1 + scrapPct / 100);
                  return (
                    <tr key={`${getField(b, 'componentPart')}-${i}`}>
                      <td>{i + 1}</td>
                      <td className="wo-printable-mono">{getField(b, 'componentPart')}</td>
                      <td>{getField(b, 'componentDescription')}</td>
                      <td className="wo-printable-num">{fmtQpa(qtyPer)}</td>
                      <td>{getField(b, 'uom', 'u')}</td>
                      <td className="wo-printable-num">{fmtScrap(scrapPct)}%</td>
                      <td className="wo-printable-num">{fmtQty(required)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="wo-printable-section">
          <h2>{t('planning.workOrder.print.routing')}</h2>
          {loading ? (
            <p className="wo-printable-loading">…</p>
          ) : routingRows.length === 0 ? (
            <p className="wo-printable-empty">{t('planning.workOrder.print.routing_empty')}</p>
          ) : (
            <table className="wo-printable-table">
              <thead>
                <tr>
                  <th>{t('planning.workOrder.ops.col.seq')}</th>
                  <th>{t('planning.workOrder.print.routing_desc')}</th>
                  <th>{t('planning.workOrder.ops.col.work_centre_no')}</th>
                  <th className="wo-printable-num">Setup (hrs)</th>
                  <th className="wo-printable-num">{t('planning.workOrder.print.routing_rate')}</th>
                  <th className="wo-printable-num">Run (hrs)</th>
                  <th className="wo-printable-num">Total (hrs)</th>
                </tr>
              </thead>
              <tbody>
                {routingRows.map((r, i) => (
                  <tr key={`${r.operationNo}-${i}`}>
                    <td>{r.operationNo}</td>
                    <td>{r.operationDesc}</td>
                    <td className="wo-printable-mono">{r.workCenter}</td>
                    <td className="wo-printable-num">{r.setupHrs.toFixed(2)}</td>
                    <td className="wo-printable-num">
                      {r.isFixedHours
                        ? `${r.runFactor.toFixed(2)} hrs`
                        : `${r.runFactor >= 1 ? r.runFactor.toLocaleString() : r.runFactor.toFixed(4)}/hr`}
                    </td>
                    <td className="wo-printable-num">{r.runHrs.toFixed(2)}</td>
                    <td className="wo-printable-num wo-printable-strong">
                      {r.totalHrs.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr className="wo-printable-totals">
                  <td colSpan="3">{t('planning.workOrder.print.routing_total')}</td>
                  <td className="wo-printable-num">{totalSetup.toFixed(2)}</td>
                  <td></td>
                  <td className="wo-printable-num">{totalRun.toFixed(2)}</td>
                  <td className="wo-printable-num wo-printable-strong">{grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {!loading && routingRows.length > 0 && (
          <section className="wo-printable-summary">
            <strong>{t('planning.workOrder.print.summary')}:</strong> {grandTotal.toFixed(2)}{' '}
            {t('planning.workOrder.print.hrs')} ≈ {shifts} {t('planning.workOrder.print.shifts')} @
            8 {t('planning.workOrder.print.hrs')}/{t('planning.workOrder.print.shift')} |{' '}
            {t('planning.workOrder.col.qty_planned')}: {wo.qty_planned?.toLocaleString()} {wo.uom}
          </section>
        )}

        <footer className="wo-printable-footer">
          {t('planning.workOrder.print.generated')}: {new Date().toLocaleString()}
        </footer>
      </div>
    </div>
  );
}
