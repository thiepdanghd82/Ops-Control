// Pure filter engine shared between QuoteHistory + Summarize (Cost Breakdown).
//
// `applyQuoteFilters(items, filter, accessor?)` returns the subset of items
// passing ALL non-empty filters (AND combine). Accessor lets each caller
// project its native shape (raw quote vs Summarize row) into the flat
// schema used here — keeps this module unaware of caller specifics.
//
// S-PROJFIX (Lesson 21): customer scope reads `end_cu || project` because
// Standard's End Customer is aliased into `state.project` via CalcHeader's
// aliasMap. NPI Owner accessor honours quote-level fallback
// (`state.npi_owner || quote.npi_owner`) per QuoteHistory pattern.

export const EMPTY_FILTER = {
  query: '',
  dateFrom: null,
  dateTo: null,
  customer: '',
  part: '',
  sale: '',
};

const identity = (x) => x;

const lc = (v) => (v == null ? '' : String(v).toLowerCase());

export function applyQuoteFilters(items, filter, accessor = identity) {
  if (!Array.isArray(items)) return [];
  const f = filter || {};
  const hasQuery = !!f.query;
  const q = hasQuery ? lc(f.query) : '';
  const hasDateFrom = !!f.dateFrom;
  const hasDateTo = !!f.dateTo;
  const hasCustomer = !!f.customer;
  const cust = hasCustomer ? lc(f.customer) : '';
  const hasPart = !!f.part;
  const part = hasPart ? lc(f.part) : '';
  const hasSale = !!f.sale;
  const sale = hasSale ? lc(f.sale) : '';

  if (!hasQuery && !hasDateFrom && !hasDateTo && !hasCustomer && !hasPart && !hasSale) {
    return items;
  }

  return items.filter((item) => {
    const r = accessor(item);
    if (!r) return false;

    if (hasDateFrom || hasDateTo) {
      const day = String(r.saved_at || '').slice(0, 10);
      if (!day) return false;
      if (hasDateFrom && day < f.dateFrom) return false;
      if (hasDateTo && day > f.dateTo) return false;
    }

    if (hasCustomer) {
      const c = lc(r.direct_cu) + ' ' + lc(r.end_cu || r.project);
      if (!c.includes(cust)) return false;
    }

    if (hasPart) {
      const p = lc(r.direct_cu_pn) + ' ' + lc(r.end_cu_pn);
      if (!p.includes(part)) return false;
    }

    if (hasSale) {
      const s = lc(r.sale_owner) + ' ' + lc(r.npi_owner);
      if (!s.includes(sale)) return false;
    }

    if (hasQuery) {
      const fields = [
        r.direct_cu,
        r.direct_cu_pn,
        r.end_cu,
        r.end_cu_pn,
        r.project,
        r.project_name,
        r.ccl_pn,
        r.label,
        r.npi_owner,
        r.sale_owner,
        r.size,
        r.trade_mode,
        r.description,
        r.rfq_number,
      ];
      const hit = fields.some((v) => lc(v).includes(q));
      if (!hit) return false;
    }

    return true;
  });
}

// Adapter: raw quote (QuoteHistory shape) → flat accessor row.
// Preserves S-PROJFIX (`end_cu || project`) and NPI fallback
// (`state.npi_owner || quote.npi_owner`).
export function quoteAccessor(q) {
  if (!q) return null;
  const s = q.state || {};
  return {
    saved_at: q.saved_at,
    direct_cu: s.direct_cu,
    end_cu: s.end_cu,
    project: s.project,
    project_name: s.project_name,
    direct_cu_pn: s.direct_cu_pn,
    end_cu_pn: s.end_cu_pn,
    sale_owner: s.sale_owner,
    npi_owner: s.npi_owner || q.npi_owner,
    ccl_pn: s.ccl_pn,
    label: q.label,
    rfq_number: s.rfq_number,
    description: s.description,
    size: s.size,
    trade_mode: s.trade_mode,
  };
}
