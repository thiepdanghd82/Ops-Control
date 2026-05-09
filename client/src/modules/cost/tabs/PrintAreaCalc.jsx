/**
 * PrintAreaCalc — Print Area Calculator
 *
 * Detects print coverage % per color from an uploaded artwork and the
 * product's mm × mm dimensions. Pure client-side: Canvas API renders
 * the artwork at the target DPI, quantize() produces the K-color
 * palette, pixel-level background detection strips the blank area,
 * and the result is expressed as area % and mm² per detected color.
 *
 * Storage contract:
 *   jobs are keyed by `sku` (mã sản phẩm). Saving an existing SKU
 *   upserts in place, so re-measuring the same label overwrites its
 *   previous result. A secondary `id` (pa_NNNNN) is kept for referential
 *   stability by other tabs that might link to it.
 *
 * Extension hook:
 *   importFromLayout() is a no-op today but accepts a {widthMm, heightMm,
 *   artworkUrl, sku} payload so a future Standard / Complex tab button
 *   ("Measure from this layout") can hand over dimensions without user
 *   re-entry.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sharedApi } from '../../../services/api';
import {
  runPrintAreaAnalysis,
  recomputeTotals,
  mmToPx,
  rgbToHex,
  colorDist,
  nearestColorName,
  INK_PROFILES,
  getInkProfile,
  applyInkProfile,
  buildColorSeparation,
  normalizeRoi,
} from '../../../services/printAreaCore';
import { plateSwatchHex } from '../../../services/pdfVectorInk';
import DecimalInput from '../../../utils/DecimalInput';
import TabBarOverflow from '../../../components/Shared/TabBarOverflow';
import './PrintAreaCalc.css';

// Compact helper used by the Ink Plates panel — returns the hex string
// for a plate's colour object, falling back to the shared utility.
const getPlateSwatch = (color) => plateSwatchHex(color);

const DEFAULT_CONFIG = {
  widthMm: 30,
  heightMm: 20,
  dpi: 300,
  bgMode: 'auto',
  bgColor: [255, 255, 255],
  bgTolerance: 12,
  colorMode: 'auto',
  kColors: 8,
  mergeThreshold: 18,
  // Sprint 9 — spot-color detection. Chroma-boost and outlier rescue
  // both default ON so rare red/yellow warning inks on predominantly
  // dark artwork are not absorbed into dominant clusters by MMCQ.
  // Pinned list is populated by the eyedropper's "Pin as spot ink"
  // button; passing the hex forces a centroid at that color.
  chromaBoost: true,
  rescueOutliers: true,
  pinnedSpotHex: [],
  // Dim-line + dieline filtering. Both default ON so typical CAD
  // exports (label + dim annotations + magenta dieline) measure
  // correctly out of the box. User can toggle off for plain images.
  autoCrop: true,
  // cropMode drives which ROI strategy runs when the user hasn't drawn
  // a manual box. 'physical' = input-driven (user's mm×mm is ground
  // truth — best when artwork includes dim-line or trim-mark margins).
  // 'auto' = erode+bbox (legacy default, back-compat). 'none' = analyze
  // full canvas as-is. 'dieline' (Sprint 9, default for new jobs) =
  // auto-detect the die-line stroke color and crop to its bbox — most
  // accurate when artwork has an explicit die-cut outline, any color.
  // Manual ROI always wins regardless of this mode.
  cropMode: 'dieline',
  // Force a specific die-line color (hex) when mode='dieline'. Null =
  // auto-pick via stroke-score heuristic.
  dielineHex: null,
  // Morphological opening iterations applied AFTER cropping. Each
  // iteration drops strokes ≤2 px wider than the previous one (1 → ≤2px,
  // 2 → ≤4px, …). Off by default — reproduces pre-refactor numbers
  // bit-for-bit. Enable to strip thin black/gray dim-line annotations
  // that escape the centroid-crop.
  thinStrokeIterations: 0,
  autoExcludeDieline: true,
  // Print technology — drives ink volume math (transfer factor +
  // film thickness). Flexo is the most common label print method
  // so we default there; user can switch on the New Job tab.
  printMethod: 'flexo',
  // Drawing scale: dimensions on the artwork divided by this give
  // physical mm. 1 = 1:1 (artwork is at print size). 2 = artwork is
  // drawn 2× larger for clarity. Affects mm² output, not pixel %.
  scaleRatio: 1,
  // Sprint 8 — measurement accuracy upgrades. Defaults chosen for
  // best-in-class accuracy on first run; can be flipped off for
  // bit-for-bit parity with pre-Sprint-8 results.
  colorMetric: 'lab', // 'lab' (perceptual ΔE76) | 'rgb' (legacy)
  aaWeighting: true, // AA edge pixels contribute partial ink
  applyDotGain: true, // fold press dot gain into ink volume math
  bleedMm: 0, // trim=widthMm×heightMm; frame=+2×bleed each axis
  rotation: 'auto', // 'auto' | 0 | 90 | 180 | 270
  pageIndex: 1, // PDF page (1-based)
  userExcludedHex: [], // extra spot-color hexes marked non-print
};

function useLoadJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const data = await sharedApi.getPrintAreaJobs();
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      setError(null);
    } catch (e) {
      // Endpoint may 404 until the server is redeployed with the new
      // route — treat as empty list rather than a hard failure so the
      // tab still renders and the user can still run analysis.
      setJobs([]);
      setError(e?.message || null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { jobs, loading, error, reload, setJobs };
}

// Discrete zoom steps — chosen so each click produces a visible jump
// (50% / 75% / 100% / 125% / 150% / 200% / 300% / 500% / 800%) without
// letting the user land on awkward fractional values via repeated
// clicks. `fit` = 1 serves as the reset target.
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 5, 8];
function nearestZoomStep(value, direction) {
  // Find the current step; direction=+1 → next larger; direction=-1 → next
  // smaller. `Math.abs < 0.01` tolerates the float drift from CSS zoom
  // passes through serialization and back.
  let i = ZOOM_STEPS.findIndex((s) => Math.abs(s - value) < 0.01);
  if (i === -1) {
    // Value is between steps (e.g. user entered a custom zoom). Pick
    // the nearest lower step so +direction still makes forward progress.
    i = ZOOM_STEPS.findIndex((s) => s >= value);
    if (i === -1) i = ZOOM_STEPS.length - 1;
    if (direction > 0) return ZOOM_STEPS[i];
    return ZOOM_STEPS[Math.max(0, i - 1)];
  }
  if (direction > 0) return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, i + 1)];
  return ZOOM_STEPS[Math.max(0, i - 1)];
}

// Small inline toolbar of zoom − / percent / + / reset. Rendered in
// the canvas caption-top row, aligned right. Keyboard-accessible via
// native button semantics; screen readers get a group label.
function ZoomControls({ value, onChange, label }) {
  const atMin = Math.abs(value - ZOOM_STEPS[0]) < 0.01;
  const atMax = Math.abs(value - ZOOM_STEPS[ZOOM_STEPS.length - 1]) < 0.01;
  return (
    <div className="pa-zoom-controls" role="group" aria-label={`Zoom ${label}`}>
      <button
        type="button"
        className="pa-zoom-btn"
        aria-label={`Zoom out ${label}`}
        title="Zoom out"
        disabled={atMin}
        onClick={() => onChange(nearestZoomStep(value, -1))}
      >
        −
      </button>
      <button
        type="button"
        className="pa-zoom-value"
        aria-label={`Reset ${label} zoom`}
        title={value === 1 ? 'Fit' : 'Click to reset to 100%'}
        onClick={() => onChange(1)}
      >
        {Math.round(value * 100)}%
      </button>
      <button
        type="button"
        className="pa-zoom-btn"
        aria-label={`Zoom in ${label}`}
        title="Zoom in"
        disabled={atMax}
        onClick={() => onChange(nearestZoomStep(value, +1))}
      >
        +
      </button>
    </div>
  );
}

// ── New Job sub-tab ───────────────────────────────────────────────
function NewJobTab({ onSaved, initialJob, onInitialConsumed }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [sku, setSku] = useState('');
  const [productName, setProductName] = useState('');
  const [notes, setNotes] = useState('');
  const [openedFromLibrary, setOpenedFromLibrary] = useState(null);
  const [file, setFile] = useState(null);
  const [objectUrl, setObjectUrl] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [overlayOn, setOverlayOn] = useState({});
  // Manual ROI selection — user drags on canvas to define the region
  // that's actually the product. Wins over auto-crop when set. Coords
  // are in CANVAS-PIXEL space (not CSS pixels) so they survive zoom.
  const [roiMode, setRoiMode] = useState(false);
  const [manualRoi, setManualRoi] = useState(null);
  const [roiDrag, setRoiDrag] = useState(null); // in-progress drag
  // Pixel inspector — click on canvas to read the color + look up which
  // detected cluster it falls into. Mutually exclusive with roiMode so
  // the canvas pointer has a single, predictable behaviour at all times.
  const [pickMode, setPickMode] = useState(false);
  const [pickedPixel, setPickedPixel] = useState(null);
  // Zoom for Original + Analysis Area canvases. 1 = fit-to-box, >1 =
  // pixel-peep mode (box scrolls). Independent per canvas so user can
  // fit one while zoomed-in on the other. Applied via CSS `zoom`
  // property which also drives the parent's overflow scrollbars; the
  // underlying pixel data is untouched so analysis math never moves.
  const [originalZoom, setOriginalZoom] = useState(1);
  const [analysisZoom, setAnalysisZoom] = useState(1);
  const canvasRef = useRef(null);
  // Second canvas — read-only "Analysis area" view that shows the
  // CROPPED region only (what the algorithm actually measured), so the
  // user can verify visually that the right region was picked. Shares
  // the same overlay state as the main canvas so toggling an ink
  // highlight lights up both views simultaneously.
  const analysisCanvasRef = useRef(null);

  // Revoke object URLs to avoid leaking blob memory when the user
  // swaps files mid-session.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  // Hydrate from Library → Open. Copies persisted job fields back into
  // the form state and flashes a banner pointing the user at the next
  // step (re-drop the artwork, then Analyze). Deliberately does NOT
  // restore the `result` — that's the output of an analysis run, and
  // forcing a re-run keeps mm²/ink numbers tied to whatever config is
  // currently showing instead of a snapshot from an earlier session.
  useEffect(() => {
    if (!initialJob) return;
    setSku(initialJob.sku || '');
    setProductName(initialJob.product_name || '');
    setNotes(initialJob.notes || '');
    setManualRoi(initialJob.manual_roi || null);
    const dc = initialJob.detection_config || {};
    setConfig((prev) => ({
      ...prev,
      widthMm: Number(initialJob.width_mm) || prev.widthMm,
      heightMm: Number(initialJob.height_mm) || prev.heightMm,
      dpi: Number(initialJob.dpi) || prev.dpi,
      printMethod: initialJob.print_method || prev.printMethod,
      scaleRatio: Number(initialJob.scale_ratio) || prev.scaleRatio,
      bgMode: dc.bg_mode || prev.bgMode,
      bgColor: Array.isArray(dc.bg_color)
        ? dc.bg_color
        : dc.bg_color && typeof dc.bg_color === 'object'
          ? [dc.bg_color.r, dc.bg_color.g, dc.bg_color.b]
          : prev.bgColor,
      bgTolerance: Number.isFinite(dc.bg_tolerance) ? dc.bg_tolerance : prev.bgTolerance,
      colorMode: dc.color_mode || prev.colorMode,
      kColors: Number.isFinite(dc.k_colors) ? dc.k_colors : prev.kColors,
      mergeThreshold: Number.isFinite(dc.merge_threshold)
        ? dc.merge_threshold
        : prev.mergeThreshold,
      chromaBoost: typeof dc.chroma_boost === 'boolean' ? dc.chroma_boost : prev.chromaBoost,
      rescueOutliers:
        typeof dc.rescue_outliers === 'boolean' ? dc.rescue_outliers : prev.rescueOutliers,
      pinnedSpotHex: Array.isArray(dc.pinned_spot_hex) ? dc.pinned_spot_hex : prev.pinnedSpotHex,
    }));
    setOpenedFromLibrary({
      sku: initialJob.sku,
      artworkFile: initialJob.artwork_file || null,
      artworkLoading: !!initialJob.artwork_file,
      artworkError: null,
      updatedAt: initialJob.updated_at || initialJob.created_at || null,
    });
    // Consumed — tell parent to clear initialJob so switching away and
    // back doesn't re-hydrate (and overwrite) fresh user edits.
    onInitialConsumed?.();

    // Re-hydrate the artwork File from server storage so the user can
    // re-analyze without re-dropping. The server-stored path looks like
    //   "Library/PrintArea/artworks/<sha1>.<ext>"
    // which is served by the /data/* passthrough with session auth.
    // Wrap the Blob in a real File so the rest of the pipeline (which
    // reads `file.type` / `file.name`) sees the same shape as a user
    // drop. Abort controller supports fast-unmount without leaked
    // network traffic.
    if (initialJob.artwork_file) {
      const controller = new AbortController();
      (async () => {
        try {
          const blob = await sharedApi.getDataFile(initialJob.artwork_file, {
            signal: controller.signal,
          });
          const base = initialJob.artwork_file.split('/').pop();
          const file = new File([blob], base, { type: blob.type || initialJob.artwork_mime || '' });
          // Mark the file so `onFileSelected` keeps the banner (see
          // note in onFileSelected). Non-enumerable so JSON dumps of
          // the File don't leak the flag.
          Object.defineProperty(file, '__fromLibrary', { value: true });
          onFileSelected(file);
          setOpenedFromLibrary((prev) =>
            prev && prev.artworkFile === initialJob.artwork_file
              ? { ...prev, artworkLoading: false }
              : prev
          );
        } catch (err) {
          if (err?.name === 'AbortError') return;
          setOpenedFromLibrary((prev) =>
            prev && prev.artworkFile === initialJob.artwork_file
              ? { ...prev, artworkLoading: false, artworkError: err?.message || 'Fetch failed' }
              : prev
          );
        }
      })();
      return () => controller.abort();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onFileSelected is declared below; adding it here would TDZ on render. Hydration triggers only on initialJob change.
  }, [initialJob, onInitialConsumed]);

  const onFileSelected = useCallback(
    (f) => {
      if (!f) return;
      // Accept by MIME *or* extension — Illustrator files are usually
      // reported as application/postscript or application/illustrator
      // depending on the browser, and some browsers hand .ai over with
      // an empty type. Trust the extension as a fallback.
      const mime = (f.type || '').toLowerCase();
      const name = (f.name || '').toLowerCase();
      const mimeOk =
        /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/.test(mime) ||
        mime === 'application/pdf' ||
        mime === 'application/illustrator' ||
        mime === 'application/postscript';
      const extOk = /\.(png|jpe?g|webp|gif|bmp|svg|pdf|ai)$/.test(name);
      if (!mimeOk && !extOk) {
        setError('Unsupported file — use PNG / JPG / WebP / SVG / PDF / AI');
        return;
      }
      setError(null);
      setFile(f);
      setResult(null);
      // Fresh artwork → reset zoom on BOTH canvases so the user sees the
      // whole image first instead of last session's zoom-in position.
      setOriginalZoom(1);
      setAnalysisZoom(1);
      // Clear the Library banner only when the user themselves drops a
      // NEW artwork (interpreted as "I'm starting fresh"). A hydration
      // path that re-uses the library artwork sets `__fromLibrary` on
      // the file so we keep the banner visible.
      if (!f.__fromLibrary) setOpenedFromLibrary(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      // Raster previews get a blob URL for instant <img>-style display;
      // PDF/AI files don't need one because pdf.js rasterises them at
      // analyze time and the preview canvas shows the result.
      const isPdfLike =
        mime === 'application/pdf' ||
        mime === 'application/illustrator' ||
        mime === 'application/postscript' ||
        /\.(pdf|ai)$/.test(name);
      setObjectUrl(isPdfLike ? null : URL.createObjectURL(f));
    },
    [objectUrl]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) onFileSelected(f);
    },
    [onFileSelected]
  );

  // Clear the current artwork so the user can drop/paste a fresh file
  // without leaving the New Job tab. We revoke the blob URL in the same
  // step to avoid leaking memory on repeated reselects.
  const clearFile = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setFile(null);
    setObjectUrl(null);
    setResult(null);
    setOverlayOn({});
    setError(null);
    setStatus(null);
  }, [objectUrl]);

  // Clipboard paste — works both when the user focuses the dropzone
  // (Cmd/Ctrl+V with cursor inside) and when they paste anywhere on the
  // New Job tab. We walk clipboard.items and accept the first image/*
  // entry; non-image paste events are ignored so normal text paste in
  // other inputs on the tab still works.
  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      for (const item of items) {
        if (item.kind === 'file' && /^image\//.test(item.type)) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            // Pasted images from the clipboard don't have a filename —
            // synthesise one so the SKU-keyed upload flow can stamp an
            // extension on disk.
            const ext = (item.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
            const named = new File([f], `clipboard-${Date.now()}.${ext}`, { type: item.type });
            onFileSelected(named);
            return;
          }
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onFileSelected]);

  const runAnalyze = useCallback(async () => {
    if (!file) {
      setError('Upload an artwork first');
      return;
    }
    if (!config.widthMm || !config.heightMm) {
      setError('Width and height (mm) are required');
      return;
    }
    setError(null);
    setStatus('Analyzing...');
    try {
      // Manual ROI lives outside `config` because it depends on the
      // current rendered canvas size (which only exists after the first
      // analyze pass). We pass it explicitly so the core knows whether
      // to crop on user-drawn bounds or fall back to auto-crop.
      const r = await runPrintAreaAnalysis(file, { ...config, manualRoi });
      setResult(r);
      // Default overlays: original on, per-color off so the user opts in.
      const on = { __original: true };
      r.colors.forEach((c) => {
        on[`c${c.idx}`] = false;
      });
      setOverlayOn(on);
      setStatus(null);
      // Canvas repaint is handled by the useEffect below that watches
      // result + overlayOn — no need to paint inline here.
    } catch (e) {
      setError(e?.message || 'Analysis failed');
      setStatus(null);
    }
  }, [file, config, manualRoi]);

  // `cropImageData()` in the core returns a plain `{data, width, height}`
  // object (kept framework-free so Jest can run it in Node where
  // ImageData isn't a constructor). Canvas2D's putImageData refuses
  // anything that isn't a real ImageData instance — so we promote on
  // the way out. Pass-through when already an ImageData.
  const toImageData = (obj) => {
    if (!obj) return null;
    if (typeof ImageData !== 'undefined' && obj instanceof ImageData) return obj;
    return new ImageData(obj.data, obj.width, obj.height);
  };

  // Paint current overlay state onto the preview canvas. We always use
  // the FULL image as the base (so the user can see what was cropped
  // out), then draw a green dashed rectangle around the auto-detected
  // label bounds. Color highlight overlays still scan the full canvas
  // so the user can verify visually whether a cluster's detection
  // matched the expected pixels.
  const paintCanvas = useCallback(
    (r, overlays) => {
      const canvas = canvasRef.current;
      if (!canvas || !r) return;
      const base = r._fullImg || r._imgData;
      if (!base) return;
      const { width: w, height: h } = base;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (overlays.__original) {
        ctx.putImageData(toImageData(base), 0, 0);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      // Color highlight overlays — skip excluded colors by default since
      // the user is actively trying to ignore them.
      const active = r.colors.filter((c) => overlays[`c${c.idx}`]);
      if (active.length > 0) {
        const src = base.data;
        const out = ctx.getImageData(0, 0, w, h);
        const dst = out.data;
        const merge = config.mergeThreshold || 18;
        for (let i = 0; i < src.length; i += 4) {
          const pr = src[i],
            pg = src[i + 1],
            pb = src[i + 2];
          for (const c of active) {
            const dr = pr - c.rgb[0],
              dg = pg - c.rgb[1],
              db = pb - c.rgb[2];
            if (Math.sqrt(dr * dr + dg * dg + db * db) <= merge) {
              dst[i] = c.rgb[0];
              dst[i + 1] = c.rgb[1];
              dst[i + 2] = c.rgb[2];
              dst[i + 3] = 255;
              break;
            }
          }
        }
        ctx.putImageData(out, 0, 0);
      }
      // Draw crop bbox on top — color depends on source: green for auto
      // (the algorithm picked it), blue for manual (user picked it).
      // Stroke width scales with canvas so thick and thin labels both
      // get a visible outline without blowing up on high-DPI renders.
      if (r.crop) {
        const sw = Math.max(2, Math.round(Math.min(w, h) / 400));
        ctx.save();
        ctx.strokeStyle = r.crop_source === 'manual' ? '#2563eb' : '#16a34a';
        ctx.lineWidth = sw;
        ctx.setLineDash([sw * 3, sw * 2]);
        ctx.strokeRect(r.crop.x, r.crop.y, r.crop.w, r.crop.h);
        ctx.restore();
      }
      // Manual ROI overlay: solid blue when committed, blue dashed while
      // the user is mid-drag. Drawn AFTER the crop bbox so it always sits
      // on top — the user's selection should never be hidden.
      const liveRoi = roiDrag || manualRoi;
      if (liveRoi) {
        const sw = Math.max(2, Math.round(Math.min(w, h) / 350));
        const norm = normalizeRoi(liveRoi, w, h);
        if (norm) {
          ctx.save();
          ctx.strokeStyle = '#2563eb';
          ctx.fillStyle = 'rgba(37, 99, 235, 0.10)';
          ctx.lineWidth = sw;
          ctx.setLineDash(roiDrag ? [sw * 2, sw * 2] : []);
          ctx.fillRect(norm.x, norm.y, norm.w, norm.h);
          ctx.strokeRect(norm.x, norm.y, norm.w, norm.h);
          ctx.restore();
          // Dimension labels — drawn on canvas so they survive zoom/pan
          // and print correctly when the user screenshots the preview.
          // Only draw if we can compute physical dims (need widthMm).
          const cfgWmm = Number(config.widthMm) || 0;
          const cfgHmm = Number(config.heightMm) || 0;
          const sc = Number(config.scaleRatio) || 1;
          if (cfgWmm > 0 && cfgHmm > 0) {
            const wMm = (norm.w / w) * (cfgWmm / sc);
            const hMm = (norm.h / h) * (cfgHmm / sc);
            const fontPx = Math.max(11, Math.round(Math.min(w, h) / 70));
            ctx.save();
            ctx.font = `700 ${fontPx}px 'IBM Plex Sans', system-ui, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            // X label (top edge of ROI)
            const xLabel = `${wMm.toFixed(2)} mm`;
            const xMetrics = ctx.measureText(xLabel);
            const padX = fontPx * 0.5;
            const xLblY = Math.max(fontPx + 6, norm.y - fontPx * 0.8);
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(
              norm.x + norm.w / 2 - xMetrics.width / 2 - padX,
              xLblY - fontPx * 0.6,
              xMetrics.width + padX * 2,
              fontPx * 1.2
            );
            ctx.fillStyle = '#fff';
            ctx.fillText(xLabel, norm.x + norm.w / 2, xLblY);
            // Y label (left side of ROI, rotated 90°)
            const yLabel = `${hMm.toFixed(2)} mm`;
            const yMetrics = ctx.measureText(yLabel);
            const yLblX = Math.max(fontPx + 6, norm.x - fontPx * 0.8);
            ctx.translate(yLblX, norm.y + norm.h / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(
              -yMetrics.width / 2 - padX,
              -fontPx * 0.6,
              yMetrics.width + padX * 2,
              fontPx * 1.2
            );
            ctx.fillStyle = '#fff';
            ctx.fillText(yLabel, 0, 0);
            ctx.restore();
            // Area label inside the rectangle (only if box is large enough
            // to fit the text comfortably — avoids clutter on tiny ROIs).
            const areaMm2 = wMm * hMm;
            const areaM2 = areaMm2 / 1_000_000;
            const areaText = `${areaMm2.toFixed(1)} mm² (${areaM2.toExponential(2)} m²)`;
            ctx.save();
            ctx.font = `600 ${Math.round(fontPx * 0.85)}px 'IBM Plex Sans', system-ui, sans-serif`;
            const aMetrics = ctx.measureText(areaText);
            if (norm.w > aMetrics.width + 16 && norm.h > fontPx * 2.5) {
              ctx.fillStyle = 'rgba(37, 99, 235, 0.85)';
              ctx.fillRect(
                norm.x + norm.w / 2 - aMetrics.width / 2 - 6,
                norm.y + norm.h - fontPx * 1.6,
                aMetrics.width + 12,
                fontPx * 1.2
              );
              ctx.fillStyle = '#fff';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(areaText, norm.x + norm.w / 2, norm.y + norm.h - fontPx);
            }
            ctx.restore();
          }
        }
      }
      // Picked-pixel marker: small crosshair + filled circle so the user
      // can see exactly which pixel they sampled, even after the cursor
      // has moved away.
      if (
        pickedPixel &&
        pickedPixel.x >= 0 &&
        pickedPixel.y >= 0 &&
        pickedPixel.x < w &&
        pickedPixel.y < h
      ) {
        const r = Math.max(4, Math.round(Math.min(w, h) / 200));
        ctx.save();
        ctx.lineWidth = Math.max(1.5, r * 0.4);
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.arc(pickedPixel.x, pickedPixel.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, r * 0.25);
        ctx.strokeStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(pickedPixel.x, pickedPixel.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = pickedPixel.hex;
        ctx.beginPath();
        ctx.arc(pickedPixel.x, pickedPixel.y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
    [
      config.mergeThreshold,
      config.widthMm,
      config.heightMm,
      config.scaleRatio,
      manualRoi,
      roiDrag,
      pickedPixel,
    ]
  );

  // Toggle a color's "excluded" flag and recompute totals in-place.
  // Cheap — no re-quantize, no canvas repaint, just a sum over the
  // color list. Lets the user interactively override auto-detection
  // without waiting on another full analysis pass.
  const toggleColorExcluded = useCallback(
    (idx) => {
      setResult((prev) => {
        if (!prev) return prev;
        // Mirror the toggle into cfg.userExcludedHex so a re-analyze
        // preserves the user's picks. Dieline auto-excludes remain auto.
        const target = prev.colors.find((c) => c.idx === idx);
        if (target) {
          setConfig((cfgPrev) => {
            const cur = new Set(
              (cfgPrev.userExcludedHex || []).map((h) => String(h).toUpperCase())
            );
            const hex = String(target.hex).toUpperCase();
            if (target.excluded)
              cur.delete(hex); // un-ignoring
            else cur.add(hex);
            return { ...cfgPrev, userExcludedHex: Array.from(cur) };
          });
        }
        const nextColors = prev.colors.map((c) =>
          c.idx === idx
            ? { ...c, excluded: !c.excluded, excluded_reason: !c.excluded ? 'user' : null }
            : c
        );
        // Recompute mm² against PHYSICAL dims (after scale ratio), not
        // the as-drawn dims, so toggles match the original analysis.
        const physW = prev.physical_width_mm ?? config.widthMm;
        const physH = prev.physical_height_mm ?? config.heightMm;
        const rebuilt = recomputeTotals(
          nextColors,
          prev.totals.total_pixels,
          prev.totals.bg_pixels,
          physW,
          physH
        );
        // Re-augment with ink-volume metrics — `print_area_mm2` may have
        // shifted because exclusion changes the printable denominator.
        const withInk = applyInkProfile(rebuilt.colors, prev.print_method || config.printMethod);
        // `_imgData`, `_fullImg`, `crop`, `bg_detected` survive untouched
        // so the canvas overlay stays in sync without another render.
        return { ...prev, colors: withInk, totals: rebuilt.totals };
      });
    },
    [config.widthMm, config.heightMm, config.printMethod]
  );

  // Paint the right-hand "Analysis area" canvas — same base + overlay
  // logic as the main canvas, but uses `_imgData` (already cropped to
  // ROI / auto-bbox) and draws no crop rectangle, ROI overlay, or
  // picked-pixel marker (those only belong on the interactive Original
  // view). Net effect: a clean, scale-correct rendering of ONLY the
  // region the algorithm measured.
  const paintAnalysisCanvas = useCallback(
    (r, overlays) => {
      const canvas = analysisCanvasRef.current;
      if (!canvas || !r || !r._imgData) return;
      const base = r._imgData;
      const { width: w, height: h } = base;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (overlays.__original) {
        ctx.putImageData(toImageData(base), 0, 0);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      const active = r.colors.filter((c) => overlays[`c${c.idx}`]);
      if (active.length > 0) {
        const src = base.data;
        const out = ctx.getImageData(0, 0, w, h);
        const dst = out.data;
        const merge = config.mergeThreshold || 18;
        for (let i = 0; i < src.length; i += 4) {
          const pr = src[i],
            pg = src[i + 1],
            pb = src[i + 2];
          for (const c of active) {
            const dr = pr - c.rgb[0],
              dg = pg - c.rgb[1],
              db = pb - c.rgb[2];
            if (Math.sqrt(dr * dr + dg * dg + db * db) <= merge) {
              dst[i] = c.rgb[0];
              dst[i + 1] = c.rgb[1];
              dst[i + 2] = c.rgb[2];
              dst[i + 3] = 255;
              break;
            }
          }
        }
        ctx.putImageData(out, 0, 0);
      }
    },
    [config.mergeThreshold]
  );

  // Analysis region physical dims (mm) — derived from the crop bbox on
  // the full canvas. No crop → analysis area = full label = physical
  // entered dims (after scale). Used for the caption under the right
  // canvas + for the "Analysis area" empty-state fallback.
  const analysisDims = useMemo(() => {
    if (!result) return null;
    const fullW = result._fullImg?.width;
    const fullH = result._fullImg?.height;
    const sc = Number(config.scaleRatio) || 1;
    const physW = (Number(config.widthMm) || 0) / sc;
    const physH = (Number(config.heightMm) || 0) / sc;
    if (!fullW || !fullH || !physW || !physH) return null;
    if (result.crop) {
      const wMm = (result.crop.w / fullW) * physW;
      const hMm = (result.crop.h / fullH) * physH;
      return {
        wMm,
        hMm,
        px_w: result.crop.w,
        px_h: result.crop.h,
        area_mm2: wMm * hMm,
        source: result.crop_source || 'auto',
      };
    }
    return {
      wMm: physW,
      hMm: physH,
      px_w: fullW,
      px_h: fullH,
      area_mm2: physW * physH,
      source: 'full',
    };
  }, [result, config.widthMm, config.heightMm, config.scaleRatio]);

  // Repaint whenever overlays toggle (result + overlayOn are the only
  // inputs; no stale-closure risk because paintCanvas reads both args).
  useEffect(() => {
    if (result) {
      paintCanvas(result, overlayOn);
      paintAnalysisCanvas(result, overlayOn);
    }
  }, [result, overlayOn, paintCanvas, paintAnalysisCanvas]);

  // ── Auto re-analyse when manual ROI changes ─────────────────────
  // Once the user has committed to a workflow (run Analyze at least
  // once), changing the ROI rectangle should silently re-run the
  // pipeline so the Analysis Area canvas always reflects the latest
  // selection — no explicit click needed. Debounced 400 ms so the
  // user can fine-tune the rectangle without thrashing the quantizer.
  //
  // Skipped when:
  //   - No prior result yet (first analyze must be explicit, so the
  //     user knows the cost of running it).
  //   - The new ROI matches what's already been analysed (avoids the
  //     effect re-firing after our own re-analyse updates result.crop).
  //   - User is mid-drag (defer until mouseup commits the rect).
  const [autoBusy, setAutoBusy] = useState(false);
  useEffect(() => {
    if (!result || !file) return;
    if (roiDrag) return;
    const cur = result.crop_source === 'manual' ? result.crop : null;
    const same =
      (manualRoi &&
        cur &&
        manualRoi.x === cur.x &&
        manualRoi.y === cur.y &&
        manualRoi.w === cur.w &&
        manualRoi.h === cur.h) ||
      (!manualRoi && !cur);
    if (same) return;
    setAutoBusy(true);
    const id = setTimeout(() => {
      runAnalyze().finally(() => setAutoBusy(false));
    }, 400);
    return () => {
      clearTimeout(id);
      setAutoBusy(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualRoi, roiDrag]);

  // Keyboard shortcuts:
  //   ESC          → exit ROI / Inspect mode (or clear in-flight drag)
  //   Cmd/Ctrl+↵   → run Analyze (only when a file is selected)
  // Scoped to the tab via a window listener that no-ops if the user is
  // typing in an input — never steals keys from text fields.
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (e.key === 'Escape') {
        if (roiDrag) {
          setRoiDrag(null);
          return;
        }
        if (roiMode) {
          setRoiMode(false);
          return;
        }
        if (pickMode) {
          setPickMode(false);
          return;
        }
        if (pickedPixel) {
          setPickedPixel(null);
          return;
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !inField) {
        if (file) {
          e.preventDefault();
          runAnalyze();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roiDrag, roiMode, pickMode, pickedPixel, file, runAnalyze]);

  // ── Manual ROI handlers (drag-to-select on canvas) ──────────────
  // Convert mouse coords from CSS px to canvas-pixel space. Canvas may
  // be displayed at any CSS size (max-width:100%) but the ImageData
  // and crop math live in INTRINSIC pixels — getBoundingClientRect
  // gives us the displayed size, ratio gives the conversion.
  const eventToCanvasPx = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }, []);

  const onCanvasMouseDown = useCallback(
    (e) => {
      if (!roiMode) return;
      const p = eventToCanvasPx(e);
      if (!p) return;
      e.preventDefault();
      setRoiDrag({ x: p.x, y: p.y, w: 0, h: 0 });
    },
    [roiMode, eventToCanvasPx]
  );

  const onCanvasMouseMove = useCallback(
    (e) => {
      if (!roiMode || !roiDrag) return;
      const p = eventToCanvasPx(e);
      if (!p) return;
      setRoiDrag((prev) => (prev ? { ...prev, w: p.x - prev.x, h: p.y - prev.y } : prev));
    },
    [roiMode, roiDrag, eventToCanvasPx]
  );

  const onCanvasMouseUp = useCallback(() => {
    if (!roiMode || !roiDrag) return;
    const canvas = canvasRef.current;
    if (!canvas) {
      setRoiDrag(null);
      return;
    }
    const norm = normalizeRoi(roiDrag, canvas.width, canvas.height);
    setRoiDrag(null);
    // Reject tiny accidental drags (< 8 px on either axis) — those
    // are almost always click-without-drag mistakes.
    if (!norm || norm.w < 8 || norm.h < 8) return;
    setManualRoi(norm);
  }, [roiMode, roiDrag]);

  const clearRoi = useCallback(() => {
    setManualRoi(null);
    setRoiDrag(null);
  }, []);

  // ── Pixel inspector ──────────────────────────────────────────────
  // Click anywhere on the canvas to read the source pixel. We sample
  // from `_fullImg` (the original render, no overlays) so the picked
  // RGB is always the TRUE artwork color — never the highlighted
  // overlay color the user might be currently viewing.
  //
  // After picking, we run the same nearest-cluster lookup the analyser
  // uses, so the user sees which detected ink the pixel maps to (e.g.
  // "Color #2 — Black"). Pixels outside the analysed ROI still match
  // the closest cluster — handy for spot-checking dieline / annotation
  // colors that were excluded.
  const onCanvasClick = useCallback(
    (e) => {
      if (!pickMode) return;
      const p = eventToCanvasPx(e);
      if (!p) return;
      e.preventDefault();
      // Prefer the analysed full image (correct colors, no overlays).
      // Fall back to reading from canvas directly when no analysis has
      // run yet — useful for inspecting an uploaded image pre-Analyze.
      let r, g, b;
      if (result?._fullImg && p.x < result._fullImg.width && p.y < result._fullImg.height) {
        const i = (p.y * result._fullImg.width + p.x) * 4;
        r = result._fullImg.data[i];
        g = result._fullImg.data[i + 1];
        b = result._fullImg.data[i + 2];
      } else {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const px = canvas.getContext('2d').getImageData(p.x, p.y, 1, 1).data;
        r = px[0];
        g = px[1];
        b = px[2];
      }
      const rgb = [r, g, b];
      const hex = rgbToHex(rgb);
      const name = nearestColorName(rgb);
      // Match against detected clusters — cheapest cluster wins.
      let cluster = null;
      let bestDist = Infinity;
      for (const c of result?.colors || []) {
        const d = colorDist(rgb, c.rgb);
        if (d < bestDist) {
          bestDist = d;
          cluster = c;
        }
      }
      setPickedPixel({ x: p.x, y: p.y, rgb, hex, name, cluster, dist: bestDist });
    },
    [pickMode, eventToCanvasPx, result]
  );

  // ── Live ROI dimensions in physical mm + m² area ────────────────
  // The canvas is rendered at exactly widthMm × heightMm @ DPI px, so
  // mm-per-px is constant and equals (widthMm / canvas.width). When a
  // scale ratio is applied, the entered dims are AS-DRAWN; we divide
  // by scale to get PHYSICAL mm. ROI coords live in canvas-pixel space
  // (full-canvas, not cropped) so the conversion is direct.
  const roiPhysical = useMemo(() => {
    const live = roiDrag ? normalizeRoi(roiDrag, 9999, 9999) : manualRoi;
    if (!live) return null;
    // Canvas dims: prefer analysed _fullImg (always correct), fall back
    // to the actual <canvas> size while user is mid-drag pre-analysis.
    const fullW = result?._fullImg?.width || canvasRef.current?.width;
    const fullH = result?._fullImg?.height || canvasRef.current?.height;
    if (!fullW || !fullH) return null;
    const scale = Number(config.scaleRatio) || 1;
    const physW = (Number(config.widthMm) || 0) / scale;
    const physH = (Number(config.heightMm) || 0) / scale;
    if (!physW || !physH) return null;
    const wMm = (live.w / fullW) * physW;
    const hMm = (live.h / fullH) * physH;
    return {
      wMm,
      hMm,
      area_mm2: wMm * hMm,
      area_m2: (wMm * hMm) / 1_000_000,
      px_w: live.w,
      px_h: live.h,
    };
  }, [roiDrag, manualRoi, result, config.widthMm, config.heightMm, config.scaleRatio]);

  // ── Color separation export (one PNG per detected color) ────────
  const downloadSeparations = useCallback(async () => {
    if (!result || !result._imgData) return;
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d');
    const merge = config.mergeThreshold || 18;
    for (const c of result.colors) {
      if (c.excluded) continue; // skip dieline / user-ignored colors
      const sep = buildColorSeparation(result._imgData, c.rgb, merge);
      if (!sep) continue;
      tmp.width = sep.width;
      tmp.height = sep.height;
      tctx.putImageData(new ImageData(sep.data, sep.width, sep.height), 0, 0);
      const blob = await new Promise((resolve) => tmp.toBlob(resolve, 'image/png'));
      if (!blob) continue;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const safeName = (c.name || `color${c.idx}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const skuPart = sku.trim() ? `${sku.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
      a.download = `${skuPart}sep_${c.idx}_${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer URL revocation slightly so the browser actually finishes
      // the download before we yank the blob out from under it.
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  }, [result, config.mergeThreshold, sku]);

  const save = useCallback(async () => {
    if (!result) return;
    if (!sku.trim()) {
      setError('SKU (mã) is required to save');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let artworkFile = null;
      if (file) {
        const uploaded = await sharedApi.uploadPrintAreaArtwork(file);
        artworkFile = uploaded?.artwork_file || null;
      }
      const job = {
        sku: sku.trim(),
        product_name: productName.trim() || null,
        width_mm: Number(config.widthMm),
        height_mm: Number(config.heightMm),
        dpi: Number(config.dpi),
        // New metadata fields — saved as top-level so Library + future
        // cost-calc integrations can read them without parsing config.
        print_method: config.printMethod || 'flexo',
        scale_ratio: Number(config.scaleRatio) || 1,
        manual_roi: manualRoi || null,
        artwork_file: artworkFile,
        artwork_mime: file?.type || null,
        detection_config: {
          bg_mode: config.bgMode,
          bg_color: result.bg_detected,
          bg_tolerance: Number(config.bgTolerance),
          color_mode: config.colorMode,
          k_colors: Number(config.kColors),
          merge_threshold: Number(config.mergeThreshold),
          chroma_boost: !!config.chromaBoost,
          rescue_outliers: !!config.rescueOutliers,
          pinned_spot_hex: Array.isArray(config.pinnedSpotHex) ? config.pinnedSpotHex : [],
        },
        colors: result.colors,
        totals: result.totals,
        notes: notes.trim() || null,
      };
      await sharedApi.savePrintAreaJob(job);
      setStatus('Saved ✓');
      onSaved?.();
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [result, sku, productName, config, file, notes, manualRoi, onSaved]);

  const totalPct = result ? (result.totals.total_print_pct * 100).toFixed(2) : '—';
  const totalMm2 = result ? result.totals.total_print_mm2.toFixed(2) : '—';
  const canvasPx = `${mmToPx(config.widthMm, config.dpi)} × ${mmToPx(config.heightMm, config.dpi)} px`;

  return (
    <div className="pa-body">
      {/* LEFT: Input panel */}
      <div className="pa-panel">
        <h4 className="pa-panel-title">Product</h4>
        {openedFromLibrary && (
          <div className="pa-info-banner" role="status" aria-live="polite">
            <b>Loaded from Library:</b> {openedFromLibrary.sku}
            {openedFromLibrary.updatedAt &&
              ` · ${String(openedFromLibrary.updatedAt).slice(0, 16).replace('T', ' ')}`}
            <div style={{ marginTop: 2, fontSize: 11, color: '#1e40af' }}>
              {openedFromLibrary.artworkLoading && <>⏳ Loading artwork from server…</>}
              {openedFromLibrary.artworkError && (
                <span style={{ color: '#b91c1c' }}>
                  ⚠ Couldn&rsquo;t load artwork ({openedFromLibrary.artworkError}) — drop the source
                  file manually.
                </span>
              )}
              {!openedFromLibrary.artworkLoading && !openedFromLibrary.artworkError && (
                <>
                  ✓ Artwork re-loaded
                  {openedFromLibrary.artworkFile && (
                    <>
                      {' '}
                      (<code>{openedFromLibrary.artworkFile.split('/').pop()}</code>)
                    </>
                  )}
                  . Click Analyze artwork to re-measure with the saved settings.
                </>
              )}
            </div>
          </div>
        )}
        <div className="pa-field">
          <label>SKU / Mã sản phẩm *</label>
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. 109M8-A00"
          />
        </div>
        <div className="pa-field">
          <label>Product name</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="pa-row">
          <div className="pa-field">
            <label>Width (mm) *</label>
            <DecimalInput
              value={config.widthMm}
              onChange={(v) => setConfig({ ...config, widthMm: Number(v) || 0 })}
            />
          </div>
          <div className="pa-field">
            <label>Height (mm) *</label>
            <DecimalInput
              value={config.heightMm}
              onChange={(v) => setConfig({ ...config, heightMm: Number(v) || 0 })}
            />
          </div>
          <div className="pa-field" style={{ maxWidth: 120 }}>
            <label title="Bleed added to all 4 sides of the trim size. Ink printed on the bleed area is measured (counts toward ink consumption) but is outside the finished-label trim. Leave 0 if your artwork is trim-sized.">
              Bleed (mm)
            </label>
            <DecimalInput
              value={config.bleedMm || 0}
              onChange={(v) => setConfig({ ...config, bleedMm: Math.max(0, Number(v) || 0) })}
            />
          </div>
        </div>
        <div className="pa-row">
          <div className="pa-field">
            <label>Drawing scale (artwork : physical)</label>
            <select
              value={config.scaleRatio}
              onChange={(e) => setConfig({ ...config, scaleRatio: Number(e.target.value) })}
              title="Use this when the artwork is drawn at a different size than the physical product. e.g. 2:1 means the drawing is 2× the real size, so a 60mm-wide drawing prints at 30mm."
            >
              <option value={1}>1 : 1 (actual size)</option>
              <option value={2}>2 : 1 (drawing 2× larger)</option>
              <option value={4}>4 : 1 (drawing 4× larger)</option>
              <option value={0.5}>1 : 2 (drawing half size)</option>
              <option value={0.25}>1 : 4 (drawing quarter size)</option>
            </select>
          </div>
          <div className="pa-field">
            <label>Render DPI</label>
            <select
              value={config.dpi}
              onChange={(e) => setConfig({ ...config, dpi: Number(e.target.value) })}
            >
              <option value={150}>150 (fast)</option>
              <option value={300}>300 (standard)</option>
              <option value={600}>600 (precise)</option>
            </select>
          </div>
        </div>
        {Number(config.scaleRatio) !== 1 && (
          <div className="pa-scale-hint">
            Physical = {(Number(config.widthMm) / Number(config.scaleRatio)).toFixed(2)} ×{' '}
            {(Number(config.heightMm) / Number(config.scaleRatio)).toFixed(2)} mm
          </div>
        )}

        <h4 className="pa-panel-title" style={{ marginTop: 14 }}>
          Print method
        </h4>
        <div className="pa-method-grid">
          {Object.values(INK_PROFILES).map((p) => (
            <label
              key={p.key}
              className={`pa-method-chip ${config.printMethod === p.key ? 'active' : ''}`}
              title={`${p.note}\nTransfer factor: ${p.transfer_factor} · Film: ${p.film_thickness_um} µm`}
            >
              <input
                type="radio"
                name="printMethod"
                value={p.key}
                checked={config.printMethod === p.key}
                onChange={() => setConfig({ ...config, printMethod: p.key })}
              />
              <span>{p.label}</span>
              <span className="pa-method-meta">
                ×{p.transfer_factor} · {p.film_thickness_um}µm
              </span>
            </label>
          ))}
        </div>

        <h4 className="pa-panel-title pa-title-row" style={{ marginTop: 14 }}>
          <span>Artwork</span>
          {file && (
            <button
              type="button"
              className="pa-clear-btn"
              onClick={clearFile}
              title="Remove artwork and upload a new one"
              aria-label="Remove artwork"
            >
              ×
            </button>
          )}
        </h4>
        <label
          className={`pa-dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {file ? (
            <div className="pa-dropzone-file">{file.name}</div>
          ) : (
            <div>
              <svg
                className="pa-dropzone-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <strong>Drop artwork here</strong>
              <span className="pa-dropzone-hint">
                click to browse · or paste with{' '}
                <kbd>{navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl V'}</kbd>
              </span>
              <span className="pa-dropzone-hint">PNG · JPG · WebP · SVG · PDF · AI</span>
            </div>
          )}
          <input
            type="file"
            accept="image/*,.pdf,.ai,application/pdf,application/postscript,application/illustrator"
            onChange={(e) => onFileSelected(e.target.files?.[0])}
          />
        </label>

        <h4 className="pa-panel-title" style={{ marginTop: 14 }}>
          Detection
        </h4>
        <div className="pa-field">
          <label>Background mode</label>
          <select
            value={config.bgMode}
            onChange={(e) => setConfig({ ...config, bgMode: e.target.value })}
          >
            <option value="auto">Auto (4-corner sample)</option>
            <option value="manual">Manual (white)</option>
          </select>
        </div>
        <div className="pa-field">
          <label>BG tolerance ({config.bgTolerance})</label>
          <input
            type="range"
            min="0"
            max="60"
            value={config.bgTolerance}
            onChange={(e) => setConfig({ ...config, bgTolerance: Number(e.target.value) })}
          />
        </div>
        <div className="pa-field">
          <label>K colors ({config.kColors})</label>
          <input
            type="range"
            min="1"
            max="16"
            value={config.kColors}
            onChange={(e) => setConfig({ ...config, kColors: Number(e.target.value) })}
          />
        </div>
        <div className="pa-field">
          <label>Merge threshold ({config.mergeThreshold})</label>
          <input
            type="range"
            min="0"
            max="40"
            value={config.mergeThreshold}
            onChange={(e) => setConfig({ ...config, mergeThreshold: Number(e.target.value) })}
          />
        </div>

        <div className="pa-field">
          <label title="How to trim the analysis region when you haven't drawn a manual ROI. 'Physical (input-driven)' is the most accurate when artwork has dimension-line margins — it crops to EXACTLY the W×H you entered above, anchored on the content centroid.">
            Crop mode
          </label>
          <div className="pa-radio-row">
            {[
              {
                k: 'dieline',
                label: 'Die-line (auto-detect stroke)',
                hint: 'Finds the thin closed stroke (any color) around the label and crops to its bbox — most accurate when artwork has a die-cut outline',
              },
              {
                k: 'physical',
                label: 'Physical (input-driven)',
                hint: 'Center-crop to W×H on content centroid',
              },
              {
                k: 'auto',
                label: 'Auto (erode + bbox)',
                hint: 'Legacy: crop to densest content bbox',
              },
              { k: 'none', label: 'None', hint: 'Analyze full canvas as-is' },
            ].map(({ k, label, hint }) => (
              <label key={k} className="pa-radio-opt" title={hint}>
                <input
                  type="radio"
                  name="pa-cropmode"
                  value={k}
                  checked={(config.cropMode || 'auto') === k}
                  onChange={() => setConfig({ ...config, cropMode: k, autoCrop: k !== 'none' })}
                  disabled={!!manualRoi}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {manualRoi && (
            <em style={{ color: '#6b7280', fontSize: 11 }}>
              Disabled while manual ROI is set — manual ROI always wins.
            </em>
          )}
        </div>

        <div className="pa-field">
          <label title="Morphological opening — removes thin strokes (≤ 2×N px wide) after cropping. Use when dim-line annotations share colors with legit label content and the crop alone didn't remove them. 0 = off (reproduces pre-sprint-7 numbers).">
            Thin-stroke removal ({config.thinStrokeIterations || 0})
          </label>
          <input
            type="range"
            min="0"
            max="3"
            value={config.thinStrokeIterations || 0}
            onChange={(e) => setConfig({ ...config, thinStrokeIterations: Number(e.target.value) })}
          />
        </div>

        <div className="pa-field">
          <label title="Artwork rotation. 'Auto' flips 90° when the bitmap aspect ratio doesn't match W×H (portrait artwork for a landscape label). Manual override if auto misdetects.">
            Rotation
          </label>
          <select
            value={String(config.rotation ?? 'auto')}
            onChange={(e) => {
              const v = e.target.value;
              setConfig({ ...config, rotation: v === 'auto' ? 'auto' : Number(v) });
            }}
          >
            <option value="auto">Auto-detect</option>
            <option value="0">0°</option>
            <option value="90">90° CW</option>
            <option value="180">180°</option>
            <option value="270">270° CW</option>
          </select>
        </div>

        <h4 className="pa-panel-title" style={{ marginTop: 14 }}>
          Accuracy (Sprint 8)
        </h4>
        <div className="pa-check-row">
          <label title="Use perceptual Lab color space (ΔE76) for cluster merging and nearest-centroid assignment. Default ON — merges JPG-artifact duplicates the eye can't distinguish. Turn off to reproduce pre-Sprint-8 numbers.">
            <input
              type="checkbox"
              checked={config.colorMetric !== 'rgb'}
              onChange={(e) =>
                setConfig({ ...config, colorMetric: e.target.checked ? 'lab' : 'rgb' })
              }
            />
            <span>Perceptual color distance (Lab / ΔE76)</span>
          </label>
        </div>
        <div className="pa-check-row">
          <label title="Give anti-aliased edge pixels a fractional ink weight (0..1) instead of counting them as full ink. Default ON — matches how the press actually lays ink. Shrinks coverage by 2-5% on vector art.">
            <input
              type="checkbox"
              checked={config.aaWeighting !== false}
              onChange={(e) => setConfig({ ...config, aaWeighting: e.target.checked })}
            />
            <span>Anti-aliasing sub-pixel weighting</span>
          </label>
        </div>
        <div className="pa-check-row">
          <label title="Fold press dot gain into the ink-volume math. Halftone screens grow on press (50% file ≈ 68% on substrate for flexo). Affects ink volume only — file-coverage % stays the true on-file number.">
            <input
              type="checkbox"
              checked={config.applyDotGain !== false}
              onChange={(e) => setConfig({ ...config, applyDotGain: e.target.checked })}
            />
            <span>Apply dot gain to ink volume</span>
          </label>
        </div>

        <div className="pa-check-row">
          <label title="Exclude magenta / pink clusters (CAD dieline / cut-mark convention) from the printed total. You can still override any color by clicking its row in the results.">
            <input
              type="checkbox"
              checked={config.autoExcludeDieline}
              onChange={(e) => setConfig({ ...config, autoExcludeDieline: e.target.checked })}
            />
            <span>Ignore dieline / die-cut outline (magenta)</span>
          </label>
        </div>

        <div className="pa-action-bar">
          <button
            className="pa-analyze-btn"
            disabled={!file}
            onClick={runAnalyze}
            title="Run analysis · ⌘↵ / Ctrl ↵"
          >
            ▶ Analyze artwork
          </button>
          <button
            className="pa-analyze-btn pa-save-btn"
            style={{ marginTop: 6 }}
            disabled={!result || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : '💾 Save result'}
          </button>
          {status && <div className="pa-progress">{status}</div>}
          {error && <div className="pa-error">{error}</div>}
        </div>

        <h4 className="pa-panel-title" style={{ marginTop: 14 }}>
          Notes
        </h4>
        <div className="pa-field">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              padding: 6,
              border: '1px solid #d1d5db',
              borderRadius: 5,
              fontFamily: 'inherit',
              fontSize: 12,
            }}
          />
        </div>
      </div>

      {/* RIGHT: Preview + results */}
      <div className="pa-preview-wrap">
        <div className="pa-canvas-pair">
          <div className="pa-canvas-side">
            <div className="pa-canvas-caption-top">
              <span>Original</span>
              {(objectUrl || result) && (
                <ZoomControls
                  value={originalZoom}
                  onChange={setOriginalZoom}
                  label="original artwork"
                />
              )}
            </div>
            <div
              className={`pa-canvas-box ${status ? 'is-analyzing' : ''} ${originalZoom !== 1 ? 'is-zoomed' : ''}`}
            >
              {objectUrl || result ? (
                <canvas
                  ref={canvasRef}
                  className={roiMode || pickMode ? 'pa-canvas-roi' : ''}
                  style={{ zoom: originalZoom }}
                  onMouseDown={onCanvasMouseDown}
                  onMouseMove={onCanvasMouseMove}
                  onMouseUp={onCanvasMouseUp}
                  onMouseLeave={onCanvasMouseUp}
                  onClick={onCanvasClick}
                />
              ) : (
                <div className="pa-canvas-empty">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <strong>No artwork yet</strong>
                  <span>Upload via the dropzone on the left</span>
                </div>
              )}
            </div>
            <div className="pa-canvas-caption">
              {(() => {
                const sc = Number(config.scaleRatio) || 1;
                const w = (Number(config.widthMm) || 0) / sc;
                const h = (Number(config.heightMm) || 0) / sc;
                if (!w || !h) return '—';
                return (
                  <>
                    <b>
                      {w.toFixed(2)} × {h.toFixed(2)} mm
                    </b>
                    {sc !== 1 && <span className="pa-canvas-caption-sub"> · scale {sc}:1</span>}
                  </>
                );
              })()}
            </div>
          </div>

          <div className="pa-canvas-side">
            <div className="pa-canvas-caption-top">
              <span>Analysis area</span>
              {analysisDims?.source === 'manual' && (
                <span className="pa-caption-tag pa-tag-manual">manual ROI</span>
              )}
              {analysisDims?.source === 'auto' && (
                <span className="pa-caption-tag pa-tag-auto">auto-crop</span>
              )}
              {analysisDims?.source === 'full' && (
                <span className="pa-caption-tag pa-tag-full">full canvas</span>
              )}
              {autoBusy && <span className="pa-caption-tag pa-tag-busy">syncing…</span>}
              {result && (
                <ZoomControls
                  value={analysisZoom}
                  onChange={setAnalysisZoom}
                  label="analysis area"
                />
              )}
            </div>
            <div
              className={`pa-canvas-box ${autoBusy ? 'is-analyzing' : ''} ${analysisZoom !== 1 ? 'is-zoomed' : ''}`}
            >
              {result ? (
                <canvas ref={analysisCanvasRef} style={{ zoom: analysisZoom }} />
              ) : (
                <div className="pa-canvas-empty">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <strong>Awaiting analysis</strong>
                  <span>
                    Press <kbd>{navigator.platform.includes('Mac') ? '⌘↵' : 'Ctrl ↵'}</kbd> or click{' '}
                    <em>Analyze</em>
                  </span>
                </div>
              )}
            </div>
            <div className="pa-canvas-caption">
              {analysisDims ? (
                <>
                  <b>
                    {analysisDims.wMm.toFixed(2)} × {analysisDims.hMm.toFixed(2)} mm
                  </b>
                  <span className="pa-canvas-caption-sub">
                    {' '}
                    · {analysisDims.area_mm2.toFixed(2)} mm² · {analysisDims.px_w}×
                    {analysisDims.px_h} px
                  </span>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
        </div>

        {result?.bg_sanity && !result.bg_sanity.ok && (
          <div className="pa-bg-warning" role="status" aria-live="polite">
            <b>Background detection may be wrong.</b>{' '}
            {result.bg_sanity.hint || 'Pick BG manually from a margin pixel.'}{' '}
            <span className="pa-bg-warning-meta">
              (printable ratio: {(result.bg_sanity.printable_ratio * 100).toFixed(1)}%)
            </span>
          </div>
        )}
        {result?.rotation_applied > 0 && (
          <div className="pa-info-banner">
            Rotated artwork {result.rotation_applied}°{' '}
            {result.rotation_source === 'auto' ? '(auto-detect)' : '(manual)'} to match label
            aspect.
          </div>
        )}
        {result?.bleed_mm > 0 && (
          <div className="pa-info-banner">
            Bleed {result.bleed_mm} mm applied: frame {result.frame_width_mm.toFixed(1)}×
            {result.frame_height_mm.toFixed(1)} mm, trim {result.trim_width_mm.toFixed(1)}×
            {result.trim_height_mm.toFixed(1)} mm. Ink volumes include bleed; trim-only mm² shown
            via &times;{result.trim_ratio.toFixed(3)}.
          </div>
        )}
        {result?.dieline &&
          (() => {
            const dw = result.dieline.detected_width_mm;
            const dh = result.dieline.detected_height_mm;
            const dimDrift =
              Math.abs(dw - config.widthMm) / config.widthMm > 0.02 ||
              Math.abs(dh - config.heightMm) / config.heightMm > 0.02;
            return (
              <div className="pa-info-banner pa-dieline-banner">
                <span className="pa-dieline-swatch" style={{ background: result.dieline.hex }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>Die-line detected:</b> {result.dieline.hex} (
                  {result.dieline.pixel_count.toLocaleString()} px, stroke score{' '}
                  {result.dieline.stroke_score.toFixed(1)}){' · '}
                  <b>
                    {dw.toFixed(2)} × {dh.toFixed(2)} mm
                  </b>
                  {dimDrift && (
                    <em style={{ color: '#8a5a00', marginLeft: 6 }}>
                      ({(((dw - config.widthMm) / config.widthMm) * 100).toFixed(1)}% W /{' '}
                      {(((dh - config.heightMm) / config.heightMm) * 100).toFixed(1)}% H drift vs
                      typed)
                    </em>
                  )}
                </div>
                {dimDrift && (
                  <button
                    type="button"
                    className="pa-roi-btn"
                    style={{ flexShrink: 0 }}
                    title="Overwrite the typed Width/Height with the dimensions implied by the detected die-line bbox, then you can re-analyze for a second pass."
                    onClick={() =>
                      setConfig((p) => ({
                        ...p,
                        widthMm: Number(dw.toFixed(2)),
                        heightMm: Number(dh.toFixed(2)),
                      }))
                    }
                  >
                    Apply dims →
                  </button>
                )}
              </div>
            );
          })()}

        {result && (
          <div className="pa-overlay-toggles">
            <span
              className={`pa-overlay-chip ${overlayOn.__original ? 'active' : ''}`}
              onClick={() => setOverlayOn({ ...overlayOn, __original: !overlayOn.__original })}
            >
              Original
            </span>
            {result.crop && (
              <span
                className="pa-overlay-chip"
                style={{ background: '#dcfce7', color: '#166534', cursor: 'default' }}
              >
                ⬚ Label bbox {result.crop.w}×{result.crop.h} px
              </span>
            )}
            {result.colors.map((c) => (
              <span
                key={c.idx}
                className={`pa-overlay-chip ${overlayOn[`c${c.idx}`] ? 'active' : ''} ${c.excluded ? 'excluded' : ''}`}
                onClick={() =>
                  setOverlayOn({ ...overlayOn, [`c${c.idx}`]: !overlayOn[`c${c.idx}`] })
                }
                title={c.excluded ? 'Excluded from total — click the row below to re-include' : ''}
              >
                <span className="pa-overlay-swatch" style={{ background: c.hex }} />
                {c.name} ({(c.print_area_pct * 100).toFixed(1)}%)
                {c.excluded && ' · ignored'}
              </span>
            ))}
          </div>
        )}

        {pickedPixel && (
          <div className="pa-pick-info">
            <span className="pa-pick-swatch" style={{ background: pickedPixel.hex }} />
            <div className="pa-pick-meta">
              <div className="pa-pick-row">
                <b>{pickedPixel.hex}</b> · RGB({pickedPixel.rgb.join(', ')})
              </div>
              <div className="pa-pick-row pa-pick-sub">
                @ ({pickedPixel.x}, {pickedPixel.y}) px · nearest: {pickedPixel.name}
              </div>
              {pickedPixel.cluster ? (
                <button
                  type="button"
                  className={`pa-pick-row pa-pick-ink ${overlayOn[`c${pickedPixel.cluster.idx}`] ? 'overlay-on' : ''}`}
                  onClick={() =>
                    setOverlayOn((prev) => ({
                      ...prev,
                      [`c${pickedPixel.cluster.idx}`]: !prev[`c${pickedPixel.cluster.idx}`],
                    }))
                  }
                  title="Click to highlight this ink's area on the canvas"
                >
                  <span
                    className="pa-pick-swatch sm"
                    style={{ background: pickedPixel.cluster.hex }}
                  />
                  Ink #{pickedPixel.cluster.idx} · {pickedPixel.cluster.name} ·{' '}
                  {(pickedPixel.cluster.print_area_pct * 100).toFixed(1)}%
                  {pickedPixel.cluster.excluded && (
                    <em style={{ color: '#92400e', marginLeft: 4 }}>(ignored)</em>
                  )}
                  {overlayOn[`c${pickedPixel.cluster.idx}`] && (
                    <span className="pa-overlay-dot">●</span>
                  )}
                </button>
              ) : (
                <div className="pa-pick-row pa-pick-sub">
                  No analysis yet — run Analyze to map to detected inks.
                </div>
              )}
              {(() => {
                const hex = String(pickedPixel.hex || '').toUpperCase();
                const pinned = (config.pinnedSpotHex || []).map((h) => String(h).toUpperCase());
                const isPinned = pinned.includes(hex);
                return (
                  <button
                    type="button"
                    className={`pa-pick-row pa-pick-pin ${isPinned ? 'pinned' : ''}`}
                    onClick={() => {
                      setConfig((prev) => {
                        const cur = new Set(
                          (prev.pinnedSpotHex || []).map((h) => String(h).toUpperCase())
                        );
                        if (cur.has(hex)) cur.delete(hex);
                        else cur.add(hex);
                        return { ...prev, pinnedSpotHex: Array.from(cur) };
                      });
                    }}
                    title={
                      isPinned
                        ? 'Remove this color from the forced-ink list. Re-run Analyze to apply.'
                        : 'Force this color to have its own cluster, even if coverage is tiny. Re-run Analyze to apply.'
                    }
                  >
                    {isPinned ? '📌 Pinned as spot ink · click to unpin' : '📌 Pin as spot ink'}
                  </button>
                );
              })()}
              <button type="button" className="pa-pick-clear" onClick={() => setPickedPixel(null)}>
                × clear
              </button>
            </div>
          </div>
        )}

        {Array.isArray(config.pinnedSpotHex) && config.pinnedSpotHex.length > 0 && (
          <div className="pa-pinned-row" role="list" aria-label="Pinned spot inks">
            <span className="pa-pinned-label">📌 Pinned spot inks:</span>
            {config.pinnedSpotHex.map((hex) => (
              <span key={hex} className="pa-pinned-chip" role="listitem" title={hex}>
                <span className="pa-overlay-swatch" style={{ background: hex }} />
                <code>{hex}</code>
                <button
                  type="button"
                  className="pa-pinned-remove"
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      pinnedSpotHex: (prev.pinnedSpotHex || []).filter(
                        (h) => String(h).toUpperCase() !== String(hex).toUpperCase()
                      ),
                    }))
                  }
                  aria-label={`Remove ${hex}`}
                  title="Remove. Re-run Analyze to apply."
                >
                  ×
                </button>
              </span>
            ))}
            <span className="pa-pinned-hint">
              Re-run <b>Analyze</b> to apply.
            </span>
          </div>
        )}

        <div className="pa-panel">
          <h4 className="pa-panel-title pa-title-row pa-results-header">
            <span className="pa-results-header-title">
              Results {result ? `· Canvas ${canvasPx}` : ''}
              {result && (
                <span className="pa-results-method">
                  · {getInkProfile(result.print_method).label}
                  {result.scale_ratio !== 1 && ` · scale ${result.scale_ratio}:1`}
                </span>
              )}
              {result && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 400,
                    color: '#6b7280',
                    marginLeft: 8,
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}
                >
                  Click a row to toggle ignore
                </span>
              )}
            </span>
            <div className="pa-results-header-tools">
              <button
                type="button"
                className={`pa-roi-btn ${roiMode ? 'active' : ''}`}
                onClick={() => {
                  setRoiMode((m) => !m);
                  setPickMode(false);
                }}
                title="Toggle drag-to-select mode. Drag a rectangle on the preview canvas to define the exact label region."
              >
                {roiMode ? '✓ Drawing ROI' : '⬚ Draw ROI'}
              </button>
              <button
                type="button"
                className={`pa-roi-btn ${pickMode ? 'active pa-pick-active' : ''}`}
                onClick={() => {
                  setPickMode((m) => !m);
                  setRoiMode(false);
                }}
                title="Toggle pixel inspector. Click anywhere on the canvas to read its color + which detected ink it belongs to."
              >
                {pickMode ? '✓ Inspect ON' : '🎯 Inspect color'}
              </button>
              {manualRoi && (
                <button
                  type="button"
                  className="pa-roi-btn pa-roi-clear"
                  onClick={clearRoi}
                  title="Remove the manual selection and fall back to auto-crop"
                >
                  ×
                </button>
              )}
              {result && result.colors.some((c) => !c.excluded) && (
                <button
                  type="button"
                  className="pa-sep-btn"
                  onClick={downloadSeparations}
                  title="Download one PNG per color (film positive — black where the ink prints, white elsewhere)"
                >
                  ⬇ Separations
                </button>
              )}
            </div>
          </h4>
          {roiPhysical && (
            <div className="pa-roi-info">
              <div>
                <b>X = {roiPhysical.wMm.toFixed(2)} mm</b> ·{' '}
                <b>Y = {roiPhysical.hMm.toFixed(2)} mm</b>
              </div>
              <div>
                Area: {roiPhysical.area_mm2.toFixed(2)} mm² · {roiPhysical.area_m2.toExponential(3)}{' '}
                m² · {roiPhysical.px_w}×{roiPhysical.px_h} px
              </div>
              {manualRoi && !roiDrag && (
                <div style={{ marginTop: 3, opacity: 0.85 }}>
                  ↻ Re-run <b>Analyze</b> to apply this ROI
                </div>
              )}
            </div>
          )}
          {roiMode && !manualRoi && !roiDrag && (
            <div className="pa-roi-info pa-roi-hint">
              Click + drag on the preview canvas to mark the label area.
            </div>
          )}
          {pickMode && !pickedPixel && (
            <div className="pa-roi-info pa-roi-hint">
              Click anywhere on the canvas — result appears above the Results table.
            </div>
          )}
          {!result && (
            <div style={{ color: 'var(--pa-text-subtle)', fontSize: 12, fontStyle: 'italic' }}>
              Run analysis to see per-color breakdown.
            </div>
          )}

          {/* Vector Ink Plates panel — shown when the input was a
              PDF/AI file and the vector engine produced plate-level
              coverage data. This mirrors the Esko Ink Wizard /
              PitStop "Ink Coverage" report: each plate gets its own
              row with a swatch, Pantone/CMYK identifier, area, and
              percentage. The raster cluster table (below) is still
              rendered too — the two views are complementary:
                · Plates = pricing authority (consumed ink volume)
                · Clusters = visual QC (what the eye sees) */}
          {result?.vector_ink?.plates?.length > 0 && (
            <div className="pa-panel pa-panel-plates">
              <h4 className="pa-panel-title pa-title-row">
                <span>
                  🧪 INK PLATES{' '}
                  <span style={{ fontSize: 10, fontWeight: 400, color: '#6b7280' }}>
                    · Vector pre-press analysis · {result.vector_ink.plates.length} plate
                    {result.vector_ink.plates.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 400,
                    color: '#6b7280',
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}
                >
                  Total inked: {(result.vector_ink.totalPrintedPct * 100).toFixed(2)}% ·{' '}
                  {result.vector_ink.totalPrintedMm2.toFixed(2)} mm²
                </span>
              </h4>
              {result.vector_ink.warnings?.length > 0 && (
                <div className="pa-bg-sanity pa-bg-sanity-warning" style={{ marginBottom: 8 }}>
                  {result.vector_ink.warnings.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}
              <table className="pa-results">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th style={{ width: 28 }}>Swatch</th>
                    <th>Plate</th>
                    <th>Type</th>
                    <th className="num">Area %</th>
                    <th className="num">Area mm²</th>
                    <th className="num" title="Number of vector objects drawn on this plate">
                      Objects
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.vector_ink.plates.map((p, i) => (
                    <tr key={p.key} className={p.type === 'raster' ? 'excluded' : ''}>
                      <td>{i + 1}</td>
                      <td>
                        <span
                          className="pa-swatch"
                          style={{
                            background:
                              p.type === 'raster'
                                ? 'repeating-linear-gradient(45deg,#e5e7eb 0 4px,#f3f4f6 4px 8px)'
                                : getPlateSwatch(p.color),
                          }}
                        />
                      </td>
                      <td>
                        <b>{p.name}</b>
                        {p.type === 'spot' && (
                          <span
                            className="pa-excluded-tag"
                            style={{ background: '#fef3c7', color: '#92400e' }}
                          >
                            SPOT
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>
                        {p.type}
                      </td>
                      <td
                        className="num pa-pct-cell"
                        style={{ '--pa-pct': `${Math.min(100, p.coveragePct * 100)}%` }}
                      >
                        {(p.coveragePct * 100).toFixed(2)}%
                      </td>
                      <td className="num">{p.areaMm2.toFixed(2)}</td>
                      <td className="num" style={{ color: '#6b7280' }}>
                        {p.objectCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 6, fontStyle: 'italic' }}>
                Plate areas are computed directly from the PDF content stream (Shoelace integration
                of vector geometry), not from pixel clusters. This matches the pre-press convention
                used by Esko Ink Wizard / PitStop / Hybrid Packz.
              </div>
            </div>
          )}

          {result &&
            (() => {
              const includedColors = result.colors.filter((c) => !c.excluded);
              const totalIncludedPct = includedColors.reduce((s, c) => s + c.print_area_pct, 0);
              return (
                <>
                  {/* Stacked coverage bar — visualize the split across all
                    included inks at once. Each segment is sized by its
                    pct of the TOTAL canvas (so the gray remainder
                    represents the unprinted substrate). */}
                  <div
                    className="pa-stack-bar"
                    role="img"
                    aria-label={`Coverage breakdown: ${(totalIncludedPct * 100).toFixed(1)}% printed`}
                  >
                    {includedColors.map((c) => (
                      <span
                        key={c.idx}
                        title={`${c.name} · ${(c.print_area_pct * 100).toFixed(2)}%`}
                        style={{ width: `${c.print_area_pct * 100}%`, background: c.hex }}
                      />
                    ))}
                  </div>
                  <div className="pa-stack-legend">
                    {includedColors.length === 0
                      ? 'No inks counted (all excluded)'
                      : `${(totalIncludedPct * 100).toFixed(2)}% printed · ${(100 - totalIncludedPct * 100).toFixed(2)}% substrate`}
                  </div>
                </>
              );
            })()}
          {result && (
            <table className="pa-results">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ width: 40 }}>Color</th>
                  <th>Name</th>
                  <th>Hex</th>
                  <th className="num">Area %</th>
                  <th className="num">Area mm²</th>
                  <th
                    className="num"
                    title="Wet ink volume per single label, given the active print method"
                  >
                    µL/label
                  </th>
                  <th className="num" title="Wet ink volume to print 1,000 labels of this size">
                    mL/1k
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.colors.map((c) => {
                  const overlayActive = !!overlayOn[`c${c.idx}`];
                  const toggleOverlay = (e) => {
                    // stopPropagation so the row's "toggle ignored"
                    // handler doesn't ALSO fire — these two cells own
                    // the overlay action exclusively.
                    e.stopPropagation();
                    setOverlayOn((prev) => ({ ...prev, [`c${c.idx}`]: !prev[`c${c.idx}`] }));
                  };
                  return (
                    <tr
                      key={c.idx}
                      className={`clickable ${c.excluded ? 'excluded' : ''} ${overlayActive ? 'overlay-on' : ''}`}
                      onClick={() => toggleColorExcluded(c.idx)}
                      title={
                        c.excluded
                          ? 'Click to include in total · click # or swatch to highlight on canvas'
                          : 'Click to ignore in total · click # or swatch to highlight on canvas'
                      }
                    >
                      <td
                        className="pa-show-cell"
                        onClick={toggleOverlay}
                        title="Show this ink area on the canvas"
                      >
                        {c.idx}
                        {overlayActive && (
                          <span className="pa-overlay-dot" aria-hidden="true">
                            ●
                          </span>
                        )}
                      </td>
                      <td
                        className="pa-show-cell"
                        onClick={toggleOverlay}
                        title="Show this ink area on the canvas"
                      >
                        <span className="pa-swatch" style={{ background: c.hex }} />
                      </td>
                      <td>
                        {c.name}
                        {c.excluded && (
                          <span className="pa-excluded-tag">
                            ignored
                            {c.excluded_reason === 'dieline'
                              ? ' · dieline'
                              : c.excluded_reason === 'user'
                                ? ' · user'
                                : ''}
                          </span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.hex}</td>
                      <td
                        className="num pa-pct-cell"
                        style={{ '--pa-pct': `${Math.min(100, c.print_area_pct * 100)}%` }}
                      >
                        {(c.print_area_pct * 100).toFixed(2)}%
                      </td>
                      <td className="num">{c.print_area_mm2.toFixed(2)}</td>
                      <td className="num">{(c.ink_uL_per_label || 0).toFixed(3)}</td>
                      <td className="num">{(c.ink_mL_per_1k || 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right' }}>
                    Total print coverage (excluding ignored)
                  </td>
                  <td className="num">{totalPct}%</td>
                  <td className="num">{totalMm2}</td>
                  <td className="num">
                    {result.colors
                      .filter((c) => !c.excluded)
                      .reduce((s, c) => s + (c.ink_uL_per_label || 0), 0)
                      .toFixed(3)}
                  </td>
                  <td className="num">
                    {result.colors
                      .filter((c) => !c.excluded)
                      .reduce((s, c) => s + (c.ink_mL_per_1k || 0), 0)
                      .toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Library sub-tab ───────────────────────────────────────────────
function LibraryTab({ jobs, loading, error, onReload, onOpen }) {
  const [q, setQ] = useState('');
  // Right-click context menu state. `x,y` are viewport-relative
  // (from MouseEvent.clientX/Y) so we position the floating menu via
  // fixed coords that don't drift when the table scrolls underneath.
  const [menu, setMenu] = useState(null); // { x, y, job } | null
  const menuRef = useRef(null);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter(
      (j) =>
        (j.sku || '').toLowerCase().includes(needle) ||
        (j.product_name || '').toLowerCase().includes(needle)
    );
  }, [jobs, q]);

  const handleDelete = useCallback(
    async (sku) => {
      if (!window.confirm(`Delete measurement for SKU "${sku}"?`)) return;
      try {
        await sharedApi.deletePrintAreaJob(sku);
        onReload?.();
      } catch (e) {
        window.alert(`Delete failed: ${e?.message || e}`);
      }
    },
    [onReload]
  );

  // Close the menu on outside click / Escape / scroll. Listener is
  // mounted only while the menu is visible to avoid leaking handlers.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  // Clamp the menu inside the viewport so a right-click near the
  // bottom/right edge doesn't scroll pages off-screen.
  const clamped = useMemo(() => {
    if (!menu) return null;
    const W = window.innerWidth,
      H = window.innerHeight;
    const MW = 160,
      MH = 88; // approximate menu dimensions
    return {
      x: Math.min(menu.x, W - MW - 8),
      y: Math.min(menu.y, H - MH - 8),
    };
  }, [menu]);

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Search by SKU or product name..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, padding: 6, border: '1px solid #d1d5db', borderRadius: 5 }}
        />
        <button
          onClick={onReload}
          style={{
            padding: '6px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 5,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          ↻ Reload
        </button>
      </div>
      {loading && (
        <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      )}
      {error && <div className="pa-error">{error} — showing local results only.</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          No saved measurements yet.
        </div>
      )}
      {filtered.length > 0 && (
        <table className="pa-library-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Size (mm)</th>
              <th>Method</th>
              <th>Colors</th>
              <th style={{ textAlign: 'right' }}>Print %</th>
              <th style={{ textAlign: 'right' }}>Print mm²</th>
              <th>Created</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => (
              <tr
                key={j.id || j.sku}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, job: j });
                }}
                className="pa-library-row"
              >
                <td style={{ fontWeight: 700 }}>{j.sku}</td>
                <td>{j.product_name || '—'}</td>
                <td>
                  {j.width_mm} × {j.height_mm}
                  {j.scale_ratio && j.scale_ratio !== 1 && (
                    <div style={{ fontSize: 10, color: '#6b7280' }}>scale {j.scale_ratio}:1</div>
                  )}
                </td>
                <td style={{ fontSize: 11 }}>
                  {j.print_method ? INK_PROFILES[j.print_method]?.label || j.print_method : '—'}
                </td>
                <td>
                  {(j.colors || []).map((c) => (
                    <span
                      key={c.idx}
                      className="pa-swatch"
                      style={{ background: rgbToHex(c.rgb), marginRight: 3, width: 18, height: 14 }}
                      title={`${c.name} ${(c.print_area_pct * 100).toFixed(1)}%`}
                    />
                  ))}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {j.totals ? (j.totals.total_print_pct * 100).toFixed(2) + '%' : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {j.totals ? j.totals.total_print_mm2.toFixed(2) : '—'}
                </td>
                <td style={{ fontSize: 11, color: '#6b7280' }}>
                  {(j.created_at || '').slice(0, 16).replace('T', ' ')}
                </td>
                <td>
                  <button
                    type="button"
                    title="Actions — or right-click any row"
                    aria-haspopup="menu"
                    className="pa-library-actions-btn"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenu({ x: r.right, y: r.bottom, job: j });
                    }}
                  >
                    ⋯
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {menu && clamped && (
        <div
          ref={menuRef}
          className="pa-context-menu"
          role="menu"
          aria-label={`Actions for ${menu.job.sku}`}
          style={{ top: clamped.y, left: clamped.x }}
        >
          <div className="pa-context-menu-header">{menu.job.sku}</div>
          <button
            type="button"
            role="menuitem"
            className="pa-context-menu-item"
            onClick={() => {
              const job = menu.job;
              setMenu(null);
              onOpen?.(job);
            }}
          >
            <span className="pa-context-menu-ico">↗</span> Open
          </button>
          <button
            type="button"
            role="menuitem"
            className="pa-context-menu-item pa-context-menu-danger"
            onClick={() => {
              const sku = menu.job.sku;
              setMenu(null);
              handleDelete(sku);
            }}
          >
            <span className="pa-context-menu-ico">🗑</span> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Legend sub-tab ────────────────────────────────────────────────
// Bilingual EN/VN. Each card stacks an English heading with its VN
// translation; body lists keep their EN bullets and add a VN sibling
// in italic grey beneath. Operators trained in either language can
// scan the same page without translation friction.
function LegendTab() {
  return (
    <div className="pa-legend-wrap">
      <div className="pa-legend-card">
        <h3>Pipeline / Quy trình xử lý</h3>
        <ol>
          <li>
            Render artwork to a canvas sized <code>widthMm × heightMm × (dpi / 25.4)</code> pixels
            (PDF/AI via pdf.js, raster via createImageBitmap).
            <div className="pa-bi-vi">
              Render artwork lên canvas kích thước <code>widthMm × heightMm × (dpi / 25.4)</code>{' '}
              pixel (PDF/AI dùng pdf.js, ảnh raster dùng createImageBitmap).
            </div>
          </li>
          <li>
            Detect background: sample 4 corners, pick the most-agreed color (robust to one rogue
            corner).
            <div className="pa-bi-vi">
              Phát hiện nền: lấy mẫu 4 góc, chọn màu có nhiều phiếu nhất (chịu được 1 góc bất
              thường).
            </div>
          </li>
          <li>
            Crop to region of interest — <b>manual ROI wins</b>; else auto-erode dim lines + take
            bbox; else use full canvas.
            <div className="pa-bi-vi">
              Cắt vùng quan tâm — <b>ROI thủ công ưu tiên</b>; không thì auto erode + lấy bbox; cuối
              cùng dùng full canvas.
            </div>
          </li>
          <li>
            Mask out BG pixels using Euclidean RGB distance ≤ tolerance (transparent px always BG).
            <div className="pa-bi-vi">
              Loại pixel nền theo khoảng cách RGB Euclid ≤ tolerance (pixel trong suốt luôn = nền).
            </div>
          </li>
          <li>
            Quantize remaining pixels into K clusters via median-cut.
            <div className="pa-bi-vi">Phân cụm pixel còn lại thành K cluster bằng median-cut.</div>
          </li>
          <li>
            Merge clusters whose centroids are within <code>mergeThreshold</code> — removes JPG halo
            duplicates.
            <div className="pa-bi-vi">
              Gộp cluster có centroid gần nhau trong <code>mergeThreshold</code> — loại halo trùng
              do nén JPG.
            </div>
          </li>
          <li>
            Apply scale ratio: physical mm² = (entered mm / scale)² so output reflects the real
            label, not the drawing.
            <div className="pa-bi-vi">
              Áp tỷ lệ vẽ: mm² thực = (mm nhập / scale)² để kết quả phản ánh nhãn thật, không phải
              bản vẽ.
            </div>
          </li>
          <li>
            Apply ink profile: per-color µL = area_mm² × film_µm × transfer_factor × 0.001.
            <div className="pa-bi-vi">
              Áp ink profile: µL/màu = area_mm² × film_µm × transfer_factor × 0.001.
            </div>
          </li>
          <li>
            Report pixel count → <code>% of canvas</code> → <code>mm² of physical area</code> →{' '}
            <code>µL/label</code> + <code>mL/1k</code>.
            <div className="pa-bi-vi">
              Báo: số pixel → <code>% canvas</code> → <code>mm² thực tế</code> →{' '}
              <code>µL/nhãn</code> + <code>mL/1k</code>.
            </div>
          </li>
        </ol>
      </div>
      <div className="pa-legend-card">
        <h3>
          Print methods (ink transfer factor + film thickness) / Phương pháp in (hệ số truyền + độ
          dày màng mực)
        </h3>
        <table className="pa-results">
          <thead>
            <tr>
              <th>Method / Phương pháp</th>
              <th className="num">Factor / Hệ số</th>
              <th className="num">Film µm / Màng µm</th>
              <th>Notes / Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(INK_PROFILES).map((p) => (
              <tr key={p.key}>
                <td>
                  <b>{p.label}</b>
                </td>
                <td className="num">{p.transfer_factor}</td>
                <td className="num">{p.film_thickness_um}</td>
                <td className="pa-legend-note">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pa-legend-card">
        <h3>Manual ROI + drawing scale / ROI thủ công + tỷ lệ bản vẽ</h3>
        <ul>
          <li>
            <b>Manual ROI</b> — toggle "Draw selection on canvas", drag a rectangle on the preview;
            the analysis runs only inside that box. Use this when auto-crop picks up unwanted
            technical annotations, multi-up layouts, or front+back drawings on the same sheet.
            <div className="pa-bi-vi">
              <b>ROI thủ công</b> — bật "Draw selection on canvas", kéo 1 hình chữ nhật trên
              preview; phân tích chỉ chạy trong khung đó. Dùng khi auto-crop bắt nhầm chú thích kỹ
              thuật, layout nhiều mặt, hoặc bản vẽ mặt trước+sau cùng trang.
            </div>
          </li>
          <li>
            <b>Drawing scale</b> — pick a ratio when the artwork file is drawn at non-1:1. Example:
            a 60×40 mm artwork drawn at 2:1 prints as 30×20 mm physical. Pixel % is unchanged; mm² +
            µL outputs use the physical dims.
            <div className="pa-bi-vi">
              <b>Tỷ lệ bản vẽ</b> — chọn khi file artwork không vẽ 1:1. Ví dụ: artwork 60×40 mm vẽ
              tỷ lệ 2:1 → in thực 30×20 mm. % pixel không đổi; mm² + µL dùng kích thước thực.
            </div>
          </li>
        </ul>
      </div>
      <div className="pa-legend-card">
        <h3>Color separations export / Xuất tách màu</h3>
        <p>
          Click <b>⬇ Separations</b> in the Results panel to download one PNG per detected color.
          Each PNG is a film-positive — the color's pixels rendered as solid black on white, sized
          to the analysed region. Drop these straight into your screen-burning workflow (silkscreen)
          or plate-imaging step (flexo / letterpress).
        </p>
        <p className="pa-bi-vi">
          Click <b>⬇ Separations</b> ở panel Results để tải 1 PNG cho mỗi màu phát hiện. Mỗi PNG là
          film positive — pixel của màu đó vẽ thành đen đặc trên nền trắng, đúng kích thước vùng đã
          phân tích. Chuyển thẳng sang quy trình burning lưới (silkscreen) hoặc lên bản (flexo /
          letterpress).
        </p>
      </div>
      <div className="pa-legend-card">
        <h3>Tuning / Điều chỉnh tham số</h3>
        <ul>
          <li>
            <b>BG tolerance</b> — raise for noisy scans, lower for clean vector art (default 12).
            <div className="pa-bi-vi">
              <b>Tolerance nền</b> — tăng cho ảnh scan nhiễu, giảm cho vector sạch (mặc định 12).
            </div>
          </li>
          <li>
            <b>K colors</b> — upper bound (1–16); merge step reduces to true color count. Default 8
            reserves headroom for rare spot inks.
            <div className="pa-bi-vi">
              <b>K màu</b> — giới hạn trên (1–16); bước merge giảm về số màu thật. Mặc định 8 chừa
              chỗ cho mực pha hiếm.
            </div>
          </li>
          <li>
            <b>Merge threshold</b> — 18 works for most CMYK labels; raise to 24+ for heavy JPG
            compression.
            <div className="pa-bi-vi">
              <b>Ngưỡng merge</b> — 18 phù hợp đa số nhãn CMYK; tăng lên 24+ với ảnh nén JPG nặng.
            </div>
          </li>
          <li>
            <b>DPI</b> — 300 is the standard label print DPI; 600 doubles accuracy and render time.
            <div className="pa-bi-vi">
              <b>DPI</b> — 300 là DPI in nhãn chuẩn; 600 tăng gấp đôi độ chính xác và thời gian
              render.
            </div>
          </li>
        </ul>
      </div>

      <div className="pa-legend-card">
        <h3>
          Sprint 9 — Spot-color detection (red warnings, brand inks) / Phát hiện màu pha (cảnh báo
          đỏ, mực thương hiệu)
        </h3>
        <p>
          Pre-Sprint-9, MMCQ (median-cut quantization) absorbed tiny but visually distinct spot inks
          into dominant clusters because the algorithm is pixel-density-biased. The classic failure:
          a mostly-black label with 0.3% red "Wash / Rinse / Spin" warning text lost the red
          entirely. Three independent safeguards now guarantee spot inks survive, each with a
          distinct failure mode.
        </p>
        <p className="pa-bi-vi">
          Trước Sprint 9, MMCQ (median-cut quantization) gộp các mực pha nhỏ nhưng rõ thị giác vào
          cluster chính vì thuật toán thiên về mật độ pixel. Lỗi điển hình: nhãn gần như đen với
          0.3% chữ đỏ "Wash / Rinse / Spin" mất hoàn toàn màu đỏ. Giờ có 3 lớp bảo vệ độc lập, mỗi
          lớp xử lý một dạng thất bại khác nhau.
        </p>
        <ol>
          <li>
            <b>Chroma-weighted sampling</b> <em>(on by default)</em> — before MMCQ runs, pixels with
            perceptual chroma C* &gt; 20 in Lab space are replicated 1–8× (scaling with chroma) so
            the color-space histogram reads spot inks as "dense enough" to claim a cluster.
            Replication only affects centroid SELECTION; the subsequent nearest-centroid counting
            pass runs against the original pixel list, so coverage totals are unaffected.
            <div className="pa-bi-vi">
              <b>Lấy mẫu theo chroma</b> <em>(mặc định bật)</em> — trước khi chạy MMCQ, pixel có
              chroma cảm nhận C* &gt; 20 trong Lab được nhân 1–8× (theo chroma) để histogram màu coi
              mực pha là "đủ dày" để giữ cluster. Việc nhân chỉ ảnh hưởng CHỌN centroid; pass đếm
              sau đó chạy trên pixel gốc nên tổng coverage không đổi.
            </div>
          </li>
          <li>
            <b>Outlier rescue</b> <em>(on by default)</em> — after quantize + merge, every printable
            pixel's distance to the nearest centroid is measured; pixels beyond ΔE &gt; 15 are
            sub-quantized (up to 3 new centroids). Candidates whose weight is ≥ 0.1% of the
            printable total are promoted to real clusters and the full pixel set is re-counted. This
            is the safety net when chroma-boost alone cannot surface a rare ink.
            <div className="pa-bi-vi">
              <b>Cứu outlier</b> <em>(mặc định bật)</em> — sau khi quantize + merge, đo khoảng cách
              của mỗi pixel in được tới centroid gần nhất; pixel vượt ΔE &gt; 15 sẽ được phân cụm
              con (tối đa 3 centroid mới). Ứng viên có trọng lượng ≥ 0.1% tổng pixel in được sẽ
              thành cluster thật, sau đó đếm lại toàn bộ. Đây là lưới an toàn khi chroma-boost một
              mình không bắt được mực hiếm.
            </div>
          </li>
          <li>
            <b>📌 Pin as spot ink</b> <em>(manual override)</em> — toggle <b>🎯 Inspect color</b>,
            click the exact pixel of the color you want preserved, then press{' '}
            <b>📌 Pin as spot ink</b>. The hex is added to the job's pinned list, and every future
            Analyze forces a centroid at that color. Pinned hexes persist with the saved job. Use
            this when both automatic safeguards miss a sub-visual-threshold ink (e.g., a &lt; 0.05%
            lot-number stamp).
            <div className="pa-bi-vi">
              <b>📌 Pin làm mực pha</b> <em>(can thiệp thủ công)</em> — bật <b>🎯 Inspect color</b>,
              click chính xác vào pixel màu cần giữ, rồi nhấn <b>📌 Pin as spot ink</b>. Hex được
              thêm vào danh sách pinned của job, và mỗi lần Analyze sau đều ép 1 centroid tại màu
              đó. Hex pinned được lưu cùng job. Dùng khi cả 2 lớp tự động đều bỏ qua mực dưới ngưỡng
              cảm nhận (ví dụ con dấu lot-number &lt; 0.05%).
            </div>
          </li>
        </ol>
        <p className="pa-legend-disclaimer">
          All three safeguards preserve total printed mm² exactly — they only change how that total
          is split between per-color rows. Pricing math based on per-ink volume therefore becomes
          more accurate, never less.
        </p>
        <p className="pa-bi-vi pa-legend-disclaimer">
          Cả 3 lớp bảo vệ giữ NGUYÊN tổng mm² in được — chỉ thay đổi cách phân chia giữa các dòng
          màu. Tính giá theo µL mỗi mực chỉ chính xác hơn, không kém đi.
        </p>
      </div>
      <div className="pa-legend-card">
        <h3>Storage / Lưu trữ</h3>
        <p>
          Jobs are saved keyed by <b>SKU / mã sản phẩm</b>. Re-measuring the same SKU overwrites its
          prior entry. The artwork file is uploaded once and referenced by hash to avoid duplicates
          on disk.
        </p>
        <p className="pa-bi-vi">
          Job được lưu khoá theo <b>SKU / mã sản phẩm</b>. Đo lại cùng SKU sẽ ghi đè bản trước. File
          artwork được upload 1 lần và tham chiếu theo hash để tránh trùng trên disk.
        </p>
      </div>
      <div className="pa-legend-card">
        <h3>Extension — import from product layout / Mở rộng — import từ product layout</h3>
        <p>
          A future button in Standard / Complex calc will hand over{' '}
          <code>{'{ sku, widthMm, heightMm, artworkUrl }'}</code> directly to this tab, so
          dimensions never need to be re-entered. The core pipeline already accepts this shape.
        </p>
        <p className="pa-bi-vi">
          Nút sắp tới ở Standard / Complex calc sẽ chuyển{' '}
          <code>{'{ sku, widthMm, heightMm, artworkUrl }'}</code> trực tiếp vào tab này, không phải
          nhập lại kích thước. Pipeline lõi đã chấp nhận shape này.
        </p>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function PrintAreaCalc() {
  const [sub, setSub] = useState('new');
  const { jobs, loading, error, reload } = useLoadJobs();
  // When the user picks "Open" on a library row, we stash the full job
  // here and switch to the New Job sub-tab. NewJobTab hydrates from
  // this prop on its next render, then calls `onInitialConsumed` to
  // clear it so subsequent tab-switches don't re-trigger hydration.
  const [openJob, setOpenJob] = useState(null);

  let body;
  if (sub === 'new')
    body = (
      <NewJobTab onSaved={reload} initialJob={openJob} onInitialConsumed={() => setOpenJob(null)} />
    );
  else if (sub === 'library')
    body = (
      <LibraryTab
        jobs={jobs}
        loading={loading}
        error={error}
        onReload={reload}
        onOpen={(job) => {
          setOpenJob(job);
          setSub('new');
        }}
      />
    );
  else body = <LegendTab />;

  return (
    <div className="ink-calc pa-calc">
      <header className="pa-header">
        <div className="pa-header-top">
          <div className="pa-header-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3 a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div className="pa-header-titles">
            <h1 className="pa-header-title">Print Area Calculator</h1>
            <p className="pa-header-subtitle">
              Detect per-color print coverage from artwork + product dimensions
            </p>
          </div>
          <nav className="pa-tabs" role="tablist" aria-label="Print Area sub-tabs">
            <TabBarOverflow ariaLabel="Print Area sub-tabs">
              <button
                role="tab"
                aria-selected={sub === 'new'}
                className={`pa-tab ${sub === 'new' ? 'active' : ''}`}
                onClick={() => setSub('new')}
              >
                New Job
              </button>
              <button
                role="tab"
                aria-selected={sub === 'library'}
                className={`pa-tab ${sub === 'library' ? 'active' : ''}`}
                onClick={() => setSub('library')}
              >
                Library <span className="pa-tab-count">{jobs.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={sub === 'legend'}
                className={`pa-tab ${sub === 'legend' ? 'active' : ''}`}
                onClick={() => setSub('legend')}
              >
                Legend
              </button>
            </TabBarOverflow>
          </nav>
        </div>
      </header>
      <div className="ink-body">
        <div className="ink-panel" style={{ padding: 0 }}>
          {body}
        </div>
      </div>
    </div>
  );
}
