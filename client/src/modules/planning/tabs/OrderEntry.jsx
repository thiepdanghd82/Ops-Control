import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { planningApi, sharedApi } from '../../../services/api';
import { useI18n } from '../../../utils/useI18n';
import { showToast } from '../../../utils/toast';
import { err as logErr } from '../../../utils/logger';
import EmptyState from '../../../components/Shared/EmptyState';
import Modal from '../../../components/Shared/Modal';
import './OrderEntry.css';

// Mirror the reference Production-Plan-Tool.html UX:
//   - Product Code is a typeahead backed by Finished Goods (IFS Inventory)
//   - Picking a code auto-fills Description (read-only) + Customer
//   - Excel import with preview/confirm so the operator sees what's
//     about to be created before any disk write
//
// Customer + Description come from `getProducts()` server-side. The bug
// fix in dataSync.js (Catalog No / Catalog Desc / Association No) is
// what makes this tab actually useful — before the fix, products
// returned empty strings and the datalist was useless.

function emptyForm() {
  return {
    productCode: '',
    description: '',
    quantity: '',
    dueDate: '',
    customer: '',
    priority: 'Normal',
    notes: '',
  };
}

export default function OrderEntry() {
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [formData, setFormData] = useState(emptyForm());

  // Excel import state — preview is what the server returned;
  // pendingFile is kept only so the cancel path can reset the input.
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // partNo → product map for auto-fill. Built once per products fetch.
  // String-coerce both ends because IFS exports purely numeric PNs as
  // numbers (e.g. 80644500), but operator input is always a string.
  const productMap = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.partNo), p);
    return m;
  }, [products]);

  // Datalist option nodes — memoized once per products fetch so typing
  // in the form's other fields doesn't re-create 500 React elements
  // on every keystroke. Native <datalist> still applies type-ahead
  // filtering on top, so 500 is plenty for the dropdown UX.
  const productOptions = useMemo(
    () =>
      products
        .slice(0, 500)
        .map((p) => (
          <option key={p.partNo} value={p.partNo}>
            {p.description}
          </option>
        )),
    [products]
  );

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

  // Auto-fill description + customer whenever productCode changes to a
  // known FG. Operators can still override the customer if a one-off
  // ship-to applies (the field stays editable).
  function handleProductCodeChange(value) {
    const code = String(value).trim();
    const fg = productMap.get(code);
    setFormData((prev) => ({
      ...prev,
      productCode: value,
      description: fg?.description || '',
      // Only auto-fill customer if the field is empty OR currently
      // matches another FG's customer — preserves manual edits.
      customer:
        !prev.customer || productMap.get(String(prev.productCode))?.customer === prev.customer
          ? fg?.customer || ''
          : prev.customer,
    }));
  }

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
        productCode: formData.productCode,
        partNumber: formData.productCode,
        description: formData.description,
        quantity: parseInt(formData.quantity, 10),
        dueDate: formData.dueDate,
        customer: formData.customer,
        customerName: formData.customer,
        priority: formData.priority,
        notes: formData.notes,
      });
      setOrders([...orders, newOrder]);
      setFormData(emptyForm());
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

  // ─── Excel import handlers ─────────────────────────────────────
  async function handleImportFile(file) {
    if (!file) return;
    setImporting(true);
    setImportPreview(null);
    try {
      const result = await planningApi.importOrdersPreview(file);
      setImportPreview(result);
      if (result.rows.length === 0) {
        showToast('No valid rows found', 'err');
      }
    } catch (e) {
      logErr('Import preview failed', e);
      showToast('Import failed: ' + (e.message || 'unknown'), 'err');
    } finally {
      setImporting(false);
    }
  }

  async function handleImportConfirm() {
    if (!importPreview?.rows?.length) return;
    setImporting(true);
    try {
      const result = await planningApi.importOrdersConfirm(importPreview.rows);
      const createdCount = result.created?.length || 0;
      const errorCount = result.errors?.length || 0;
      if (createdCount > 0) {
        setOrders((prev) => [...prev, ...result.created]);
      }
      if (errorCount > 0) {
        showToast(`Imported ${createdCount}, ${errorCount} errors`, 'err');
      } else {
        showToast(`Imported ${createdCount} orders`, 'ok');
      }
      handleImportCancel();
    } catch (e) {
      logErr('Import confirm failed', e);
      showToast('Confirm failed: ' + (e.message || 'unknown'), 'err');
    } finally {
      setImporting(false);
    }
  }

  function handleImportCancel() {
    setImportPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImportFile(file);
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
  const orderToDelete = confirmDeleteId != null ? orders.find((o) => o.id === confirmDeleteId) : null;
  const productMatched = productMap.has(String(formData.productCode));

  return (
    <div className="order-entry">
      {/* Header */}
      <div className="tab-header">
        <div>
          <h2>{t('planning.order_entry')}</h2>
          <p className="tab-subtitle">
            {orders.length} orders total · {products.length.toLocaleString()} finished goods loaded
          </p>
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
            <div className="form-field oe-field-code">
              <label>Product Code</label>
              <input
                type="text"
                value={formData.productCode}
                onChange={(e) => handleProductCodeChange(e.target.value)}
                placeholder="Type or select…"
                list="oe-products-list"
                required
              />
              <datalist id="oe-products-list">{productOptions}</datalist>
              {formData.productCode && !productMatched ? (
                <span className="oe-field-hint oe-field-hint-warn">
                  Not in Finished Goods — order will still be created
                </span>
              ) : null}
            </div>
            <div className="form-field oe-field-desc">
              <label>Product Description</label>
              <input
                type="text"
                value={formData.description}
                readOnly
                placeholder="(auto-filled from Finished Good)"
                tabIndex={-1}
              />
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
                placeholder="Auto-filled from Finished Good"
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

      {/* Excel Import Zone */}
      <section className="oe-import-section">
        <h3 className="oe-import-heading">Import Orders from Excel</h3>
        {!importPreview ? (
          <div
            className={`oe-dropzone ${importing ? 'oe-dropzone-busy' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
          >
            <div className="oe-dropzone-icon">📂</div>
            <div className="oe-dropzone-title">
              {importing ? 'Reading file…' : 'Click to browse or drag & drop Excel file here'}
            </div>
            <div className="oe-dropzone-hint">
              Format: <strong>Product Code</strong> | <strong>Quantity</strong> |{' '}
              <strong>Due Date</strong> (header row optional)
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="oe-file-input"
              onChange={(e) => handleImportFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="oe-import-preview">
            <div className="oe-import-summary">
              <strong>{importPreview.summary.total}</strong> rows ready
              {importPreview.summary.notFound > 0 && (
                <span className="oe-summary-warn">
                  {' '}
                  ({importPreview.summary.notFound} unknown codes)
                </span>
              )}
              {importPreview.summary.skipped > 0 && (
                <span className="oe-summary-skip">
                  , {importPreview.summary.skipped} skipped (missing qty/date)
                </span>
              )}
            </div>
            <div className="oe-preview-table-wrap">
              <table className="oe-preview-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Customer</th>
                    <th>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.map((r, idx) => (
                    <tr key={idx} className={r.found ? '' : 'oe-row-unknown'}>
                      <td className="cell-code">{r.productCode}</td>
                      <td>{r.description}</td>
                      <td className="cell-qty">{r.quantity.toLocaleString()}</td>
                      <td>{r.customer}</td>
                      <td>{r.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="oe-import-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleImportConfirm}
                disabled={importing || importPreview.rows.length === 0}
              >
                {importing ? 'Importing…' : `Confirm Import (${importPreview.rows.length})`}
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleImportCancel}
                disabled={importing}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Orders Table */}
      <div className="orders-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Product Code</th>
              <th>Description</th>
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
                <td colSpan="9" className="oe-empty-cell">
                  <EmptyState icon="📋" title="No orders yet" hint='Click "+ New Order" to create one.' />
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td className="cell-id">{order.id}</td>
                  <td className="cell-code">{order.productCode || order.partNumber}</td>
                  <td className="oe-cell-desc">{order.description || ''}</td>
                  <td className="cell-qty">{order.quantity?.toLocaleString()}</td>
                  <td>{order.dueDate}</td>
                  <td>{order.customer || order.customerName}</td>
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
              ? `#${orderToDelete.id} · ${orderToDelete.productCode || orderToDelete.partNumber} · qty ${orderToDelete.quantity}`
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
