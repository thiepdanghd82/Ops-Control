import { useState, useEffect, useCallback } from 'react';
import { planningApi, sharedApi } from '../../../services/api';
import { useI18n } from '../../../utils/useI18n';
import { getField, getNumField } from '../../../utils/fieldMap';
import { showToast } from '../../../utils/toast';
import { err as logErr } from '../../../utils/logger';
import EmptyState from '../../../components/Shared/EmptyState';
import './WorkOrdersLegacy.css';

const STATUS_BORDER = {
  New: '#3b82f6',
  'In Progress': '#f59e0b',
  Completed: '#22c55e',
  'On Hold': '#94a3b8',
};

export default function WorkOrders() {
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [routing, setRouting] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [ordersRes, woRes, routingRes] = await Promise.all([
        planningApi.getOrders(),
        planningApi.getWorkOrders(),
        sharedApi.getRouting(),
      ]);
      setOrders(ordersRes.filter((o) => o.status === 'Planned' || o.status === 'Released'));
      setWorkOrders(woRes);
      setRouting(routingRes);
    } catch (e) {
      logErr('WorkOrders load failed', e);
      setLoadError(e.message || 'Failed to load work order data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleOrder(id) {
    const next = new Set(selectedOrders);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedOrders(next);
  }

  function toggleAll() {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map((o) => o.id)));
    }
  }

  // Two-phase create-then-status-update is already correct (status only
  // bumps for fulfilled WO promises). This refactor surfaces partial
  // failures via toast + tracks status-update failures so admins know
  // when a WO exists but the parent order didn't transition to Released.
  async function generateWorkOrders() {
    if (selectedOrders.size === 0) return;
    setGenerating(true);

    try {
      const woPayloads = [];
      for (const orderId of selectedOrders) {
        const order = orders.find((o) => o.id === orderId);
        if (!order) continue;
        const ops = routing.filter((r) => getField(r, 'partNo') === order.productCode);
        woPayloads.push({
          orderId: order.id,
          payload: {
            orderId: order.id,
            productCode: order.productCode,
            quantity: order.quantity,
            customer: order.customer,
            dueDate: order.dueDate,
            operations: ops.map((op) => ({
              opNo: getField(op, 'operationNo'),
              description: getField(op, 'operationDesc'),
              workCenter: getField(op, 'workCenter'),
              setupTime: getNumField(op, 'setupTime'),
              runFactor: getNumField(op, 'runFactor'),
            })),
            estimatedHours: ops.reduce((total, op) => {
              const setup = getNumField(op, 'setupTime');
              const runFactor = getNumField(op, 'runFactor');
              return total + setup + (runFactor > 0 ? order.quantity / runFactor : 0);
            }, 0),
          },
        });
      }

      // Phase 1: create all WOs
      const woResults = await Promise.allSettled(
        woPayloads.map(({ payload }) => planningApi.createWorkOrder(payload))
      );

      // Phase 2: status-bump ONLY orders whose WO created successfully
      const newWOs = [];
      const statusBumpFor = [];
      woResults.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          newWOs.push(result.value);
          statusBumpFor.push(woPayloads[i].orderId);
        }
      });

      const statusResults = await Promise.allSettled(
        statusBumpFor.map((id) => planningApi.updateOrder(id, { status: 'Released' }))
      );
      const statusFailedCount = statusResults.filter((r) => r.status === 'rejected').length;
      const woFailedCount = woResults.filter((r) => r.status === 'rejected').length;

      if (newWOs.length > 0) {
        const parts = [`${newWOs.length} work order(s) created`];
        if (woFailedCount > 0) parts.push(`${woFailedCount} WO failed`);
        if (statusFailedCount > 0)
          parts.push(`${statusFailedCount} parent order(s) still show Planned (refresh to retry)`);
        showToast(parts.join(' · '), woFailedCount + statusFailedCount > 0 ? 'err' : 'ok');
      } else if (woFailedCount > 0) {
        showToast(`All ${woFailedCount} WO creation(s) failed`, 'err');
      }

      setWorkOrders([...workOrders, ...newWOs]);
      setSelectedOrders(new Set());

      // Reload orders to reflect status changes — only if at least one bump succeeded
      if (statusBumpFor.length > 0) {
        const updatedOrders = await planningApi.getOrders();
        setOrders(updatedOrders.filter((o) => o.status === 'Planned' || o.status === 'Released'));
      }
    } catch (e) {
      logErr('Generate WOs failed', e);
      showToast('Failed to generate work orders: ' + (e.message || 'unknown'), 'err');
    } finally {
      setGenerating(false);
    }
  }

  async function updateWOStatus(woId, newStatus) {
    try {
      const updated = await planningApi.updateWorkOrder(woId, { status: newStatus });
      setWorkOrders(workOrders.map((wo) => (wo.id === woId ? updated : wo)));
      showToast(`Status: ${newStatus}`, 'ok');
    } catch (e) {
      logErr('updateWOStatus failed', e);
      showToast('Failed to update: ' + (e.message || 'unknown'), 'err');
    }
  }

  if (loading) return <div className="tab-loading">Loading work orders...</div>;

  if (loadError) {
    return (
      <div className="work-orders">
        <EmptyState
          icon="⚠️"
          title="Failed to load work orders"
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

  return (
    <div className="work-orders">
      <div className="tab-header">
        <div>
          <h2>{t('planning.work_orders')}</h2>
          <p className="tab-subtitle">
            {workOrders.length} work orders &bull; {orders.length} planned orders
          </p>
        </div>
      </div>

      {/* Generate from planned orders */}
      {orders.length > 0 && (
        <div className="wo-generate-section">
          <h3>Generate Work Orders from Planned Orders</h3>
          <div className="orders-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="wo-col-check">
                    <input
                      type="checkbox"
                      checked={selectedOrders.size === orders.length && orders.length > 0}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Order ID</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Due Date</th>
                  <th>Customer</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className={selectedOrders.has(o.id) ? 'selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedOrders.has(o.id)}
                        onChange={() => toggleOrder(o.id)}
                        aria-label={`Select order ${o.id}`}
                      />
                    </td>
                    <td className="cell-id">#{o.id}</td>
                    <td className="cell-code">{o.productCode}</td>
                    <td className="text-right mono">{o.quantity?.toLocaleString()}</td>
                    <td>{o.dueDate}</td>
                    <td>{o.customer}</td>
                    <td>
                      <span
                        className={`status-badge status-${o.status?.toLowerCase().replace(' ', '-')}`}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="wo-actions">
            <button
              className="btn btn-primary"
              disabled={selectedOrders.size === 0 || generating}
              onClick={generateWorkOrders}
            >
              {generating ? 'Generating…' : `Generate ${selectedOrders.size} Work Order(s)`}
            </button>
          </div>
        </div>
      )}

      <h3 className="wo-section-title">All Work Orders</h3>
      <div className="orders-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>WO #</th>
              <th>Order</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Due Date</th>
              <th>Est. Hours</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {workOrders.length === 0 ? (
              <tr>
                <td colSpan="7" className="wo-empty-cell">
                  <EmptyState
                    icon="📋"
                    title="No work orders yet"
                    hint="Select a planned order above and click Generate."
                  />
                </td>
              </tr>
            ) : (
              workOrders.map((wo) => (
                <tr key={wo.id}>
                  <td className="cell-code">{wo.woNumber}</td>
                  <td className="cell-id">#{wo.orderId}</td>
                  <td>{wo.productCode}</td>
                  <td className="text-right mono">{wo.quantity?.toLocaleString()}</td>
                  <td>{wo.dueDate}</td>
                  <td className="text-right mono">{Math.round(wo.estimatedHours * 10) / 10}h</td>
                  <td>
                    <select
                      className="status-select"
                      value={wo.status}
                      onChange={(e) => updateWOStatus(wo.id, e.target.value)}
                      style={{ borderColor: STATUS_BORDER[wo.status] || '#ccc' }}
                      aria-label={`Status for ${wo.woNumber}`}
                    >
                      <option>New</option>
                      <option>In Progress</option>
                      <option>Completed</option>
                      <option>On Hold</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
