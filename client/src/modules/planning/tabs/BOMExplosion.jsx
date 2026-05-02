import { useState, useEffect, useMemo, useCallback } from 'react';
import { planningApi, sharedApi } from '../../../services/api';
import { useI18n } from '../../../utils/useI18n';
import { getField, getNumField } from '../../../utils/fieldMap';
import { err as logErr } from '../../../utils/logger';
import EmptyState from '../../../components/Shared/EmptyState';
import './BOMExplosion.css';

export default function BOMExplosion() {
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [bomData, setBomData] = useState([]);
  const [inventory, setInventory] = useState({});
  const [wipByProduct, setWipByProduct] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [viewMode, setViewMode] = useState('per-order'); // 'per-order' | 'stacked' | 'consolidated'

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [ordersRes, bomRes, invRes, wipRes, woRes] = await Promise.all([
        planningApi.getOrders(),
        sharedApi.getBOM(),
        sharedApi.getInventory(),
        planningApi.getWIP(),
        planningApi.getWorkOrders(),
      ]);
      setOrders(ordersRes.filter((o) => o.status !== 'Completed'));
      setBomData(bomRes);

      // Build inventory lookup: partNo -> quantity
      const invMap = {};
      const allParts = [
        ...(invRes.inventory || []),
        ...(invRes.rawMaterials || []),
        ...(invRes.finishedGoods || []),
      ];
      allParts.forEach((p) => {
        const partNo = getField(p, 'partNo');
        const qty = getNumField(p, 'qtyOnHand');
        if (partNo) invMap[partNo] = (invMap[partNo] || 0) + qty;
      });
      setInventory(invMap);

      // Build WIP lookup: productCode -> completedQty (already produced, reduces demand)
      const wipMap = {};
      (woRes || []).forEach((wo) => {
        if (wo.status === 'Completed') return; // already counted in inventory
        const wip = (wipRes || []).find((w) => w.woId === wo.id);
        const completed = wip?.completedQty || 0;
        if (completed > 0 && wo.productCode) {
          wipMap[wo.productCode] = (wipMap[wo.productCode] || 0) + completed;
        }
      });
      setWipByProduct(wipMap);
    } catch (e) {
      logErr('BOMExplosion load failed', e);
      setLoadError(e.message || 'Failed to load BOM data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Explode BOM for a single order
  function explodeOrder(order) {
    const components = bomData.filter((b) => getField(b, 'parentPartNo') === order.productCode);

    // WIP completed qty for this product reduces the effective order demand
    const wipCompleted = wipByProduct[order.productCode] || 0;
    const effectiveQty = Math.max(0, order.quantity - wipCompleted);

    return components.map((comp) => {
      const compPartNo = getField(comp, 'componentPart');
      const qtyPer = getNumField(comp, 'qtyPerAssembly', 1);
      const scrapPct = getNumField(comp, 'componentScrap') / 100;
      const required = effectiveQty * qtyPer * (1 + scrapPct);
      const onHand = inventory[compPartNo] || 0;
      const shortage = Math.max(0, required - onHand);

      return {
        orderId: order.id,
        productCode: order.productCode,
        componentPart: compPartNo,
        description: getField(comp, 'componentDescription'),
        uom: getField(comp, 'uom', 'u'),
        qtyPer,
        scrapPct: scrapPct * 100,
        orderQty: order.quantity,
        wipCompleted,
        required: Math.round(required * 100) / 100,
        onHand: Math.round(onHand * 100) / 100,
        shortage: Math.round(shortage * 100) / 100,
        status: shortage > 0 ? 'Shortage' : onHand < required * 1.1 ? 'Low Stock' : 'OK',
      };
    });
  }

  // Consolidated BOM across all orders
  const consolidatedBOM = useMemo(() => {
    const map = {};
    orders.forEach((order) => {
      const components = explodeOrder(order);
      components.forEach((comp) => {
        if (!map[comp.componentPart]) {
          map[comp.componentPart] = {
            componentPart: comp.componentPart,
            description: comp.description,
            uom: comp.uom,
            totalRequired: 0,
            onHand: comp.onHand,
            orderCount: 0,
          };
        }
        map[comp.componentPart].totalRequired += comp.required;
        map[comp.componentPart].orderCount++;
      });
    });

    return Object.values(map)
      .map((item) => ({
        ...item,
        totalRequired: Math.round(item.totalRequired * 100) / 100,
        shortage: Math.round(Math.max(0, item.totalRequired - item.onHand) * 100) / 100,
        status:
          item.totalRequired > item.onHand
            ? 'Shortage'
            : item.onHand < item.totalRequired * 1.1
              ? 'Low Stock'
              : 'OK',
      }))
      .sort((a, b) => b.shortage - a.shortage);
    // explodeOrder is a stable local function closing over bomData;
    // including it in deps would require useCallback indirection for no gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, bomData, inventory]);

  // Stats
  const stats = useMemo(() => {
    const total = consolidatedBOM.length;
    const shortages = consolidatedBOM.filter((c) => c.status === 'Shortage').length;
    const lowStock = consolidatedBOM.filter((c) => c.status === 'Low Stock').length;
    const ok = consolidatedBOM.filter((c) => c.status === 'OK').length;
    return { total, shortages, lowStock, ok };
  }, [consolidatedBOM]);

  if (loading) {
    return <div className="tab-loading">Loading BOM data...</div>;
  }

  if (loadError) {
    return (
      <div className="bom-explosion">
        <EmptyState
          icon="⚠️"
          title="Failed to load BOM data"
          hint={loadError}
          action={
            <button className="btn btn-primary" onClick={loadData}>
              Retry
            </button>
          }
        />
      </div>
    );
  }

  const selectedComponents = selectedOrder ? explodeOrder(selectedOrder) : [];

  return (
    <div className="bom-explosion">
      <div className="tab-header">
        <div>
          <h2>{t('planning.bom_explosion')}</h2>
          <p className="tab-subtitle">
            {orders.length} active orders &bull; {stats.total} unique components
          </p>
        </div>
        <div className="tab-actions">
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'per-order' ? 'active' : ''}`}
              onClick={() => setViewMode('per-order')}
            >
              Per Order
            </button>
            <button
              className={`toggle-btn ${viewMode === 'stacked' ? 'active' : ''}`}
              onClick={() => setViewMode('stacked')}
            >
              All Orders Stacked
            </button>
            <button
              className={`toggle-btn ${viewMode === 'consolidated' ? 'active' : ''}`}
              onClick={() => setViewMode('consolidated')}
            >
              Consolidated
            </button>
          </div>
        </div>
      </div>

      {/* Status KPIs */}
      <div className="bom-kpis">
        <div className="kpi-card kpi-total">
          <span className="kpi-value">{stats.total}</span>
          <span className="kpi-label">Components</span>
        </div>
        <div className="kpi-card kpi-ok">
          <span className="kpi-value">{stats.ok}</span>
          <span className="kpi-label">OK</span>
        </div>
        <div className="kpi-card kpi-low">
          <span className="kpi-value">{stats.lowStock}</span>
          <span className="kpi-label">Low Stock</span>
        </div>
        <div className="kpi-card kpi-shortage">
          <span className="kpi-value">{stats.shortages}</span>
          <span className="kpi-label">Shortage</span>
        </div>
      </div>

      {viewMode === 'per-order' && (
        <div className="bom-per-order">
          {/* Order selector */}
          <div className="order-selector">
            <label>Select Order:</label>
            <select
              value={selectedOrder?.id || ''}
              onChange={(e) => {
                const order = orders.find((o) => o.id === parseInt(e.target.value));
                setSelectedOrder(order || null);
              }}
            >
              <option value="">-- Choose an order --</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id} — {o.productCode} (Qty: {o.quantity?.toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          {selectedOrder && (
            <div className="orders-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Component Part</th>
                    <th>Description</th>
                    <th>UOM</th>
                    <th>Qty/Assy</th>
                    <th>Scrap %</th>
                    <th className="text-right">Required</th>
                    <th className="text-right">On Hand</th>
                    <th className="text-right">Shortage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedComponents.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="empty-state">
                        No BOM data found for this product
                      </td>
                    </tr>
                  ) : (
                    selectedComponents.map((comp, i) => (
                      <tr key={comp.componentPart || `sc-${i}`}>
                        <td className="cell-code">{comp.componentPart}</td>
                        <td>{comp.description}</td>
                        <td>{comp.uom}</td>
                        <td className="text-right">{comp.qtyPer}</td>
                        <td className="text-right">{comp.scrapPct}%</td>
                        <td className="text-right mono">{comp.required.toLocaleString()}</td>
                        <td className="text-right mono">{comp.onHand.toLocaleString()}</td>
                        <td className="text-right mono">
                          {comp.shortage > 0 ? comp.shortage.toLocaleString() : '—'}
                        </td>
                        <td>
                          <span
                            className={`status-badge status-${comp.status.toLowerCase().replace(' ', '-')}`}
                          >
                            {comp.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {viewMode === 'stacked' && (
        <div className="bom-stacked">
          {orders.length === 0 ? (
            <EmptyState
              icon="📋"
              title="No active orders"
              hint="Create orders in Order Entry to see their BOM breakdown stacked here."
            />
          ) : (
            orders.map((order) => {
              const components = explodeOrder(order);
              const shortCnt = components.filter((c) => c.status === 'Shortage').length;
              const lowCnt = components.filter((c) => c.status === 'Low Stock').length;
              const summaryCls =
                shortCnt > 0
                  ? 'bom-stacked-short'
                  : lowCnt > 0
                    ? 'bom-stacked-low'
                    : 'bom-stacked-ok';
              const badgeText =
                shortCnt > 0
                  ? `${shortCnt} Shortage`
                  : lowCnt > 0
                    ? `${lowCnt} Low Stock`
                    : 'All OK';
              return (
                <details key={order.id} className={`bom-stacked-row ${summaryCls}`}>
                  <summary>
                    <span className="bom-stacked-id">#{order.id}</span>
                    <span className="bom-stacked-pn">{order.productCode}</span>
                    <span className="bom-stacked-qty">Qty: {order.quantity?.toLocaleString()}</span>
                    <span className="bom-stacked-comp">{components.length} components</span>
                    <span
                      className={`status-badge status-${shortCnt > 0 ? 'shortage' : lowCnt > 0 ? 'low-stock' : 'ok'}`}
                    >
                      {badgeText}
                    </span>
                  </summary>
                  {components.length === 0 ? (
                    <p className="bom-stacked-empty">No BOM data found for this product</p>
                  ) : (
                    <table className="data-table bom-stacked-table">
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th>Description</th>
                          <th>UOM</th>
                          <th className="text-right">Required</th>
                          <th className="text-right">On Hand</th>
                          <th className="text-right">Shortage</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {components.map((comp, i) => (
                          <tr key={comp.componentPart || `bs-${order.id}-${i}`}>
                            <td className="cell-code">{comp.componentPart}</td>
                            <td>{comp.description}</td>
                            <td>{comp.uom}</td>
                            <td className="text-right mono">{comp.required.toLocaleString()}</td>
                            <td className="text-right mono">{comp.onHand.toLocaleString()}</td>
                            <td className="text-right mono">
                              {comp.shortage > 0 ? comp.shortage.toLocaleString() : '—'}
                            </td>
                            <td>
                              <span
                                className={`status-badge status-${comp.status.toLowerCase().replace(' ', '-')}`}
                              >
                                {comp.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </details>
              );
            })
          )}
        </div>
      )}

      {viewMode === 'consolidated' && (
        /* Consolidated View */
        <div className="orders-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Component Part</th>
                <th>Description</th>
                <th>UOM</th>
                <th className="text-right">Total Required</th>
                <th className="text-right">On Hand</th>
                <th className="text-right">Shortage</th>
                <th>Orders</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedBOM.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-state">
                    No BOM data. Create orders first.
                  </td>
                </tr>
              ) : (
                consolidatedBOM.map((comp, i) => (
                  <tr key={comp.componentPart || `cb-${i}`}>
                    <td className="cell-code">{comp.componentPart}</td>
                    <td>{comp.description}</td>
                    <td>{comp.uom}</td>
                    <td className="text-right mono">{comp.totalRequired.toLocaleString()}</td>
                    <td className="text-right mono">{comp.onHand.toLocaleString()}</td>
                    <td className="text-right mono">
                      {comp.shortage > 0 ? comp.shortage.toLocaleString() : '—'}
                    </td>
                    <td className="text-center">{comp.orderCount}</td>
                    <td>
                      <span
                        className={`status-badge status-${comp.status.toLowerCase().replace(' ', '-')}`}
                      >
                        {comp.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
