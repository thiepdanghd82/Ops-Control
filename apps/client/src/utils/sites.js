// @ts-check
/**
 * Single source of truth for the Quoted Module site list.
 *
 * Prior to Phase 9G.4 this array was duplicated in four places
 * (RfqInfoCard, LibRate, LibDDL, LibFinance). When Ops added a new
 * site, three of the four would forget to update — SGA would silently
 * default to 0, rates wouldn't show up, etc. All four now import from
 * this module.
 *
 * Ordering: VN first (the default / most common), then CCL-site codes,
 * then India. Match the order operators expect to see in dropdowns.
 *
 * Server-side parity: when a new site is added here, also update the
 * Finance tab SGA rates (`sga_rate_pct_by_site`) and the rate table
 * seed data so quotes on that site have rate lookups + SGA config.
 */

export const SITES = Object.freeze([
  'VN',
  '41 RDC',
  '41 Flexo',
  '55 site',
  '49 site',
  '54 site',
  'India',
]);
