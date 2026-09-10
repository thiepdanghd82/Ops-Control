/**
 * ImportDialog — multi-target IFS data file upload (inventory, finished
 * goods, raw materials, BOM, routing). Migrated to the shared Modal
 * primitive in the 2026-04-24 modal-design refresh.
 */
import { useState, useRef } from 'react';
import Modal from './Modal';
import './ImportDialog.css';

const IMPORT_TARGETS = {
  inventory: { label: 'IFS Inventory (Full)', endpoint: '/api/import/inventory', icon: '📊' },
  finishedGoods: { label: 'Finished Goods', endpoint: '/api/import/finished-goods', icon: '📦' },
  // Raw Materials retired 2026-06-25 — import via Material Cost › IFS Materials.
  bom: { label: 'Manufacturing Structures (BOM)', endpoint: '/api/import/bom', icon: '⚙️' },
  routing: { label: 'Routing Operations', endpoint: '/api/import/routing', icon: '🔄' },
};

export default function ImportDialog({ isOpen, onClose, onImportComplete }) {
  const [target, setTarget] = useState('inventory');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  async function handleUpload() {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`);
      return;
    }
    setUploading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('ops_token');
      const res = await fetch(IMPORT_TARGETS[target].endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) setError(data.error || 'Import failed');
      else {
        setResult(data);
        onImportComplete?.(target, data);
      }
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleClose() {
    setFile(null);
    setResult(null);
    setError('');
    onClose();
  }

  return (
    <Modal open={isOpen} onClose={handleClose} size="md" ariaLabelledBy="import-title">
      <Modal.Header
        id="import-title"
        title="Import IFS Data"
        subtitle="CSV or Excel — max 50 MB per file"
        severity="info"
      />

      <Modal.Body>
        {/* Target selection */}
        <div className="import-section">
          <label className="import-label">Data Type</label>
          <div className="import-targets">
            {Object.entries(IMPORT_TARGETS).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                className={`import-target ${target === key ? 'active' : ''}`}
                onClick={() => {
                  setTarget(key);
                  setResult(null);
                  setError('');
                }}
              >
                <span className="target-icon">{cfg.icon}</span>
                <span className="target-label">{cfg.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* File upload */}
        <div className="import-section">
          <label className="import-label">File</label>
          <div
            className={`import-dropzone ${file ? 'has-file' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('drag-over');
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('drag-over');
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files[0])}
              style={{ display: 'none' }}
            />
            {file ? (
              <div className="file-info">
                <span className="file-icon">📄</span>
                <div>
                  <div className="file-name">{file.name}</div>
                  <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
                </div>
                <button
                  type="button"
                  className="file-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  aria-label="Remove selected file"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="dropzone-text">
                <span className="dropzone-icon">📂</span>
                <p>Click to browse or drag &amp; drop</p>
                <p className="dropzone-hint">.csv, .xlsx, .xls — max 50MB</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="import-error" role="alert">
            <span aria-hidden>❌</span> {error}
          </div>
        )}

        {result && (
          <div className="import-success" role="status">
            <div>
              <span aria-hidden>✅</span> Imported successfully
            </div>
            <div className="import-stats">
              <span>{result.stats?.headers} columns</span>
              <span>•</span>
              <span>{result.stats?.rows?.toLocaleString()} rows</span>
              {result.stats?.backup && <span>• Backup: {result.stats.backup}</span>}
            </div>
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <button type="button" className="op-btn op-btn-ghost" onClick={handleClose}>
          Cancel
        </button>
        <button
          type="button"
          className="op-btn op-btn-primary"
          disabled={!file || uploading}
          onClick={handleUpload}
        >
          {uploading ? 'Importing…' : `Import ${IMPORT_TARGETS[target].label}`}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
