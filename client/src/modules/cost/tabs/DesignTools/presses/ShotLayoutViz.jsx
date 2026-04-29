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

export default function ShotLayoutViz({ inputs, result, cross, artworkUrl }) {
  const L  = Number(inputs?.L)  || 0;   // product length down-web (mm)
  const Pw = Number(inputs?.Pw) || 0;   // product width cross (mm)
  const W  = Number(inputs?.W)  || 0;   // total web width (mm)
  const E  = Number(inputs?.E)  || 0;   // edge margin per side (mm)
  const K  = Number(inputs?.K)  || 0;   // print-zone overhead (mm)
  const n_down   = Math.max(1, Number(result?.n_down)   || 1);
  const n_across = Math.max(1, Number(cross?.n_across)  || 1);
  const actual_gap_md = Number(result?.actual_gap) || 0;
  const pitch  = Number(result?.pitch) || 0;
  // Cylinder tooth count — accept BOTH `cylinder_z` (jobSummary shape)
  // and `z` (raw ranked-cylinder row shape). Earlier code only checked
  // cylinder_z and silently rendered "—" when the schematic was fed
  // a top5[0] row directly (which exposes `z` not `cylinder_z`).
  const cylZ   = result?.cylinder_z ?? result?.z ?? null;

  if (!L || !Pw || !W || !pitch) {
    return (
      <div className="slv-empty">
        <div>Layout preview unavailable — fill L, Pw, W, and pick a cylinder above.</div>
        <div className="slv-empty-vi">Cần nhập L, Pw, W và có cylinder Top 1 để vẽ layout.</div>
      </div>
    );
  }

  // Cross-direction lane gap (actual). cross.lane_gap_actual is the
  // authoritative source; if missing, derive it from the inputs so the
  // viz still renders in legacy code paths.
  const availTd = Math.max(0, W - 2 * E);
  const lane_gap_actual = n_across > 1
    ? Math.max(0, (availTd - n_across * Pw) / (n_across - 1))
    : 0;

  const totalCavities = n_down * n_across;

  // ── SVG viewBox in millimetres ──────────────────────────────────
  // We pad the viewBox so labels around the perimeter don't clip.
  // 26 mm padding accommodates dimension lines + text at typical
  // font sizes (~3-4 mm). The W and pitch axes scale independently.
  const padTop    = 26;
  const padBottom = 22;
  const padLeft   = 28;
  const padRight  = 16;
  const vbW = W + padLeft + padRight;
  const vbH = pitch + padTop + padBottom;

  // Anchor for the inner web rectangle — everything else positions
  // relative to this.
  const x0 = padLeft;
  const y0 = padTop;

  // ── Product cell positions ──────────────────────────────────────
  // First product starts AFTER the edge margin AND after the print-zone
  // overhead K (which is the first part of the cylinder circumference,
  // not printable). Subsequent rows step by (L + actual_gap_md).
  const cellStartX = x0 + E;
  const cellStartY = y0 + K;
  const cells = [];
  for (let row = 0; row < n_down; row++) {
    for (let col = 0; col < n_across; col++) {
      cells.push({
        x: cellStartX + col * (Pw + lane_gap_actual),
        y: cellStartY + row * (L + actual_gap_md),
        idx: row * n_across + col + 1,
      });
    }
  }

  // ── Font / stroke widths in mm ──────────────────────────────────
  // We pick sizes that look ~10-12 px on a typical render. Because
  // the SVG is mm-scaled, a 4-mm label on a 270-mm web reads roughly
  // 9-10 px after the container compresses to ~600 px wide.
  const labelFs = Math.max(2.4, Math.min(W, pitch) / 60);
  const dimFs   = labelFs * 0.85;
  const stroke  = Math.max(0.3, labelFs / 8);

  return (
    <div className="slv-wrap">
      <div className="slv-stats">
        <div className="slv-stat">
          <div className="slv-stat-label">Cavities <span className="slv-bi-vi">/ Cavity</span></div>
          <div className="slv-stat-val">{totalCavities}</div>
          <div className="slv-stat-sub">{n_down} × {n_across} <span className="slv-bi-vi">(MD × TD)</span></div>
        </div>
        <div className="slv-stat">
          <div className="slv-stat-label">Cylinder <span className="slv-bi-vi">/ Trục</span></div>
          <div className="slv-stat-val">{cylZ ? `${cylZ}T` : '—'}</div>
          <div className="slv-stat-sub">Pitch {pitch.toFixed(2)} mm</div>
        </div>
        <div className="slv-stat">
          <div className="slv-stat-label">Product <span className="slv-bi-vi">/ Sản phẩm</span></div>
          <div className="slv-stat-val">{Pw} × {L}</div>
          <div className="slv-stat-sub">mm (Pw × L)</div>
        </div>
        <div className="slv-stat">
          <div className="slv-stat-label">Gap MD <span className="slv-bi-vi">/ Gap chiều chạy</span></div>
          <div className="slv-stat-val">{actual_gap_md.toFixed(3)}</div>
          <div className="slv-stat-sub">mm (actual)</div>
        </div>
        <div className="slv-stat">
          <div className="slv-stat-label">Lane gap <span className="slv-bi-vi">/ Gap chiều ngang</span></div>
          <div className="slv-stat-val">{lane_gap_actual.toFixed(2)}</div>
          <div className="slv-stat-sub">mm (TD)</div>
        </div>
      </div>

      <div className="slv-svg-wrap">
        <svg
          className="slv-svg"
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label={`Shot layout: ${totalCavities} cavities, ${n_down} rows × ${n_across} lanes on ${W}mm web`}
        >
          {/* Web background */}
          <rect x={x0} y={y0} width={W} height={pitch}
                fill="#ffffff" stroke="#525252" strokeWidth={stroke * 1.5} />

          {/* Print-zone overhead K — top of the cylinder (clamp + reg) */}
          {K > 0 && (
            <>
              <rect x={x0} y={y0} width={W} height={K}
                    fill="#fef3c7" stroke="#f1c21b" strokeWidth={stroke}
                    strokeDasharray={`${stroke * 4} ${stroke * 2}`} />
              <text x={x0 + W / 2} y={y0 + K / 2}
                    fontSize={dimFs} fill="#78350f" textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="IBM Plex Sans, Arial">
                K = {K.toFixed(1)} mm overhead
              </text>
            </>
          )}

          {/* Edge margins — left + right strips */}
          {E > 0 && (
            <>
              <rect x={x0} y={y0 + K} width={E} height={pitch - K}
                    fill="#e8edff" stroke="none" />
              <rect x={x0 + W - E} y={y0 + K} width={E} height={pitch - K}
                    fill="#e8edff" stroke="none" />
            </>
          )}

          {/* Sprint 14h — define the artwork ONCE as a <symbol>, then
              <use> it in every cell. SVG renderer caches the symbol so
              N cells × an image is still 1 decode. preserveAspectRatio
              "xMidYMid meet" letterboxes the artwork inside the cell
              while preserving its aspect ratio (no stretching). */}
          {artworkUrl && (
            <defs>
              <symbol id="slv-art" preserveAspectRatio="xMidYMid meet">
                <image href={artworkUrl} x="0" y="0" width="100" height="100"
                       preserveAspectRatio="xMidYMid meet" />
              </symbol>
            </defs>
          )}

          {/* Product cavities */}
          {cells.map(c => (
            <g key={c.idx}>
              <rect x={c.x} y={c.y} width={Pw} height={L}
                    fill={artworkUrl ? '#ffffff' : '#dbeafe'}
                    stroke="#0f62fe" strokeWidth={stroke * 1.2}
                    rx={Math.min(2, Pw * 0.05)} />
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
              <text x={c.x + Pw / 2} y={c.y + L / 2 - labelFs * 0.4}
                    fontSize={labelFs}
                    fill={artworkUrl ? '#dc2626' : '#0f2341'}
                    stroke={artworkUrl ? '#ffffff' : 'none'}
                    strokeWidth={artworkUrl ? stroke * 0.6 : 0}
                    paintOrder="stroke"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="IBM Plex Sans, Arial" fontWeight="700">
                #{c.idx}
              </text>
              {/* Show LxPw inside cell only if there's room AND no
                  artwork (artwork already conveys the visual; size
                  label belongs as a perimeter dimension instead). */}
              {!artworkUrl && L > labelFs * 4 && Pw > labelFs * 6 && (
                <text x={c.x + Pw / 2} y={c.y + L / 2 + labelFs * 0.8}
                      fontSize={dimFs} fill="#3b4d6e" textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily="IBM Plex Sans, Arial">
                  {Pw}×{L}
                </text>
              )}
            </g>
          ))}

          {/* ── Dimension annotations ───────────────────────────── */}
          {/* Web width W on top */}
          <DimLineH
            x1={x0} x2={x0 + W} y={y0 - 8}
            label={`W = ${W} mm`} fs={dimFs} stroke={stroke}
          />
          {/* Pitch on left */}
          <DimLineV
            y1={y0} y2={y0 + pitch} x={x0 - 8}
            label={`Pitch ${pitch.toFixed(1)} mm`} fs={dimFs} stroke={stroke}
          />
          {/* Edge margin E on bottom-left, only if room */}
          {E > 0 && (
            <text x={x0 + E / 2} y={y0 + pitch + 6}
                  fontSize={dimFs * 0.85} fill="#525252" textAnchor="middle"
                  fontFamily="IBM Plex Sans, Arial">
              E={E}
            </text>
          )}
          {E > 0 && (
            <text x={x0 + W - E / 2} y={y0 + pitch + 6}
                  fontSize={dimFs * 0.85} fill="#525252" textAnchor="middle"
                  fontFamily="IBM Plex Sans, Arial">
              E={E}
            </text>
          )}
          {/* MD direction arrow on the right */}
          <text x={x0 + W + 4} y={y0 + pitch / 2}
                fontSize={dimFs} fill="#0043ce" textAnchor="start"
                dominantBaseline="middle"
                fontFamily="IBM Plex Sans, Arial" fontWeight="600">
            ↓ MD
          </text>
          {/* TD direction arrow on bottom */}
          <text x={x0 + W / 2} y={y0 + pitch + 16}
                fontSize={dimFs} fill="#0043ce" textAnchor="middle"
                fontFamily="IBM Plex Sans, Arial" fontWeight="600">
            ← TD →
          </text>
        </svg>
      </div>

      <div className="slv-legend">
        <span className="slv-legend-item">
          <span className="slv-swatch slv-swatch-product" /> Product cavity · Sản phẩm
        </span>
        {E > 0 && (
          <span className="slv-legend-item">
            <span className="slv-swatch slv-swatch-edge" /> Edge margin · Mép web (E)
          </span>
        )}
        {K > 0 && (
          <span className="slv-legend-item">
            <span className="slv-swatch slv-swatch-overhead" /> Cylinder overhead · Vùng không in (K)
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
      <text x={(x1 + x2) / 2} y={y - ticks * 1.5}
            fontSize={fs} fill="#161616" textAnchor="middle"
            stroke="none" fontFamily="IBM Plex Sans, Arial" fontWeight="600">
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
      <text x={x - ticks * 1.5} y={cy}
            fontSize={fs} fill="#161616" textAnchor="middle"
            stroke="none" fontFamily="IBM Plex Sans, Arial" fontWeight="600"
            transform={`rotate(-90 ${x - ticks * 1.5} ${cy})`}>
        {label}
      </text>
    </g>
  );
}
