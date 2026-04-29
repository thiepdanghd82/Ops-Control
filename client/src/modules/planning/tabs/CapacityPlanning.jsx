import { useState, useEffect, useMemo, useCallback } from 'react';
import { planningApi, sharedApi } from '../../../services/api';
import { useI18n } from '../../../utils/useI18n';
import { getField, getNumField } from '../../../utils/fieldMap';
import { err as logErr } from '../../../utils/logger';
import EmptyState from '../../../components/Shared/EmptyState';
import './CapacityPlanning.css';

const DEFAULT_WEEKLY_CAPACITY = 48; // 8h/day * 6 days fallback when finance hrs missing
const WEEKS_PER_YEAR = 52;

export default function CapacityPlanning() {
  const { t } = useI18n();
  const [workCenters, setWorkCenters] = useState([]);
  const [routing, setRouting] = useState([]);
  const [orders, setOrders] = useState([]);
  const [wcCapacity, setWcCapacity] = useState({}); // workcenter -> weekly hours
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedWC, setSelectedWC] = useState('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [, wcRes, routingRes, ordersRes, financeRes] = await Promise.all([
        planningApi.getWorkOrders(), // fire-and-forget warm-up; result not consumed
        sharedApi.getWorkCenters(),
        sharedApi.getRouting(),
        planningApi.getOrders(),
        sharedApi.getFinance().catch(() => null)
      ]);
      setWorkCenters(wcRes);
      setRouting(routingRes);
      setOrders(ordersRes);

      // Build per-work-center capacity from finance data (hrs field = annual available hours).
      // Annual → weekly conversion uses 52 working weeks; short-year periods (Q1, Jan, etc.)
      // are not modelled here — operators should rely on the headline banner if finance data
      // is missing entirely.
      const capMap = {};
      const finWC = financeRes?.financeWC || financeRes?.finance_wc || [];
      if (Array.isArray(finWC)) {
        finWC.forEach(wc => {
          const name = wc.w || wc.workcenter || '';
          const annualHrs = parseFloat(wc.hrs || 0);
          if (name && annualHrs > 0) {
            capMap[name] = Math.round((annualHrs / WEEKS_PER_YEAR) * 10) / 10;
          }
        });
      }
      setWcCapacity(capMap);
    } catch (e) {
      logErr('CapacityPlanning load failed', e);
      setLoadError(e.message || 'Failed to load capacity data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Calculate utilization per work center
  const utilization = useMemo(() => {
    const wcMap = {};
    const activeOrders = orders.filter(o => o.status === 'Planned' || o.status === 'Released' || o.status === 'In Progress');

    // Initialize work centers with per-WC capacity (from finance data or default)
    workCenters.forEach(wc => {
      wcMap[wc] = {
        name: wc,
        scheduledHours: 0,
        capacity: wcCapacity[wc] || DEFAULT_WEEKLY_CAPACITY,
        orders: []
      };
    });

    // Calculate hours from routing
    activeOrders.forEach(order => {
      const ops = routing.filter(r =>
        getField(r, 'partNo') === order.productCode
      );
      ops.forEach(op => {
        const wc = getField(op, 'workCenter');
        const setupHrs = getNumField(op, 'setupTime');
        const runFactor = getNumField(op, 'runFactor');
        const runHrs = runFactor > 0 ? order.quantity / runFactor : 0;

        if (wc && wcMap[wc]) {
          wcMap[wc].scheduledHours += setupHrs + runHrs;
          wcMap[wc].orders.push({
            orderId: order.id,
            productCode: order.productCode,
            hours: Math.round((setupHrs + runHrs) * 100) / 100
          });
        }
      });
    });

    return Object.values(wcMap)
      .map(wc => ({
        ...wc,
        scheduledHours: Math.round(wc.scheduledHours * 100) / 100,
        utilization: Math.round((wc.scheduledHours / wc.capacity) * 100)
      }))
      .sort((a, b) => b.utilization - a.utilization);
  }, [workCenters, routing, orders, wcCapacity]);

  const filtered = selectedWC === 'all'
    ? utilization
    : utilization.filter(u => u.name === selectedWC);

  // Stats
  const avgUtil = useMemo(() => {
    const active = utilization.filter(u => u.scheduledHours > 0);
    if (active.length === 0) return 0;
    return Math.round(active.reduce((s, u) => s + u.utilization, 0) / active.length);
  }, [utilization]);

  const overloaded = utilization.filter(u => u.utilization > 85).length;
  const idle = utilization.filter(u => u.scheduledHours === 0).length;

  if (loading) return <div className="tab-loading">Loading capacity data...</div>;

  if (loadError) {
    return (
      <div className="capacity-planning">
        <EmptyState
          icon="⚠️"
          title="Failed to load capacity data"
          hint={loadError}
          action={<button className="btn btn-primary" onClick={loadData}>Retry</button>}
        />
      </div>
    );
  }

  // Banner shown when finance data is missing — operators must know the
  // displayed numbers fall back to a default 48h/week per WC, not the
  // tuned annual hours from finance.
  const usingFallback = Object.keys(wcCapacity).length === 0;

  function getBarColor(pct) {
    if (pct > 85) return '#ef4444';
    if (pct > 70) return '#f59e0b';
    return '#22c55e';
  }

  return (
    <div className="capacity-planning">
      <div className="tab-header">
        <div>
          <h2>{t('planning.capacity_planning')}</h2>
          <p className="tab-subtitle">Weekly view &bull; {usingFallback ? `Fallback ${DEFAULT_WEEKLY_CAPACITY}h/week (no finance data)` : 'Per-WC capacity from finance data'}</p>
        </div>
        <div className="tab-actions">
          <select
            className="wc-filter"
            value={selectedWC}
            onChange={e => setSelectedWC(e.target.value)}
            aria-label="Filter by work center"
          >
            <option value="all">All Work Centers</option>
            {workCenters.map(wc => (
              <option key={wc} value={wc}>{wc}</option>
            ))}
          </select>
        </div>
      </div>

      {usingFallback && (
        <div className="cap-fallback-banner" role="alert">
          ⚠ Finance work-center hours unavailable — every WC is using the default {DEFAULT_WEEKLY_CAPACITY}h/week.
          Utilization figures below are approximate; configure finance hours in <strong>Library &rarr; Finance</strong> for accurate numbers.
        </div>
      )}

      {/* KPIs */}
      <div className="cap-kpis">
        <div className="kpi-card kpi-total">
          <span className="kpi-value">{avgUtil}%</span>
          <span className="kpi-label">Avg Utilization</span>
        </div>
        <div className="kpi-card kpi-ok">
          <span className="kpi-value">{utilization.filter(u => u.scheduledHours > 0 && u.utilization <= 85).length}</span>
          <span className="kpi-label">Normal</span>
        </div>
        <div className="kpi-card kpi-shortage">
          <span className="kpi-value">{overloaded}</span>
          <span className="kpi-label">Overloaded (&gt;85%)</span>
        </div>
        <div className="kpi-card kpi-idle">
          <span className="kpi-value">{idle}</span>
          <span className="kpi-label">Idle</span>
        </div>
      </div>

      {/* Capacity Bars */}
      <div className="cap-chart">
        {filtered.length === 0 ? (
          <EmptyState icon="🏭" title="No work centers found" hint="Configure work centers in Library to see capacity." />
        ) : filtered.map(wc => (
          <div key={wc.name} className="cap-row">
            <div className="cap-label">
              <span className="cap-wc-name">{wc.name}</span>
              <span className="cap-hours">{wc.scheduledHours}h / {wc.capacity}h</span>
            </div>
            <div className="cap-bar-container">
              <div
                className="cap-bar-fill"
                style={{
                  width: `${Math.min(100, wc.utilization)}%`,
                  backgroundColor: getBarColor(wc.utilization)
                }}
              />
              {wc.utilization > 100 && (
                <div
                  className="cap-bar-overflow"
                  style={{ width: `${Math.min(100, wc.utilization - 100)}%` }}
                />
              )}
            </div>
            <span className="cap-pct" style={{ color: getBarColor(wc.utilization) }}>
              {wc.utilization}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
