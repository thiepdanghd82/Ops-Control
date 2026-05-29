import { useState, useEffect, useCallback } from 'react';
import { planningApi, sharedApi } from '../../../services/api';
import { useI18n } from '../../../utils/useI18n';
import { showToast } from '../../../utils/toast';
import { err as logErr } from '../../../utils/logger';
import EmptyState from '../../../components/Shared/EmptyState';
import Modal from '../../../components/Shared/Modal';
import './OrderEntry.css';

export default function OrderEntry() {
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [formData, setFormData] = useState({
    productCode: '',
    quantity: '',
    dueDate: '',
    customer: '',
    priority: 'Normal',
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [ordersData, productsData] = await Promise.all([
        planningApi.getOrders(),
        sharedApi.getProducts(),
      ]);
      setOrders(ordersData);
      setProducts(productsData);
    } catch (e) {
      logErr('OrderEntry load failed', e);
      setLoadError(e.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Validate before submit — pre-save guard prevents corrupt orders.
  function validateForm() {
    const qty = parseInt(formData.quantity, 10);
    if (!formData.productCode) return 'Product code is required';
    if (!Number.isFinite(qty) || qty <= 0) return 'Quantity must be a positive integer';
    if (!formData.dueDate) return 'Due date is required';
    if (formData.dueDate < new Date().toISOString().slice(0, 10))
      return 'Due date cannot be in the past';
    if (!formData.customer) return 'Customer is required';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const error = validateForm();
    if (error) {
      showToast(error, 'err');
      return;
    }
    setSubmitting(true);
    try {
      const newOrder = await planningApi.createOrder({
        ...formData,
        quantity: parseInt(formData.quantity, 10),
      });
      setOrders([...orders, newOrder]);
      setFormData({
        productCode: '',
        quantity: '',
        dueDate: '',
        customer: '',
        priority: 'Normal',
        notes: '',
      });
      setShowForm(false);
      showToast('Order created', 'ok');
    } catch (e) {
      logErr('Create order failed', e);
      showToast('Failed to create order: ' + (e.message || 'unknown'), 'err');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      const updated = await planningApi.updateOrder(id, { status: newStatus });
      setOrders(orders.map((o) => (o.id === id ? updated : o)));
      showToast(`Status: ${newStatus}`, 'ok');
    } catch (e) {
      logErr('updateOrder failed', e);
      showToast('Failed to update: ' + (e.message || 'unknown'), 'err');
    }
  }

  async function performDelete(id) {
    setConfirmDeleteId(null);
    try {
      await planningApi.deleteOrder(id);
      setOrders(orders.filter((o) => o.id !== id));
      showToast('Order deleted', 'ok');
    } catch (e) {
      logErr('deleteOrder failed', e);
      showToast('Failed to delete: ' + (e.message || 'unknown'), 'err');
    }
  }

  const statusColors = {
    New: '#3b82f6',
    Planned: '#8b5cf6',
    Released: '#f59e0b',
    'In Progress': '#10b981',
    Completed: '#6b7280',
  };

  if (loading) {
    return <div className="tab-loading">Loading orders...</div>;
  }

  if (loadError) {
    return (
      <div className="order-entry">
        <EmptyState
          icon="⚠️"
          title="Failed to load orders"
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const orderToDelete =
    confirmDeleteId != null ? orders.find((o) => o.id === confirmDeleteId) : null;

  return (
    <div className="order-entry">
      {/* Header */}
      <div className="tab-header">
        <div>
          <h2>{t('planning.order_entry')}</h2>
          <p className="tab-subtitle">{orders.length} orders total</p>
        </div>
        <div className="tab-actions">
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cancel' : '+ New Order'}
          </button>
        </div>
      </div>

      {/* New Order Form */}
      {showForm && (
        <form className="order-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-field">
              <label>Product Code</label>
              <input
                type="text"
                value={formData.productCode}
                onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                placeholder="Enter part number"
                list="products-list"
                required
              />
              <datalist id="products-list">
                {products.slice(0, 100).map((p) => (
                  <option key={p.partNo} value={p.partNo}>
                    {p.description}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="form-field">
              <label>Quantity</label>
              <input
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="0"
                min="1"
                required
              />
            </div>
            <div className="form-field">
              <label>Due Date</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                min={todayStr}
                required
              />
            </div>
            <div className="form-field">
              <label>Customer</label>
              <input
                type="text"
                value={formData.customer}
                onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                placeholder="Customer name"
                required
              />
            </div>
            <div className="form-field">
              <label>Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              >
                <option>Low</option>
                <option>Normal</option>
                <option>High</option>
                <option>Urgent</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Order'}
            </button>
          </div>
        </form>
      )}

      {/* Orders Table */}
      <div className="orders-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Product Code</th>
              <th>Quantity</th>
              <th>Due Date</th>
              <th>Customer</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan="8" className="oe-empty-cell">
                  <EmptyState
                    icon="📋"
                    title="No orders yet"
                    hint='Click "+ New Order" to create one.'
                  />
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td className="cell-id">{order.id}</td>
                  <td className="cell-code">{order.productCode}</td>
                  <td className="cell-qty">{order.quantity?.toLocaleString()}</td>
                  <td>{order.dueDate}</td>
                  <td>{order.customer}</td>
                  <td>
                    <span className={`priority-badge priority-${order.priority?.toLowerCase()}`}>
                      {order.priority}
                    </span>
                  </td>
                  <td>
                    <select
                      className="status-select"
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      style={{ borderColor: statusColors[order.status] || '#ccc' }}
                    >
                      <option>New</option>
                      <option>Planned</option>
                      <option>Released</option>
                      <option>In Progress</option>
                      <option>Completed</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => setConfirmDeleteId(order.id)}
                      title="Delete"
                      aria-label={`Delete order ${order.id}`}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={confirmDeleteId != null}
        onClose={() => setConfirmDeleteId(null)}
        size="sm"
        severity="danger"
      >
        <Modal.Header
          title="Delete order?"
          subtitle={
            orderToDelete
              ? `#${orderToDelete.id} · ${orderToDelete.productCode} · qty ${orderToDelete.quantity}`
              : ''
          }
        />
        <Modal.Body>
          This action cannot be undone. The order will be removed from the system. Any work orders
          already generated from it will keep their references but will no longer link back to a
          parent order.
        </Modal.Body>
        <Modal.Footer>
          <button className="op-btn op-btn-ghost" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </button>
          <button
            className="op-btn op-btn-primary op-btn-danger"
            onClick={() => performDelete(confirmDeleteId)}
          >
            Delete Order
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
