/**
 * LibMfg — Manufacturing Structures Browser
 *
 * Column keys match the verbatim CSV headers written to the server by the
 * /api/import-wizard endpoints. The server stores {headers, rows} and
 * hydrates rows into objects keyed by the original header strings (see
 * server/services/dataSync.js → parseJsDataFile). That's why the keys here
 * are string-literal header names with spaces, not camelCase.
 */
import { useCallback, useState } from 'react';
import { sharedApi, importApi } from '../../../services/api';
import DataBrowser from '../../../components/Shared/DataBrowser';
import ImportWizard from '../../../components/Shared/ImportWizard';
import { useCachedFetch, invalidateCache } from '../../../hooks/useCachedFetch';

const COLUMNS = [
  { key: 'Parent Part No', label: 'Parent Part' },
  { key: 'Parent Part Description', label: 'Parent Description' },
  { key: 'Component Part', label: 'Component Part' },
  { key: 'Component Part Description', label: 'Component Description' },
  {
    key: 'Qty Per Assembly',
    label: 'Qty/Assembly',
    format: (v) =>
      v == null || v === ''
        ? '—'
        : Number(v)
            .toFixed(6)
            .replace(/\.?0+$/, ''),
  },
  { key: 'UOM', label: 'UOM' },
  {
    key: 'Component Scrap',
    label: 'Scrap',
    format: (v) =>
      v == null || v === ''
        ? '—'
        : Number(v)
            .toFixed(5)
            .replace(/\.?0+$/, ''),
  },
  {
    key: 'Scrap Factor (%)',
    label: 'Scrap %',
    format: (v) => (v == null || v === '' ? '—' : `${Number(v)}%`),
  },
  { key: 'Pitch', label: 'Pitch' },
  { key: 'Cavity', label: 'Cavity' },
  { key: 'Color Nums', label: 'Colors' },
  { key: 'Structure Type', label: 'Structure Type' },
  { key: 'Alternative No', label: 'Alt' },
  { key: 'Structure Effectivity', label: 'Effectivity' },
  { key: 'Planner', label: 'Planner' },
];

export default function LibMfg() {
  // Sprint 1.7h Phase 2 — SWR cache. First visit = network fetch (the
  // 6 MB BOM hits the wire); every subsequent tab switch in the same
  // session returns the cached array INSTANTLY + revalidates in the
  // background. Phase 1 ETag means revalidation is a 304 (~5ms) when
  // upstream hasn't changed.
  const { data: bomData, refresh: reloadBom } = useCachedFetch('lib-mfg-bom', () =>
    sharedApi.getBOM()
  );
  const data = Array.isArray(bomData) ? bomData : [];
  const loading = bomData == null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleWizardCommitted = useCallback(async () => {
    await sharedApi.refreshCache().catch(() => {});
    invalidateCache('lib-mfg-bom');
    await reloadBom();
  }, [reloadBom]);

  const handleClear = useCallback(async () => {
    if (
      !window.confirm(
        'Clear all Manufacturing Structures data? The current file will be backed up first.'
      )
    )
      return;
    setBusy(true);
    setMsg('Clearing…');
    try {
      await importApi.clearBom();
      await sharedApi.refreshCache().catch(() => {});
      invalidateCache('lib-mfg-bom');
      await reloadBom();
      setMsg('Data cleared');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error('Clear failed:', err);
      setMsg('Clear failed: ' + (err.message || 'Unknown error'));
      setTimeout(() => setMsg(''), 5000);
    } finally {
      setBusy(false);
    }
  }, [reloadBom]);

  const importSlot = (
    <>
      <button
        className="db-col-btn db-btn-primary"
        onClick={() => setWizardOpen(true)}
        disabled={busy}
        title="Import manufacturing structures from CSV or XLSX (preview before commit)"
      >
        {'⬆ Import…'}
      </button>
      <button
        className="db-col-btn db-btn-danger"
        onClick={handleClear}
        disabled={busy}
        title="Clear all Manufacturing Structures data (backup kept)"
      >
        {'🗑 Clear Data'}
      </button>
      {msg && <span className="db-toolbar-msg">{msg}</span>}
    </>
  );

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        Loading Manufacturing Structures...
      </div>
    );
  }

  const mfgIcon = (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 20h20" />
      <path d="M4 20V9l6-4v15" />
      <path d="M14 20V10l6 4v6" />
      <path d="M7 12h.01M7 16h.01M17 17h.01" />
    </svg>
  );

  return (
    <>
      <DataBrowser
        title="Manufacturing Structures"
        icon={mfgIcon}
        data={data}
        columns={COLUMNS}
        lsKey="ops-lib-mfg-cols"
        accentColor="#0f62fe"
        toolbarExtras={importSlot}
      />
      <ImportWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        datasetKey="bom"
        datasetLabel="Manufacturing Structures (BOM)"
        onCommitted={handleWizardCommitted}
      />
    </>
  );
}
