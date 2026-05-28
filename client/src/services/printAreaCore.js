/**
 * Print Area Calculator — pure algorithm functions
 *
 * Pipeline:
 *   1. renderArtwork(file, widthMm, heightMm, dpi) -> ImageData
 *   2. detectBackground(imgData) -> {r,g,b}
 *   3. maskPrintable(imgData, bg, tolerance) -> { pixels, bgCount, total }
 *   4. quantizeColors(pixels, k) -> [{ rgb:[r,g,b], count }]
 *   5. mergeClusters(clusters, threshold) -> merged list
 *   6. buildResult(clusters, total, bgCount, widthMm, heightMm) -> final job payload
 *
 * Kept framework-free so Jest can exercise the math without a browser.
 * Steps that need DOM (renderArtwork, overlay rendering) live in the
 * component file. Everything below is deterministic and pixel-pure.
 */

import quantize from 'quantize';

// ── Unit conversion ───────────────────────────────────────────────

// 1 inch = 25.4 mm. Round to nearest px so canvas sizing is exact —
// a 30 mm @ 300 DPI label is 354.33 px, we pick 354 rather than letting
// the browser antialias a fractional canvas.
export const mmToPx = (mm, dpi = 300) => Math.round((mm * dpi) / 25.4);
export const pxToMm = (px, dpi = 300) => (px * 25.4) / dpi;

// ── Color math ────────────────────────────────────────────────────

// Euclidean RGB distance. Kept for back-compat with saved jobs and
// callers that pass `metric: 'rgb'`. For new analyses, prefer Lab via
// `labDist` — perceptually uniform, so a ΔE76 threshold merges JPG-
// artifact duplicates that RGB-Euclidean would miss.
export function colorDist(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ── Perceptual color distance (CIE L*a*b* + ΔE76) ────────────────────
//
// RGB Euclidean treats `(50,50,50) ↔ (60,60,60)` and `(240,240,240) ↔
// (250,250,250)` as equally similar, but the human eye perceives dark-
// gray shifts 4× more strongly than near-white shifts. That asymmetry
// is why the old mergeClusters routinely left TWO grays or TWO dark
// reds in the output when JPG compression dithered a single ink into
// adjacent RGB cells.
//
// Lab decomposes color into L (lightness, 0..100) and a,b (green-red,
// blue-yellow chroma axes, roughly ±128). Euclidean distance in Lab
// ("ΔE76") is perceptually uniform to a first approximation — a ΔE
// of 1 is the just-noticeable-difference (JND) for a trained eye,
// ΔE ≈ 3 is where a layman starts to see a difference.
//
// We use CIE76 (plain Euclidean in Lab) not CIEDE2000 because:
//   - CIE76 is 3 arithmetic ops after conversion; DE2000 is 50+ incl. atan2
//   - on a 100k-pixel canvas, that's the difference between 5 ms and 80 ms
//   - merge decisions are insensitive to the CIE76→DE2000 upgrade
//     (~5% reshuffling at cluster-level, not per-pixel)

// sRGB gamma companding → linear light (reverses the display γ ≈ 2.2).
function srgbToLinear(c) {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

// Cached Lab conversion. `rgbKey = r<<16|g<<8|b` fits in one int so
// a Map lookup is O(1). On typical label art the same 10-50 colors
// dominate → 1000× speedup when we convert 100k pixels.
const _labCache = new Map();
const _LAB_CACHE_CAP = 50_000; // bound memory; evict all on overflow
export function rgbToLab(rgb) {
  const r = rgb[0] | 0,
    g = rgb[1] | 0,
    b = rgb[2] | 0;
  const key = (r << 16) | (g << 8) | b;
  const hit = _labCache.get(key);
  if (hit !== undefined) return hit;
  if (_labCache.size >= _LAB_CACHE_CAP) _labCache.clear();

  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  // sRGB → XYZ (D65 white, matrix from IEC 61966-2-1).
  const X = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const Y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const Z = 0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl;
  // Normalize by D65 reference white.
  const xn = X / 0.95047;
  const yn = Y / 1.0;
  const zn = Z / 1.08883;
  const EPS = 216 / 24389; // (6/29)^3
  const KAPPA = 24389 / 27; // (29/3)^3
  const fx = xn > EPS ? Math.cbrt(xn) : (KAPPA * xn + 16) / 116;
  const fy = yn > EPS ? Math.cbrt(yn) : (KAPPA * yn + 16) / 116;
  const fz = zn > EPS ? Math.cbrt(zn) : (KAPPA * zn + 16) / 116;
  const lab = [
    116 * fy - 16, // L
    500 * (fx - fy), // a
    200 * (fy - fz), // b
  ];
  _labCache.set(key, lab);
  return lab;
}

// ΔE76 — Euclidean distance in Lab space. JND ≈ 2.3; casual viewers
// see a difference around ΔE ≈ 3; a threshold of 5 is a safe merge
// band that catches JPG ringing without conflating distinct inks.
export function deltaE76(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function labDist(rgb1, rgb2) {
  return deltaE76(rgbToLab(rgb1), rgbToLab(rgb2));
}

// LCh chroma: sqrt(a² + b²) in Lab. 0 = achromatic (gray/black/white);
// > 30 = vivid spot color (red/blue/yellow warning labels, brand inks).
// Used by quantizeColors to boost sampling weight for rare-but-vivid
// pixels that MMCQ density bias would otherwise absorb into dark/gray
// clusters — a classic failure mode on predominantly black artwork
// with tiny red/yellow highlights.
export function chromaOfRgb(rgb) {
  const lab = rgbToLab(rgb);
  return Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
}

// Parse "#RRGGBB" (case-insensitive, with/without #). Returns null for
// malformed input so callers can skip gracefully. Does NOT accept 3-char
// short form — the pinned-spot use case always stores the full hex from
// rgbToHex, so we don't need the expansion.
export function hexToRgb(hex) {
  const h = String(hex || '')
    .replace(/^#/, '')
    .trim();
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Unified distance — picks the metric via `opts.metric` ('lab'|'rgb').
// Keep callers free to pass rgb triples; conversion is cached so the
// Lab path is only ~2× the RGB cost after warm-up.
export function distance(a, b, opts = {}) {
  return opts.metric === 'lab' ? labDist(a, b) : colorDist(a, b);
}

export function rgbToHex([r, g, b]) {
  const hex = (n) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

// Nearest-neighbor name from a tiny built-in palette. Users can
// override the name in the UI; this is just a sensible default so
// Ink Calculator can auto-link "Black" → black ink without the user
// typing it each time.
const BASIC_PALETTE = [
  { name: 'Black', rgb: [0, 0, 0] },
  { name: 'White', rgb: [255, 255, 255] },
  { name: 'Red', rgb: [220, 38, 38] },
  { name: 'Green', rgb: [22, 163, 74] },
  { name: 'Blue', rgb: [37, 99, 235] },
  { name: 'Yellow', rgb: [250, 204, 21] },
  { name: 'Cyan', rgb: [6, 182, 212] },
  { name: 'Magenta', rgb: [217, 70, 239] },
  { name: 'Orange', rgb: [249, 115, 22] },
  { name: 'Purple', rgb: [147, 51, 234] },
  { name: 'Brown', rgb: [120, 53, 15] },
  { name: 'Gray', rgb: [107, 114, 128] },
  { name: 'Silver', rgb: [203, 213, 225] },
  { name: 'Gold', rgb: [212, 175, 55] },
];

export function nearestColorName(rgb) {
  let best = BASIC_PALETTE[0];
  let bestDist = Infinity;
  for (const entry of BASIC_PALETTE) {
    const d = colorDist(rgb, entry.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best.name;
}

// ── Background detection ──────────────────────────────────────────

// Mean RGB of a block starting at (x, y) of size (w, h). Used to sample
// the 4 corners of the artwork — corners are almost always BG on
// label/sticker artwork.
export function meanBlock(imgData, x, y, w, h) {
  const { data, width } = imgData;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const i = ((y + dy) * width + (x + dx)) * 4;
      if (i < 0 || i + 2 >= data.length) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (n === 0) return [0, 0, 0];
  return [r / n, g / n, b / n];
}

// Detect BG by sampling 4 corners and returning the median-ish color.
// If corners disagree wildly (e.g. a full-bleed artwork), we still pick
// the closest pair — the user can override via "Pick background" in UI.
export function detectBackground(imgData, blockSize = 5) {
  const { width: w, height: h } = imgData;
  const bs = Math.min(blockSize, Math.floor(w / 4), Math.floor(h / 4));
  const corners = [
    meanBlock(imgData, 0, 0, bs, bs),
    meanBlock(imgData, w - bs, 0, bs, bs),
    meanBlock(imgData, 0, h - bs, bs, bs),
    meanBlock(imgData, w - bs, h - bs, bs, bs),
  ];
  // Pick the corner whose sum-of-distances to the other 3 is minimal
  // — that's the "most agreed" corner, robust to one rogue corner.
  let best = corners[0];
  let bestSum = Infinity;
  for (const c of corners) {
    let sum = 0;
    for (const other of corners) sum += colorDist(c, other);
    if (sum < bestSum) {
      bestSum = sum;
      best = c;
    }
  }
  return [Math.round(best[0]), Math.round(best[1]), Math.round(best[2])];
}

// ── Auto-crop: strip dim lines + find the real label bbox ────────
//
// Dimension annotations (arrows, thin lines, tiny measurement text)
// share the artwork canvas with the actual label content, but they
// are never meant to be printed. Measuring them would inflate both
// the detected color count and the total coverage %.
//
// Strategy:
//   1. Build a boolean "printable" mask (same logic as maskPrintable).
//   2. Erode with a 4-neighbor kernel — any pixel adjacent to BG is
//      dropped. Thin (≤ 1 px) lines vanish entirely; solid content
//      shrinks by 1 px but keeps its shape.
//   3. Take the bbox of whatever's left → that's the label area.
//   4. Optionally pad by a few pixels so we don't clip the label's
//      outer anti-aliased edges after the erosion step.
//
// For artwork WITHOUT dim annotations, the bbox collapses to roughly
// the full canvas; the crop is then a no-op and costs only the one
// O(n) erosion pass.

export function erodePrintableMask(imgData, bg, tolerance = 12) {
  const { data, width: w, height: h } = imgData;
  const raw = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 8) continue;
    const dr = data[i] - bg[0];
    const dg = data[i + 1] - bg[1];
    const db = data[i + 2] - bg[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) > tolerance) raw[p] = 1;
  }
  // 4-neighbor erosion. Border pixels are dropped implicitly because
  // the neighbor loop skips y=0, y=h-1, x=0, x=w-1.
  const eroded = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (raw[p] && raw[p - 1] && raw[p + 1] && raw[p - w] && raw[p + w]) {
        eroded[p] = 1;
      }
    }
  }
  return eroded;
}

export function boundsOfMask(mask, w, h, pad = 3) {
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(w - 1, maxX + pad);
  const y1 = Math.min(h - 1, maxY + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function cropImageData(imgData, roi) {
  const { data, width } = imgData;
  const out = new Uint8ClampedArray(roi.w * roi.h * 4);
  for (let y = 0; y < roi.h; y++) {
    const srcRow = ((roi.y + y) * width + roi.x) * 4;
    const dstRow = y * roi.w * 4;
    out.set(data.subarray(srcRow, srcRow + roi.w * 4), dstRow);
  }
  return { data: out, width: roi.w, height: roi.h };
}

// ── Morphological helpers (thin-stroke removal beyond the single erode) ──
//
// `erodePrintableMask` above does one 4-neighbor erosion pass on the
// printable mask — enough to drop 1-px AA edges but preserves ≥2-px
// strokes. For thicker dim-line callouts that survive the basic erode,
// we expose explicit primitives so callers can compose an "opening"
// (erode ∘ dilate) with `iterations` control.
//
// Opening removes any stroke whose NARROWEST axis is ≤ 2×iterations px.
// It PRESERVES filled fills of the same thickness because dilate
// reinflates anything that survived the erode. Tuning knob — the user
// can trade false-positive stroke removal for more aggressive cleanup.

export function dilateMask(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (mask[p]) {
        out[p] = 1;
        continue;
      }
      // 4-neighbor: if any neighbor is set, this pixel becomes set.
      if (
        (y > 0 && mask[p - w]) ||
        (y < h - 1 && mask[p + w]) ||
        (x > 0 && mask[p - 1]) ||
        (x < w - 1 && mask[p + 1])
      ) {
        out[p] = 1;
      }
    }
  }
  return out;
}

function erodeMaskOnce(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (mask[p] && mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w]) {
        out[p] = 1;
      }
    }
  }
  return out;
}

export function openMask(mask, w, h, iterations = 1) {
  const n = Math.max(1, Math.min(5, Math.round(iterations)));
  let m = mask;
  for (let i = 0; i < n; i++) m = erodeMaskOnce(m, w, h);
  for (let i = 0; i < n; i++) m = dilateMask(m, w, h);
  return m;
}

// Pixel-weighted centroid of a binary mask. Used by physical-anchored
// cropping to decide WHERE to drop the mm × mm window. Weighting by
// density (each set pixel contributes equally) means the centroid
// tracks the bulk of the content rather than being pulled toward
// outlier annotations far from the main label.
export function centroidOfMask(mask, w, h) {
  let sumX = 0,
    sumY = 0,
    n = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        sumX += x;
        sumY += y;
        n++;
      }
    }
  }
  if (n === 0) return null;
  return { cx: sumX / n, cy: sumY / n, count: n };
}

// ── Die-line bbox detection (Sprint 9) ───────────────────────────
//
// Many CAD-exported labels ship with a thin CLOSED STROKE of a spot
// color marking the physical die-cut edge. That stroke is the most
// authoritative source for the label's true boundary — far more
// reliable than the user's typed dimensions (off-by-millimeter
// typos), content centroid (pulled by outlying dim-line callouts),
// or the auto-crop bbox (includes callouts).
//
// The die-line can be ANY color — magenta is common but red/cyan/
// black are all seen. `isDielineColor` (the magenta-only heuristic)
// doesn't help here. We identify the stroke geometrically instead:
// thin strokes enclose a large area with few pixels, so
//
//   stroke_score = bbox_area / pixel_count
//
// is high for a die-line and low for a fill. Pick the color cluster
// that (a) has bbox ≥ `minRelSize` of the canvas, (b) has ≥ 50 pixels,
// (c) maximizes the stroke score. Its bbox = the true label area.
//
// `opts.ignoreHex` (hex strings) lets the caller exclude colors
// known NOT to be a die-line (e.g. the detected BG when it leaks in,
// or a user-designated non-dieline spot color). Returns `null` if
// no candidate passes.
export function pickDielineBbox(imgData, bg, opts = {}) {
  const { data, width: w, height: h } = imgData;
  const tol = opts.tolerance || 12;
  const metric = opts.metric === 'lab' ? 'lab' : 'rgb';
  const bgCmp = metric === 'lab' ? rgbToLab(bg) : bg;
  const minRelSize = opts.minRelSize ?? 0.1;
  const minPixels = opts.minPixels ?? 50;
  const ignore = new Set((opts.ignoreHex || []).map((h) => String(h).toUpperCase()));
  // Bucket non-BG pixels by quantized color (4 bits per channel so
  // JPG-adjacent colors fall into the same bucket). Each bucket tracks
  // running bbox + count; we score after the single scan.
  const buckets = new Map();
  for (let y = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, p += 4) {
      if (data[p + 3] < 8) continue;
      const r = data[p],
        g = data[p + 1],
        b = data[p + 2];
      const px = [r, g, b];
      const d = metric === 'lab' ? deltaE76(rgbToLab(px), bgCmp) : colorDist(px, bg);
      if (d <= tol) continue;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); // 12-bit bucket
      let bkt = buckets.get(key);
      if (!bkt) {
        bkt = { sumR: 0, sumG: 0, sumB: 0, n: 0, minX: x, minY: y, maxX: x, maxY: y };
        buckets.set(key, bkt);
      }
      bkt.sumR += r;
      bkt.sumG += g;
      bkt.sumB += b;
      bkt.n++;
      if (x < bkt.minX) bkt.minX = x;
      else if (x > bkt.maxX) bkt.maxX = x;
      if (y < bkt.minY) bkt.minY = y;
      else if (y > bkt.maxY) bkt.maxY = y;
    }
  }
  // Score candidates.
  const canvasArea = w * h;
  let best = null;
  let bestScore = 0;
  for (const bkt of buckets.values()) {
    if (bkt.n < minPixels) continue;
    const bw = bkt.maxX - bkt.minX + 1;
    const bh = bkt.maxY - bkt.minY + 1;
    const bboxArea = bw * bh;
    const relSize = bboxArea / canvasArea;
    if (relSize < minRelSize) continue;
    const rgb = [
      Math.round(bkt.sumR / bkt.n),
      Math.round(bkt.sumG / bkt.n),
      Math.round(bkt.sumB / bkt.n),
    ];
    if (ignore.has(rgbToHex(rgb))) continue;
    const score = bboxArea / bkt.n;
    if (score > bestScore) {
      bestScore = score;
      best = { rgb, bbox: { x: bkt.minX, y: bkt.minY, w: bw, h: bh }, n: bkt.n, score };
    }
  }
  return best;
}

// Same as `pickDielineBbox` but the caller specifies the exact
// die-line color (hex). Useful when the user picks the stroke color
// via click-to-inspect. Returns the tight bbox of pixels within
// `opts.matchTolerance` (Lab ΔE or RGB distance) of `targetHex`.
export function dielineBboxByColor(imgData, targetHex, opts = {}) {
  const { data, width: w, height: h } = imgData;
  const tol = opts.matchTolerance ?? (opts.metric === 'lab' ? 6 : 24);
  const metric = opts.metric === 'lab' ? 'lab' : 'rgb';
  const target = [
    parseInt(targetHex.slice(1, 3), 16),
    parseInt(targetHex.slice(3, 5), 16),
    parseInt(targetHex.slice(5, 7), 16),
  ];
  const targetCmp = metric === 'lab' ? rgbToLab(target) : target;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1,
    n = 0;
  for (let y = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, p += 4) {
      if (data[p + 3] < 8) continue;
      const px = [data[p], data[p + 1], data[p + 2]];
      const d = metric === 'lab' ? deltaE76(rgbToLab(px), targetCmp) : colorDist(px, target);
      if (d > tol) continue;
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (n === 0 || maxX < 0) return null;
  return {
    rgb: target,
    bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    n,
    score: ((maxX - minX + 1) * (maxY - minY + 1)) / n,
  };
}

// Input-driven crop (the "absolute coordinate" approach). Ignores
// whatever bbox the content happens to form and instead cuts a rectangle
// of EXACTLY widthMm × heightMm @ dpi, centered on the content centroid
// (falls back to geometric center if the mask is empty).
//
// Why this exists: when the input artwork includes dimension callouts
// or trim-mark annotations OUTSIDE the actual label area, erode+bbox
// still captures thicker annotations as "content". Anchoring on the
// user-specified physical dimensions makes the user's sidebar input
// the source of truth — annotations outside the mm × mm window are
// discarded by construction, not by heuristics.
//
// Returns `null` if the image is already SMALLER than the requested
// physical size (caller should use the full canvas in that case —
// there's no way to crop up).
export function physicalAnchoredCrop(imgData, bg, widthMm, heightMm, dpi = 300, tolerance = 12) {
  const { width, height } = imgData;
  const targetW = mmToPx(widthMm, dpi);
  const targetH = mmToPx(heightMm, dpi);
  if (targetW >= width && targetH >= height) return null; // no room to crop
  const maskBytes = erodePrintableMask(imgData, bg, tolerance);
  const centroid = centroidOfMask(maskBytes, width, height);
  const cx = centroid ? centroid.cx : width / 2;
  const cy = centroid ? centroid.cy : height / 2;
  // Center the target box on the centroid, then clamp so it stays fully
  // inside the canvas. If target dims exceed the canvas along one axis,
  // clip that axis to the canvas and keep the other axis centered.
  const w = Math.min(targetW, width);
  const h = Math.min(targetH, height);
  let x = Math.round(cx - w / 2);
  let y = Math.round(cy - h / 2);
  x = Math.max(0, Math.min(width - w, x));
  y = Math.max(0, Math.min(height - h, y));
  return { x, y, w, h };
}

// ── Dieline / cut-mark color detection ───────────────────────────
//
// CAD / Illustrator files use a spot color to show the physical shape
// of the product (die-cut line, registration marks). Most shops use
// bright magenta / pink for this — it never appears in actual ink
// because it's out of the printable gamut for CMYK black labels.
//
// Heuristic: magenta = R and B both significantly higher than G, with
// R ≈ B. Tuned loosely so it catches everything from pure magenta
// (#FF00FF) down to muted pinks (#C86080) that CAD tools sometimes use.
// Monochrome/greyscale and warm/cool non-pink tones don't match.

export function isDielineColor(rgb) {
  const [r, g, b] = rgb;
  const rMinusG = r - g;
  const bMinusG = b - g;
  // Both R and B must dominate G by ≥ 40 (otherwise it's not pinkish),
  // and the R-B spread relative to max(R,B) < 60% (otherwise one side
  // is dominant → red or blue, not magenta).
  if (rMinusG < 40 || bMinusG < 40) return false;
  const maxRB = Math.max(r, b);
  if (maxRB === 0) return false;
  return Math.abs(r - b) < maxRB * 0.6;
}

// ── Pixel masking ─────────────────────────────────────────────────

// Split pixels into { printable (not-BG), bgCount }. Alpha < 8 is also
// treated as BG — transparent PNG edges should never be counted as ink.
//
// Optional `opts.aaWeighting` (default true) gives each printable pixel
// a fractional WEIGHT (0..1) instead of a 0/1 classification. The model:
//
//   weight = clamp((d - tolerance) / tolerance, 0, 1)
//
// where `d` is the color distance to BG. A pixel right at the tolerance
// boundary has weight 0 (effectively BG); a pixel at 2× tolerance
// contributes weight 1 (full ink). Anti-aliased edges — which sit in
// the `tolerance .. 2× tolerance` band — contribute PARTIAL ink
// proportional to their saturation. Downstream `print_area_pct` = Σweight
// / total, which typically shrinks measured coverage by 2-5% on vector
// artwork with soft edges — the AA fringe that would otherwise inflate
// the total as full-ink pixels.
//
// Pass `{ aaWeighting: false }` to reproduce pre-Sprint-8 numbers
// bit-for-bit (weights all 1.0, identical to original counts).
//
// The `metric` option ('rgb'|'lab') chooses how BG distance is measured.
// Lab is perceptually uniform so a tolerance of (say) 6 ΔE catches the
// same visual band on dark and light BGs; RGB needs a larger tolerance
// on darks. Default 'rgb' for back-compat.
export function maskPrintable(imgData, bg, tolerance = 12, opts = {}) {
  const { data } = imgData;
  const pixels = [];
  const weights = [];
  let bgCount = 0;
  let printableWeight = 0;
  const total = data.length / 4;
  const aa = opts.aaWeighting !== false;
  const metric = opts.metric === 'lab' ? 'lab' : 'rgb';
  const bgColor = metric === 'lab' ? rgbToLab(bg) : bg;
  const tol = metric === 'lab' && tolerance > 10 ? tolerance / 4 : tolerance;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 8) {
      bgCount++;
      continue;
    }
    const px = [data[i], data[i + 1], data[i + 2]];
    const d = metric === 'lab' ? deltaE76(rgbToLab(px), bgColor) : colorDist(px, bg);
    if (d <= tol) {
      bgCount++;
      continue;
    }
    let w = 1;
    if (aa) {
      // Partial ink band: `tol < d < 2×tol`. Map linearly to (0,1];
      // anything beyond 2×tol is full ink.
      w = Math.min(1, Math.max(0, (d - tol) / tol));
      // Guard: a hair above the tol boundary (w ≈ 0) contributes nothing
      // meaningful and still takes a quantize slot. Fold those into BG.
      if (w < 0.05) {
        bgCount++;
        continue;
      }
    }
    pixels.push(px);
    weights.push(w);
    printableWeight += w;
  }
  return { pixels, weights, bgCount, total, printableWeight };
}

// ── Quantization ──────────────────────────────────────────────────

// Median-cut via `quantize` lib + explicit weighted re-count.
//
// We deliberately avoid `cmap.map(px)` — upstream bug: VBox.contains
// references an undefined `gval` on some color triples and throws
// ReferenceError in the browser. palette() works fine, so we build our
// own nearest-centroid assignment. O(n * k) — for k ≤ 8 and 300-DPI
// label canvases (< 500k pixels) this is a few ms.
//
// `weights` (optional, same length as `pixels`) makes each pixel
// contribute its weight instead of +1. If omitted, behavior matches
// pre-Sprint-8 (everyone gets weight 1.0). Quantize tree still uses
// unweighted RGB samples to pick centroids — weights only affect the
// COUNT after centroids are fixed, so sub-pixel weighting doesn't
// distort the palette, only the area math.
//
// `opts.metric` ('rgb'|'lab') picks the nearest-centroid distance.
// Lab produces cleaner cluster boundaries for visually similar inks
// (e.g., two distinct grays the eye reads as "the same gray").
export function quantizeColors(pixels, k, weights, opts = {}) {
  if (pixels.length === 0) return [];
  const metric = opts.metric === 'lab' ? 'lab' : 'rgb';
  const dist = metric === 'lab' ? labDist : colorDist;
  // K max was 8 pre-Sprint-9; widened to 16 so operators can reserve
  // slots for rare spot colors (red warnings, brand hues) that MMCQ
  // density bias would otherwise absorb into dominant dark clusters.
  // The merge step still collapses near-duplicates, so bumping K does
  // not inflate the final palette for artwork that only has 3 inks.
  // NaN-guard: Math.round(NaN) = NaN, which would poison the clamp and
  // hand NaN to the quantize lib. Fall back to 4 (the pre-Sprint-9 default)
  // when a caller passes a non-finite k. This protects against corrupted
  // saved jobs and out-of-range user input alike.
  const kNum = Number.isFinite(k) ? Math.round(k) : 4;
  const clamped = Math.max(1, Math.min(16, kNum));
  const weighted = Array.isArray(weights) && weights.length === pixels.length;
  // k=1 short-circuits to the mean of all pixels.
  if (clamped === 1) {
    let r = 0,
      g = 0,
      b = 0,
      wSum = 0;
    for (let i = 0; i < pixels.length; i++) {
      const w = weighted ? weights[i] : 1;
      r += pixels[i][0] * w;
      g += pixels[i][1] * w;
      b += pixels[i][2] * w;
      wSum += w;
    }
    return wSum > 0 ? [{ rgb: [r / wSum, g / wSum, b / wSum], count: wSum }] : [];
  }

  // ── Chroma-weighted sampling (Sprint 9) ────────────────────────────
  // MMCQ's median-cut is density-weighted: it carves new cluster bounds
  // around the DENSEST regions of color-space first. On a mostly-black
  // label with <1% red text, red pixels never win a bucket — all 8 K
  // slots get consumed splitting the dominant dark blob.
  //
  // Fix: upsample high-chroma pixels before feeding MMCQ, so the red
  // region reads as "dense enough" to claim its own cluster. The
  // subsequent nearest-centroid count still runs against the ORIGINAL
  // pixel list, so coverage math is unaffected — we only bend MMCQ's
  // centroid-selection, not the area totals.
  //
  // Boost curve: chroma ≤ 20 → 1× (no change); 20..50 → 1..4×; ≥ 50 →
  // capped at `chromaBoostMax` (default 8×). Disable via
  // `opts.chromaBoost = false` to reproduce pre-Sprint-9 palettes.
  const chromaBoost = opts.chromaBoost !== false;
  const maxBoost = Number.isFinite(opts.chromaBoostMax) ? opts.chromaBoostMax : 8;
  let samples = pixels;
  if (chromaBoost) {
    samples = [];
    for (let p = 0; p < pixels.length; p++) {
      const px = pixels[p];
      samples.push(px);
      const C = chromaOfRgb(px);
      if (C > 20) {
        // Linear ramp: C=20 → +0, C=30 → +1×, C=50 → +3×, saturates at maxBoost.
        const boost = Math.min(maxBoost - 1, Math.max(0, Math.round((C - 20) / 10)));
        for (let b = 0; b < boost; b++) samples.push(px);
      }
    }
  }

  const cmap = quantize(samples, clamped);
  if (!cmap) return [];
  const palette = cmap.palette();
  if (palette.length === 0) return [];
  const counts = new Array(palette.length).fill(0);
  for (let p = 0; p < pixels.length; p++) {
    const px = pixels[p];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const d = dist(px, palette[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    counts[bestIdx] += weighted ? weights[p] : 1;
  }
  // The `quantize` lib sometimes emits more palette entries than `k`
  // when the input has very tight clusters — filter the zero-count
  // noise so downstream consumers (mergeClusters, buildResult, UI)
  // don't see phantom rows that confuse coverage math.
  return palette.map((rgb, i) => ({ rgb, count: counts[i] })).filter((c) => c.count > 0);
}

// Merge clusters whose centroids are within `threshold` of each other.
// Typical label art has 2–4 true colors but JPG compression splits each
// into 2–3 near-identical clusters; merging tightens the palette.
//
// `opts.metric` picks the distance model:
//   'lab' (default) — ΔE76 threshold ≈ 3..5 for JND-level merging.
//   'rgb'           — legacy Euclidean, threshold ≈ 15..25. Kept for
//                     reproducing saved analyses bit-for-bit.
// When metric='lab' and the caller passes an RGB threshold (> 15),
// we auto-convert it to a reasonable ΔE (roughly threshold / 4) so
// existing UI sliders migrate smoothly without a hard breaking change.
export function mergeClusters(clusters, threshold = 18, opts = {}) {
  const metric = opts.metric === 'lab' ? 'lab' : 'rgb';
  const dist = metric === 'lab' ? labDist : colorDist;
  // UI slider was calibrated in RGB units (0-40). When the metric
  // flips to Lab, map that range onto ΔE76 (0-10) so existing saved
  // values still produce roughly the expected merge behavior.
  const t = metric === 'lab' && threshold > 10 ? Math.max(0, threshold / 4) : threshold;
  if (t <= 0 || clusters.length <= 1) return [...clusters];
  const sorted = [...clusters].sort((a, b) => b.count - a.count);
  const out = [];
  for (const c of sorted) {
    const match = out.find((o) => dist(o.rgb, c.rgb) <= t);
    if (match) {
      const total = match.count + c.count;
      match.rgb = [
        (match.rgb[0] * match.count + c.rgb[0] * c.count) / total,
        (match.rgb[1] * match.count + c.rgb[1] * c.count) / total,
        (match.rgb[2] * match.count + c.rgb[2] * c.count) / total,
      ];
      match.count = total;
    } else {
      out.push({ rgb: [...c.rgb], count: c.count });
    }
  }
  return out;
}

// ── Outlier rescue (Sprint 9) ─────────────────────────────────────
//
// Even with chroma-boosted MMCQ, a spot ink that covers < 0.05% of the
// label can slip past the K cap (MMCQ picks splits in a pixel-count
// tournament and a handful of red pixels can still lose to a 12-ink
// dark-gray ramp). This pass is the safety net.
//
// Algorithm:
//   1. For each pixel, find the distance to its NEAREST existing
//      centroid (post-quantize+merge).
//   2. Pixels where that distance exceeds `outlierThreshold` are
//      "true outliers" — they don't belong to any current cluster in
//      perceptual terms. For ΔE76 the default is 15 (well beyond JND);
//      for RGB it's 60 (≈ the perceptual equivalent).
//   3. Sub-quantize the outliers (k=3 by default) to produce candidate
//      rescue centroids.
//   4. Keep only candidates whose pixel weight ≥ `minOutlierPct` of the
//      total (default 0.1%) so we don't promote noise.
//   5. Re-run nearest-centroid counting over the WHOLE pixel set with
//      the merged (original ∪ rescued) centroid list — the counts are
//      accurate, not just the outlier share.
//
// Cost: 2 extra O(n·k) passes. On a 500×500 label (< 250k px) with
// k ≤ 10, that's < 10 ms total — imperceptible in the analyze button.
export function rescueOutlierClusters(pixels, weights, clusters, opts = {}) {
  if (!clusters || clusters.length === 0 || pixels.length === 0) return clusters;
  const metric = opts.metric === 'lab' ? 'lab' : 'rgb';
  const dist = metric === 'lab' ? labDist : colorDist;
  const outlierThreshold = Number.isFinite(opts.outlierThreshold)
    ? opts.outlierThreshold
    : metric === 'lab'
      ? 15
      : 60;
  const weighted = Array.isArray(weights) && weights.length === pixels.length;
  const totalWeight = weighted ? weights.reduce((a, b) => a + b, 0) : pixels.length;
  const minPct = Number.isFinite(opts.minOutlierPct) ? opts.minOutlierPct : 0.001;
  const minWeight = totalWeight * minPct;
  // NaN-guard the rescue k — `??` only coalesces null/undefined, so
  // opts.maxNewClusters = NaN would slip through and poison the clamp
  // and the sub-quantize call. Explicit finite check keeps this robust
  // against malformed saved jobs.
  const maxNew = Math.max(
    1,
    Math.min(6, Number.isFinite(opts.maxNewClusters) ? opts.maxNewClusters : 3)
  );

  // Pass 1: collect pixels beyond the outlier threshold.
  const outliers = [];
  const outlierWeights = [];
  for (let p = 0; p < pixels.length; p++) {
    const px = pixels[p];
    let best = Infinity;
    for (const c of clusters) {
      const d = dist(px, c.rgb);
      if (d < best) best = d;
      if (best === 0) break;
    }
    if (best > outlierThreshold) {
      outliers.push(px);
      outlierWeights.push(weighted ? weights[p] : 1);
    }
  }
  if (outliers.length === 0) return clusters;

  // Pass 2: sub-quantize the outliers. Skip chroma-boost here — the
  // outliers are already colour-selected, boosting would skew the
  // sub-palette toward the vividest of the outliers and miss e.g. a
  // gold-foil cluster that's warm but low chroma.
  const subClusters = quantizeColors(outliers, maxNew, outlierWeights, {
    metric,
    chromaBoost: false,
  });
  const kept = subClusters.filter((c) => c.count >= minWeight);
  if (kept.length === 0) return clusters;

  // Pass 3: merge+re-count so totals add up exactly to the printable set.
  const merged = [
    ...clusters.map((c) => ({ rgb: [...c.rgb], count: 0 })),
    ...kept.map((c) => ({ rgb: [...c.rgb], count: 0, rescued: true })),
  ];
  for (let p = 0; p < pixels.length; p++) {
    const px = pixels[p];
    let bestIdx = 0,
      bestD = Infinity;
    for (let i = 0; i < merged.length; i++) {
      const d = dist(px, merged[i].rgb);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    merged[bestIdx].count += weighted ? weights[p] : 1;
  }
  return merged.filter((c) => c.count > 0);
}

// ── Pinned spot-color injection (Sprint 9, eyedropper) ─────────────
//
// User-facing escape hatch for the rare case where both chroma-boost
// AND outlier-rescue miss a spot ink (typical: a tiny lot-number stamp
// printed in warning red that the user cares about). The UI's
// eyedropper lets the operator click the pixel; the hex gets added to
// `cfg.pinnedSpotHex` and this function forces a centroid at that
// color, winning any pixels within perceptual range of it.
//
// Skips a pin if an existing cluster centroid is already within
// `nearTol` of it (5 ΔE / 20 RGB) — no point injecting a duplicate.
export function injectPinnedClusters(pixels, weights, clusters, pinnedHexes, opts = {}) {
  if (!Array.isArray(pinnedHexes) || pinnedHexes.length === 0) return clusters;
  const metric = opts.metric === 'lab' ? 'lab' : 'rgb';
  const dist = metric === 'lab' ? labDist : colorDist;
  const nearTol = metric === 'lab' ? 5 : 20;
  const weighted = Array.isArray(weights) && weights.length === pixels.length;
  const pinnedRgbs = [];
  for (const hex of pinnedHexes) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue;
    const already = clusters.some((c) => dist(c.rgb, rgb) <= nearTol);
    if (!already) pinnedRgbs.push(rgb);
  }
  if (pinnedRgbs.length === 0) return clusters;

  const merged = [
    ...clusters.map((c) => ({ rgb: [...c.rgb], count: 0 })),
    ...pinnedRgbs.map((rgb) => ({ rgb: [...rgb], count: 0, pinned: true })),
  ];
  for (let p = 0; p < pixels.length; p++) {
    const px = pixels[p];
    let bestIdx = 0,
      bestD = Infinity;
    for (let i = 0; i < merged.length; i++) {
      const d = dist(px, merged[i].rgb);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    merged[bestIdx].count += weighted ? weights[p] : 1;
  }
  return merged.filter((c) => c.count > 0);
}

// ── Ink profiles (print method) ───────────────────────────────────
//
// Per-method ink transfer behavior. `transfer_factor` accounts for the
// fraction of ink that doesn't reach the substrate (anilox cell residue
// for flexo, mesh hold-back for silkscreen, plate-to-blanket-to-paper
// loss for offset). `film_thickness_um` is the typical wet-ink layer
// laid down for opaque coverage. Defaults below are industry baselines —
// real shops should calibrate against their own equipment + ink rheology.
//
// Volume math (see inkVolumeMicroliters):
//   1 µL = 1 mm³, so 1 mm² × 1 µm = 0.001 µL
//   per-label volume (µL) = area_mm² × film_µm × transfer_factor × 0.001
//
// `key` doubles as the value stored in the saved job, so renaming is
// a breaking change — add a new entry instead.
// `dot_gain_pct_at_50` is the mechanical + optical dot gain at a 50% tint
// — the "sweet spot" where gain is maximal. We model dot gain with the
// classical Yule-Nielsen-inspired curve (see `applyDotGain`). For solid
// fills (100%) gain is 0; for 50% screens it peaks. An 18% DG on flexo
// means a 50% file prints at 68% coverage on substrate.
export const INK_PROFILES = {
  letterpress: {
    key: 'letterpress',
    label: 'Letterpress',
    transfer_factor: 1.05,
    film_thickness_um: 2.0,
    dot_gain_pct_at_50: 12,
    note: 'Relief printing — thin direct ink film. Best for solid line art and text.',
  },
  flexo: {
    key: 'flexo',
    label: 'Flexo',
    transfer_factor: 1.12,
    film_thickness_um: 3.0,
    dot_gain_pct_at_50: 18,
    note: 'Anilox-fed flexo. Default factor covers ~10–15% transfer loss to anilox cells.',
  },
  silkscreen: {
    key: 'silkscreen',
    label: 'Silkscreen',
    transfer_factor: 1.3,
    film_thickness_um: 15.0,
    dot_gain_pct_at_50: 8,
    note: 'Through-mesh deposit — heaviest film, opaque coverage. Mesh + emulsion holds back ~25–30% of ink.',
  },
  offset: {
    key: 'offset',
    label: 'Offset',
    transfer_factor: 1.05,
    film_thickness_um: 1.5,
    dot_gain_pct_at_50: 15,
    note: 'Lithographic offset — thinnest film, optimal for halftone CMYK process.',
  },
  digital: {
    key: 'digital',
    label: 'Digital',
    transfer_factor: 1.0,
    film_thickness_um: 1.0,
    dot_gain_pct_at_50: 3,
    note: 'Inkjet / toner — no transfer loss. Volume reflects only printed area.',
  },
};

export function getInkProfile(key) {
  return INK_PROFILES[key] || INK_PROFILES.flexo;
}

// Per-color wet-ink volume in microlitres for ONE label. Formula:
//   area_mm² × film_µm × factor × 0.001  (because 1 mm²·µm = 0.001 µL)
export function inkVolumeMicroliters(areaMm2, profile) {
  if (!profile || !(areaMm2 > 0)) return 0;
  return areaMm2 * profile.film_thickness_um * profile.transfer_factor * 0.001;
}

// Dot gain correction. Converts a FILE coverage `file_pct` (what the
// analysis pipeline measured from pixels) to the PRESS coverage —
// the fraction of substrate actually covered with ink after dots grow
// on press. Dot gain peaks at 50% tint and vanishes at 0% and 100%.
//
// Model: `press = file + gain_at_50 × sin(π × file)` — a standard
// approximation used in print calibration. Exact curves are shop-
// specific (measured with a densitometer), but this form reproduces
// 80-90% of the real signal with one parameter.
//
//   gain_at_50 = 0.18 → flexo at 50% prints at ~68%
//   gain_at_50 = 0.03 → digital at 50% prints at ~53%
//
// Clamps to [0, 1]. Accepts file_pct as either 0..1 or 0..100 (auto-
// detects by magnitude).
export function applyDotGain(filePct, gainAt50Pct) {
  if (!(filePct > 0) || !(gainAt50Pct > 0)) return filePct || 0;
  const scale = filePct > 1.01 ? 100 : 1; // auto-detect pct vs fraction
  const f = filePct / scale; // 0..1
  const g = gainAt50Pct / 100; // e.g. 0.18
  const press = f + g * Math.sin(Math.PI * f);
  return Math.max(0, Math.min(1, press)) * scale;
}

// Augment each color row with `ink_uL_per_label` + `ink_mL_per_1k` +
// `dot_gain_pct` (the extra area contributed by dot gain) using the
// active print profile. Pure — returns a new array.
//
// `opts.applyDotGain` (default true) folds dot gain into the ink volume
// by computing an effective area = file_area × (press_pct / file_pct).
// For a 50% file on flexo this multiplies ink volume by ~1.36; for
// solids it's a no-op. Disable to match pre-Sprint-8 math.
export function applyInkProfile(colors, profileKey, opts = {}) {
  const profile = getInkProfile(profileKey);
  const useDotGain = opts.applyDotGain !== false;
  const gain = useDotGain ? profile.dot_gain_pct_at_50 || 0 : 0;
  return (colors || []).map((c) => {
    const filePct = c.print_area_pct || 0;
    const pressPct = gain > 0 ? applyDotGain(filePct, gain) : filePct;
    // Effective area for INK VOLUME: the substrate actually holds
    // `pressPct / filePct` times the file's pixel area because dots
    // grew. For solids that ratio is 1.0 (no change). Guard against
    // divide-by-zero for empty clusters.
    const gainRatio = filePct > 0 ? pressPct / filePct : 1;
    const effAreaMm2 = (c.print_area_mm2 || 0) * gainRatio;
    const uL = inkVolumeMicroliters(effAreaMm2, profile);
    return {
      ...c,
      ink_uL_per_label: uL,
      ink_mL_per_1k: uL, // 1000 labels × µL = mL (1 µL × 1000 = 1 mL)
      dot_gain_pct: useDotGain ? Math.max(0, pressPct - filePct) : 0,
      press_area_pct: pressPct,
    };
  });
}

// Detect a 90° rotation between the artwork and the user's stated
// label dimensions. Returns a multiple-of-90 rotation in DEGREES that,
// when applied to the input, aligns its aspect ratio with widthMm ×
// heightMm. Landscape label (30×20) with a portrait artwork bitmap
// returns 90; aspects already aligned return 0.
//
// Threshold (0.05 = 5% aspect deviation) avoids flipping on near-
// square labels where the heuristic isn't safe. Caller can always
// override with an explicit rotation in cfg.
export function detectRotation(bitmapW, bitmapH, labelWmm, labelHmm) {
  if (!bitmapW || !bitmapH || !labelWmm || !labelHmm) return 0;
  const imgAspect = bitmapW / bitmapH;
  const labelAspect = labelWmm / labelHmm;
  const swappedAspect = labelHmm / labelWmm;
  const err0 = Math.abs(imgAspect - labelAspect) / labelAspect;
  const err90 = Math.abs(imgAspect - swappedAspect) / swappedAspect;
  // Only suggest rotation if rotating meaningfully improves the aspect
  // match AND the current mismatch is >5%.
  if (err0 < 0.05) return 0;
  if (err90 < err0 * 0.5) return 90;
  return 0;
}

// Rotate an ImageData 90°/180°/270° clockwise. Returns a new
// ImageData-shaped object. 0° returns the input unchanged. Use this
// when `detectRotation` suggests a flip, before feeding the image
// into BG/crop/analyze.
export function rotateImageData(imgData, degrees) {
  const deg = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  if (deg === 0) return imgData;
  const { data, width: w, height: h } = imgData;
  const newW = deg === 180 ? w : h;
  const newH = deg === 180 ? h : w;
  const out = new Uint8ClampedArray(newW * newH * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 4;
      let nx, ny;
      if (deg === 90) {
        nx = h - 1 - y;
        ny = x;
      } else if (deg === 180) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else /* 270 */ {
        nx = y;
        ny = w - 1 - x;
      }
      const dstIdx = (ny * newW + nx) * 4;
      out[dstIdx] = data[srcIdx];
      out[dstIdx + 1] = data[srcIdx + 1];
      out[dstIdx + 2] = data[srcIdx + 2];
      out[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return { data: out, width: newW, height: newH };
}

// Decide whether BG detection looks suspicious. If printable ratio is
// very low (<5%) the BG detector probably picked a label color as BG.
// If very high (>95%) the BG detector picked a rare outlier color,
// leaving every pixel classified as "printable". Both suggest the
// user should pick BG manually.
export function bgSanityCheck(total, bgCount) {
  if (!(total > 0)) return { ok: false, reason: 'empty', printable_ratio: 0 };
  const printableRatio = 1 - bgCount / total;
  if (printableRatio < 0.05) {
    return {
      ok: false,
      reason: 'low_printable',
      printable_ratio: printableRatio,
      hint: 'Very little non-background content detected — try picking BG manually from a margin.',
    };
  }
  if (printableRatio > 0.95) {
    return {
      ok: false,
      reason: 'high_printable',
      printable_ratio: printableRatio,
      hint: 'Almost every pixel classified as ink — the detected BG may be wrong. Pick BG from a clear margin.',
    };
  }
  return { ok: true, printable_ratio: printableRatio };
}

// ── Color separation export ───────────────────────────────────────
//
// Generates a 1-bit-style "film positive" ImageData for ONE detected
// color: pixels matching the cluster centroid (within `threshold` of
// Euclidean RGB distance) are painted black, everything else white.
// Output shape mirrors the input ImageData so the component can hand
// it to a hidden canvas + toBlob() to download as PNG.
//
// Used by the silkscreen / flexo workflow where each color needs its
// own separation film for plate burning. Auto-excluded clusters
// (dieline, user-toggled) should be skipped by the caller.
export function buildColorSeparation(imgData, targetRgb, threshold = 18) {
  if (!imgData || !targetRgb) return null;
  const { data, width, height } = imgData;
  const out = new Uint8ClampedArray(data.length);
  const t2 = threshold * threshold;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - targetRgb[0];
    const dg = data[i + 1] - targetRgb[1];
    const db = data[i + 2] - targetRgb[2];
    const isMatch = dr * dr + dg * dg + db * db <= t2;
    const v = isMatch ? 0 : 255;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { data: out, width, height };
}

// ── Result assembly ───────────────────────────────────────────────

// `excludePredicate(rgb) -> boolean` or `{ predicate, reasonFor }` lets
// the caller mark clusters as excluded from the printed total (e.g. the
// magenta dieline). Each color row still carries its own pct/mm² so the
// UI can show "what would have been counted"; only the totals honor
// the exclusion.
//
// Extensible spot-color handling: pass an array of user-flagged hex
// strings via `opts.userExcludedHex = ['#FF00FF', '#000000']` to mark
// additional clusters as excluded (reason='user'). Use for varnish /
// foil / secondary dielines that don't match the magenta heuristic.
export function buildResult(
  clusters,
  total,
  bgCount,
  widthMm,
  heightMm,
  excludePredicate,
  opts = {}
) {
  const areaMm2 = widthMm * heightMm;
  const sorted = [...clusters].sort((a, b) => b.count - a.count);
  const userSet = new Set((opts.userExcludedHex || []).map((h) => String(h).toUpperCase()));
  const colors = sorted.map((c, i) => {
    const rgb = [Math.round(c.rgb[0]), Math.round(c.rgb[1]), Math.round(c.rgb[2])];
    const hex = rgbToHex(rgb);
    const dielineAuto = typeof excludePredicate === 'function' && excludePredicate(rgb) === true;
    const userMark = userSet.has(hex);
    const excluded = dielineAuto || userMark;
    return {
      idx: i + 1,
      rgb,
      hex,
      name: nearestColorName(rgb),
      pixel_count: c.count,
      print_area_pct: total > 0 ? c.count / total : 0,
      print_area_mm2: total > 0 ? (c.count / total) * areaMm2 : 0,
      excluded,
      // Reason precedence: user pick overrides auto heuristic so the
      // UI can show "why excluded" and let the user flip it back.
      excluded_reason: userMark ? 'user' : dielineAuto ? 'dieline' : null,
    };
  });
  return recomputeTotals(colors, total, bgCount, widthMm, heightMm);
}

// Recompute the totals block after an exclusion state change. Cheap
// enough to run on every UI toggle — no need to re-render the canvas
// or re-quantize.
//
// `pixel_count` on each color is ALREADY the weighted sum (when AA
// weighting is active — see maskPrintable/quantizeColors), so the
// aggregation here is a straight Σ with no second conversion. The
// unweighted `bgCount` is kept alongside for information display.
export function recomputeTotals(colors, total, bgCount, widthMm, heightMm) {
  const areaMm2 = widthMm * heightMm;
  let includedWeight = 0;
  let excludedWeight = 0;
  for (const c of colors) {
    if (c.excluded) excludedWeight += c.pixel_count;
    else includedWeight += c.pixel_count;
  }
  const printableRaw = total - bgCount; // unweighted count, kept for info
  return {
    colors,
    totals: {
      total_pixels: total,
      bg_pixels: bgCount,
      printable_pixels: printableRaw,
      excluded_pixels: excludedWeight,
      printed_pixels: includedWeight,
      total_print_pct: total > 0 ? includedWeight / total : 0,
      total_print_mm2: total > 0 ? (includedWeight / total) * areaMm2 : 0,
    },
  };
}

// ── Browser-only entry point ──────────────────────────────────────

// Detect PDF/AI by MIME or file extension. Adobe Illustrator (.ai) files
// saved with "Create PDF Compatible File" (Illustrator's default since
// CS) embed a full PDF stream and can be opened by pdf.js as if they
// were a regular PDF — so we route both through the same renderer.
function isPdfLike(file) {
  if (!file) return false;
  const mime = (file.type || '').toLowerCase();
  if (
    mime === 'application/pdf' ||
    mime === 'application/illustrator' ||
    mime === 'application/postscript'
  )
    return true;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.pdf') || name.endsWith('.ai');
}

// Lazy-load pdf.js ONLY when a PDF/AI file actually arrives, so the
// ~800 kB worker chunk doesn't bloat the baseline tab bundle for users
// who only ever drop PNGs. Worker URL resolved via Vite's `?url`
// import — pdf.js needs an absolute URL to spin up the Web Worker
// that does the heavy parsing off the main thread.
let _pdfjs = null;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  // Chromium 130+ ships native Uint8Array.prototype.toHex/toBase64. PDF.js v4's
  // guarded check `Uint8Array.prototype.toHex ? e.toHex() : <fallback>` then
  // unconditionally calls e.toHex() — which throws "n.toHex is not a function"
  // when e is a plain Array (some PDFs hand the trailer /ID parser one).
  // Forcing the fallback path by deleting the prototype methods on both the
  // main thread AND inside the worker realm sidesteps the engine bug.
  // eslint-disable-next-line no-empty -- pre-existing tech debt: intentional empty fallback
  try {
    delete Uint8Array.prototype.toHex;
  } catch {}
  // eslint-disable-next-line no-empty -- pre-existing tech debt: intentional empty fallback
  try {
    delete Uint8Array.prototype.toBase64;
  } catch {}

  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  // The worker file itself was patched at build time (scripts/patch-pdfjs-worker.mjs)
  // to prepend the same `delete Uint8Array.prototype.toHex/toBase64` shim, since
  // the worker runs in its own realm and main-thread deletes don't reach it.
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = pdfjs;
  return pdfjs;
}

// Render a single page of a PDF/AI document onto a canvas at the target
// print size. Uses the page's native dimensions to pick a scale that
// maps the PDF's widest axis onto our target canvas — labels are often
// authored at the final print size so 1:1 mapping is typical, but we
// still normalize to the user-specified mm × mm so dimension overrides
// win over whatever the artwork file claims.
async function renderPdfLike(file, widthMm, heightMm, dpi, pageIndex = 1) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buf, disableFontFace: false });
  const doc = await loadingTask.promise;
  try {
    const pageNum = Math.max(1, Math.min(doc.numPages || 1, Math.round(pageIndex) || 1));
    const page = await doc.getPage(pageNum);
    const targetW = mmToPx(widthMm, dpi);
    const targetH = mmToPx(heightMm, dpi);
    // viewport at scale 1 is the PDF's native px size (PDF unit = 1/72 inch).
    const vp1 = page.getViewport({ scale: 1 });
    // Scale so the PDF fills our target canvas (preserves aspect by
    // picking the tighter of the two ratios — overflow is trimmed, not
    // stretched, so the user's stated dimensions are authoritative).
    const scale = Math.min(targetW / vp1.width, targetH / vp1.height);
    const viewport = page.getViewport({ scale: scale || 1 });
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    // Center the rendered PDF inside the target canvas when aspect
    // ratios don't match — keeps whitespace symmetric so 4-corner BG
    // detection still samples the empty margins correctly.
    const dx = Math.max(0, (targetW - viewport.width) / 2);
    const dy = Math.max(0, (targetH - viewport.height) / 2);
    // PDF.js v5 RenderParameters: `canvas` is the preferred input; `canvasContext`
    // is supported but the docs say "if the context must absolutely be used to
    // render the page, the canvas must be null". Internal color handling (the
    // toHex path) fails when neither is wired correctly. Pass both explicitly.
    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      transform: [1, 0, 0, 1, dx, dy],
    }).promise;
    return ctx.getImageData(0, 0, targetW, targetH);
  } finally {
    try {
      await doc.destroy();
    } catch {
      /* ignore cleanup failure */
    }
  }
}

// Loads a File/Blob into ImageData at the target mm × mm @ DPI. Uses
// OffscreenCanvas when available (every modern browser) and falls back
// to a detached <canvas> for Safari < 16.
export async function renderArtwork(file, widthMm, heightMm, dpi = 300, pageIndex = 1) {
  if (isPdfLike(file)) return renderPdfLike(file, widthMm, heightMm, dpi, pageIndex);
  const w = mmToPx(widthMm, dpi);
  const h = mmToPx(heightMm, dpi);
  const bitmap = await createImageBitmap(file);
  let canvas, ctx;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(w, h);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } else {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  // Paint white under the artwork so transparent-PNG edges don't
  // inherit whatever the canvas default is (Chrome = transparent,
  // which would skew BG detection). User can still override BG mode.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// Render at the bitmap's NATIVE aspect/size (capped at maxPx). Unlike
// `renderArtwork`, this does NOT squash the input into the label-sized
// canvas — it preserves any extra space around the label that was in
// the source (dimension arrows, trim marks, callouts). The physical-
// anchored crop mode then trims that extra space back down to exactly
// widthMm × heightMm @ dpi.
//
// Returns { imageData, canvasMm: { wMm, hMm } } where canvasMm is the
// *effective* physical span of the rendered bitmap assuming the source
// was authored at `dpi` — lets the caller compute where widthMm×heightMm
// falls inside the oversized canvas.
export async function renderArtworkNative(
  file,
  widthMm,
  heightMm,
  dpi = 300,
  maxPx = 2400,
  pageIndex = 1
) {
  if (isPdfLike(file)) {
    // PDF: render at the PDF's native px density. Scale so the long
    // edge hits maxPx (prevents memory blowouts on large AI files).
    const pdfjs = await loadPdfjs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf, disableFontFace: false }).promise;
    try {
      const pageNum = Math.max(1, Math.min(doc.numPages || 1, Math.round(pageIndex) || 1));
      const page = await doc.getPage(pageNum);
      const vp1 = page.getViewport({ scale: 1 });
      const longEdge = Math.max(vp1.width, vp1.height);
      const scale = longEdge > maxPx ? maxPx / longEdge : 1;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    } finally {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
    }
  }
  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = longEdge > maxPx ? maxPx / longEdge : 1;
  // Floor: label must be at least widthMm×heightMm @ dpi worth of
  // pixels to get analysis fidelity, so if the native bitmap would
  // downscale below that, stretch back up (anti-aliased) to the label
  // pixel size. Avoids the degenerate case where a 200×100 input would
  // otherwise be analyzed at a density too coarse to measure anything.
  const targetW = mmToPx(widthMm, dpi);
  const targetH = mmToPx(heightMm, dpi);
  const minScale = Math.max(targetW / bitmap.width, targetH / bitmap.height);
  const finalScale = Math.max(scale, Math.min(1, minScale));
  const w = Math.max(1, Math.round(bitmap.width * finalScale));
  const h = Math.max(1, Math.round(bitmap.height * finalScale));
  let canvas, ctx;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(w, h);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } else {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// Effective physical dimensions after applying drawing scale ratio.
// User enters dimensions AS DRAWN on the artwork; scale_ratio tells us
// how much the drawing is enlarged vs reality. scale=2 means the
// artwork is drawn at 2× physical size, so a 60 mm wide drawing prints
// at 30 mm. We feed the EFFECTIVE physical mm into the area-% math so
// mm² output reflects the real label, not the drawing.
//
// Scale ratio of 1 (the default) is a no-op — the entered dimensions
// ARE the physical dimensions.
export function effectivePhysicalDims(widthMm, heightMm, scaleRatio) {
  const s = Number(scaleRatio);
  const safe = Number.isFinite(s) && s > 0 ? s : 1;
  return {
    widthMm: widthMm / safe,
    heightMm: heightMm / safe,
    scale: safe,
  };
}

// Clamp a manual ROI rectangle to the canvas bounds. Coords arrive in
// canvas-pixel space (caller is responsible for converting from CSS px
// using getBoundingClientRect). Negative width/height (drag from
// bottom-right to top-left) is normalized.
export function normalizeRoi(roi, canvasW, canvasH) {
  if (!roi) return null;
  let x = Math.round(roi.x);
  let y = Math.round(roi.y);
  let w = Math.round(roi.w);
  let h = Math.round(roi.h);
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  x = Math.max(0, Math.min(canvasW - 1, x));
  y = Math.max(0, Math.min(canvasH - 1, y));
  w = Math.max(1, Math.min(canvasW - x, w));
  h = Math.max(1, Math.min(canvasH - y, h));
  return { x, y, w, h };
}

// Full pipeline — one call from the component. `cfg` is the UI form
// state. Returns the shape that buildResult produces, plus bg_detected
// for display + the rendered ImageData so the component can paint an
// overlay without re-rendering.
//
// Region of interest priority (highest wins):
//   1. cfg.manualRoi                     → user drew a box on the canvas
//   2. cfg.cropMode === 'physical'       → "absolute coordinate" crop;
//                                          renders at NATIVE aspect, then
//                                          center-crops to widthMm×heightMm
//                                          on the content centroid. The
//                                          most accurate when input has
//                                          dim-line / trim-mark margins.
//   3. cfg.cropMode === 'auto' OR cfg.autoCrop !== false
//                                        → erode-then-bbox (legacy default)
//   4. cfg.cropMode === 'none'           → no crop, analyze full canvas
//
// Ink-coverage math (made explicit here to stop future drift):
//   let P = pixels in the analyzed region (label-only after crop)
//   let C_i = pixels assigned to color cluster i
//   let A = widthMm × heightMm / scaleRatio²  (physical label area)
//   color_pct_i = C_i / P                (dimensionless, 0..1)
//   color_mm²_i = color_pct_i × A         (mm² of that color on product)
//   total_print_pct = Σ (C_i excluded=false) / P
//   total_print_mm² = total_print_pct × A
//
// Correctness hinges on P representing the LABEL area only — no margins
// or callouts. That's what the crop modes above guarantee.
export async function runPrintAreaAnalysis(file, cfg) {
  const mode =
    cfg.cropMode || (cfg.manualRoi ? 'manual' : cfg.autoCrop !== false ? 'auto' : 'none');
  const metric = cfg.colorMetric === 'rgb' ? 'rgb' : 'lab'; // Lab default
  const aaWeighting = cfg.aaWeighting !== false; // on by default
  const bleedMm = Math.max(0, Number(cfg.bleedMm) || 0);
  const pageIndex = Math.max(1, Number(cfg.pageIndex) || 1);

  // Vector-ink engine dispatch (Sprint 11). For PDF/AI input the
  // pre-press gold-standard approach reads the content stream directly
  // and reports per-ink-plate coverage rather than visual colour
  // clusters. The engine attaches its result to the return payload as
  // `vectorInk`; the UI can show both the raster clusters (visual QC)
  // AND the plate breakdown (pricing authority) side-by-side.
  //
  // Dispatch policy (cfg.vectorMode):
  //   'auto' (default) — run vector engine when the file is PDF/AI;
  //                       skip for raster (PNG/JPG/SVG).
  //   'force'           — require vector; error if not applicable.
  //   'off'             — skip vector even for PDF/AI.
  const vectorMode = cfg.vectorMode || 'auto';
  let vectorInk = null;
  if (vectorMode !== 'off' && isPdfLike(file)) {
    try {
      const { analyzePdfVectorInk } = await import('./pdfVectorInk.js');
      vectorInk = await analyzePdfVectorInk(
        file,
        cfg.widthMm + 2 * bleedMm,
        cfg.heightMm + 2 * bleedMm,
        {
          pageIndex,
        }
      );
    } catch (e) {
      // Non-fatal: raster path continues and is still authoritative
      // for visual clusters. Surface the failure reason in warnings so
      // operators know the plate view is unavailable.
      vectorInk = {
        mode: 'vector',
        plates: [],
        warnings: [
          `Vector ink analysis failed: ${e.message || e}. Plate-level coverage is unavailable; raster clusters below are the only data.`,
        ],
        error: true,
      };
      if (vectorMode === 'force') throw e;
    }
  }

  // Bleed math: when the user specified a non-zero bleed, the ANALYSIS
  // frame grows to include the bleed (so ink covered in the bleed still
  // counts toward ink consumption per label). The TRIM mm² (what ends
  // up on the finished product) is still computed below from widthMm ×
  // heightMm. Both are reported.
  const frameWmm = cfg.widthMm + 2 * bleedMm;
  const frameHmm = cfg.heightMm + 2 * bleedMm;

  const fullImg =
    mode === 'physical' && !cfg.manualRoi
      ? await renderArtworkNative(file, frameWmm, frameHmm, cfg.dpi, 2400, pageIndex)
      : await renderArtwork(file, frameWmm, frameHmm, cfg.dpi, pageIndex);

  // Rotation: either user-forced via cfg.rotation ∈ {0,90,180,270,'auto'}
  // or auto-detected from aspect mismatch. Applied BEFORE BG detection
  // so the corners we sample are in the correct orientation.
  let rotation = 0;
  const rotCfg = cfg.rotation;
  if (rotCfg === 'auto' || rotCfg == null) {
    rotation = detectRotation(fullImg.width, fullImg.height, frameWmm, frameHmm);
  } else if (rotCfg === 90 || rotCfg === 180 || rotCfg === 270) {
    rotation = rotCfg;
  }
  const rotated = rotation ? rotateImageData(fullImg, rotation) : fullImg;

  // BG sampled from the uncropped+rotated canvas — paper/whitespace
  // outside the label anchors the detection. Manual override still wins.
  const bg =
    cfg.bgMode === 'manual' && cfg.bgColor
      ? [cfg.bgColor[0], cfg.bgColor[1], cfg.bgColor[2]]
      : detectBackground(rotated);

  let imgData = rotated;
  let crop = null;
  let cropSource = null; // 'manual' | 'physical' | 'auto' | null

  let dielinePick = null; // { rgb, bbox, n, score, hex } when auto-picked
  if (cfg.manualRoi) {
    // Manual ROI wins — user explicitly scoped the measurement.
    const roi = normalizeRoi(cfg.manualRoi, rotated.width, rotated.height);
    if (roi) {
      imgData = cropImageData(rotated, roi);
      crop = roi;
      cropSource = 'manual';
    }
  } else if (mode === 'dieline') {
    // Die-line bbox: find the thin closed stroke surrounding the label
    // content and use its bounding box as the crop. This is the most
    // accurate mode when the artwork has an explicit die-cut outline
    // (any color). User can force a specific die-line color via
    // `cfg.dielineHex`; otherwise auto-pick via stroke-score.
    const ignoreHex = [
      // Never pick a known background shade as the "die-line".
      rgbToHex(bg),
      ...(cfg.userExcludedHex || []),
    ];
    const pick = cfg.dielineHex
      ? dielineBboxByColor(rotated, cfg.dielineHex, { metric })
      : pickDielineBbox(rotated, bg, { tolerance: cfg.bgTolerance, metric, ignoreHex });
    if (pick) {
      dielinePick = { ...pick, hex: rgbToHex(pick.rgb) };
      imgData = cropImageData(rotated, pick.bbox);
      crop = pick.bbox;
      cropSource = 'dieline';
    }
  } else if (mode === 'physical') {
    // Input-driven crop: the user's mm×mm sidebar input is ground truth.
    // Crops to the FRAME dims (trim + bleed) — full ink footprint.
    const box = physicalAnchoredCrop(rotated, bg, frameWmm, frameHmm, cfg.dpi, cfg.bgTolerance);
    if (box) {
      imgData = cropImageData(rotated, box);
      crop = box;
      cropSource = 'physical';
    }
  } else if (mode === 'auto' || (mode !== 'none' && cfg.autoCrop !== false)) {
    const eroded = erodePrintableMask(rotated, bg, cfg.bgTolerance);
    const bounds = boundsOfMask(eroded, rotated.width, rotated.height, 3);
    if (bounds) {
      const shrinkX = 1 - bounds.w / rotated.width;
      const shrinkY = 1 - bounds.h / rotated.height;
      if (shrinkX > 0.05 || shrinkY > 0.05) {
        imgData = cropImageData(rotated, bounds);
        crop = bounds;
        cropSource = 'auto';
      }
    }
  }

  let { pixels, weights, bgCount, total } = maskPrintable(imgData, bg, cfg.bgTolerance, {
    aaWeighting,
    metric,
  });

  // Optional morphological opening — removes thin dim-callout strokes
  // even when their color matches legit content. Rebuilds pixels/weights
  // from the opened mask; dropped pixels re-count as BG.
  if (cfg.thinStrokeIterations && cfg.thinStrokeIterations > 0) {
    const { width: iw, height: ih, data } = imgData;
    const printable = new Uint8Array(iw * ih);
    // Rebuild the 0/1 mask from the original pixels so opening operates
    // on the same set we measured above (consistent with weighted math).
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] < 8) continue;
      const px = [data[i], data[i + 1], data[i + 2]];
      const d = metric === 'lab' ? deltaE76(rgbToLab(px), rgbToLab(bg)) : colorDist(px, bg);
      const tol = metric === 'lab' && cfg.bgTolerance > 10 ? cfg.bgTolerance / 4 : cfg.bgTolerance;
      if (d > tol) printable[p] = 1;
    }
    const opened = openMask(printable, iw, ih, cfg.thinStrokeIterations);
    const newPixels = [];
    const newWeights = [];
    let newBgCount = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] < 8) {
        newBgCount++;
        continue;
      }
      const px = [data[i], data[i + 1], data[i + 2]];
      const d = metric === 'lab' ? deltaE76(rgbToLab(px), rgbToLab(bg)) : colorDist(px, bg);
      const tol = metric === 'lab' && cfg.bgTolerance > 10 ? cfg.bgTolerance / 4 : cfg.bgTolerance;
      if (d <= tol) {
        newBgCount++;
        continue;
      }
      if (!opened[p]) {
        newBgCount++;
        continue;
      }
      // Re-derive weight for kept pixels so AA band is respected.
      let w = 1;
      if (aaWeighting) {
        w = Math.min(1, Math.max(0, (d - tol) / tol));
        if (w < 0.05) {
          newBgCount++;
          continue;
        }
      }
      newPixels.push(px);
      newWeights.push(w);
    }
    pixels = newPixels;
    weights = newWeights;
    bgCount = newBgCount;
  }

  // BG sanity check — emit a diagnostic if printable ratio is suspiciously
  // low or high. The UI surfaces this as a warning banner.
  const bgSanity = bgSanityCheck(total, bgCount);

  // Sprint 9: chroma-boosted MMCQ so rare spot inks aren't eaten by the
  // dominant dark/gray regions. Flag-off via cfg.chromaBoost=false.
  let clusters = quantizeColors(pixels, cfg.kColors, weights, {
    metric,
    chromaBoost: cfg.chromaBoost !== false,
  });
  clusters = mergeClusters(clusters, cfg.mergeThreshold, { metric });

  // Sprint 9: outlier rescue — catches spot inks that even chroma-boost
  // missed (e.g., a 0.05% red warning on a 90% black label). Toggle off
  // with cfg.rescueOutliers=false for bit-for-bit pre-Sprint-9 output.
  if (cfg.rescueOutliers !== false) {
    clusters = rescueOutlierClusters(pixels, weights, clusters, {
      metric,
      outlierThreshold: cfg.outlierThreshold,
      minOutlierPct: cfg.minOutlierPct,
      maxNewClusters: cfg.maxRescueClusters,
    });
  }

  // Sprint 9: pinned spot-color injection. User-flagged eyedropper hexes
  // are forced into the palette even if both MMCQ and rescue missed them.
  if (Array.isArray(cfg.pinnedSpotHex) && cfg.pinnedSpotHex.length > 0) {
    clusters = injectPinnedClusters(pixels, weights, clusters, cfg.pinnedSpotHex, { metric });
  }

  // When dieline mode auto-picked a stroke color, exclude THAT color
  // from the printed total (it's a cut guide, not ink). Combines with
  // the magenta heuristic so a green stroke is still caught, and the
  // stroke color we just detected is caught too.
  const detectedDielineRgb = dielinePick?.rgb || null;
  const exclude =
    cfg.autoExcludeDieline !== false
      ? (rgb) => {
          if (isDielineColor(rgb)) return true;
          if (detectedDielineRgb) {
            const d =
              metric === 'lab'
                ? labDist(rgb, detectedDielineRgb)
                : colorDist(rgb, detectedDielineRgb);
            const nearTol = metric === 'lab' ? 5 : 20;
            if (d <= nearTol) return true;
          }
          return false;
        }
      : null;
  // Scale ratio applies to the PHYSICAL (mm) dimensions the user
  // entered. Pixel ratios are scale-invariant.
  const phys = effectivePhysicalDims(cfg.widthMm, cfg.heightMm, cfg.scaleRatio);
  const physFrame = effectivePhysicalDims(frameWmm, frameHmm, cfg.scaleRatio);
  // buildResult uses the FRAME area (trim + bleed) as the mm² denominator
  // when bleed > 0 — the frame is what the pixel canvas actually covers
  // after cropping, so mm²/% numbers are self-consistent. For the
  // trim-only metric the caller multiplies by (trim_area / frame_area).
  let result = buildResult(
    clusters,
    total,
    bgCount,
    physFrame.widthMm,
    physFrame.heightMm,
    exclude,
    { userExcludedHex: cfg.userExcludedHex || [] }
  );

  // Trim-only mm² — ink that actually lands on the finished product.
  // Scales the frame total by (trim_area / frame_area). When bleed = 0
  // this is an identity; when bleed > 0 it shrinks the mm² by roughly
  // `1 - (frame_area - trim_area) / frame_area`.
  const trimAreaMm2 = phys.widthMm * phys.heightMm;
  const frameAreaMm2 = physFrame.widthMm * physFrame.heightMm;
  const trimRatio = frameAreaMm2 > 0 ? trimAreaMm2 / frameAreaMm2 : 1;

  // Augment each color with ink-volume metrics for the active print
  // method. Dot gain is folded in by default (Sprint 8) — disable via
  // cfg.applyDotGain=false to reproduce pre-Sprint-8 ink numbers.
  result = {
    ...result,
    colors: applyInkProfile(result.colors, cfg.printMethod, {
      applyDotGain: cfg.applyDotGain !== false,
    }),
  };

  return {
    ...result,
    bg_detected: { r: bg[0], g: bg[1], b: bg[2] },
    bg_sanity: bgSanity,
    crop,
    crop_source: cropSource,
    crop_mode: mode,
    // Die-line summary when mode='dieline' succeeded: color detected +
    // its implied physical dimensions (inverse of mmToPx at cfg.dpi).
    // UI can show "Die-line detected: #EC4444, 29.2×15.8 mm — update
    // product dims?" and offer a one-click override.
    dieline: dielinePick
      ? {
          hex: dielinePick.hex,
          rgb: dielinePick.rgb,
          bbox: dielinePick.bbox,
          pixel_count: dielinePick.n,
          stroke_score: dielinePick.score,
          detected_width_mm: pxToMm(dielinePick.bbox.w, cfg.dpi),
          detected_height_mm: pxToMm(dielinePick.bbox.h, cfg.dpi),
        }
      : null,
    rotation_applied: rotation,
    rotation_source:
      rotation === 0 ? 'none' : rotCfg === 90 || rotCfg === 180 || rotCfg === 270 ? 'user' : 'auto',
    thin_stroke_iterations: cfg.thinStrokeIterations || 0,
    color_metric: metric,
    aa_weighting: aaWeighting,
    bleed_mm: bleedMm,
    frame_width_mm: physFrame.widthMm,
    frame_height_mm: physFrame.heightMm,
    trim_width_mm: phys.widthMm,
    trim_height_mm: phys.heightMm,
    trim_ratio: trimRatio,
    print_method: cfg.printMethod || 'flexo',
    scale_ratio: phys.scale,
    physical_width_mm: phys.widthMm,
    physical_height_mm: phys.heightMm,
    apply_dot_gain: cfg.applyDotGain !== false,
    page_index: pageIndex,
    // Vector-ink (plate-level) result from the pre-press engine. Null
    // for raster inputs OR when vectorMode='off'. When present, the UI
    // renders an Ink Plates panel alongside the raster clusters.
    vector_ink: vectorInk,
    _imgData: imgData,
    _fullImg: fullImg,
  };
}
