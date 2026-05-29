/**
 * rfqGen — Auto-generate RFQ numbers matching COST V1.0 logic.
 *
 * Format: RFQ-YYYY-{S|C}{4-digit sequence}
 *   S = Standard, C = Complex
 *   Example: RFQ-2026-S0001, RFQ-2026-C0042
 *
 * Scans existing quote history + current in-memory std/cplx states to
 * find used sequence numbers for the given year/type, then returns the
 * first gap (1..max) or max+1 if contiguous.
 */
export function genRfqNum(type, quotes, stdState, cplxState) {
  const yr = new Date().getFullYear();
  const prefix = `RFQ-${yr}-${type}`;

  const usedSet = new Set();
  const pushIfMatch = (n) => {
    if (typeof n === 'string' && n.startsWith(prefix)) {
      const seq = parseInt(n.slice(prefix.length), 10);
      if (!isNaN(seq) && seq > 0) usedSet.add(seq);
    }
  };

  (quotes || []).forEach((q) => pushIfMatch(q?.state?.rfq_number || ''));
  pushIfMatch(stdState?.rfq_number || '');
  pushIfMatch(cplxState?.rfq_number || '');

  let next = 1;
  if (usedSet.size > 0) {
    const max = Math.max(...usedSet);
    for (let i = 1; i <= max; i++) {
      if (!usedSet.has(i)) {
        next = i;
        break;
      }
      if (i === max) next = max + 1;
    }
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}
