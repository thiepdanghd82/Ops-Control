import { useState, useEffect, useMemo, useCallback } from 'react';
import { planningApi, sharedApi } from '../../../services/api';
import { useI18n } from '../../../utils/useI18n';
import { getField, getNumField } from '../../../utils/fieldMap';
import { err as logErr } from '../../../utils/logger';
import EmptyState from '../../../components/Shared/EmptyState';
import './MaterialCheck.css';

export default function MaterialCheck() {
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [bomData, setBomData] = useState([]);
  const [inventory, setInventory] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'shortage' | 'low' | 'over' | 'ok'
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [ordersRes, bomRes, invRes] = await Promise.all([
        planningApi.getOrders(),
        sharedApi.getBOM(),
        sharedApi.getInventory()
      ]);
      setOrders(ordersRes.filter(o => o.status !== 'Completed'));
      setBomData(bomRes);

      const invMap = {};
      const allParts = [...(invRes.inventory || []), ...(invRes.rawMaterials || []), ...(invRes.finishedGoods || [])];
      allParts.forEach(p => {
        const partNo = getField(p, 'partNo');
        const qty = getNumField(p, 'qtyOnHand');
        if (partNo) invMap[partNo] = (invMap[partNo] || 0) + qty;
      });
      setInventory(invMap);
    } catch (e) {
      logErr('MaterialCheck load failed', e);
      setLoadError(e.message || 'Failed to load material data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Consolidated material requirements.
  // BUG FIX: previously coverage was clamped at 100 %, hiding excess inventory.
  // Real coverage is now reported (can exceed 100); the visual bar is the only
  // thing that's clamped to 100 % so it doesn't overflow the cell.
  const materials = useMemo(() => {
    const map = {};
    orders.forEach(order => {
      // String-coerce — IFS Part Nos export as numbers, productCode is
      // always a string (CLAUDE.md lesson #21).
      const targetPn = String(order.productCode);
      const components = bomData.filter(b =>
        String(getField(b, 'parentPartNo')) === targetPn
      );
      components.forEach(comp => {
        const partNo = getField(comp, 'componentPart');
        const qtyPer = getNumField(comp, 'qtyPerAssembly', 1);
        const scrapPct = getNumField(comp, 'componentScrap') / 100;
        const required = order.quantity * qtyPer * (1 + scrapPct);

        if (!map[partNo]) {
          map[partNo] = {
            partNo,
            description: getField(comp, 'componentDescription'),
            uom: getField(comp, 'uom', 'u'),
            totalRequired: 0,
            onHand: inventory[partNo] || 0,
            orderCount: 0
          };
        }
        map[partNo].totalRequired += required;
        map[partNo].orderCount++;
      });
    });

    return Object.values(map).map(item => {
      const shortage = Math.max(0, item.totalRequired - item.onHand);
      const coverageRaw = item.totalRequired > 0
        ? (item.onHand / item.totalRequired) * 100
        : (item.onHand > 0 ? 9999 : 100); // no demand + on-hand > 0 → effectively unlimited
      const coverage = Math.round(coverageRaw);
      let status;
      if (shortage > 0) status = 'Shortage';
      else if (coverage > 200) status = 'Over Stock';
      else if (item.onHand < item.totalRequired * 1.1) status = 'Low Stock';
      else status = 'OK';
      return {
        ...item,
        totalRequired: Math.round(item.totalRequired * 100) / 100,
        shortage: Math.round(shortage * 100) / 100,
        coverage,
        status,
      };
    }).sort((a, b) => a.coverage - b.coverage);
  }, [orders, bomData, inventory]);

  const filtered = useMemo(() => {
    let result = materials;
    if (filter === 'shortage') result = result.filter(m => m.status === 'Shortage');
    else if (filter === 'low') result = result.filter(m => m.status === 'Low Stock');
    else if (filter === 'ok') result = result.filter(m => m.status === 'OK');
    else if (filter === 'over') result = result.filter(m => m.status === 'Over Stock');

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(m =>
        (m.partNo || '').toLowerCase().includes(term) ||
        (m.description || '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [materials, filter, searchTerm]);

  const stats = useMemo(() => {
    const total = materials.length;
    const shortages = materials.filter(m => m.status === 'Shortage').length;
    const low = materials.filter(m => m.status === 'Low Stock').length;
    const ok = materials.filter(m => m.status === 'OK').length;
    const over = materials.filter(m => m.status === 'Over Stock').length;
    // Avg coverage clamped at 200% so a few excess parts don't skew the headline number.
    const avgCoverage = total > 0
      ? Math.round(materials.reduce((s, m) => s + Math.min(m.coverage, 200), 0) / total)
      : 100;
    return { total, shortages, low, ok, over, avgCoverage };
  }, [materials]);

  if (loading) return <div className="tab-loading">Loading material data...</div>;

  if (loadError) {
    return (
      <div className="material-check">
        <EmptyState
          icon="⚠️"
          title="Failed to load material data"
          hint={loadError}
          action={<button className="btn btn-primary" onClick={loadData}>Retry</button>}
        />
      </div>
    );
  }

  const kpiClass = (key) => `kpi-card mc-kpi-clickable ${filter === key ? 'mc-kpi-active' : ''}`;
  const setOrToggle = (key) => () => setFilter(filter === key ? 'all' : key);

  return (
    <div className="material-check">
      <div className="tab-header">
        <div>
          <h2>{t('planning.material_check')}</h2>
          <p className="tab-subtitle">
            Consolidated availability for {orders.length} active orders
          </p>
        </div>
      </div>

      <div className="mc-kpis">
        <div className="kpi-card kpi-total">
          <span className="kpi-value">{stats.avgCoverage}%</span>
          <span className="kpi-label">Avg Coverage</span>
        </div>
        <button className={kpiClass('ok') + ' kpi-ok'} onClick={setOrToggle('ok')} aria-pressed={filter === 'ok'}>
          <span className="kpi-value">{stats.ok}</span>
          <span className="kpi-label">OK</span>
        </button>
        <button className={kpiClass('low') + ' kpi-low'} onClick={setOrToggle('low')} aria-pressed={filter === 'low'}>
          <span className="kpi-value">{stats.low}</span>
          <span className="kpi-label">Low Stock</span>
        </button>
        <button className={kpiClass('shortage') + ' kpi-shortage'} onClick={setOrToggle('shortage')} aria-pressed={filter === 'shortage'}>
          <span className="kpi-value">{stats.shortages}</span>
          <span className="kpi-label">Shortage</span>
        </button>
        <button className={kpiClass('over') + ' kpi-over'} onClick={setOrToggle('over')} aria-pressed={filter === 'over'}>
          <span className="kpi-value">{stats.over}</span>
          <span className="kpi-label">Over Stock</span>
        </button>
      </div>

      <div className="mc-toolbar">
        <input
          type="text"
          placeholder="Search by part number or description..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="mc-search"
          aria-label="Search materials"
        />
        <span className="mc-count">{filtered.length} of {materials.length} materials</span>
      </div>

      <div className="orders-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Part No</th>
              <th>Description</th>
              <th>UOM</th>
              <th className="text-right">Required</th>
              <th className="text-right">On Hand</th>
              <th className="text-right">Shortage</th>
              <th>Coverage</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="8" className="mc-empty-cell">
                <EmptyState icon="🔍" title="No materials match" hint="Adjust the filter or clear the search." />
              </td></tr>
            ) : filtered.map((mat, i) => (
              <tr key={mat.partNo || `m-${i}`}>
                <td className="cell-code">{mat.partNo}</td>
                <td>{mat.description}</td>
                <td>{mat.uom}</td>
                <td className="text-right mono">{mat.totalRequired.toLocaleString()}</td>
                <td className="text-right mono">{mat.onHand.toLocaleString()}</td>
                <td className="text-right mono">{mat.shortage > 0 ? mat.shortage.toLocaleString() : '—'}</td>
                <td>
                  <div className="coverage-bar">
                    <div
                      className={`coverage-fill ${mat.coverage >= 200 ? 'over' : mat.coverage >= 100 ? 'full' : mat.coverage >= 70 ? 'mid' : 'low'}`}
                      style={{ width: `${Math.min(100, mat.coverage)}%` }}
                    />
                    <span className="coverage-text">{mat.coverage > 999 ? '∞' : `${mat.coverage}%`}</span>
                  </div>
                </td>
                <td><span className={`status-badge status-${mat.status.toLowerCase().replace(' ', '-')}`}>{mat.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
