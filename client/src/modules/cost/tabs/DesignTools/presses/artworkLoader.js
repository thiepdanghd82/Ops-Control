/**
 * artworkLoader — read an operator-uploaded artwork file (image OR PDF)
 * and return a PNG data URL suitable for `<image href=…>` overlay in
 * the Shot Layout SVG.
 *
 * Sprint 14i. Two paths:
 *   - Image (PNG/JPG/SVG/WebP/GIF): `FileReader.readAsDataURL` —
 *     near-instant, no library load.
 *   - PDF: lazy-import pdfjs, render page 1 to an offscreen canvas at
 *     ~1200 px wide, then `canvas.toDataURL('image/png')`. The lazy
 *     import keeps the ~800 kB pdfjs worker out of the Design Tools
 *     baseline bundle for users who only drop PNGs.
 *
 * Returns: { dataUrl, width_px, height_px, kind }
 *   kind = 'image' | 'pdf-page'
 *
 * Errors throw; callers should toast and reset the file input.
 */

const RENDER_TARGET_WIDTH_PX = 1200; // good balance: crisp on retina,
// ~1-2 MB encoded for typical artwork.

let _pdfjsModule = null;
async function loadPdfjs() {
  if (_pdfjsModule) return _pdfjsModule;
  const pdfjs = await import('pdfjs-dist');
  // Vite's `?url` returns the file's absolute URL after build hashing.
  // pdfjs needs that to bootstrap the worker thread.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjsModule = pdfjs;
  return pdfjs;
}

export async function loadArtwork(file) {
  if (!file) throw new Error('No file');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (isPdf) return renderPdfFirstPage(file);
  return readImage(file);
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      // We'd love to know the natural pixel size for downstream layout
      // tweaks, but it costs an extra <img> decode. Skip for now;
      // ShotLayoutViz uses preserveAspectRatio so dimensions don't
      // matter for correctness.
      resolve({ dataUrl, width_px: 0, height_px: 0, kind: 'image' });
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name || 'image'}`));
    reader.readAsDataURL(file);
  });
}

async function renderPdfFirstPage(file) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, disableFontFace: false }).promise;
  try {
    if (!doc.numPages) throw new Error('PDF has no pages');
    const page = await doc.getPage(1);
    // Native viewport is in PDF units (1/72 inch). Scale so the
    // longest axis hits RENDER_TARGET_WIDTH_PX — keeps memory bounded
    // while staying crisp when scaled down by SVG preserveAspectRatio.
    const vp1 = page.getViewport({ scale: 1 });
    const longestNative = Math.max(vp1.width, vp1.height);
    const scale = longestNative > 0 ? RENDER_TARGET_WIDTH_PX / longestNative : 1;
    const viewport = page.getViewport({ scale });
    // OffscreenCanvas would be ideal but Safari < 16 and some workers
    // lack it; a regular canvas works everywhere and the image is
    // discarded after toDataURL.
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('canvas 2d context unavailable');
    // White background — most artwork is RGB-on-white. Without this,
    // transparent regions become black on toDataURL('image/png') in
    // some browsers, which surprises operators.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    return {
      dataUrl,
      width_px: canvas.width,
      height_px: canvas.height,
      kind: 'pdf-page',
    };
  } finally {
    // Free the parsed PDF — the page render is captured in our canvas.
    try {
      await doc.destroy();
    } catch {
      /* noop */
    }
  }
}
