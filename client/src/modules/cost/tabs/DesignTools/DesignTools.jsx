/**
 * DesignTools — top-level tab module for press-engineer design tools.
 * Sprint 14.
 *
 * Hierarchy (3 levels of in-page nesting):
 *
 *   Sidebar: "Design Tools"
 *     └─ Toolset bar:  Print tools | Cutting tools | Finishing tools (placeholders)
 *         └─ Press bar (within Print tools):
 *               Gallus | Letter_press | Brotech | HP Indigo | Silkscreen
 *               └─ Per-press inner tabs: Print Design | Cutting Design
 *
 * Only Gallus is fully implemented in this sprint — the other 4 presses
 * render a "Coming soon" stub with the same skeleton so engineers
 * immediately see the architecture is uniform. As each new press file
 * is built, swap the stub for the real component.
 *
 * Design philosophy (IBM Carbon / SAP Fiori):
 *   - 3 nested tab bars sounds like a lot but each is a single line of
 *     ~24 px tall, so the total chrome is ~72 px — comparable to the
 *     CostModule sub-tab + sub-sub-tab pattern in StandardCalc.
 *   - Active selection persists per session (sessionStorage) so an
 *     engineer who closes + reopens the tab returns to the same press.
 */
import { useEffect, useState } from 'react';
import GallusCalc from './presses/GallusCalc';
import './DesignTools.css';

const TOOLSETS = [
  { id: 'print', en: 'Print tools', vi: 'Công cụ in', icon: '🖨' },
  { id: 'cut', en: 'Cutting tools', vi: 'Công cụ cắt', icon: '✂', disabled: true },
  { id: 'finish', en: 'Finishing tools', vi: 'Công cụ hoàn thiện', icon: '✨', disabled: true },
];

const PRESSES = [
  { id: 'gallus', en: 'Gallus', vi: 'Gallus ECS340', impl: 'gallus' },
  { id: 'letter_press', en: 'Letter Press', vi: 'Máy Letter Press', impl: 'stub' },
  { id: 'brotech', en: 'Brotech', vi: 'Brotech', impl: 'stub' },
  { id: 'hp_indigo', en: 'HP Indigo', vi: 'HP Indigo', impl: 'stub' },
  { id: 'silkscreen', en: 'Silkscreen', vi: 'Lụa (Silkscreen)', impl: 'stub' },
];

const SS_KEY = 'ops_design_tools_state';

export default function DesignTools() {
  const [state, setState] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) return { toolset: 'print', press: 'gallus', ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return { toolset: 'print', press: 'gallus' };
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify(state));
    } catch {
      /* quota */
    }
  }, [state]);

  const setToolset = (id) => setState((prev) => ({ ...prev, toolset: id }));
  const setPress = (id) => setState((prev) => ({ ...prev, press: id }));

  return (
    <div className="dt-root">
      {/* ═════════ Page header ═════════ */}
      <header className="dt-page-hdr">
        <div className="dt-title">
          <span className="dt-title-icon">⚒</span>
          <div>
            <b>Design Tools</b>
            <span className="dt-bi-vi"> · Bộ công cụ thiết kế cho kỹ sư in</span>
          </div>
        </div>
        <div className="dt-page-sub">
          Pick a tool family below — each opens a per-machine designer.
          <span className="dt-bi-vi">
            {' '}
            Chọn bộ công cụ bên dưới — mỗi bộ mở designer cho từng loại máy.
          </span>
        </div>
      </header>

      {/* ═════════ Level 1: toolset bar ═════════ */}
      <div className="dt-toolset-bar" role="tablist" aria-label="Tool family">
        {TOOLSETS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={state.toolset === t.id}
            disabled={t.disabled}
            className={`dt-toolset ${state.toolset === t.id ? 'active' : ''}`}
            onClick={() => !t.disabled && setToolset(t.id)}
            title={t.disabled ? 'Coming in a future sprint' : t.en}
          >
            <span className="dt-toolset-icon" aria-hidden>
              {t.icon}
            </span>
            <span>
              <div className="dt-toolset-en">{t.en}</div>
              <div className="dt-toolset-vi">{t.vi}</div>
            </span>
            {t.disabled && <span className="dt-soon">soon</span>}
          </button>
        ))}
      </div>

      {/* ═════════ Level 2: press bar ═════════ */}
      {state.toolset === 'print' && (
        <div className="dt-press-bar" role="tablist" aria-label="Press machine">
          {PRESSES.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={state.press === p.id}
              className={`dt-press ${state.press === p.id ? 'active' : ''}`}
              onClick={() => setPress(p.id)}
            >
              <div className="dt-press-en">{p.en}</div>
              <div className="dt-press-vi">{p.vi}</div>
              {p.impl === 'stub' && <span className="dt-soon">stub</span>}
            </button>
          ))}
        </div>
      )}

      {/* ═════════ Level 3: per-press content ═════════ */}
      <main className="dt-content">
        {state.toolset === 'print' ? (
          <PressContent press={state.press} />
        ) : (
          <ComingSoonPanel
            en="Cutting tools / Finishing tools — coming next sprint."
            vi="Công cụ cắt / hoàn thiện — sẽ có ở sprint kế tiếp."
          />
        )}
      </main>
    </div>
  );
}

function PressContent({ press }) {
  const def = PRESSES.find((p) => p.id === press);
  if (!def) return null;
  if (def.impl === 'gallus') return <GallusCalc />;
  return (
    <ComingSoonPanel
      en={`${def.en} — calculator scaffolding will mirror the Gallus structure (Print Design + Cutting Design sub-tabs).`}
      vi={`${def.vi} — bảng tính sẽ giống cấu trúc Gallus (sub-tab Print Design + Cutting Design).`}
      pressName={def.en}
    />
  );
}

function ComingSoonPanel({ en, vi, pressName }) {
  return (
    <div className="dt-coming-soon">
      <div className="dt-cs-icon">🚧</div>
      <div className="dt-cs-title">
        <b>Coming soon</b>
        <span className="dt-bi-vi"> · Sắp ra mắt</span>
      </div>
      <p>{en}</p>
      <p className="dt-bi-vi">{vi}</p>
      {pressName && (
        <p className="dt-cs-checklist">
          To bring up <b>{pressName}</b>, drop a <code>{pressName.toLowerCase()}Inventory.js</code>{' '}
          + <code>{pressName.toLowerCase()}Engine.js</code> in <code>presses/</code> using the
          Gallus pair as a template, then add the press to <code>PRESSES</code> in{' '}
          <code>DesignTools.jsx</code>.
        </p>
      )}
    </div>
  );
}
