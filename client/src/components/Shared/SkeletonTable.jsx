/**
 * SkeletonTable — loading placeholder for data tables.
 *
 * Replaces "Loading..." text with animated shimmer bars so the UI feels
 * responsive while the actual rows stream in. Matches the density of
 * `.tbl-pro` (11px header, 8px rows).
 *
 * Props:
 *   rows        — number of placeholder rows (default 10)
 *   cols        — number of columns (default 6)
 *   widths      — optional array of percentage widths per col (length = cols)
 */
export default function SkeletonTable({ rows = 10, cols = 6, widths }) {
  const w =
    widths && widths.length === cols
      ? widths
      : Array.from({ length: cols }, (_, i) => (i === 0 ? 40 : i === cols - 1 ? 60 : 80));

  return (
    <div style={{ width: '100%', padding: '0 12px' }}>
      <style>{`
        @keyframes skeletonShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .sk-bar {
          height: 10px; border-radius: 2px; display: inline-block;
          background: linear-gradient(90deg, #e8e8e8 0%, #f4f4f4 50%, #e8e8e8 100%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.3s ease-in-out infinite;
        }
        .sk-row { display: flex; gap: 12px; padding: 9px 0; border-bottom: 1px solid #f0f0f0; }
      `}</style>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="sk-row" aria-hidden="true">
          {w.map((ww, c) => (
            <span
              key={c}
              className="sk-bar"
              style={{ width: `${ww}%`, opacity: 0.8 - (r % 3) * 0.05 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
