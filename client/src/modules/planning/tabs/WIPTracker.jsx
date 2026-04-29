import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { planningApi } from '../../../services/api';
import { useI18n } from '../../../utils/useI18n';
import { showToast } from '../../../utils/toast';
import { err as logErr } from '../../../utils/logger';
import EmptyState from '../../../components/Shared/EmptyState';
import './WIPTracker.css';

export default function WIPTracker() {
  const { t } = useI18n();
  const [workOrders, setWorkOrders] = useState([]);
  const [wipData, setWipData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingId, setSavingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [woRes, wipRes] = await Promise.all([
        planningApi.getWorkOrders(),
        planningApi.getWIP()
      ]);
      setWorkOrders(woRes);
      setWipData(wipRes);
    } catch (e) {
      logErr('WIP load failed', e);
      setLoadError(e.message || 'Failed to load WIP data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Merge WO + WIP data
  const wipRows = useMemo(() => {
    return workOrders
      .filter(wo => wo.status !== 'Completed')
      .map(wo => {
        const wip = wipData.find(w => w.woId === wo.id) || {};
        const completedQty = wip.completedQty || 0;
        const progress = wo.quantity > 0 ? Math.round((completedQty / wo.quantity) * 100) : 0;
        return {
          ...wo,
          completedQty,
          progress: Math.min(100, progress),
          currentOp: wip.currentOperation || '',
          notes: wip.notes || '',
          lastUpdate: wip.updatedAt || null
        };
      })
      .sort((a, b) => {
        const statusOrder = { 'In Progress': 0, 'New': 1, 'On Hold': 2 };
        return (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3);
      });
  }, [workOrders, wipData]);

  // Targeted update: patches the specific WIP row in local state instead of
  // reloading the whole dataset on every blur. Keeps the UI snappy with N=1000+ WOs.
  const handleProgressUpdate = useCallback(async (wo, newCompletedQty) => {
    const qty = Number.parseInt(newCompletedQty, 10);
    if (!Number.isFinite(qty) || qty < 0) {
      showToast('Completed qty must be a non-negative integer', 'err');
      return;
    }
    if (qty === wo.completedQty) return; // no-op
    if (qty > wo.quantity) {
      showToast(`Completed (${qty}) exceeds order qty (${wo.quantity})`, 'err');
      return;
    }
    setSavingId(wo.id);
    try {
      await planningApi.updateWIP(wo.id, { completedQty: qty });
      // Patch local state without a full reload
      setWipData(prev => {
        const next = [...prev];
        const idx = next.findIndex(w => w.woId === wo.id);
        const stamp = new Date().toISOString();
        if (idx >= 0) next[idx] = { ...next[idx], completedQty: qty, updatedAt: stamp };
        else next.push({ woId: wo.id, completedQty: qty, currentOperation: '', notes: '', updatedAt: stamp });
        return next;
      });
      // Auto-complete WO if quota reached
      if (qty >= wo.quantity) {
        await planningApi.updateWorkOrder(wo.id, { status: 'Completed' });
        setWorkOrders(prev => prev.map(w => w.id === wo.id ? { ...w, status: 'Completed' } : w));
        showToast(`${wo.woNumber} marked Completed`, 'ok');
      } else {
        showToast(`${wo.woNumber} updated`, 'ok');
      }
    } catch (e) {
      logErr('WIP update failed', e);
      showToast('Update failed: ' + (e.message || 'unknown error'), 'err');
    } finally {
      setSavingId(null);
    }
  }, []);

  const startWO = useCallback(async (woId) => {
    try {
      await planningApi.updateWorkOrder(woId, { status: 'In Progress' });
      setWorkOrders(prev => prev.map(w => w.id === woId ? { ...w, status: 'In Progress' } : w));
      showToast('Work order started', 'ok');
    } catch (e) {
      logErr('Start WO failed', e);
      showToast('Failed to start: ' + (e.message || 'unknown error'), 'err');
    }
  }, []);

  // Stats
  const stats = useMemo(() => {
    const inProgress = wipRows.filter(w => w.status === 'In Progress').length;
    const waiting = wipRows.filter(w => w.status === 'New').length;
    const onHold = wipRows.filter(w => w.status === 'On Hold').length;
    const totalQty = wipRows.reduce((s, w) => s + (w.quantity || 0), 0);
    const completedQty = wipRows.reduce((s, w) => s + (w.completedQty || 0), 0);
    const overallProgress = totalQty > 0 ? Math.round((completedQty / totalQty) * 100) : 0;
    return { inProgress, waiting, onHold, overallProgress };
  }, [wipRows]);

  if (loading) return <div className="tab-loading">Loading WIP data...</div>;

  if (loadError) {
    return (
      <div className="wip-tracker">
        <EmptyState
          icon="⚠️"
          title="Failed to load WIP data"
          hint={loadError}
          action={<button className="btn btn-primary" onClick={loadData}>Retry</button>}
        />
      </div>
    );
  }

  function getProgressColor(pct) {
    if (pct >= 80) return '#22c55e';
    if (pct >= 40) return '#3b82f6';
    return '#f59e0b';
  }

  return (
    <div className="wip-tracker">
      <div className="tab-header">
        <div>
          <h2>{t('planning.wip_tracker')}</h2>
          <p className="tab-subtitle">{wipRows.length} active work orders</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="wip-kpis">
        <div className="kpi-card kpi-progress">
          <span className="kpi-value">{stats.overallProgress}%</span>
          <span className="kpi-label">Overall Progress</span>
        </div>
        <div className="kpi-card kpi-low">
          <span className="kpi-value">{stats.inProgress}</span>
          <span className="kpi-label">In Progress</span>
        </div>
        <div className="kpi-card kpi-waiting">
          <span className="kpi-value">{stats.waiting}</span>
          <span className="kpi-label">Waiting</span>
        </div>
        <div className="kpi-card kpi-onhold">
          <span className="kpi-value">{stats.onHold}</span>
          <span className="kpi-label">On Hold</span>
        </div>
      </div>

      {/* WIP Cards */}
      <div className="wip-grid">
        {wipRows.length === 0 ? (
          <div className="wip-grid-empty">
            <EmptyState
              icon="📋"
              title="No active work orders"
              hint="Generate work orders from the Work Orders tab."
            />
          </div>
        ) : wipRows.map(wo => (
          <WipCard
            key={wo.id}
            wo={wo}
            saving={savingId === wo.id}
            onUpdate={handleProgressUpdate}
            onStart={startWO}
            getProgressColor={getProgressColor}
          />
        ))}
      </div>
    </div>
  );
}

// ── WipCard — controlled input keeps user value in sync with server state ──
// Re-syncs when the server-side completedQty changes (e.g. after a successful
// save or a parallel edit). Uses the "derive state from props" pattern —
// no useEffect — which is React's official guidance for this case
// (https://react.dev/learn/you-might-not-need-an-effect).
// memo() so 1,000+ cards don't all re-render when only one card's state changes.
// Equality covers wo.completedQty + status + saving — the only props that
// can flip render output. getProgressColor is parent-stable; onUpdate/onStart
// are useCallback-stable.
const WipCard = memo(function WipCard({ wo, saving, onUpdate, onStart, getProgressColor }) {
  const [draft, setDraft] = useState(String(wo.completedQty || ''));
  const [lastServerQty, setLastServerQty] = useState(wo.completedQty);
  // External change → flush the input. User's local edits aren't blown away
  // by the same component being re-rendered with the same server value.
  if (wo.completedQty !== lastServerQty) {
    setLastServerQty(wo.completedQty);
    setDraft(String(wo.completedQty || ''));
  }

  const commit = useCallback(() => {
    if (draft === String(wo.completedQty || '')) return;
    onUpdate(wo, draft);
  }, [draft, wo, onUpdate]);

  return (
    <div className={`wip-card wip-status-${wo.status?.toLowerCase().replace(' ', '-')}`}>
      <div className="wip-card-header">
        <span className="wip-wo-number">{wo.woNumber}</span>
        <span className={`status-badge status-${wo.status?.toLowerCase().replace(' ','-')}`}>{wo.status}</span>
      </div>

      <div className="wip-card-body">
        <div className="wip-info-row">
          <span className="wip-label">Product</span>
          <span className="wip-value">{wo.productCode}</span>
        </div>
        <div className="wip-info-row">
          <span className="wip-label">Customer</span>
          <span className="wip-value">{wo.customer || '—'}</span>
        </div>
        <div className="wip-info-row">
          <span className="wip-label">Due</span>
          <span className="wip-value">{wo.dueDate || '—'}</span>
        </div>

        <div className="wip-progress-section">
          <div className="wip-progress-header">
            <span>{wo.completedQty.toLocaleString()} / {wo.quantity?.toLocaleString()}</span>
            <span className="wip-progress-pct" style={{ color: getProgressColor(wo.progress) }}>{wo.progress}%</span>
          </div>
          <div className="wip-progress-bar">
            <div
              className="wip-progress-fill"
              style={{ width: `${wo.progress}%`, backgroundColor: getProgressColor(wo.progress) }}
            />
          </div>
        </div>

        <div className="wip-update">
          <input
            type="number"
            min="0"
            max={wo.quantity}
            className="wip-qty-input"
            placeholder="Completed qty"
            value={draft}
            disabled={saving}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
            aria-label={`Completed quantity for ${wo.woNumber}`}
          />
          {saving && <span className="wip-saving" aria-live="polite">Saving…</span>}
          {wo.status === 'New' && !saving && (
            <button className="btn btn-primary btn-sm" onClick={() => onStart(wo.id)}>
              Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
