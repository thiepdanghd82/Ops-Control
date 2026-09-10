/**
 * SidebarIcon — 16×16 monochrome glyphs for the left nav.
 *
 * Inline SVG (no icon-pack dep). All paths use currentColor so they
 * inherit the link color (active = white, idle = secondary, hover = primary).
 * Stroke width 1.5 + round caps matches IBM Carbon icon library.
 *
 * Ported from Ops Control v1.3 (apps/client/src/SidebarIcon.jsx).
 * Extra glyphs added for v1.2-only tabs: messages, summarize,
 * formal_quote, rfq_tracker, help.
 */
import React from 'react';

const PATHS = {
  // ── Workspace
  dashboard: (
    <>
      <rect x="2" y="2" width="5" height="6" rx="0.5" />
      <rect x="9" y="2" width="5" height="3" rx="0.5" />
      <rect x="2" y="10" width="5" height="4" rx="0.5" />
      <rect x="9" y="7" width="5" height="7" rx="0.5" />
    </>
  ),

  // ── Pricing / Calculators
  calc_std: (
    <>
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <line x1="6" y1="5" x2="10" y2="5" />
      <line x1="6" y1="8" x2="6" y2="8" />
      <line x1="10" y1="8" x2="10" y2="8" />
      <line x1="6" y1="11" x2="6" y2="11" />
      <line x1="10" y1="11" x2="10" y2="11" />
    </>
  ),
  calc_cplx: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M5 5 l3 3 -3 3" />
      <line x1="9" y1="11" x2="12" y2="11" />
    </>
  ),
  print_area: (
    <>
      <rect x="3" y="6" width="10" height="6" rx="0.5" />
      <path d="M5 6 V3 h6 v3" />
      <circle cx="11" cy="9" r="0.5" fill="currentColor" />
    </>
  ),
  ink: (
    <>
      <path d="M8 2 L4 8 a4 4 0 1 0 8 0 z" />
    </>
  ),
  design: (
    <>
      <path d="M3 13 L8 3 l5 10 z" />
      <line x1="6" y1="9" x2="10" y2="9" />
    </>
  ),
  cylinder: (
    <>
      <ellipse cx="8" cy="3.5" rx="5" ry="1.5" />
      <path d="M3 3.5 V12.5 a5 1.5 0 0 0 10 0 V3.5" />
    </>
  ),
  history: (
    <>
      <circle cx="8" cy="8" r="6" />
      <polyline points="8,4 8,8 11,10" />
    </>
  ),
  // Parts list — checklist-ish ledger icon (NPI Parts List, Sprint S-NPI-PARTS).
  parts_list: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
      <line x1="5" y1="5.5" x2="11" y2="5.5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="10.5" x2="9" y2="10.5" />
    </>
  ),
  analysis: (
    <>
      <polyline points="2,12 5,8 8,10 11,5 14,7" />
      <circle cx="5" cy="8" r="0.7" fill="currentColor" />
      <circle cx="8" cy="10" r="0.7" fill="currentColor" />
      <circle cx="11" cy="5" r="0.7" fill="currentColor" />
    </>
  ),

  // ── Quoting (v1.2-only)
  messages: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <polyline points="2,4 8,9 14,4" />
    </>
  ),
  summarize: (
    <>
      <line x1="3" y1="4" x2="13" y2="4" />
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="3" y1="12" x2="9" y2="12" />
    </>
  ),
  formal_quote: (
    <>
      <path d="M4 2 h6 l3 3 V14 H4 z" />
      <polyline points="10,2 10,5 13,5" />
      <line x1="6" y1="9" x2="11" y2="9" />
      <line x1="6" y1="11" x2="11" y2="11" />
    </>
  ),
  rfq_tracker: (
    <>
      <rect x="3" y="3" width="10" height="11" rx="0.5" />
      <polyline points="5,7 6.5,8.5 9.5,5.5" />
      <line x1="5" y1="11" x2="11" y2="11" />
    </>
  ),
  // RFQ Tracking — spreadsheet grid (master list; distinct from rfq_tracker).
  rfq_tracking: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="0.5" />
      <line x1="2.5" y1="6.5" x2="13.5" y2="6.5" />
      <line x1="2.5" y1="9.75" x2="13.5" y2="9.75" />
      <line x1="6.5" y1="3" x2="6.5" y2="13" />
      <line x1="10" y1="3" x2="10" y2="13" />
    </>
  ),

  // ── Production / Planning
  orders: (
    <>
      <path d="M3 3 h10 v3 h-10 z" />
      <path d="M3 6 v8 h10 V6" />
      <line x1="6" y1="9" x2="10" y2="9" />
    </>
  ),
  new_order: (
    <>
      <path d="M3 3 h10 v3 h-10 z" />
      <path d="M3 6 v8 h10 V6" />
      <line x1="8" y1="8" x2="8" y2="12" />
      <line x1="6" y1="10" x2="10" y2="10" />
    </>
  ),
  wip: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4 a4 4 0 0 1 0 8" fill="currentColor" stroke="none" />
    </>
  ),
  capacity: (
    <>
      <rect x="2" y="11" width="3" height="3" />
      <rect x="6.5" y="7" width="3" height="7" />
      <rect x="11" y="3" width="3" height="11" />
    </>
  ),
  materials_chk: (
    <>
      <path d="M2 4 h12" />
      <path d="M2 8 h12" />
      <path d="M2 12 h12" />
      <circle cx="4" cy="4" r="0.8" fill="currentColor" />
      <circle cx="6" cy="8" r="0.8" fill="currentColor" />
      <circle cx="9" cy="12" r="0.8" fill="currentColor" />
    </>
  ),
  bom: (
    <>
      <rect x="6" y="2" width="4" height="3" />
      <rect x="2" y="11" width="4" height="3" />
      <rect x="10" y="11" width="4" height="3" />
      <path d="M8 5 V8 M4 11 V8 h8 V11" />
    </>
  ),
  samples: (
    <>
      <path d="M6 2 v6 l-3 5 a1 1 0 0 0 1 1 h8 a1 1 0 0 0 1 -1 l-3 -5 V2" />
      <line x1="5" y1="2" x2="11" y2="2" />
    </>
  ),

  // ── Master data / Library
  material: (
    <>
      <path d="M8 2 L2 5 v6 l6 3 6 -3 V5 z" />
      <path d="M2 5 L8 8 l6 -3" />
      <line x1="8" y1="8" x2="8" y2="14" />
    </>
  ),
  rates: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4 V12 M5.5 6 a2 2 0 0 1 5 0 c0 2 -5 1 -5 3 a2 2 0 0 0 5 0" />
    </>
  ),
  finance: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M5 8 h6 M8 5 v6" />
    </>
  ),
  ddl: (
    <>
      <rect x="2" y="3" width="12" height="3" rx="0.5" />
      <rect x="2" y="9" width="12" height="3" rx="0.5" />
      <polyline points="11,4 12,5 13,4" />
      <polyline points="11,10 12,11 13,10" />
    </>
  ),
  mfg: (
    <>
      <path d="M2 14 V6 l3 2 V4 l3 2 V4 l3 2 V14 z" />
      <line x1="2" y1="14" x2="14" y2="14" />
    </>
  ),
  routing: (
    <>
      <circle cx="3.5" cy="8" r="1.5" />
      <circle cx="12.5" cy="4" r="1.5" />
      <circle cx="12.5" cy="12" r="1.5" />
      <line x1="5" y1="8" x2="11" y2="4" />
      <line x1="5" y1="8" x2="11" y2="12" />
    </>
  ),

  // ── Manufacturing systems
  ifs: (
    <>
      <rect x="2" y="3" width="12" height="3" rx="0.5" />
      <rect x="2" y="6.5" width="12" height="3" rx="0.5" />
      <rect x="2" y="10" width="12" height="3" rx="0.5" />
      <circle cx="4" cy="4.5" r="0.5" fill="currentColor" />
      <circle cx="4" cy="8" r="0.5" fill="currentColor" />
      <circle cx="4" cy="11.5" r="0.5" fill="currentColor" />
    </>
  ),
  machine: (
    <>
      <rect x="2" y="6" width="12" height="7" rx="0.5" />
      <circle cx="6" cy="9.5" r="1.5" />
      <circle cx="11" cy="9.5" r="1.5" />
      <path d="M6 6 V4 h4 V6" />
    </>
  ),
  connection: (
    <>
      <circle cx="4" cy="8" r="2" />
      <circle cx="12" cy="8" r="2" />
      <line x1="6" y1="8" x2="10" y2="8" />
    </>
  ),

  // ── Approvals
  approvals: (
    <>
      <path d="M8 2 l5 2 v4 c0 3 -2 5 -5 6 -3 -1 -5 -3 -5 -6 V4 z" />
      <polyline points="6,8 7.5,9.5 10.5,6.5" />
    </>
  ),

  // ── System
  settings: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2 v2 M8 12 v2 M2 8 h2 M12 8 h2 M3.8 3.8 l1.4 1.4 M10.8 10.8 l1.4 1.4 M3.8 12.2 l1.4 -1.4 M10.8 5.2 l1.4 -1.4" />
    </>
  ),
  metrics: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <polyline points="4,11 7,7 9,9 12,5" />
    </>
  ),
  audit: (
    <>
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <line x1="5" y1="5" x2="11" y2="5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="11" x2="9" y2="11" />
    </>
  ),
  health: (
    <>
      <path d="M2 8 h3 l1.5 -3 3 6 1.5 -3 h3" />
    </>
  ),
  help: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.2 a2 2 0 1 1 2.6 2.4 c-0.5 0.3 -0.8 0.7 -0.8 1.4" />
      <circle cx="8" cy="11.6" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
};

export function SidebarIcon({ name }) {
  const path = PATHS[name];
  if (!path) {
    return (
      <svg className="ops-sidebar__icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      className="ops-sidebar__icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
