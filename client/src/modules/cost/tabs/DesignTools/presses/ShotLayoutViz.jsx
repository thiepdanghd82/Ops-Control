/**
 * ShotLayoutViz — SVG schematic of one cylinder revolution = 1 shot.
 * Sprint 14f.
 *
 * Visualises everything the operator needs to "see" the layout at a
 * glance:
 *   - Web boundary (W mm wide × pitch mm tall, scaled proportionally)
 *   - Edge margins (E mm strips, left + right, in light grey)
 *   - Print-zone overhead (K mm at top, in yellow — area NOT covered
 *     by plate; clamp + reg marks live here)
 *   - Product cavities (n_across × n_down grid, blue cells, with
 *     L × Pw dimensions written inside each)
 *   - Inter-product gaps (MD = actual_gap, TD = lane_gap_actual)
 *   - Cavity count (total = n_down × n_across) shown in a corner badge
 *   - Dimension labels around the perimeter (W, pitch, E, etc.)
 *
 * Coordinate system: viewBox uses raw mm so 1 unit = 1 mm. The SVG
 * scales to its container via preserveAspectRatio. No state, no
 * effects — pure presentational, easy to test by snapshot.
 *
 * Falls back to a friendly empty state when the math isn't ready
 * (e.g. user just opened the tab and no Top 1 cylinder exists yet).
 */

import { useState } from 'react';

export default function ShotLayoutViz({ inputs, result, cross, artworkUrl }) {
  // S-LAYOUT-VIZ-3 (2026-05-06) — zoom state. CSS-scale the SVG inside
  // a scroll-clipped wrapper. preserveAspectRatio handles the SVG's
  // own scaling; this lets operator zoom in to inspect a specific
  // cell without resizing the whole panel. Min 0.5×, max 4×.
  const [zoom, setZoom] = useState(1);
  const zoomIn = () => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const zoomReset = () => setZoom(1);

  const L = Number(inputs?.L) || 0; // product length down-web (mm)
  const Pw = Number(inputs?.Pw) || 0; // product width cross (mm)
  const W = Number(inputs?.W) || 0; // total web width (mm)
  const E = Number(inputs?.E) || 0; // edge margin per side (mm)
  const K = Number(inputs?.K) || 0; // print-zone overhead (mm)
  const bleed = Math.max(0, Number(inputs?.bleed_mm) || 0); // print bleed/side (mm)
  const L_eff = L + 2 * bleed; // engine packs this into pitch
  const Pw_eff = Pw + 2 * bleed; // cross-axis bleed
  const n_down = Math.max(1, Number(result?.n_down) || 1);
  const n_across = Math.max(1, Number(cross?.n_across) || 1);
  const actual_gap_md = Number(result?.actual_gap) || 0;
  const pitch = Number(result?.pitch) || 0;
  // Cylinder tooth count — accept BOTH `cylinder_z` (jobSummary shape)
  // and `z` (raw ranked-cylinder row shape). Earlier code only checked
  // cylinder_z and silently rendered "—" when the schematic was fed
  // a top5[0] row directly (which exposes `z` not `cylinder_z`).
  const cylZ = result?.cylinder_z ?? result?.z ?? null;

  if (!L || !Pw || !W || !pitch) {
    return (
      <div className="slv-empty">
        <div>Layout preview unavailable — fill L, Pw, W, and pick a cylinder above.</div>
        <div className="slv-empty-vi">Cần nhập L, Pw, W và có cylinder Top 1 để vẽ layout.</div>
      </div>
    );
  }

  // Cross-direction lane gap (actual). cross.lane_gap_actual is the
  // authoritative source — engine computes it bleed-aware via Pw_eff.
  // S-LAYOUT-VIZ-3 (2026-05-06) — fix asymmetry: prior derivation used
  // `Pw` instead of `Pw_eff`, inflating the gap by 2·bleed per lane and
  // pushing the rightmost cell beyond the W boundary. Now we trust the
  // engine's value and only derive (with Pw_eff) when prop is missing.
  const availTd = Math.max(0, W - 2 * E);
  const lane_gap_actual = Number.isFinite(cross?.lane_gap_actual)
    ? Math.max(0, Number(cross.lane_gap_actual))
    : n_across > 1
      ? Math.max(0, (availTd - n_across * Pw_eff) / (n_across - 1))
      : 0;

  const totalCavities = n_down * n_across;

  // ── SVG viewBox in millimetres ──────────────────────────────────
  // We pad the viewBox so labels around the perimeter don't clip.
  // 26 mm padding accommodates dimension lines + text at typical
  // font sizes (~3-4 mm). The W and pitch axes scale independently.
  // S-LAYOUT-VIZ-3 — right + bottom padding bumped to fit the new
  // dimension chains (segmented E | Pw_eff | gap layout). Without this
  // the rightmost L label clips the viewBox edge.
  const padTop = 26;
  const padBottom = 32;
  const padLeft = 28;
  const padRight = 36;
  const vbW = W + padLeft + padRight;
  const vbH = pitch + padTop + padBottom;

  // Anchor for the inner web rectangle — everything else positions
  // relative to this.
  const x0 = padLeft;
  const y0 = padTop;

  // ── Product cell + MD gap positions ─────────────────────────────
  // Continuous-web flexo geometry: pitch = K + N×L + N×G_each, so the
  // last (Nth) gap closes the cylinder seam. Drawing N gaps EXPLICITLY
  // (instead of relying on residual whitespace at the bottom) makes
  // it visually obvious the gaps are uniform — no operator confusion
  // about a "dead block" at row N. Sprint S-LAYOUT-VIZ-1.
  // Bleed-aware geometry (Sprint S-LAYOUT-VIZ-2):
  // The engine packs (K + N×L_eff + N×gap) = pitch where L_eff = L + 2·bleed.
  // The trim cell is centred inside its bleed footprint. Step between
  // bleed-footprint TOPS = (L_eff + gap). The gap stripe sits BETWEEN
  // bleed boundaries (full pitch closure invariant).
  const cellStartX = x0 + E;
  const cellStartY = y0 + K;
  const cells = [];
  const bleedRects = [];
  const gaps = [];
  for (let row = 0; row < n_down; row++) {
    const bleedY = cellStartY + row * (L_eff + actual_gap_md);
    const trimY = bleedY + bleed; // trim cell inset by `bleed`
    for (let col = 0; col < n_across; col++) {
      const bleedX = cellStartX + col * (Pw_eff + lane_gap_actual);
      const trimX = bleedX + bleed;
      cells.push({
        x: trimX,
        y: trimY,
        idx: row * n_across + col + 1,
      });
      if (bleed > 0.05) {
        bleedRects.push({
          x: bleedX,
          y: bleedY,
          width: Pw_eff,
          height: L_eff,
          idx: row * n_across + col + 1,
        });
      }
    }
    if (actual_gap_md > 0.05) {
      gaps.push({ y: bleedY + L_eff, height: actual_gap_md, idx: row + 1 });
    }
  }

  // ── Font / stroke widths in mm ──────────────────────────────────
  // We pick sizes that look ~10-12 px on a typical render. Because
  // the SVG is mm-scaled, a 4-mm label on a 270-mm web reads roughly
  // 9-10 px after the container compresses to ~600 px wide.
  const labelFs = Math.max(2.4, Math.min(W, pitch) / 60);
  const dimFs = labelFs * 0.85;
  const stroke = Math.max(0.3, labelFs / 8);

  return (
    <div className="slv-wrap">
      <div className="slv-stats">
        <div className="slv-stat">
          <div className="slv-stat-label">
            Cavities <span className="slv-bi-vi">/ Cavity</span>
          </div>
          <div className="slv-stat-val">{totalCavities}</div>
          <div className="slv-stat-sub">
            {n_down} × {n_across} <span className="slv-bi-vi">(MD × TD)</span>
          </div>
        </div>
        <div className="slv-stat">
          <div className="slv-stat-label">
            Cylinder <span className="slv-bi-vi">/ Trục</span>
          </div>
          <div className="slv-stat-val">{cylZ ? `${cylZ}T` : '—'}</div>
          <div className="slv-stat-sub">Pitch {pitch.toFixed(2)} mm</div>
        </div>
        <div className="slv-stat">
          <div className="slv-stat-label">
            Product <span className="slv-bi-vi">/ Sản phẩm</span>
          </div>
          <div className="slv-stat-val">
            {Pw} × {L}
          </div>
          <div className="slv-stat-sub">mm (Pw × L)</div>
        </div>
        <div className="slv-stat">
          <div className="slv-stat-label">
            Gap MD <span className="slv-bi-vi">/ Gap chiều chạy</span>
          </div>
          <div className="slv-stat-val">{actual_gap_md.toFixed(3)}</div>
          <div className="slv-stat-sub">mm (actual)</div>
        </div>
        <div className="slv-stat">
          <div className="slv-stat-label">
            Lane gap <span className="slv-bi-vi">/ Gap chiều ngang</span>
          </div>
          <div className="slv-stat-val">{lane_gap_actual.toFixed(2)}</div>
          <div className="slv-stat-sub">mm (TD)</div>
        </div>
      </div>

      {/* S-LAYOUT-VIZ-3 — zoom controls. Buttons + percentage readout.
          Zoom applies CSS transform to the SVG, container scrolls. */}
      <div
        className="slv-zoom-bar"
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          padding: '6px 0',
          fontSize: 12,
        }}
      >
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= 0.5}
          title="Zoom out"
          style={{
            padding: '2px 10px',
            border: '1px solid #c6c6c6',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          −
        </button>
        <button
          type="button"
          onClick={zoomReset}
          title="Reset zoom · 100%"
          style={{
            padding: '2px 10px',
            border: '1px solid #c6c6c6',
            background: zoom === 1 ? '#edf5ff' : '#fff',
            cursor: 'pointer',
            minWidth: 60,
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= 4}
          title="Zoom in"
          style={{
            padding: '2px 10px',
            border: '1px solid #c6c6c6',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          +
        </button>
        <span style={{ color: '#6f6f6f', marginLeft: 8 }}>Zoom · Phóng to / thu nhỏ</span>
      </div>
      <div className="slv-svg-wrap" style={{ overflow: 'auto', maxHeight: '70vh' }}>
        <svg
          className="slv-svg"
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label={`Shot layout: ${totalCavities} cavities, ${n_down} rows × ${n_across} lanes on ${W}mm web`}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            transition: 'transform 0.12s',
          }}
        >
          {/* Web background */}
          <rect
            x={x0}
            y={y0}
            width={W}
            height={pitch}
            fill="#ffffff"
            stroke="#525252"
            strokeWidth={stroke * 1.5}
          />

          {/* Print-zone overhead K — top of the cylinder (clamp + reg) */}
          {K > 0 && (
            <>
              <rect
                x={x0}
                y={y0}
                width={W}
                height={K}
                fill="#fef3c7"
                stroke="#f1c21b"
                strokeWidth={stroke}
                strokeDasharray={`${stroke * 4} ${stroke * 2}`}
              />
              <text
                x={x0 + W / 2}
                y={y0 + K / 2}
                fontSize={dimFs}
                fill="#78350f"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="IBM Plex Sans, Arial"
              >
                K = {K.toFixed(1)} mm overhead
              </text>
            </>
          )}

          {/* Edge margins — left + right strips */}
          {E > 0 && (
            <>
              <rect x={x0} y={y0 + K} width={E} height={pitch - K} fill="#e8edff" stroke="none" />
              <rect
                x={x0 + W - E}
                y={y0 + K}
                width={E}
                height={pitch - K}
                fill="#e8edff"
                stroke="none"
              />
            </>
          )}

          {/* MD gap stripes — explicit N-up uniform gaps between products
              (pitch = K + N×L + N×G_each by construction). The last
              stripe closes the cylinder seam; without this rect the
              same area renders as ambiguous whitespace and operators
              read it as "dead block at bottom" (Sprint S-LAYOUT-VIZ-1). */}
          {gaps.map((g) => (
            <g key={`gap-${g.idx}`}>
              <rect
                x={x0}
                y={g.y}
                width={W}
                height={g.height}
                fill="#f1f5f9"
                stroke="#cbd5e1"
                strokeWidth={stroke * 0.5}
                strokeDasharray={`${stroke * 2.5} ${stroke * 1.5}`}
              />
              {g.height > dimFs * 1.4 && (
                <text
                  x={x0 + W / 2}
                  y={g.y + g.height / 2}
                  fontSize={dimFs * 0.85}
                  fill="#64748b"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="IBM Plex Sans, Arial"
                >
                  gap {g.idx} · {g.height.toFixed(2)} mm
                </text>
              )}
            </g>
          ))}

          {/* Bleed footprint — what the plate physically prints. Drawn
              UNDER the trim cell so the trim is visually crisp; bleed
              shows as a thin dashed band protruding bleed mm on every
              side. Operators see "trim vs print" at a glance — the
              labelled cell stays at L (trim) so it matches the die. */}
          {bleedRects.map((b) => (
            <rect
              key={`bleed-${b.idx}`}
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={stroke * 0.6}
              strokeDasharray={`${stroke * 2} ${stroke * 1.2}`}
            />
          ))}

          {/* Sprint 14h — define the artwork ONCE as a <symbol>, then
              <use> it in every cell. SVG renderer caches the symbol so
              N cells × an image is still 1 decode. preserveAspectRatio
              "xMidYMid meet" letterboxes the artwork inside the cell
              while preserving its aspect ratio (no stretching). */}
          {artworkUrl && (
            <defs>
              <symbol id="slv-art" preserveAspectRatio="xMidYMid meet">
                <image
                  href={artworkUrl}
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  preserveAspectRatio="xMidYMid meet"
                />
              </symbol>
            </defs>
          )}

          {/* Product cavities */}
          {cells.map((c) => (
            <g key={c.idx}>
              <rect
                x={c.x}
                y={c.y}
                width={Pw}
                height={L}
                fill={artworkUrl ? '#ffffff' : '#dbeafe'}
                stroke="#0f62fe"
                strokeWidth={stroke * 1.2}
                rx={Math.min(2, Pw * 0.05)}
              />
              {/* Artwork overlay — clipped to cell bounds via the use's
                  width/height. Slight inset (5% on each side) so the
                  cell border + label remain readable. */}
              {artworkUrl && (
                <image
                  href={artworkUrl}
                  x={c.x + Pw * 0.05}
                  y={c.y + L * 0.05}
                  width={Pw * 0.9}
                  height={L * 0.9}
                  preserveAspectRatio="xMidYMid meet"
                  opacity="0.92"
                />
              )}
              <text
                x={c.x + Pw / 2}
                y={c.y + L / 2 - labelFs * 0.4}
                fontSize={labelFs}
                fill={artworkUrl ? '#dc2626' : '#0f2341'}
                stroke={artworkUrl ? '#ffffff' : 'none'}
                strokeWidth={artworkUrl ? stroke * 0.6 : 0}
                paintOrder="stroke"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="IBM Plex Sans, Arial"
                fontWeight="700"
              >
                #{c.idx}
              </text>
              {/* Show LxPw inside cell only if there's room AND no
                  artwork (artwork already conveys the visual; size
                  label belongs as a perimeter dimension instead). */}
              {!artworkUrl && L > labelFs * 4 && Pw > labelFs * 6 && (
                <text
                  x={c.x + Pw / 2}
                  y={c.y + L / 2 + labelFs * 0.8}
                  fontSize={dimFs}
                  fill="#3b4d6e"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="IBM Plex Sans, Arial"
                >
                  {Pw}×{L}
                </text>
              )}
            </g>
          ))}

          {/* ── Dimension annotations ───────────────────────────── */}
          {/* Web width W on top */}
          <DimLineH
            x1={x0}
            x2={x0 + W}
            y={y0 - 8}
            label={`W = ${W} mm`}
            fs={dimFs}
            stroke={stroke}
          />
          {/* Pitch on left */}
          <DimLineV
            y1={y0}
            y2={y0 + pitch}
            x={x0 - 8}
            label={`Pitch ${pitch.toFixed(1)} mm`}
            fs={dimFs}
            stroke={stroke}
          />
          {/* S-LAYOUT-VIZ-3 — bottom dimension CHAIN: E | Pw_eff | gap |
              ... | E. Visualises the math W = 2·E + n·Pw_eff + (n−1)·gap.
              First/last segments are E; middle segments alternate Pw_eff
              and lane_gap. Tick marks at every transition. */}
          {(() => {
            const dimY = y0 + pitch + 8;
            const ticks = [];
            // segment boundaries (x positions)
            const xs = [x0]; // left edge of web
            xs.push(x0 + E);
            for (let c = 0; c < n_across; c++) {
              const baseX = x0 + E + c * (Pw_eff + lane_gap_actual);
              xs.push(baseX + Pw_eff);
              if (c < n_across - 1) xs.push(baseX + Pw_eff + lane_gap_actual);
            }
            xs.push(x0 + W); // right edge of web
            // De-dup (in case lane_gap=0 collapses adjacent xs)
            const uniqXs = xs.filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > 0.05);
            // Render ticks
            for (const xv of uniqXs) {
              ticks.push(
                <line
                  key={`t-${xv.toFixed(3)}`}
                  x1={xv}
                  y1={dimY - 1.5}
                  x2={xv}
                  y2={dimY + 1.5}
                  stroke="#525252"
                  strokeWidth={stroke}
                />
              );
            }
            // Render baseline
            const baseline = (
              <line x1={x0} y1={dimY} x2={x0 + W} y2={dimY} stroke="#525252" strokeWidth={stroke} />
            );
            // Render labels per segment
            const labels = [];
            for (let i = 0; i < uniqXs.length - 1; i++) {
              const a = uniqXs[i],
                b = uniqXs[i + 1];
              const mid = (a + b) / 2;
              const w = b - a;
              if (w < dimFs * 0.6) continue;
              let txt;
              if (i === 0 || i === uniqXs.length - 2) txt = `E ${E}`;
              else if (i % 2 === 1)
                txt = `${Pw}${bleed > 0.05 ? '+' + (2 * bleed).toFixed(0) : ''}`;
              else txt = `g ${lane_gap_actual.toFixed(2)}`;
              labels.push(
                <text
                  key={`L-${i}`}
                  x={mid}
                  y={dimY + 5}
                  fontSize={dimFs * 0.75}
                  fill="#525252"
                  textAnchor="middle"
                  dominantBaseline="hanging"
                  fontFamily="IBM Plex Sans, Arial"
                >
                  {txt}
                </text>
              );
            }
            return (
              <g>
                {baseline}
                {ticks}
                {labels}
              </g>
            );
          })()}
          {/* S-LAYOUT-VIZ-3 — right-edge dimension chain for L + actual_gap.
              Mirrors the bottom chain: K | L_eff | gap | L_eff | gap | ... */}
          {(() => {
            const dimX = x0 + W + 8;
            const ys = [y0]; // top of web (start of K)
            if (K > 0) ys.push(y0 + K);
            for (let r = 0; r < n_down; r++) {
              const baseY = y0 + K + r * (L_eff + actual_gap_md);
              ys.push(baseY + L_eff);
              if (r < n_down - 1) ys.push(baseY + L_eff + actual_gap_md);
            }
            ys.push(y0 + pitch);
            const uniqYs = ys.filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > 0.05);
            const items = [];
            items.push(
              <line
                key="rb"
                x1={dimX}
                y1={y0}
                x2={dimX}
                y2={y0 + pitch}
                stroke="#525252"
                strokeWidth={stroke}
              />
            );
            for (const yv of uniqYs) {
              items.push(
                <line
                  key={`rt-${yv.toFixed(3)}`}
                  x1={dimX - 1.5}
                  y1={yv}
                  x2={dimX + 1.5}
                  y2={yv}
                  stroke="#525252"
                  strokeWidth={stroke}
                />
              );
            }
            for (let i = 0; i < uniqYs.length - 1; i++) {
              const a = uniqYs[i],
                b = uniqYs[i + 1];
              const mid = (a + b) / 2;
              const h = b - a;
              if (h < dimFs * 0.6) continue;
              let txt;
              if (i === 0 && K > 0) txt = `K ${K}`;
              else if (i === uniqYs.length - 2 && actual_gap_md > 0.05)
                txt = `g ${actual_gap_md.toFixed(2)}`;
              // alternate L_eff / gap
              else if (Math.abs(h - L_eff) < 0.5)
                txt = `${L}${bleed > 0.05 ? '+' + (2 * bleed).toFixed(0) : ''}`;
              else if (Math.abs(h - actual_gap_md) < 0.5) txt = `g ${actual_gap_md.toFixed(2)}`;
              else txt = h.toFixed(1);
              items.push(
                <text
                  key={`rL-${i}`}
                  x={dimX + 4}
                  y={mid}
                  fontSize={dimFs * 0.7}
                  fill="#525252"
                  textAnchor="start"
                  dominantBaseline="middle"
                  fontFamily="IBM Plex Sans, Arial"
                >
                  {txt}
                </text>
              );
            }
            return <g>{items}</g>;
          })()}
          {/* MD direction arrow — moved further right to clear the
              new dimension chain (S-LAYOUT-VIZ-3). */}
          <text
            x={x0 + W + 24}
            y={y0 + pitch / 2}
            fontSize={dimFs}
            fill="#0043ce"
            textAnchor="start"
            dominantBaseline="middle"
            fontFamily="IBM Plex Sans, Arial"
            fontWeight="600"
          >
            ↓ MD
          </text>
          {/* TD direction arrow on bottom — moved further down to clear
              the new bottom dimension chain. */}
          <text
            x={x0 + W / 2}
            y={y0 + pitch + 24}
            fontSize={dimFs}
            fill="#0043ce"
            textAnchor="middle"
            fontFamily="IBM Plex Sans, Arial"
            fontWeight="600"
          >
            ← TD →
          </text>
        </svg>
      </div>

      <div className="slv-legend">
        <span className="slv-legend-item">
          <span className="slv-swatch slv-swatch-product" /> Product cavity · Sản phẩm
        </span>
        {bleed > 0.05 && (
          <span className="slv-legend-item">
            <span className="slv-swatch slv-swatch-bleed" /> Bleed footprint · Tràn lề (L+2·{bleed}{' '}
            mm)
          </span>
        )}
        {actual_gap_md > 0.05 && (
          <span className="slv-legend-item">
            <span className="slv-swatch slv-swatch-gap" /> MD gap · Khe chiều chạy (
            {actual_gap_md.toFixed(2)} mm × {n_down})
          </span>
        )}
        {E > 0 && (
          <span className="slv-legend-item">
            <span className="slv-swatch slv-swatch-edge" /> Edge margin · Mép web (E)
          </span>
        )}
        {K > 0 && (
          <span className="slv-legend-item">
            <span className="slv-swatch slv-swatch-overhead" /> Cylinder overhead · Vùng không in
            (K)
          </span>
        )}
      </div>
    </div>
  );
}

// Horizontal dimension line + label (used for W on the top edge).
function DimLineH({ x1, x2, y, label, fs, stroke }) {
  const ticks = fs * 0.8;
  return (
    <g fill="none" stroke="#525252" strokeWidth={stroke}>
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - ticks} x2={x1} y2={y + ticks} />
      <line x1={x2} y1={y - ticks} x2={x2} y2={y + ticks} />
      <text
        x={(x1 + x2) / 2}
        y={y - ticks * 1.5}
        fontSize={fs}
        fill="#161616"
        textAnchor="middle"
        stroke="none"
        fontFamily="IBM Plex Sans, Arial"
        fontWeight="600"
      >
        {label}
      </text>
    </g>
  );
}

// Vertical dimension line + label (rotated 90° for the pitch axis).
function DimLineV({ x, y1, y2, label, fs, stroke }) {
  const ticks = fs * 0.8;
  const cy = (y1 + y2) / 2;
  return (
    <g fill="none" stroke="#525252" strokeWidth={stroke}>
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - ticks} y1={y1} x2={x + ticks} y2={y1} />
      <line x1={x - ticks} y1={y2} x2={x + ticks} y2={y2} />
      <text
        x={x - ticks * 1.5}
        y={cy}
        fontSize={fs}
        fill="#161616"
        textAnchor="middle"
        stroke="none"
        fontFamily="IBM Plex Sans, Arial"
        fontWeight="600"
        transform={`rotate(-90 ${x - ticks * 1.5} ${cy})`}
      >
        {label}
      </text>
    </g>
  );
}
