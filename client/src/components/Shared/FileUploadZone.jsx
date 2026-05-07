/**
 * FileUploadZone — Shared drawing/file upload component.
 * Used in both Standard (CalcLayout) and Complex (SubProductRow) tabs.
 *
 * Features:
 *   - Drag & drop, paste (Ctrl+V), or browse to upload
 *   - Right-click menu: Open · Delete · Upload drawing
 *   - Double-click opens file in new browser tab
 *   - Mouse wheel zoom + drag-to-pan on image previews
 *   - Auto-names files as {Customer}_{EndCuPN}_{YYYY-MM-DD_HHmm}[suffix]
 *
 * Props:
 *   label        : string  — zone title ("Design Layout Drawing")
 *   file         : object  — { name, type, dataUrl } or null
 *   endCu        : string  — End customer (primary naming key)
 *   directCu     : string  — Direct customer (fallback if no end customer)
 *   endCuPn      : string  — End customer part number (primary PN key)
 *   cclPn        : string  — CCL PN fallback when endCuPn is blank
 *   nameSuffix   : string  — optional, e.g. "_cust" for customer drawing
 *   onFileChange : fn      — called with { name, type, dataUrl }
 *   onClear      : fn      — called to remove the file
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { costApi } from '../../services/api';
import Modal from './Modal';
import './FileUploadZone.css';

// PDF.js renderer — Electron 41's built-in Chromium PDF Viewer renders
// <embed type="application/pdf"> as blank inside the renderer process even
// with `plugins: true`, and Safari's WebKit refuses to paint <iframe>-PDF
// when an ancestor has CSS transform (Modal entrance animation triggers
// this). pdfjs-dist works on both surfaces because it renders to canvas
// in JS — no browser plugin involvement. Same loader pattern as
// services/printAreaCore.js.
let _pdfjsModule = null;
async function loadPdfjs() {
  if (_pdfjsModule) return _pdfjsModule;
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjsModule = pdfjs;
  return pdfjs;
}

function PdfCanvasPreview({ bytes, className, title }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    if (!bytes) return undefined;
    let cancelled = false;
    let pdfDoc = null;
    setStatus('loading');
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        // pdfjs mutates the buffer on parse — clone so a re-mount/HMR cycle
        // doesn't see a detached buffer the second time.
        const data = bytes.slice(0);
        if (cancelled) return;
        pdfDoc = await pdfjs.getDocument({ data, disableFontFace: false }).promise;
        if (cancelled || !containerRef.current) return;
        containerRef.current.replaceChildren();
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(i);
          const baseVp = page.getViewport({ scale: 1 });
          const containerW = containerRef.current.clientWidth || 800;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const scale = (containerW / baseVp.width) * dpr;
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = '100%';
          canvas.style.display = 'block';
          canvas.style.marginBottom = '8px';
          containerRef.current.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }
        if (!cancelled) setStatus('ready');
      } catch (e) {
        console.warn('[PdfCanvasPreview] render failed:', e);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      if (pdfDoc) pdfDoc.destroy();
    };
  }, [bytes]);
  return (
    <div className={className} style={{ overflow: 'auto', position: 'relative', background: '#f4f4f4' }} title={title}>
      <div ref={containerRef} />
      {status === 'loading' && (
        <div className="fuz-file-msg" style={{ position: 'absolute', top: 8, left: 8 }}>
          Rendering PDF…
        </div>
      )}
      {status === 'error' && (
        <div className="fuz-file-msg fuz-file-err" role="alert" style={{ padding: 16 }}>
          ⚠ Failed to render PDF. Use “Open in new window” instead.
        </div>
      )}
    </div>
  );
}

// ── Helpers ──
function normalizeFile(f) {
  if (!f) return null;
  if (typeof f === 'string') {
    const m = /^data:([^;]+);/i.exec(f);
    const mime = m ? m[1] : 'application/octet-stream';
    const ext = mime === 'application/pdf' ? '.pdf' : mime.startsWith('image/') ? '.' + mime.slice(6) : '';
    return { name: `legacy${ext}`, type: mime, dataUrl: f };
  }
  return f;
}

function extOf(name) {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// Build the auto-generated basename per spec:
//   {EndCustomer || DirectCustomer}_{EndCuPN || CclPN}_{YYYY-MM-DD_HHmm}[suffix]
// Strips filesystem-unfriendly characters. Stamped at upload time (not
// at mount) so re-uploading the same layout produces a fresh timestamp.
function sanitizePart(s) {
  return String(s || '').trim().replace(/[\s/\\:*?"<>|]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}
function buildServerBasename({ endCu, directCu, endCuPn, cclPn, nameSuffix }) {
  const cust = sanitizePart(endCu) || sanitizePart(directCu) || 'NoCustomer';
  const pn   = sanitizePart(endCuPn) || sanitizePart(cclPn) || 'NoPN';
  const d    = new Date();
  const pad  = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${cust}_${pn}_${stamp}${nameSuffix || ''}`;
}

export default function FileUploadZone({
  label, file: rawFile,
  endCu, directCu, endCuPn, cclPn, nameSuffix,
  onFileChange, onClear,
  collapsible = false, defaultCollapsed = true, storageKey,
}) {
  const inputRef = useRef(null);
  const viewportRef = useRef(null);
  const file = normalizeFile(rawFile);

  // Collapse state. Persisted per-storageKey so reopening the tab returns
  // the operator to their last choice. Default collapsed when the prop is
  // enabled — keeps the Layout tab's drawing zones folded out of the way
  // until the operator explicitly clicks the header to inspect.
  const collapseStorageKey = storageKey || (collapsible ? `fuz.collapsed.${label}` : '');
  const [collapsed, setCollapsed] = useState(() => {
    if (!collapsible) return false;
    if (!collapseStorageKey) return defaultCollapsed;
    try {
      const v = localStorage.getItem(collapseStorageKey);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch { /* localStorage unavailable */ }
    return defaultCollapsed;
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      if (collapseStorageKey) {
        try { localStorage.setItem(collapseStorageKey, next ? '1' : '0'); } catch { /* ignore */ }
      }
      return next;
    });
  }, [collapseStorageKey]);
  // Fall back to file-extension check when MIME type is missing/unset —
  // legacy saves or server-fetched files sometimes have empty `type`
  // even though the content is clearly an image. Without this fallback
  // the Rotate button silently disappears for valid image files.
  const isImage = !!(file && (
    file.type?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|heic|heif)$/i.test(file.name || '')
  ));
  const isPDF = file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
  const hasPreview = !!(file?.dataUrl);

  // ── Context menu ──
  const [ctxMenu, setCtxMenu] = useState(null);

  // ── Fullscreen modal ──
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // ── Blob URL ──
  // Browsers (Chrome 60+, Safari 14+) block `data:` URLs in `<iframe>` and
  // `window.open()` for security. Convert the base64 data URL to a Blob URL
  // once per file change — Blob URLs work in both contexts and only require
  // CSP `frame-src blob:` (which we set in server/index.js).
  // Without this fix: Customer Drawing PDF iframe is blank, "Open in new
  // window" produces a blank popup. F-DRAW-1 + F-DRAW-2.
  // Decoded once per file change; both the blob URL ("Open in new window")
  // and PdfCanvasPreview (PDF.js needs raw bytes — fetch(blob:) is blocked
  // by Electron's CSP `connect-src`) read from this.
  const pdfBytes = useMemo(() => {
    if (!file?.dataUrl || typeof file.dataUrl !== 'string') return null;
    const m = /^data:([^;]+);base64,(.+)$/.exec(file.dataUrl);
    if (!m) return null;
    try {
      const bin = atob(m[2]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return { bytes: arr, mime: m[1] };
    } catch {
      return null;
    }
  }, [file?.dataUrl]);
  const blobUrl = useMemo(() => {
    if (!pdfBytes) return '';
    return URL.createObjectURL(new Blob([pdfBytes.bytes], { type: pdfBytes.mime }));
  }, [pdfBytes]);
  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  // ── Zoom & Pan (image only) ──
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);  // deg: 0 | 90 | 180 | 270
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Reset zoom/pan/rotation when file changes. React 19's stricter rule
  // flags direct setState in effects; here the reset is the whole point
  // of the effect — rewriting via subscribe adds complexity for zero
  // behavior change. Consistent with AuthContext / useMyApprovalCount
  // pattern elsewhere in the codebase.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setRotation(0); }, [file?.name]);

  // ── Auto-fetch from server ──
  // Sprint 1.7 — the previous swallow-all `catch {}` masked every reason
  // a drawing failed to load (404 from over-zealous safeFn, 500 read
  // error, 401 stale session). The empty viewport that resulted gave
  // operators no clue why the drawing wasn't showing. Now: surface a
  // visible "Drawing not found on server" message in the empty state
  // when the lookup 404s, AND log other failures to the console so they
  // show up in client-error telemetry.
  const [fetchError, setFetchError] = useState(null);
  // Same "intentional sync setState in effect" pattern as the zoom/pan
  // reset above — the whole point of the effect is to wipe stale error
  // state when the file changes, so React 19's strict rule trips us.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!file || file.dataUrl || !file.name) { setFetchError(null); return; }
    let cancelled = false;
    setFetchError(null);
    (async () => {
      try {
        const json = await costApi.getLayout(file.name);
        if (cancelled) return;
        if (!json?.data) {
          setFetchError('Server returned no data for this drawing.');
          return;
        }
        const mime = json.mime || file.type || 'application/octet-stream';
        onFileChange({ name: file.name, type: mime, dataUrl: `data:${mime};base64,${json.data}` });
      } catch (err) {
        if (cancelled) return;
        const msg = err?.status === 404
          ? `Drawing "${file.name}" not found on the server. It may have been deleted or moved.`
          : `Failed to load drawing: ${err?.message || 'unknown error'}`;
        setFetchError(msg);
        if (err?.status !== 404) console.warn('[FileUploadZone] fetch failed:', file.name, err);
      }
    })();
    return () => { cancelled = true; };
  }, [file, onFileChange]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── File reading ──
  const readFile = useCallback((f) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      // Auto-name per customer spec: {Customer}_{EndCuPN}_{Date_Time}.
      // Uses new naming context when available, falls back to legacy
      // cclPn so loading old quotes still works.
      const basename = buildServerBasename({ endCu, directCu, endCuPn, cclPn, nameSuffix });
      const ext = extOf(f.name)
        || (f.type === 'application/pdf' ? '.pdf'
            : f.type?.startsWith('image/') ? '.' + f.type.slice(6)
            : '.bin');
      const generatedName = basename + ext;
      const obj = { name: generatedName, type: f.type, dataUrl };
      onFileChange(obj);
      try {
        await costApi.saveLayout({
          ccl_pn: basename,
          ext,
          data: dataUrl,
        });
      } catch (err) { console.warn('saveLayout failed:', err); }
    };
    reader.readAsDataURL(f);
  }, [onFileChange, endCu, directCu, endCuPn, cclPn, nameSuffix]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    if (f) readFile(f);
  }, [readFile]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/') || item.type === 'application/pdf') {
        const f = item.getAsFile();
        if (f) { readFile(f); e.preventDefault(); break; }
      }
    }
  }, [readFile]);

  // ── Context menu handlers ──
  // Menu opens on right-click regardless of whether a file is attached:
  // when empty, only "Upload drawing" is shown (per customer spec).
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    // Defer via microtask so the window "contextmenu" close listener
    // (attached while a previous menu is open) runs FIRST in the same
    // batch — then our open-at-new-position lands after the flush and
    // actually opens the menu at the new coordinates. Without this, a
    // second right-click on the same zone would collapse to null.
    queueMicrotask(() => setCtxMenu({ x, y }));
  }, []);

  // Close context menu on any click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); };
  }, [ctxMenu]);

  const ctxOpen = async () => {
    setCtxMenu(null);
    // Desktop (Electron): hand off to the OS default handler so PDFs open
    // in Adobe Acrobat / Preview / system browser — operators get print
    // dialog, annotations, etc. that the embedded Chromium PDF viewer
    // doesn't expose. Falls back to web-style window.open() when the
    // bridge isn't available (regular browser).
    const bridge = window.ops?.shell?.openExternalFile;
    if (bridge && file?.dataUrl) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(file.dataUrl);
      if (m) {
        const ext =
          m[1] === 'application/pdf'
            ? '.pdf'
            : m[1].startsWith('image/')
              ? '.' + m[1].slice(6).split('+')[0]
              : '.bin';
        try {
          await bridge(m[2], ext);
          return;
        } catch (err) {
          console.warn('[FileUploadZone] openExternalFile failed, falling back:', err);
        }
      }
    }
    if (blobUrl) window.open(blobUrl, '_blank', 'noopener,noreferrer');
  };
  const ctxDelete = () => {
    setCtxMenu(null);
    if (file && window.confirm(`Remove "${file.name || 'file'}"?`)) onClear();
  };
  const ctxUpload = () => {
    setCtxMenu(null);
    inputRef.current?.click();
  };
  // Rotate 90° clockwise per click (0 → 90 → 180 → 270 → 0). Image only;
  // PDFs use the native iframe renderer and don't respect CSS transform.
  // Rotation is preview-only (not persisted) — fresh load resets to 0°,
  // matching how zoom/pan behave.
  const ctxRotate = () => {
    setCtxMenu(null);
    setRotation(r => (r + 90) % 360);
  };

  // ── Double-click → fullscreen modal ──
  // Was: window.open(dataUrl) which (a) is blocked for data: URLs by modern
  // browsers, (b) loses the in-app context. Now opens an in-app modal at
  // xl size — operators can still hit the Open button for a real new tab.
  const handleDoubleClick = useCallback(() => {
    if (file?.dataUrl) setFullscreenOpen(true);
  }, [file]);

  // ── Zoom (wheel) ──
  const handleWheel = useCallback((e) => {
    if (!isImage || !hasPreview) return;
    e.preventDefault();
    setZoom(z => clamp(z + (e.deltaY > 0 ? -0.15 : 0.15), 0.5, 6));
  }, [isImage, hasPreview]);

  // ── Pan (mouse drag) ──
  const handleMouseDown = useCallback((e) => {
    if (!isImage || zoom <= 1 || e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }, [isImage, zoom, pan]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.px + dx / zoom, y: dragStart.current.py + dy / zoom });
  }, [dragging, zoom]);

  const handleMouseUp = useCallback(() => { setDragging(false); }, []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [dragging, handleMouseMove, handleMouseUp]);

  return (
    <div className={`fuz-zone${collapsed ? ' fuz-zone-collapsed' : ''}`}
      onDrop={handleDrop} onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
      onPaste={handlePaste} onContextMenu={handleContextMenu} tabIndex={0}>

      {/* Head card — promotes the 4 file actions (Open / Rotate / Upload /
          Delete) to visible icon buttons. Right-click still opens the
          full dropdown for power users, but direct buttons give every
          user a discoverable path. Matches Quote History's action-column
          pattern — icon buttons with tooltips + hover color feedback.
          Disabled states: Open + Delete when no file; Rotate only for
          images (PDF iframe ignores CSS transform). */}
      <div
        className={`fuz-label${collapsible ? ' fuz-label-collapsible' : ''}${collapsed ? ' fuz-collapsed' : ''}`}
        onContextMenu={handleContextMenu}
        onClick={collapsible ? toggleCollapsed : undefined}
        title={collapsible ? (collapsed ? 'Click to show drawing' : 'Click to hide drawing') : 'Right-click for the full menu'}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={collapsible ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapsed(); }
        } : undefined}
      >
        {collapsible && (
          <span className="fuz-chevron" aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 3 L5 7 L8 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        <span className="fuz-label-text">{label}</span>
        {file?.name && <span className="fuz-filename" title={file.name}> — {file.name}</span>}
        <div className="fuz-label-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="fuz-act-btn fuz-act-fullscreen"
            onClick={(e) => { e.stopPropagation(); if (file?.dataUrl) setFullscreenOpen(true); }}
            disabled={!file}
            title="Fullscreen (double-click)"
            aria-label="Open drawing fullscreen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9"/>
              <polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/>
              <line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
          <button type="button" className="fuz-act-btn fuz-act-open"
            onClick={(e) => { e.stopPropagation(); ctxOpen(); }}
            disabled={!file}
            title="Open in new window (⌘O)"
            aria-label="Open drawing in new window">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
          <button type="button" className="fuz-act-btn fuz-act-rotate"
            onClick={(e) => { e.stopPropagation(); setRotation(r => (r + 90) % 360); }}
            disabled={!file || (!isImage && isPDF)}
            title={file ? (isImage ? 'Rotate 90° clockwise (⌘R)' : 'Rotate only works on image files') : 'No file attached'}
            aria-label="Rotate drawing 90 degrees">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button type="button" className="fuz-act-btn fuz-act-upload"
            onClick={(e) => { e.stopPropagation(); ctxUpload(); }}
            title="Upload new drawing (⌘U)"
            aria-label="Upload new drawing">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </button>
          <button type="button" className="fuz-act-btn fuz-act-delete"
            onClick={(e) => { e.stopPropagation(); ctxDelete(); }}
            disabled={!file}
            title="Delete drawing (⌘⌫)"
            aria-label="Delete drawing">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Preview or Empty — body hidden when collapsible+collapsed. We
          conditionally render rather than CSS-hide so PdfCanvasPreview
          doesn't run pdfjs while the panel is folded away. */}
      {!collapsed && (file ? (
        <div className={`fuz-viewport ${dragging ? 'fuz-panning' : ''}`}
          ref={viewportRef}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}>
          {hasPreview && isImage && (
            <img src={file.dataUrl} alt={file.name} className="fuz-img"
              style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg)` }}
              draggable={false} />
          )}
          {hasPreview && isPDF && blobUrl && (
            <PdfCanvasPreview bytes={pdfBytes?.bytes} title={file.name} className="fuz-pdf-frame" />
          )}
          {hasPreview && !isImage && !isPDF && <div className="fuz-file-msg">File attached</div>}
          {!hasPreview && !fetchError && <div className="fuz-file-msg">Loading preview…</div>}
          {!hasPreview && fetchError && (
            <div className="fuz-file-msg fuz-file-err" role="alert">
              ⚠ {fetchError}
              <div className="fuz-file-err-hint">
                Right-click → <b>Upload drw…</b> to re-attach a new file.
              </div>
            </div>
          )}
          {/* Zoom indicator */}
          {isImage && zoom !== 1 && (
            <div className="fuz-zoom-badge">{Math.round(zoom * 100)}%</div>
          )}
          {/* Rotation indicator (only while non-zero) */}
          {isImage && rotation !== 0 && (
            <div className="fuz-rot-badge">{rotation}°</div>
          )}
        </div>
      ) : (
        <div className="fuz-empty" onClick={() => inputRef.current?.click()}>
          <div className="fuz-empty-icon">&#128206;</div>
          <div className="fuz-empty-text">Drop file, paste (Ctrl+V), or <span className="fuz-browse">browse</span></div>
          <div className="fuz-empty-hint">PNG, JPG, SVG, PDF</div>
        </div>
      ))}

      {/* Hidden file input */}
      <input ref={inputRef} type="file" accept="image/*,.pdf,.svg" style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) readFile(e.target.files[0]); }} />

      {/* Context menu — styled to match the Quote History dropdown.
          Header row shows card title + filename (like "Quote #99 — NA"),
          item rows use the same hover color + shortcut chips. */}
      {ctxMenu && (
        <div className="fuz-ctx" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
          <div className="fuz-ctx-header">
            {label}
            <span className="fuz-ctx-header-sub">{file?.name ? ` — ${file.name}` : ' — (empty)'}</span>
          </div>
          <div className="fuz-ctx-sep" />
          <div className={`fuz-ctx-item ${!file ? 'fuz-ctx-disabled' : ''}`}
               onClick={file ? ctxOpen : undefined}>
            <span className="fuz-ctx-icon">&#128194;</span>
            <span className="fuz-ctx-label">Open</span>
            <span className="fuz-ctx-shortcut">&#8984;O</span>
          </div>
          {isImage && (
            <div className="fuz-ctx-item" onClick={ctxRotate}>
              <span className="fuz-ctx-icon">&#8635;</span>
              <span className="fuz-ctx-label">Rotate 90°</span>
              <span className="fuz-ctx-shortcut">&#8984;R</span>
            </div>
          )}
          <div className="fuz-ctx-sep" />
          <div className="fuz-ctx-item" onClick={ctxUpload}>
            <span className="fuz-ctx-icon">&#128190;</span>
            <span className="fuz-ctx-label">Upload drw…</span>
            <span className="fuz-ctx-shortcut">&#8984;U</span>
          </div>
          <div className="fuz-ctx-sep" />
          <div className={`fuz-ctx-item fuz-ctx-danger ${!file ? 'fuz-ctx-disabled' : ''}`}
               onClick={file ? ctxDelete : undefined}>
            <span className="fuz-ctx-icon">&#128465;&#65039;</span>
            <span className="fuz-ctx-label">Delete</span>
            <span className="fuz-ctx-shortcut">&#8984;&#9003;</span>
          </div>
        </div>
      )}

      {/* Fullscreen viewer — XL modal showing the file at large size.
          Triggered by the new fullscreen button OR double-click on the
          preview. PDFs use blob URL iframe (avoids CSP/data-URL block).
          Images respect rotation but reset zoom/pan inside the modal. */}
      <Modal open={fullscreenOpen} onClose={() => setFullscreenOpen(false)}
             size="xl" severity="info">
        <Modal.Header title={label} subtitle={file?.name || ''} />
        <Modal.Body>
          {file && hasPreview && isImage && (
            <img src={blobUrl || file.dataUrl} alt={file.name}
              className="fuz-fs-img"
              style={{ transform: `rotate(${rotation}deg)` }} />
          )}
          {file && hasPreview && isPDF && blobUrl && (
            <PdfCanvasPreview bytes={pdfBytes?.bytes} title={file.name} className="fuz-fs-pdf" />
          )}
          {file && !hasPreview && (
            <div className="fuz-file-msg">No preview available.</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="op-btn op-btn-secondary"
                  onClick={ctxOpen} disabled={!blobUrl}>
            Open in new window
          </button>
          <button type="button" className="op-btn op-btn-primary"
                  onClick={() => setFullscreenOpen(false)}>
            Close
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
