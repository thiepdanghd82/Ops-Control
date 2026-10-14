/**
 * Help tab — Excel/SAP-style in-app user guide.
 *
 * Three-pane layout:
 *   - Left:   search box + grouped index of all 45 help entries
 *   - Main:   structured content for the selected entry
 *   - Top:    download-as-Word + print buttons
 *
 * Content is driven by src/help/content.js — a single source of truth
 * also consumed by the Word export script. To add/edit a section,
 * edit content.js only; this component rebuilds its index on render.
 *
 * Context-sensitive deep links: other tabs can set `window.__helpTarget`
 * (via the useF1Help hook) and press F1; the sidebar handler routes to
 * the Help tab and this component reads __helpTarget on mount.
 */
import { createContext, useContext, useMemo, useState, useEffect, useRef } from 'react';
import {
  HELP_SECTIONS,
  HELP_CONTENT,
  HELP_META,
  GLOSSARY,
  getHelpIndex,
} from '../../help/content.js';
import { useI18n } from '../../utils/useI18n';
import { pickLang } from '../../utils/pickLang';
import './HelpTab.css';

// Default entry when nothing is selected. 'help' is its own entry —
// serves as a short "how to use Help itself" intro.
const DEFAULT_ID = 'help';

// Render-time authorization fallback when an entry doesn't declare
// `authorization` explicitly. Derived from the app's actual role gates
// (see ROLE_LEVELS in Sidebar.jsx): viewonly < user < cost < admin < sys.
// Entries can override by setting authorization on their content record.
const DEFAULT_AUTH_BY_SECTION = {
  CALCULATORS: {
    roleRequired: 'User',
    notesKey: 'help.auth.quote',
  },
  QUOTING: {
    roleRequired: 'User',
    notesKey: 'help.auth.approve',
  },
  MANUFACTURING: {
    roleRequired: 'User',
    notesKey: 'help.auth.templates',
  },
  TRACKING: {
    roleRequired: 'User',
    notesKey: 'help.auth.own_records',
  },
  REPORTS: {
    roleRequired: 'User',
    notesKey: 'help.auth.export_csv',
  },
  LIBRARIES: {
    roleRequired: 'User',
    notesKey: 'help.auth.master_data',
  },
  SYSTEM: {
    roleRequired: 'Admin',
    notesKey: 'help.auth.sys_only',
  },
  PLANNING: {
    roleRequired: 'User',
    notesKey: 'help.auth.release_wo',
  },
};
function resolveAuth(entry) {
  if (entry?.authorization) return entry.authorization;
  return DEFAULT_AUTH_BY_SECTION[entry?.section] || { roleRequired: 'User' };
}

// Coerce a value (string OR { en, vi } bilingual object) to a string for
// search-haystack assembly. Sprint 1.6 — without this, bilingual workflow
// steps / tips / pitfalls would `.join` to "[object Object]" and break
// search hit detection on those entries.
function flatten(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return `${v.en || ''} ${v.vi || ''}`;
  return String(v);
}

// Filter predicate: case-insensitive match in title / purpose / workflow /
// tips / pitfalls / keyFields — any hit surfaces the entry.
function matchesQuery(entry, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystack = [
    entry.title?.en,
    entry.title?.vi,
    entry.purpose?.en,
    entry.purpose?.vi,
    entry.whenToUse?.en,
    entry.whenToUse?.vi,
    ...(entry.workflow || []).map(flatten),
    ...(entry.tips || []).map(flatten),
    ...(entry.pitfalls || []).map(flatten),
    ...(entry.features || []).map(flatten),
    ...(entry.keyFields || []).map(
      (f) => `${flatten(f.field || f.name)} ${flatten(f.label)} ${flatten(f.notes || f.desc)}`
    ),
    ...(entry.formulas || []).map(
      (f) => `${flatten(f.name)} ${flatten(f.expr || f.formula)} ${flatten(f.notes)}`
    ),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

// ── Help i18n — one language at a time ─────────────────────────────
// Entry copy lives in content.js as { en, vi } pairs (the offline Word
// export reads the same file), so it can't move into STRINGS. HelpTab
// reads useI18n() once and provides it here; `L(en, vi)` picks the half
// for the active locale, English when the Vietnamese twin is missing.
// Until 2026-09-14 every pair below rendered BOTH halves stacked.
const HelpI18n = createContext({ locale: 'en', t: (key) => key });
function useHelp() {
  const { locale, t } = useContext(HelpI18n);
  return { t, locale, L: (en, vi) => pickLang(locale, en, vi) };
}

// One line of entry copy in the active language.
function Bilingual({ en, vi, tag: Tag = 'p' }) {
  const { L } = useHelp();
  const text = L(en, vi);
  if (!text) return null;
  return <Tag className="help-bi">{text}</Tag>;
}

// Picks the active locale's half of a bilingual value. Content authors
// migrated strings → { en, vi } objects progressively, so both shapes
// reach here; a plain string is already single-language and passes
// through. Before 2026-09-14 this returned `vi || en` unconditionally,
// which showed Vietnamese formula names to English users.
function asText(v, locale) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return pickLang(locale, v.en, v.vi) || '';
  return String(v);
}

// Same as Bilingual but tolerates EITHER a string OR an { en, vi }
// object — some content slots use one shape, some the other.
function FlexBilingual({ value, tag: Tag = 'div' }) {
  if (!value) return null;
  if (typeof value === 'string') return <Tag className="help-bi">{value}</Tag>;
  return <Bilingual en={value.en} vi={value.vi} tag={Tag} />;
}

// A list item that may be a plain string (legacy) or an { en, vi }
// object. Renders the active locale's half only.
function BiItem({ value, icon }) {
  const { locale } = useHelp();
  const isObj = value && typeof value === 'object' && !Array.isArray(value);
  const text = isObj ? asText(value, locale) : value;
  return (
    <li>
      {icon && <span className="help-item-icon">{icon} </span>}
      <span className="help-bi">{text}</span>
    </li>
  );
}

function SectionBlock({ heading, children, id }) {
  if (!children) return null;
  return (
    <section className="help-block" id={id}>
      <h3 className="help-block-title">{heading}</h3>
      {children}
    </section>
  );
}

function HelpContentView({ entry, onRelatedClick }) {
  const { t, locale, L } = useHelp();
  if (!entry) {
    return <div className="help-empty">{t('help.pick_topic')}</div>;
  }
  const sectionLabel = HELP_SECTIONS.find((s) => s.key === entry.section);

  // SAP Help layout — section order:
  //   1. Header (title, breadcrumb, function, path)
  //   2. Use           (businessScenario || purpose — the BUSINESS reason)
  //   3. Integration   (whenToUse — upstream/downstream context)
  //   4. Authorization (explicit role/permission)
  //   5. Prerequisites
  //   6. Features      (bulleted capabilities — NEW)
  //   7. Procedure     (numbered activities, formal voice)
  //   8. Key fields
  //   9. Formulas      (calc tabs)
  //   10. Appendix     (reference tables)
  //   11. Example      (centralized end-to-end scenario)
  //   12. Result       (outcome statement)
  //   13. Constraints  (pitfalls renamed)
  //   14. Best practices (tips renamed)
  //   15. See also     (relatedTabs renamed)
  //
  // Any section whose data is absent is silently skipped — tabs with
  // minimal content still render cleanly.
  const useContent = entry.businessScenario || entry.purpose;

  return (
    <article className="help-content">
      <header className="help-content-header">
        <div className="help-breadcrumb">
          {sectionLabel ? L(sectionLabel.label.en, sectionLabel.label.vi) : entry.section}
        </div>
        <h2 className="help-content-title">{L(entry.title.en, entry.title.vi)}</h2>
        {(entry.function || entry.path) && (
          <dl className="help-meta-row">
            {entry.function && (
              <>
                <dt>{t('help.function')}</dt>
                <dd>{L(entry.function.en, entry.function.vi)}</dd>
              </>
            )}
            {entry.path && (
              <>
                <dt>{t('help.path')}</dt>
                <dd>
                  <code className="help-path">{entry.path}</code>
                </dd>
              </>
            )}
            {(() => {
              const a = resolveAuth(entry);
              return (
                <>
                  <dt>{t('help.authorization')}</dt>
                  <dd>
                    <span className="help-role-badge">{a.roleRequired}</span>
                    {(a.notesKey || a.notes) && (
                      <em> · {a.notesKey ? t(a.notesKey) : asText(a.notes, locale)}</em>
                    )}
                  </dd>
                </>
              );
            })()}
          </dl>
        )}
      </header>

      {/* 1. Use — business scenario. SAP convention: this is WHY the
          screen exists for the business, not WHAT it does technically. */}
      {useContent && (
        <SectionBlock heading={t('help.sec.use')} id="use">
          <Bilingual en={useContent.en} vi={useContent.vi} />
        </SectionBlock>
      )}

      {/* 2. Integration — where this sits in the broader flow. */}
      {entry.whenToUse && (
        <SectionBlock heading={t('help.sec.integration')} id="integration">
          <Bilingual en={entry.whenToUse.en} vi={entry.whenToUse.vi} />
        </SectionBlock>
      )}

      {/* 3. Prerequisites — what must exist / be true first. */}
      {entry.preRequisites?.length > 0 && (
        <SectionBlock heading={t('help.sec.prereq')} id="prereq">
          <ul className="help-list">
            {entry.preRequisites.map((s, i) => (
              <BiItem key={i} value={s} />
            ))}
          </ul>
        </SectionBlock>
      )}

      {/* 4. Features — capabilities the screen exposes (SAP-style bullets). */}
      {entry.features?.length > 0 && (
        <SectionBlock heading={t('help.sec.features')} id="features">
          <ul className="help-list">
            {entry.features.map((f, i) => (
              <BiItem key={i} value={f} icon="▸" />
            ))}
          </ul>
        </SectionBlock>
      )}

      {/* 5. Procedure (activities). Legacy `workflow` array renders as
          flat steps; `procedures` array renders as grouped activities. */}
      {entry.workflow?.length > 0 && (
        <SectionBlock heading={t('help.sec.procedure')} id="workflow">
          <ol className="help-list help-list-num">
            {entry.workflow.map((s, i) => (
              <BiItem key={i} value={s} />
            ))}
          </ol>
        </SectionBlock>
      )}

      {entry.procedures?.length > 0 && (
        <SectionBlock heading={t('help.sec.procedure')} id="procedures">
          <div className="help-procedures">
            {entry.procedures.map((prc, i) => (
              <div key={i} className="help-procedure">
                <h4 className="help-procedure-title">
                  <span className="help-procedure-num">{i + 1}.</span>
                  <span>{L(prc.title.en, prc.title.vi)}</span>
                </h4>
                {prc.note && (
                  <div className="help-procedure-note">
                    <b>{t('help.note')}</b>
                    <div>{L(prc.note.en, prc.note.vi)}</div>
                  </div>
                )}
                <ol className="help-list help-list-num">
                  {prc.steps.map((s, j) => (
                    <BiItem key={j} value={s} />
                  ))}
                </ol>
                {prc.screenshot && (
                  <img
                    src={`/help/screenshots/${prc.screenshot}`}
                    alt={prc.title.en}
                    className="help-screenshot help-screenshot-sm"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      {entry.appendices?.length > 0 && (
        <SectionBlock heading={t('help.sec.appendix')} id="appendices">
          {entry.appendices.map((app, i) => (
            <div key={i} className="help-appendix">
              <div className="help-appendix-title">
                {String.fromCharCode(65 + i)}. {L(app.title.en, app.title.vi)}
              </div>
              <table className="help-table">
                <thead>
                  <tr>
                    {app.columns.map((c) => (
                      <th key={c.key}>{L(c.en, c.vi)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {app.rows.map((r, j) => (
                    <tr key={j}>
                      {app.columns.map((c) => (
                        <td key={c.key}>{r[c.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </SectionBlock>
      )}

      {entry.screenshot && (
        <SectionBlock heading={t('help.sec.screenshot')} id="screenshot">
          <img
            src={`/help/screenshots/${entry.screenshot}`}
            alt={entry.title.en}
            className="help-screenshot"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="help-screenshot-caption">{t('help.shot_caption', { id: entry.id })}</div>
        </SectionBlock>
      )}

      {entry.keyFields?.length > 0 && (
        <SectionBlock heading={t('help.sec.fields')} id="fields">
          <table className="help-table">
            <thead>
              <tr>
                <th>{t('help.col.field')}</th>
                <th>{t('help.col.type')}</th>
                <th>{t('help.col.description')}</th>
              </tr>
            </thead>
            <tbody>
              {/* Sprint 1.6 — content uses two shapes depending on vintage:
                  legacy { name, type, desc } and newer { field, label, type, notes }.
                  Coalesce so older-style entries still render their name/desc
                  AND newer entries render their field/label/notes — and any
                  bilingual { en, vi } object is unwrapped via asText/FlexBilingual
                  instead of crashing the page. */}
              {entry.keyFields.map((f, i) => (
                <tr key={i}>
                  <td>
                    <code>{asText(f.field, locale) || asText(f.name, locale)}</code>
                    {f.label &&
                      asText(f.label, locale) !==
                        (asText(f.field, locale) || asText(f.name, locale)) && (
                        <div className="help-col-label">{asText(f.label, locale)}</div>
                      )}
                  </td>
                  <td>
                    <span className="help-type">{asText(f.type, locale)}</span>
                  </td>
                  <td>
                    <FlexBilingual value={f.notes ?? f.desc} tag="div" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionBlock>
      )}

      {entry.formulas?.length > 0 && (
        <SectionBlock heading={t('help.sec.formulas')} id="formulas">
          <div className="help-formulas">
            {entry.formulas.map((f, i) => (
              <div key={i} className="help-formula">
                {/* Sprint 1.6 — name + notes may be bi() bilingual objects
                    OR plain strings depending on the entry's vintage.
                    asText() / FlexBilingual coerce safely so the page
                    no longer crashes on the bilingual variants. */}
                <div className="help-formula-name">{asText(f.name, locale)}</div>
                <pre className="help-formula-expr">
                  <code>{asText(f.expr, locale) || asText(f.formula, locale)}</code>
                </pre>
                {f.meaning && (
                  <div className="help-formula-meaning">
                    <span className="help-formula-label">{t('help.meaning')}</span>
                    {asText(f.meaning, locale)}
                  </div>
                )}
                {f.example && (
                  <div className="help-formula-example">
                    <span className="help-formula-label">{t('help.example_label')}</span>
                    <pre>
                      <code>{asText(f.example, locale)}</code>
                    </pre>
                  </div>
                )}
                {f.notes && <FlexBilingual value={f.notes} tag="div" />}
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      {/* 11. Example — centralized end-to-end scenario (SAP-style box). */}
      {entry.example && (
        <SectionBlock heading={t('help.sec.example')} id="example">
          <div className="help-example">
            {entry.example.scenario && (
              <div className="help-example-scenario">
                <span className="help-example-label">{t('help.scenario')}</span>
                {typeof entry.example.scenario === 'object' ? (
                  <Bilingual en={entry.example.scenario.en} vi={entry.example.scenario.vi} />
                ) : (
                  entry.example.scenario
                )}
              </div>
            )}
            {Array.isArray(entry.example.steps) && entry.example.steps.length > 0 && (
              <ol className="help-list help-list-num">
                {entry.example.steps.map((s, i) => (
                  <BiItem key={i} value={s} />
                ))}
              </ol>
            )}
            {entry.example.expected && (
              <div className="help-example-expected">
                <span className="help-example-label">{t('help.expected')}</span>
                {typeof entry.example.expected === 'object' ? (
                  <Bilingual en={entry.example.expected.en} vi={entry.example.expected.vi} />
                ) : (
                  entry.example.expected
                )}
              </div>
            )}
          </div>
        </SectionBlock>
      )}

      {/* 12. Result — what the user achieves after completing the procedure. */}
      {entry.result && (
        <SectionBlock heading={t('help.sec.result')} id="result">
          <Bilingual en={entry.result.en} vi={entry.result.vi} />
        </SectionBlock>
      )}

      {/* 13. Constraints — pitfalls renamed to SAP terminology. */}
      {(entry.constraints?.length > 0 || entry.pitfalls?.length > 0) && (
        <SectionBlock heading={t('help.sec.constraints')} id="constraints">
          <ul className="help-list help-list-pit">
            {(entry.constraints || []).map((s, i) => (
              <BiItem key={`c-${i}`} value={s} icon="⚠️" />
            ))}
            {(entry.pitfalls || []).map((s, i) => (
              <BiItem key={`p-${i}`} value={s} icon="⚠️" />
            ))}
          </ul>
        </SectionBlock>
      )}

      {/* 14. Best practices — tips renamed. */}
      {entry.tips?.length > 0 && (
        <SectionBlock heading={t('help.sec.tips')} id="tips">
          <ul className="help-list help-list-tips">
            {entry.tips.map((s, i) => (
              <BiItem key={i} value={s} icon="💡" />
            ))}
          </ul>
        </SectionBlock>
      )}

      {/* 15. See also — relatedTabs renamed to SAP terminology. */}
      {entry.relatedTabs?.length > 0 && (
        <SectionBlock heading={t('help.sec.see_also')} id="see-also">
          <div className="help-related">
            {entry.relatedTabs.map((relId) => {
              const rel = HELP_CONTENT[relId];
              if (!rel) return null;
              return (
                <button
                  key={relId}
                  type="button"
                  className="help-related-chip"
                  onClick={() => onRelatedClick?.(relId)}
                >
                  {L(rel.title.en, rel.title.vi)}
                </button>
              );
            })}
          </div>
        </SectionBlock>
      )}
    </article>
  );
}

// Glossary panel — renders alphabetized domain terms. Opens as an
// alternative right-pane when the user picks "Glossary" in the sidebar
// (entry id = '__glossary' sentinel).
function GlossaryView({ query }) {
  const { t, L } = useHelp();
  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? GLOSSARY.filter((g) => `${g.term} ${g.en} ${g.vi}`.toLowerCase().includes(q))
    : GLOSSARY;
  return (
    <article className="help-content">
      <header className="help-content-header">
        <div className="help-breadcrumb">{t('help.glossary.crumb')}</div>
        <h2 className="help-content-title">{t('help.glossary')}</h2>
        <dl className="help-meta-row">
          <dt>{t('help.glossary.count')}</dt>
          <dd>{t('help.glossary.terms', { shown: filtered.length, total: GLOSSARY.length })}</dd>
        </dl>
      </header>
      <SectionBlock heading={t('help.glossary.section')} id="glossary-terms">
        <dl className="help-glossary">
          {filtered.map((g) => (
            <div key={g.term} className="help-glossary-entry">
              <dt className="help-glossary-term">{g.term}</dt>
              <dd>
                <div className="help-bi">{L(g.en, g.vi)}</div>
              </dd>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="help-glossary-empty">
              <div>{t('help.glossary.empty', { q: query })}</div>
            </div>
          )}
        </dl>
      </SectionBlock>
    </article>
  );
}

export default function HelpTab() {
  const { locale, t } = useI18n();
  const helpI18n = useMemo(() => ({ locale, t }), [locale, t]);
  const L = (en, vi) => pickLang(locale, en, vi);
  // Deep-link: any tab can set window.__helpTarget to a help entry id
  // before navigating here via F1. We read it on mount + on each focus
  // to support the use-F1-twice case (close + re-open with a new target).
  const initialId =
    typeof window !== 'undefined' && window.__helpTarget && HELP_CONTENT[window.__helpTarget]
      ? window.__helpTarget
      : DEFAULT_ID;
  const [selected, setSelected] = useState(initialId);
  const [query, setQuery] = useState('');
  const contentRef = useRef(null);

  // Consume the deep-link target once, so navigating away + back
  // doesn't re-jump to the same topic.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__helpTarget) {
      window.__helpTarget = null;
    }
  }, []);

  // Scroll to top when selection changes — otherwise a long previous
  // entry leaves the user in the middle of the new one.
  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 });
  }, [selected]);

  const index = useMemo(() => getHelpIndex(), []);
  const filtered = useMemo(() => {
    if (!query.trim()) return null;
    const out = {};
    for (const section of Object.keys(index)) {
      const hits = index[section].filter((e) => matchesQuery(e, query));
      if (hits.length > 0) out[section] = hits;
    }
    return out;
  }, [query, index]);

  const shownIndex = filtered || index;
  const selectedEntry = HELP_CONTENT[selected];

  function handleExport() {
    // The export is produced OFFLINE by a node script so this in-app
    // button just points to the static asset that was copied to the
    // server at build time. See scripts/build-user-guide.mjs.
    window.open('/help/OpsControl_UserGuide.docx', '_blank');
  }

  function handlePrint() {
    // Print only the right pane; sidebar + search box are hidden in
    // print styles for a clean handout. The useNativePrint approach
    // is sturdier than rolling a custom print window — system font
    // rendering and page breaks are honored by the browser.
    window.print();
  }

  return (
    <HelpI18n.Provider value={helpI18n}>
      <div className="help-tab" role="region" aria-label={t('help.aria.region')}>
        <div className="help-toolbar">
          <div className="help-toolbar-left">
            <h2 className="help-page-title">{t('help.page_title')}</h2>
            <span className="help-tip-pill">{t('help.tip')}</span>
            <span
              className="help-version-pill"
              title={t('help.updated', { date: HELP_META.lastUpdated })}
            >
              {HELP_META.version} · {t('help.entries', { n: HELP_META.totalEntries })}
            </span>
          </div>
          <div className="help-toolbar-right">
            <button type="button" className="help-btn" onClick={handleExport}>
              {t('help.word')}
            </button>
            <button type="button" className="help-btn help-btn-ghost" onClick={handlePrint}>
              {t('help.print')}
            </button>
          </div>
        </div>

        <div className="help-body">
          <aside className="help-sidebar">
            <input
              type="search"
              className="help-search"
              placeholder={t('help.search_ph')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('help.aria.search')}
            />
            <nav className="help-index" aria-label={t('help.aria.sections')}>
              {/* Glossary — always visible at the top of the index. SAP
                convention: domain vocabulary is a first-class reference,
                not a nested appendix. */}
              <div className="help-index-section">
                <div className="help-index-section-label">{t('help.glossary')}</div>
                <button
                  type="button"
                  className={`help-index-item ${selected === '__glossary' ? 'active' : ''}`}
                  onClick={() => setSelected('__glossary')}
                >
                  <span className="help-index-label">
                    {t('help.glossary.nav', { n: GLOSSARY.length })}
                  </span>
                </button>
              </div>

              {HELP_SECTIONS.map((s) => {
                const entries = shownIndex[s.key] || [];
                if (entries.length === 0) return null;
                return (
                  <div key={s.key} className="help-index-section">
                    <div className="help-index-section-label">{L(s.label.en, s.label.vi)}</div>
                    {entries.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className={`help-index-item ${e.id === selected ? 'active' : ''}`}
                        onClick={() => setSelected(e.id)}
                      >
                        <span className="help-index-label">{L(e.title.en, e.title.vi)}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {Object.keys(shownIndex).length === 0 && (
                <div className="help-index-empty">{t('help.no_results')}</div>
              )}
            </nav>
          </aside>

          <main className="help-main" ref={contentRef}>
            {selected === '__glossary' ? (
              <GlossaryView query={query} />
            ) : (
              <HelpContentView entry={selectedEntry} onRelatedClick={setSelected} />
            )}
          </main>
        </div>
      </div>
    </HelpI18n.Provider>
  );
}
