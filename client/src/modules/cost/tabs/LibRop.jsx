/**
 * LibRop — Routing Operations Browser
 *
 * Column keys match the verbatim CSV headers written by the wizard's
 * preview/commit pipeline. Server stores {headers, rows} and hydrates
 * into objects keyed by the original header strings, so the keys here
 * are string-literal header names with spaces (not camelCase).
 */
import { useCallback, useState } from 'react';
import { sharedApi, importApi } from '../../../services/api';
import DataBrowser from '../../../components/Shared/DataBrowser';
import ImportWizard from '../../../components/Shared/ImportWizard';
import { useCachedFetch, invalidateCache } from '../../../hooks/useCachedFetch';

const COLUMNS = [
  { key: 'Part No', label: 'Part No' },
  { key: 'Part Description', label: 'Part Description' },
  { key: 'Operation No', label: 'Op No' },
  { key: 'Operation Description', label: 'Operation' },
  { key: 'Work Centre No', label: 'Work Center' },
  { key: 'Work Centre Desc', label: 'WC Description' },
  { key: 'Mach Setup Time', label: 'Mach Setup', format: v => (v == null || v === '') ? '—' : Number(v).toFixed(5).replace(/\.?0+$/, '') },
  { key: 'Labour Setup Time', label: 'Labor Setup', format: v => (v == null || v === '') ? '—' : Number(v).toFixed(5).replace(/\.?0+$/, '') },
  { key: 'Mach Run Factor', label: 'Mach Run', format: v => (v == null || v === '') ? '—' : Number(v).toFixed(5).replace(/\.?0+$/, '') },
  { key: 'Labour Run Factor', label: 'Labor Run', format: v => (v == null || v === '') ? '—' : Number(v).toFixed(5).replace(/\.?0+$/, '') },
  { key: 'Factor Unit', label: 'Unit' },
  { key: 'Crew Size', label: 'Crew' },
  { key: 'Setup Crew Size', label: 'Setup Crew' },
  { key: 'Labour Class', label: 'Labor Class' },
  { key: 'Alternative', label: 'Alt' },
  { key: 'Routing Effectivity', label: 'Effectivity' },
  { key: 'Efficiency Factor', label: 'Efficiency' },
  { key: 'Site', label: 'Site' },
  { key: 'Routing Type', label: 'Routing Type' },
];

export default function LibRop() {
  // Sprint 1.7h Phase 2 — SWR cache. Routing Ops is the heaviest tab
  // at 16 MB; first visit unavoidably hits the wire, repeat visits are
  // instant from in-memory cache + background revalidate (304 if no
  // server change).
  const { data: routingData, refresh: reloadRouting } = useCachedFetch(
    'lib-rop-routing',
    () => sharedApi.getRouting(),
  );
  const data = Array.isArray(routingData) ? routingData : [];
  const loading = routingData == null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleWizardCommitted = useCallback(async () => {
    await sharedApi.refreshCache().catch(() => {});
    invalidateCache('lib-rop-routing');
    await reloadRouting();
  }, [reloadRouting]);

  const handleClear = useCallback(async () => {
    if (!window.confirm('Clear all Routing Operations data? The current file will be backed up first.')) return;
    setBusy(true);
    setMsg('Clearing…');
    try {
      await importApi.clearRouting();
      await sharedApi.refreshCache().catch(() => {});
      invalidateCache('lib-rop-routing');
      await reloadRouting();
      setMsg('Data cleared');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error('Clear failed:', err);
      setMsg('Clear failed: ' + (err.message || 'Unknown error'));
      setTimeout(() => setMsg(''), 5000);
    } finally {
      setBusy(false);
    }
  }, [reloadRouting]);

  const importSlot = (
    <>
      <button
        className="db-col-btn db-btn-primary"
        onClick={() => setWizardOpen(true)}
        disabled={busy}
        title="Import routing operations from CSV or XLSX (preview before commit)"
      >
        {'⬆ Import…'}
      </button>
      <button
        className="db-col-btn db-btn-danger"
        onClick={handleClear}
        disabled={busy}
        title="Clear all Routing Operations data (backup kept)"
      >
        {'🗑 Clear Data'}
      </button>
      {msg && <span className="db-toolbar-msg">{msg}</span>}
    </>
  );

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading Routing Operations...</div>;
  }

  const ropIcon = (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.09a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.09a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  );

  return (
    <>
      <DataBrowser
        title="Routing Operations"
        icon={ropIcon}
        data={data}
        columns={COLUMNS}
        lsKey="ops-lib-rop-cols"
        accentColor="#0f62fe"
        toolbarExtras={importSlot}
      />
      <ImportWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        datasetKey="routing"
        datasetLabel="Routing Operations"
        onCommitted={handleWizardCommitted}
      />
    </>
  );
}
