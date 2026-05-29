/**
 * pdfVectorInk.js — vector-native ink-coverage analyzer (pre-press
 * grade). Inspired by Esko Ink Wizard / PitStop Pro / Hybrid Packz:
 * instead of rasterizing the artwork and clustering pixels (which
 * loses plate information), this module walks the PDF content stream
 * directly and attributes area to the ink PLATE that drew it.
 *
 * Why this matters:
 *   - A 2 mm red "Wash" label + a 10 mm black background rasterise to
 *     99.8% black / 0.2% red *pixels*. After 1:1 printing, the operator
 *     actually consumes ~2 mm² of red ink AND ~10 mm² of black ink on
 *     separate plates. Raster MMCQ undercounts the red ink because it
 *     only sees what is visually dominant.
 *   - Pantone / spot inks live in Separation or DeviceN colour spaces.
 *     After rasterisation they become approximate RGB. The vector
 *     engine reads the spot name verbatim from the PDF ("PANTONE 485 C").
 *   - Overprinting: red that prints OVER black still consumes both
 *     plates. Raster only shows the visible top colour; vector adds
 *     both areas.
 *
 * ─── Algorithm ─────────────────────────────────────────────────────
 *
 * For each PDF page:
 *   1. Get the operator list via pdf.js `page.getOperatorList()`.
 *      This returns an array of numeric op codes + argument tuples.
 *   2. Walk it with a state machine that tracks:
 *        - current transform matrix (CTM)
 *        - fill + stroke colour in the current colour space
 *        - current path (sequence of subpaths)
 *        - graphics state stack (q / Q operators)
 *   3. On each fill / eoFill / stroke / fillStroke:
 *        a. Flatten the current path (curves -> line segments)
 *        b. Compute signed area via the Shoelace formula per subpath
 *        c. Transform path units to device mm² via CTM + page scale
 *        d. Attribute the area to the current ink plate (including tint)
 *   4. For image XObjects (`Do /Image`): fall back to raster MMCQ on
 *      just that image (sub-region), then attribute pixel mass to the
 *      inferred plate. [Phase 3 — not yet implemented; image objects
 *      are currently skipped with a warning.]
 *
 * Output shape is designed to be rendered directly next to the
 * existing raster clusters, so the UI can show both side-by-side.
 *
 * Not modelled (deferred — see code comments):
 *   - Overprint with ExtGState OP=true (additive to plate totals)
 *   - Pantone library RGB preview (the name is read, RGB is passed-through)
 *   - Soft-masks (SMask) and transparency groups
 *   - Vector images clipped by complex clip-paths
 *
 * The module is framework-free + testable: all heavy math functions
 * are pure, only `analyzePdfVectorInk` touches the browser / pdf.js.
 */

// ── pdf.js OPS codes we care about ────────────────────────────────
//
// pdf.js exports OPS as an object where each key is the op name and
// the value is a small integer. Since the numbering can change between
// major versions, we resolve them at runtime from the imported module
// instead of hard-coding integers.
let _pdfjsRef = null;
async function loadPdfjs() {
  if (_pdfjsRef) return _pdfjsRef;
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjsRef = pdfjs;
  return pdfjs;
}

// ── Pure math helpers ─────────────────────────────────────────────

/**
 * Shoelace signed area of a polygon (sequence of [x, y] points).
 * Positive area = counter-clockwise; negative = clockwise.
 * The absolute value is the un-signed area.
 */
export function shoelaceArea(poly) {
  if (!poly || poly.length < 3) return 0;
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * Flatten a cubic Bezier into a polyline. Uses uniform t-parameter
 * sampling — NOT adaptive. For typical label artwork this is plenty
 * accurate (we're measuring area, not reconstructing geometry), and
 * it's bounded-work so long curves can't pathologically OOM. Use
 * `segments = 16` for most jobs; bump to 32 for heavy-curvature
 * artwork (logos, fancy dingbats).
 */
export function flattenCubic(p0, p1, p2, p3, segments = 16) {
  const out = [p0];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    // Cubic Bezier: (1−t)³P₀ + 3(1−t)²t P₁ + 3(1−t)t² P₂ + t³ P₃
    const x =
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
    const y =
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
    out.push([x, y]);
  }
  return out;
}

/**
 * Determinant of a 2D affine matrix stored as [a, b, c, d, e, f]
 * where the matrix is:
 *   | a  c  e |
 *   | b  d  f |
 *   | 0  0  1 |
 * This determines how the transform scales area.
 */
export function matrixDet(m) {
  return m[0] * m[3] - m[1] * m[2];
}

/**
 * Multiply two affine matrices (left × right).
 * pdf.js uses the same [a, b, c, d, e, f] convention.
 */
export function matrixMul(left, right) {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/**
 * Map a point through a transform matrix.
 */
export function applyMatrix(m, p) {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/**
 * Normalise a colour to a stable plate key string.
 *
 *  - Spot / Separation → 'spot:' + uppercase name ('spot:PANTONE 485 C')
 *  - DeviceCMYK        → 'cmyk:<c>-<m>-<y>-<k>' rounded to 2 dp
 *  - DeviceRGB         → 'rgb:<r>-<g>-<b>' with [0..255] ints
 *  - DeviceGray        → 'gray:<g>' with [0..255]
 *
 * Keys are used as object indices for plate accumulation, so identical
 * colours cluster into one plate automatically.
 */
export function plateKey(color) {
  if (!color) return 'rgb:0-0-0';
  if (color.cs === 'spot' || color.cs === 'Separation' || color.cs === 'DeviceN') {
    const name = String(color.name || 'Unknown Spot')
      .trim()
      .toUpperCase();
    return `spot:${name}`;
  }
  if (color.cs === 'DeviceCMYK' || color.cs === 'cmyk') {
    const [c, m, y, k] = color.values;
    return `cmyk:${c.toFixed(2)}-${m.toFixed(2)}-${y.toFixed(2)}-${k.toFixed(2)}`;
  }
  if (color.cs === 'DeviceGray' || color.cs === 'gray') {
    return `gray:${Math.round(color.values[0] * 255)}`;
  }
  // DeviceRGB fallback.
  const rgb = color.values || [0, 0, 0];
  return `rgb:${Math.round(rgb[0] * 255)}-${Math.round(rgb[1] * 255)}-${Math.round(rgb[2] * 255)}`;
}

/**
 * Human-readable label for a plate. For spot colours we surface the
 * Pantone name verbatim; for process colours we surface which channel
 * is dominant.
 */
export function plateName(color) {
  if (!color) return 'Unknown';
  if (color.cs === 'spot' || color.cs === 'Separation' || color.cs === 'DeviceN') {
    return color.name || 'Unknown Spot';
  }
  if (color.cs === 'DeviceCMYK' || color.cs === 'cmyk') {
    const [c, m, y, k] = color.values;
    const parts = [];
    if (c > 0) parts.push(`C${Math.round(c * 100)}`);
    if (m > 0) parts.push(`M${Math.round(m * 100)}`);
    if (y > 0) parts.push(`Y${Math.round(y * 100)}`);
    if (k > 0) parts.push(`K${Math.round(k * 100)}`);
    return parts.length ? parts.join(' ') : 'Paper (no ink)';
  }
  if (color.cs === 'DeviceGray' || color.cs === 'gray') {
    return `Gray ${Math.round(color.values[0] * 100)}%`;
  }
  const [r, g, b] = (color.values || [0, 0, 0]).map((v) => Math.round(v * 255));
  return `RGB(${r},${g},${b})`;
}

// ── Content-stream walker ────────────────────────────────────────

/**
 * Walk the operator list for one page and accumulate area per plate.
 *
 * Returns a map: plateKey -> { name, type, colorValues, areaPdfUnits }.
 * Area is in PDF user-space units squared (1 unit = 1/72 inch). The
 * caller scales to mm² using page.userUnit + page dimensions.
 *
 * This function is EXPORTED for unit-testing without needing pdf.js —
 * callers can synthesise an operator list + OPS enum and verify the
 * accumulation logic.
 */
export function accumulatePlates(operatorList, OPS, resolveColor = null) {
  const plates = new Map();

  // Graphics state — a stack-based model matching the q/Q save/restore
  // bracketing in the PDF content stream. Each entry carries the CTM
  // and the current fill + stroke colour.
  const gsStack = [
    {
      ctm: [1, 0, 0, 1, 0, 0], // identity
      fill: { cs: 'DeviceGray', values: [0] }, // default black
      stroke: { cs: 'DeviceGray', values: [0] },
      fillTint: 1,
      strokeTint: 1,
    },
  ];
  let gs = gsStack[0];

  // Current path — an array of subpaths, each a polyline of points.
  let currentPath = [];
  let currentSubpath = null; // the subpath being built

  function startSubpath(pt) {
    currentSubpath = [pt];
    currentPath.push(currentSubpath);
  }
  function addPoint(pt) {
    if (!currentSubpath) startSubpath(pt);
    else currentSubpath.push(pt);
  }
  function closeSubpath() {
    if (currentSubpath && currentSubpath.length > 0) {
      // Close the loop by appending the first point again. Shoelace
      // handles open loops too but the closed form matches filled
      // regions 1:1.
      const first = currentSubpath[0];
      const last = currentSubpath[currentSubpath.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) currentSubpath.push(first);
    }
  }

  function fillArea() {
    // Sum |shoelace| for each subpath. Path points are ALREADY in
    // device space (each moveTo/lineTo/curveTo/rectangle applies CTM
    // via applyMatrix when the op is processed) — so no further det
    // multiplication is needed. Do NOT add `* |det(CTM)|` here or the
    // area is squared.
    //
    // Using absolute value so clockwise holes don't erroneously
    // subtract (printing-wise, a hole inside a shape still consumes
    // ink on the outer shape — even-odd fill is the correct model
    // only for visual rendering, not for plate coverage).
    // TODO Phase 2: distinguish evenodd vs nonzero fill rule.
    let areaDevice = 0;
    for (const sp of currentPath) {
      if (sp.length < 3) continue;
      areaDevice += Math.abs(shoelaceArea(sp));
    }
    if (areaDevice <= 0) return;

    const color = gs.fill;
    const tintedArea = areaDevice * gs.fillTint;
    const key = plateKey(color);
    const existing = plates.get(key);
    if (existing) {
      existing.areaPdfUnits += tintedArea;
      existing.objectCount += 1;
    } else {
      plates.set(key, {
        key,
        name: plateName(color),
        type:
          color.cs === 'spot' || color.cs === 'Separation' || color.cs === 'DeviceN'
            ? 'spot'
            : 'process',
        color,
        areaPdfUnits: tintedArea,
        objectCount: 1,
      });
    }
  }

  function resetPath() {
    currentPath = [];
    currentSubpath = null;
  }

  // Main op walk
  const fnArray = operatorList.fnArray || [];
  const argsArray = operatorList.argsArray || [];
  const N = fnArray.length;

  for (let i = 0; i < N; i++) {
    const op = fnArray[i];
    const args = argsArray[i] || [];

    // q — save graphics state
    if (op === OPS.save) {
      gsStack.push({ ...gs, ctm: [...gs.ctm] });
      gs = gsStack[gsStack.length - 1];
      continue;
    }
    // Q — restore graphics state
    if (op === OPS.restore) {
      if (gsStack.length > 1) gsStack.pop();
      gs = gsStack[gsStack.length - 1];
      continue;
    }
    // cm — concat matrix to CTM. args can be [a,b,c,d,e,f] flat or a
    // single nested array depending on the pdf.js build.
    if (op === OPS.transform) {
      const m2 = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      gs.ctm = matrixMul(gs.ctm, m2);
      continue;
    }

    // Path construction
    if (op === OPS.moveTo) {
      startSubpath(applyMatrix(gs.ctm, [args[0], args[1]]));
      continue;
    }
    if (op === OPS.lineTo) {
      addPoint(applyMatrix(gs.ctm, [args[0], args[1]]));
      continue;
    }
    if (op === OPS.curveTo) {
      // Cubic Bezier (x1,y1,x2,y2,x3,y3)
      const last = (currentSubpath && currentSubpath[currentSubpath.length - 1]) || [0, 0];
      const p0 = last;
      const p1 = applyMatrix(gs.ctm, [args[0], args[1]]);
      const p2 = applyMatrix(gs.ctm, [args[2], args[3]]);
      const p3 = applyMatrix(gs.ctm, [args[4], args[5]]);
      const flat = flattenCubic(p0, p1, p2, p3);
      // Skip first point (already in the path)
      for (let j = 1; j < flat.length; j++) addPoint(flat[j]);
      continue;
    }
    if (op === OPS.curveTo2 || op === OPS.curveTo3) {
      // v: (x2, y2, x3, y3) — first control = current point
      // y: (x1, y1, x3, y3) — second control = x3,y3
      // Both are cubic Bezier shortcuts. Expand to full form.
      const last = (currentSubpath && currentSubpath[currentSubpath.length - 1]) || [0, 0];
      let p1, p2, p3;
      if (op === OPS.curveTo2) {
        p1 = last;
        p2 = applyMatrix(gs.ctm, [args[0], args[1]]);
        p3 = applyMatrix(gs.ctm, [args[2], args[3]]);
      } else {
        p1 = applyMatrix(gs.ctm, [args[0], args[1]]);
        p3 = applyMatrix(gs.ctm, [args[2], args[3]]);
        p2 = p3;
      }
      const flat = flattenCubic(last, p1, p2, p3);
      for (let j = 1; j < flat.length; j++) addPoint(flat[j]);
      continue;
    }
    if (op === OPS.rectangle) {
      const [x, y, w, h] = args;
      startSubpath(applyMatrix(gs.ctm, [x, y]));
      addPoint(applyMatrix(gs.ctm, [x + w, y]));
      addPoint(applyMatrix(gs.ctm, [x + w, y + h]));
      addPoint(applyMatrix(gs.ctm, [x, y + h]));
      addPoint(applyMatrix(gs.ctm, [x, y]));
      continue;
    }
    if (op === OPS.closePath) {
      closeSubpath();
      continue;
    }

    // Fill / stroke / paint operators
    if (op === OPS.fill || op === OPS.eoFill) {
      // Both fill rules accrue area to the plate for ink-coverage.
      // Difference between nonzero-vs-evenodd only matters for
      // RENDERING holes visible. See TODO above.
      fillArea();
      resetPath();
      continue;
    }
    if (op === OPS.fillStroke || op === OPS.eoFillStroke) {
      fillArea();
      resetPath();
      continue;
    }
    if (op === OPS.closeFillStroke || op === OPS.closeEOFillStroke) {
      closeSubpath();
      fillArea();
      resetPath();
      continue;
    }
    if (op === OPS.endPath) {
      resetPath();
      continue;
    }

    // Colour-setting operators. pdf.js normalises most colour sets
    // into `setFillRGBColor`/`setFillCMYKColor`/`setFillGray` even
    // when the PDF uses DeviceN/Separation — unless we use the
    // resolver below, those spots will arrive as their process-mix
    // approximation. Separation detection is in Phase 2 via
    // `resolveColor` hook.
    if (op === OPS.setFillRGBColor) {
      gs.fill = { cs: 'DeviceRGB', values: [args[0], args[1], args[2]] };
      gs.fillTint = 1;
      continue;
    }
    if (op === OPS.setStrokeRGBColor) {
      gs.stroke = { cs: 'DeviceRGB', values: [args[0], args[1], args[2]] };
      gs.strokeTint = 1;
      continue;
    }
    if (op === OPS.setFillCMYKColor) {
      gs.fill = { cs: 'DeviceCMYK', values: [args[0], args[1], args[2], args[3]] };
      gs.fillTint = 1;
      continue;
    }
    if (op === OPS.setStrokeCMYKColor) {
      gs.stroke = { cs: 'DeviceCMYK', values: [args[0], args[1], args[2], args[3]] };
      gs.strokeTint = 1;
      continue;
    }
    if (op === OPS.setFillGray) {
      gs.fill = { cs: 'DeviceGray', values: [args[0]] };
      gs.fillTint = 1;
      continue;
    }
    if (op === OPS.setStrokeGray) {
      gs.stroke = { cs: 'DeviceGray', values: [args[0]] };
      gs.strokeTint = 1;
      continue;
    }

    // setFillColorN / setStrokeColorN — used by Separation / DeviceN.
    // pdf.js annotates these with the resolved colour space name in
    // the page resources; the resolver hook lets callers lift that
    // into the plate record.
    if (op === OPS.setFillColorN && resolveColor) {
      const resolved = resolveColor(args);
      if (resolved) {
        gs.fill = resolved.color;
        gs.fillTint = resolved.tint ?? 1;
      }
      continue;
    }
    if (op === OPS.setStrokeColorN && resolveColor) {
      const resolved = resolveColor(args);
      if (resolved) {
        gs.stroke = resolved.color;
        gs.strokeTint = resolved.tint ?? 1;
      }
      continue;
    }

    // Image XObject (`Do /Image`). Phase 3 — track as an unclassified
    // raster area so the user knows the vector total is incomplete
    // when images are present.
    if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
      // Attribute to a synthetic "raster-image" plate. Area = |CTM det|
      // since the image fills a 1×1 PDF-unit square under its CTM.
      const det = Math.abs(matrixDet(gs.ctm));
      const key = 'raster:image';
      const existing = plates.get(key);
      if (existing) {
        existing.areaPdfUnits += det;
        existing.objectCount += 1;
      } else {
        plates.set(key, {
          key,
          name: 'Raster image (un-separated)',
          type: 'raster',
          color: null,
          areaPdfUnits: det,
          objectCount: 1,
        });
      }
      continue;
    }
    // Other ops (text, shading, stroke-only paths) — skipped for
    // Phase 1. Text is often converted to outlines in flexo/offset
    // workflows; strokes contribute very little area.
  }

  return plates;
}

// ── Public entry ──────────────────────────────────────────────────

/**
 * analyzePdfVectorInk — run the vector ink coverage engine on a PDF/AI
 * file and return per-plate results.
 *
 *  @param {File|Blob} file        PDF or AI file
 *  @param {number}   widthMm      target physical width (mm)
 *  @param {number}   heightMm     target physical height (mm)
 *  @param {Object}   opts         { pageIndex, includePreview }
 *  @returns {Promise<{
 *    mode: 'vector',
 *    plates: Array<{ key, name, type, color, areaMm2, coveragePct, objectCount }>,
 *    totalPrintedMm2: number,
 *    totalPrintedPct: number,
 *    frameMm2: number,
 *    warnings: string[],
 *    pageUserUnit: number,
 *    pageBox: { x, y, w, h }  // PDF media/trim box in user units
 *  }>}
 */
export async function analyzePdfVectorInk(file, widthMm, heightMm, opts = {}) {
  const pageIndex = Math.max(1, Math.round(opts.pageIndex || 1));
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, disableFontFace: true }).promise;
  const warnings = [];
  try {
    const pageNum = Math.min(doc.numPages || 1, pageIndex);
    const page = await doc.getPage(pageNum);
    const OPS = pdfjs.OPS;

    // Separation / DeviceN resolver. When pdf.js encounters `scn`/`SCN`
    // (setFillColorN) in a Separation space, it leaves the space
    // descriptor in the page's commonObjs / colorSpace registry. We
    // walk the resources to build a name index.
    //
    // pdf.js API: page.commonObjs / page.objs hold colour space caches
    // but are populated lazily during rendering. For the content-stream
    // walk we ask for the object list which includes ColorSpace nodes.
    //
    // Phase 1: we pick the easiest signal — the colour space's .name
    // attribute when it's Separation. If DeviceN with multiple names
    // we treat as process approximation. Better resolver is deferred
    // to Phase 2 — documented limitation.
    const resolveColor = (args) => {
      // pdf.js `setFillColorN` arg shape: [...colorValues, colorSpaceName]
      // where colorSpaceName may be a string key into page.objs.
      // When space resolution is unavailable, fall back to treating the
      // numeric component(s) as a grayscale tint — matches the common
      // "100% solid spot" case for tints close to 1.0.
      const tint = typeof args[0] === 'number' ? args[0] : 1;
      // If the last arg is a string and not numeric, treat as spot name.
      const tail = args[args.length - 1];
      if (typeof tail === 'string' && !/^\d/.test(tail)) {
        return {
          color: { cs: 'Separation', name: tail, values: [tint] },
          tint,
        };
      }
      return null;
    };

    const operatorList = await page.getOperatorList();
    const plates = accumulatePlates(operatorList, OPS, resolveColor);

    // Area scaling: PDF user units are 1/72 inch by default (unless
    // userUnit is overridden). Convert to mm² using:
    //   1 inch = 25.4 mm
    //   PDF unit in mm = 25.4 / 72 = 0.352778 mm
    //   area in mm² = area in (PDF unit)² × (25.4/72)²
    const vp = page.getViewport({ scale: 1 });
    const userUnit = page.userUnit || 1;
    const mmPerPdfUnit = (25.4 / 72) * userUnit;
    const unitToMm2 = mmPerPdfUnit * mmPerPdfUnit;

    // The frame area is the user-requested printable area (widthMm ×
    // heightMm). Coverage% is per-plate_area / frame_area. We also
    // emit the raw PDF page box so callers can sanity-check scale.
    const frameMm2 = Math.max(1, widthMm * heightMm);

    const rawPlates = Array.from(plates.values()).map((p) => {
      const areaMm2 = p.areaPdfUnits * unitToMm2;
      return {
        ...p,
        areaMm2,
        coveragePct: frameMm2 > 0 ? areaMm2 / frameMm2 : 0,
      };
    });

    // Sort: process (CMYK) plates first, then spots by coverage desc.
    rawPlates.sort((a, b) => {
      if (a.type !== b.type) {
        const order = { process: 0, spot: 1, raster: 2 };
        return (order[a.type] ?? 9) - (order[b.type] ?? 9);
      }
      return b.coveragePct - a.coveragePct;
    });

    // If the PDF has ANY raster-image plate, the vector total is
    // incomplete — user should treat the result as a lower bound.
    if (rawPlates.some((p) => p.type === 'raster')) {
      warnings.push(
        'PDF contains raster image(s). Vector analysis undercounts these regions — ' +
          'their colours are not split by plate. Use raster-MMCQ mode for a visual cluster view.'
      );
    }

    const totalPrintedMm2 = rawPlates
      .filter((p) => p.type !== 'raster')
      .reduce((s, p) => s + p.areaMm2, 0);
    const totalPrintedPct = frameMm2 > 0 ? totalPrintedMm2 / frameMm2 : 0;

    return {
      mode: 'vector',
      plates: rawPlates,
      totalPrintedMm2,
      totalPrintedPct,
      frameMm2,
      warnings,
      pageUserUnit: userUnit,
      pageBox: { x: vp.viewBox[0], y: vp.viewBox[1], w: vp.width, h: vp.height },
    };
  } finally {
    try {
      await doc.destroy();
    } catch {
      /* ignore */
    }
  }
}

// ── Utility: plate → hex swatch for UI ─────────────────────────────

/**
 * Convert a plate's stored colour object to an approximate RGB hex
 * for UI swatches. Spots fall back to a muted warning grey when no
 * process-mix is known; CMYK uses the naive subtractive approximation
 * (not a real ICC profile conversion, but good enough for thumbnails).
 */
export function plateSwatchHex(color) {
  if (!color) return '#9ca3af'; // grey for unknown
  if (color.cs === 'DeviceRGB' || color.cs === 'rgb') {
    const [r, g, b] = color.values;
    return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  }
  if (color.cs === 'DeviceGray' || color.cs === 'gray') {
    const g = Math.round(color.values[0] * 255);
    return rgbToHex(g, g, g);
  }
  if (color.cs === 'DeviceCMYK' || color.cs === 'cmyk') {
    const [c, m, y, k] = color.values;
    // Naive CMYK → RGB: R = 255(1−C)(1−K), G = 255(1−M)(1−K), B = 255(1−Y)(1−K)
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    return rgbToHex(r, g, b);
  }
  // Spot — if name looks like "PANTONE NNN" or a known colour word,
  // attempt a crude lookup. Otherwise return a distinguishable grey.
  // Phase 2: integrate a real Pantone library (MIT-licensed PANTONE
  // data exists as npm pkg `pantone-colors`).
  return '#6b7280';
}

function rgbToHex(r, g, b) {
  const h = (n) =>
    Math.max(0, Math.min(255, n | 0))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}
