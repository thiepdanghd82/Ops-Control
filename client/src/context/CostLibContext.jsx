/* eslint-disable react-refresh/only-export-components --
   Co-locates CostLibProvider with the `useCostLib` hook. See CalcContext
   for rationale — splitting is not worth the churn. */
/**
 * CostLibContext — loads and caches all library data (rate, DDL, materials, finance, inkCalc)
 * Replaces the global LIB object from COST V1.0.
 * Provides site-switching and helper functions.
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { sharedApi } from '../services/api';

const CostLibContext = createContext(null);
export { CostLibContext };

export function useCostLib() {
  const ctx = useContext(CostLibContext);
  if (!ctx) throw new Error('useCostLib must be used within CostLibProvider');
  return ctx;
}

export function CostLibProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSite, setActiveSite] = useState('VN');

  // Raw data from server
  const [rawRates, setRawRates] = useState({ rateSites: {}, rate: [] });
  const [rawDDL, setRawDDL] = useState({ ddlSites: {}, ddl: {} });
  const [materials, setMaterials] = useState({ matDB: [], npiDB: [], sourcingDB: [] });
  const [finance, setFinance] = useState({ wc: [], summary: {}, years: {} });
  const [inkCalc, setInkCalc] = useState({});
  // Phase 10M — Raw Materials from IFS Inventory. Loaded here (was
  // previously scoped to IFSInventory.jsx only) so the right-click
  // material picker in Std/Complex can search it alongside NPI and
  // Sourcing DB. Shape: Array<{ "Part No", "Part Description",
  // "Supplier ID", Price, "Price Unit Measure", ... }>.
  const [rawMaterials, setRawMaterials] = useState([]);

  // In-flight controller for the parallel lib-load. A new loadAll() —
  // e.g. `refreshLib()` after a Settings edit, or Strict-Mode double
  // mount in dev — aborts the previous batch so a slow response can't
  // overwrite freshly-saved data and the provider never setState's
  // after unmount.
  const abortRef = useRef(null);

  const loadAll = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const signal = ctrl.signal;
    setLoading(true);
    setError(null);
    try {
      const [ratesData, ddlData, matData, finData, inkData, invData] = await Promise.all([
        sharedApi.getRates({ signal }),
        sharedApi.getDDL({ signal }),
        sharedApi.getMaterials({ signal }),
        sharedApi.getFinance({ signal }),
        sharedApi.getInkCalc({ signal }),
        sharedApi.getInventory({ signal }).catch((e) => {
          // AbortError propagates so the outer catch handles it; other
          // inventory failures degrade to empty rawMaterials (optional
          // data — the picker still works with NPI + Sourcing DB).
          if (e?.name === 'AbortError') throw e;
          return { rawMaterials: [] };
        }),
      ]);
      if (signal.aborted) return;
      setRawRates(ratesData);
      setRawDDL(ddlData);
      setMaterials(matData);
      setFinance(finData);
      setInkCalc(inkData);
      setRawMaterials(Array.isArray(invData?.rawMaterials) ? invData.rawMaterials : []);
    } catch (err) {
      // AbortError = superseded by a newer loadAll() or the provider
      // unmounted. Not a real failure — silent.
      if (err?.name === 'AbortError') return;
      console.error('CostLibContext: failed to load library data', err);
      setError(err.message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    return () => abortRef.current?.abort();
  }, [loadAll]);

  // Apply site-specific rate & DDL (mirrors applySiteLibrary from COST V1.0)
  const lib = useMemo(() => {
    const s = activeSite || 'VN';

    // Rate: use site-specific if available, fallback to VN, then default
    let rate = rawRates.rate || [];
    if (rawRates.rateSites && rawRates.rateSites[s] && Array.isArray(rawRates.rateSites[s]) && rawRates.rateSites[s].length > 0) {
      rate = rawRates.rateSites[s];
    } else if (rawRates.rateSites && rawRates.rateSites['VN']) {
      rate = rawRates.rateSites['VN'];
    }

    // DDL: use site-specific if available, fallback to VN, then default
    let ddl = rawDDL.ddl || {};
    if (rawDDL.ddlSites && rawDDL.ddlSites[s] && typeof rawDDL.ddlSites[s] === 'object' && Array.isArray(rawDDL.ddlSites[s].trade_mode)) {
      ddl = rawDDL.ddlSites[s];
    } else if (rawDDL.ddlSites && rawDDL.ddlSites['VN']) {
      ddl = rawDDL.ddlSites['VN'];
    }

    return {
      rate,
      ddl,
      rateSites: rawRates.rateSites || {},
      ddlSites: rawDDL.ddlSites || {},
      mat: materials.matDB || [],
      npi: materials.npiDB || [],
      sourcing: materials.sourcingDB || [],
      rawMaterials, // Phase 10M — IFS inventory raw materials library
      finance,
      financeWC: finance.wc || [],
      financeSum: finance.summary || {},
      inkCalc,
    };
  }, [activeSite, rawRates, rawDDL, materials, finance, inkCalc, rawMaterials]);

  // Helper functions matching COST V1.0 global helpers
  const getRateByWC = useCallback((wc) => {
    return (lib.rate || []).find(r => r.workcenter === wc) || null;
  }, [lib.rate]);

  const getToolLife = useCallback((toolType) => {
    return (lib.ddl && lib.ddl.tool_life) ? (lib.ddl.tool_life[toolType] || 0) : 0;
  }, [lib.ddl]);

  const getMatByCode = useCallback((code) => {
    if (!code) return null;
    const c = String(code).trim().toLowerCase();
    return (lib.mat || []).find(m => String(m.code).trim().toLowerCase() === c) || null;
  }, [lib.mat]);

  const getAllWorkcenters = useCallback(() => {
    return (lib.rate || []).filter(r => r.machine_rate > 0 || r.labor_rate > 0).map(r => r.workcenter);
  }, [lib.rate]);

  const value = useMemo(() => ({
    lib,
    loading,
    error,
    activeSite,
    setActiveSite,
    getRateByWC,
    getToolLife,
    getMatByCode,
    getAllWorkcenters,
    refreshLib: loadAll,
    // Expose raw data for Settings/editor tabs
    rawRates,
    rawDDL,
    materials,
    finance,
    inkCalc,
    // Local setters so editor tabs can commit directly to engine data
    // without having to refetch from the server after a save.
    setRawRates,
    setRawDDL,
    setMaterials,
    setFinance,
    setInkCalc,
  }), [lib, loading, error, activeSite, getRateByWC, getToolLife, getMatByCode, getAllWorkcenters, loadAll, rawRates, rawDDL, materials, finance, inkCalc]);

  return (
    <CostLibContext.Provider value={value}>
      {children}
    </CostLibContext.Provider>
  );
}
