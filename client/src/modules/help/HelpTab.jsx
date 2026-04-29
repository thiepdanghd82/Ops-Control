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
import { useState, useMemo, useEffect, useRef } from 'react';
import { HELP_SECTIONS, HELP_CONTENT, HELP_META, GLOSSARY, getHelpIndex } from '../../help/content.js';
import './HelpTab.css';

// Default entry when nothing is selected. 'help' is its own entry —
// serves as a short "how to use Help itself" intro.
const DEFAULT_ID = 'help';

// Render-time authorization fallback when an entry doesn't declare
// `authorization` explicitly. Derived from the app's actual role gates
// (see ROLE_LEVELS in Sidebar.jsx): viewonly < user < cost < admin < sys.
// Entries can override by setting authorization on their content record.
const DEFAULT_AUTH_BY_SECTION = {
  CALCULATORS:   { roleRequired: 'User', notes: 'Quote authoring — Cost role required to commit. · Soạn báo giá — cần role Cost để Save.' },
  QUOTING:       { roleRequired: 'User', notes: 'Cost / Admin to approve or send. · Cost / Admin để duyệt hoặc gửi.' },
  MANUFACTURING: { roleRequired: 'User', notes: 'Cost / Admin to edit templates + routing. · Cost / Admin để sửa template + routing.' },
  TRACKING:      { roleRequired: 'User', notes: 'Everyone can view their own records. · Mọi người xem được record của mình.' },
  REPORTS:       { roleRequired: 'User', notes: 'Admin required to export CSV. · Cần Admin để export CSV.' },
  LIBRARIES:     { roleRequired: 'User', notes: 'Cost / Admin to edit master data. · Cost / Admin để sửa master data.' },
  SYSTEM:        { roleRequired: 'Admin', notes: 'Sys role only for select subscreens. · Chỉ role Sys cho một số sub-screen.' },
  PLANNING:      { roleRequired: 'User', notes: 'Cost / Admin to release work orders. · Cost / Admin để release work order.' },
};
function resolveAuth(entry) {
  if (entry?.authorization) return entry.authorization;
  return DEFAULT_AUTH_BY_SECTION[entry?.section] || { roleRequired: 'User', notes: '' };
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
    entry.title?.en, entry.title?.vi,
    entry.purpose?.en, entry.purpose?.vi,
    entry.whenToUse?.en, entry.whenToUse?.vi,
    ...(entry.workflow || []).map(flatten),
    ...(entry.tips || []).map(flatten),
    ...(entry.pitfalls || []).map(flatten),
    ...(entry.features || []).map(flatten),
    ...(entry.keyFields || []).map(f => `${flatten(f.field || f.name)} ${flatten(f.label)} ${flatten(f.notes || f.desc)}`),
    ...(entry.formulas || []).map(f => `${flatten(f.name)} ${flatten(f.expr || f.formula)} ${flatten(f.notes)}`),
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(needle);
}

function Bilingual({ en, vi, tag: Tag = 'p' }) {
  if (!en && !vi) return null;
  return (
    <Tag className="help-bilingual">
      {en && <span className="help-bi-en">{en}</span>}
      {vi && <span className="help-bi-vi">{vi}</span>}
    </Tag>
  );
}

// Sprint 1.6 — defensive coercion for slots the renderer treated as
// plain strings but content authors filled with bi() / bilingual objects
// (formulas[].name + .notes, keyFields[].desc). Rendering an object
// directly throws React error #31 ("objects are not valid as a React
// child"), which crashed the whole Help tab. This helper picks the VI
// value when present (the help UI defaults VI-first), falls back to EN,
// and passes strings through unchanged.
function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.vi || v.en || '';
  return String(v);
}

// Same shape as Bilingual but tolerates EITHER a string OR a {en,vi}
// object — handy for slots where some entries use one shape and some
// use the other. Returns null if both halves are empty.
function FlexBilingual({ value, tag: Tag = 'div' }) {
  if (!value) return null;
  if (typeof value === 'string') return <Tag className="help-bilingual"><span className="help-bi-en">{value}</span></Tag>;
  return <Bilingual en={value.en} vi={value.vi} tag={Tag} />;
}

// BiItem renders a list item that may be a plain string (legacy,
// rendered as-is) or a { en, vi } object (new bilingual form).
// Content authors progressively migrate strings → objects; the UI
// handles both without breaking.
function BiItem({ value, icon }) {
  const isObj = value && typeof value === 'object' && !Array.isArray(value);
  const en = isObj ? value.en : value;
  const vi = isObj ? value.vi : null;
  return (
    <li>
      {icon && <span className="help-item-icon">{icon} </span>}
      <span className="help-bi-en">{en}</span>
      {vi && vi !== en && <span className="help-bi-vi">{vi}</span>}
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
  if (!entry) {
    return <div className="help-empty">Select a topic from the left.</div>;
  }
  const sectionLabel = HELP_SECTIONS.find(s => s.key === entry.section);

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
          {sectionLabel ? `${sectionLabel.label.en} · ${sectionLabel.label.vi}` : entry.section}
        </div>
        <h2 className="help-content-title">
          <span className="help-title-en">{entry.title.en}</span>
          <span className="help-title-vi">{entry.title.vi}</span>
        </h2>
        {(entry.function || entry.path) && (
          <dl className="help-meta-row">
            {entry.function && (
              <>
                <dt>Function</dt>
                <dd>
                  {entry.function.en}
                  {entry.function.vi && <em> · {entry.function.vi}</em>}
                </dd>
              </>
            )}
            {entry.path && (
              <>
                <dt>Path · Đường dẫn</dt>
                <dd><code className="help-path">{entry.path}</code></dd>
              </>
            )}
            {(() => {
              const a = resolveAuth(entry);
              return (
                <>
                  <dt>Authorization · Phân quyền</dt>
                  <dd>
                    <span className="help-role-badge">{a.roleRequired}</span>
                    {a.notes && <em> · {a.notes}</em>}
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
        <SectionBlock heading="Use · Mục đích nghiệp vụ" id="use">
          <Bilingual en={useContent.en} vi={useContent.vi} />
        </SectionBlock>
      )}

      {/* 2. Integration — where this sits in the broader flow. */}
      {entry.whenToUse && (
        <SectionBlock heading="Integration · Tích hợp / Khi dùng" id="integration">
          <Bilingual en={entry.whenToUse.en} vi={entry.whenToUse.vi} />
        </SectionBlock>
      )}

      {/* 3. Prerequisites — what must exist / be true first. */}
      {entry.preRequisites?.length > 0 && (
        <SectionBlock heading="Prerequisites · Điều kiện tiên quyết" id="prereq">
          <ul className="help-list">
            {entry.preRequisites.map((s, i) => <BiItem key={i} value={s} />)}
          </ul>
        </SectionBlock>
      )}

      {/* 4. Features — capabilities the screen exposes (SAP-style bullets). */}
      {entry.features?.length > 0 && (
        <SectionBlock heading="Features · Tính năng" id="features">
          <ul className="help-list">
            {entry.features.map((f, i) => <BiItem key={i} value={f} icon="▸" />)}
          </ul>
        </SectionBlock>
      )}

      {/* 5. Procedure (activities). Legacy `workflow` array renders as
          flat steps; `procedures` array renders as grouped activities. */}
      {entry.workflow?.length > 0 && (
        <SectionBlock heading="Procedure · Thao tác" id="workflow">
          <ol className="help-list help-list-num">
            {entry.workflow.map((s, i) => <BiItem key={i} value={s} />)}
          </ol>
        </SectionBlock>
      )}

      {entry.procedures?.length > 0 && (
        <SectionBlock heading="Procedure · Thao tác" id="procedures">
          <div className="help-procedures">
            {entry.procedures.map((prc, i) => (
              <div key={i} className="help-procedure">
                <h4 className="help-procedure-title">
                  <span className="help-procedure-num">{i + 1}.</span>
                  <span>{prc.title.vi}</span>
                  <span className="help-procedure-en">({prc.title.en})</span>
                </h4>
                {prc.note && (
                  <div className="help-procedure-note">
                    <b>Note · Lưu ý:</b>
                    {prc.note.en && <div>{prc.note.en}</div>}
                    {prc.note.vi && prc.note.vi !== prc.note.en && (
                      <div className="help-procedure-note-vi">{prc.note.vi}</div>
                    )}
                  </div>
                )}
                <ol className="help-list help-list-num">
                  {prc.steps.map((s, j) => <BiItem key={j} value={s} />)}
                </ol>
                {prc.screenshot && (
                  <img
                    src={`/help/screenshots/${prc.screenshot}`}
                    alt={prc.title.en}
                    className="help-screenshot help-screenshot-sm"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      {entry.appendices?.length > 0 && (
        <SectionBlock heading="Appendix · Phụ lục" id="appendices">
          {entry.appendices.map((app, i) => (
            <div key={i} className="help-appendix">
              <div className="help-appendix-title">
                {String.fromCharCode(65 + i)}. {app.title.vi} <span className="help-title-en">({app.title.en})</span>
              </div>
              <table className="help-table">
                <thead>
                  <tr>
                    {app.columns.map((c) => (
                      <th key={c.key}>
                        {c.vi || c.en}
                        {c.vi && c.en && c.vi !== c.en && <div className="help-col-en">{c.en}</div>}
                      </th>
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
        <SectionBlock heading="Screenshot · Ảnh minh hoạ" id="screenshot">
          <img
            src={`/help/screenshots/${entry.screenshot}`}
            alt={entry.title.en}
            className="help-screenshot"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div className="help-screenshot-caption">
            <div>Screenshot for <code>{entry.id}</code>. If missing, run the screenshot capture script (see CLAUDE.md).</div>
            <div className="help-caption-vi">Ảnh minh hoạ cho <code>{entry.id}</code>. Nếu thiếu, chạy script chụp screenshot (xem CLAUDE.md).</div>
          </div>
        </SectionBlock>
      )}

      {entry.keyFields?.length > 0 && (
        <SectionBlock heading="Field reference · Trường dữ liệu" id="fields">
          <table className="help-table">
            <thead>
              <tr>
                <th>Field<div className="help-col-en">Trường</div></th>
                <th>Type<div className="help-col-en">Kiểu</div></th>
                <th>Description<div className="help-col-en">Mô tả</div></th>
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
                  <td><code>{asText(f.field) || asText(f.name)}</code>
                    {f.label && (typeof f.label === 'object' || (asText(f.label) !== (asText(f.field) || asText(f.name)))) && (
                      <div className="help-col-en">{asText(f.label)}</div>
                    )}
                  </td>
                  <td><span className="help-type">{asText(f.type)}</span></td>
                  <td><FlexBilingual value={f.notes ?? f.desc} tag="div" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionBlock>
      )}

      {entry.formulas?.length > 0 && (
        <SectionBlock heading="Formulas · Công thức" id="formulas">
          <div className="help-formulas">
            {entry.formulas.map((f, i) => (
              <div key={i} className="help-formula">
                {/* Sprint 1.6 — name + notes may be bi() bilingual objects
                    OR plain strings depending on the entry's vintage.
                    asText() / FlexBilingual coerce safely so the page
                    no longer crashes on the bilingual variants. */}
                <div className="help-formula-name">{asText(f.name)}</div>
                <pre className="help-formula-expr"><code>{asText(f.expr) || asText(f.formula)}</code></pre>
                {f.meaning && (
                  <div className="help-formula-meaning">
                    <span className="help-formula-label">Ý nghĩa · Meaning:</span>
                    {typeof f.meaning === 'string' ? f.meaning : (f.meaning.vi || f.meaning.en)}
                  </div>
                )}
                {f.example && (
                  <div className="help-formula-example">
                    <span className="help-formula-label">Ví dụ · Example:</span>
                    <pre><code>{asText(f.example)}</code></pre>
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
        <SectionBlock heading="Example · Ví dụ" id="example">
          <div className="help-example">
            {entry.example.scenario && (
              <div className="help-example-scenario">
                <span className="help-example-label">Scenario · Tình huống:</span>
                {typeof entry.example.scenario === 'object'
                  ? <Bilingual en={entry.example.scenario.en} vi={entry.example.scenario.vi} />
                  : entry.example.scenario}
              </div>
            )}
            {Array.isArray(entry.example.steps) && entry.example.steps.length > 0 && (
              <ol className="help-list help-list-num">
                {entry.example.steps.map((s, i) => <BiItem key={i} value={s} />)}
              </ol>
            )}
            {entry.example.expected && (
              <div className="help-example-expected">
                <span className="help-example-label">Expected result · Kết quả mong đợi:</span>
                {typeof entry.example.expected === 'object'
                  ? <Bilingual en={entry.example.expected.en} vi={entry.example.expected.vi} />
                  : entry.example.expected}
              </div>
            )}
          </div>
        </SectionBlock>
      )}

      {/* 12. Result — what the user achieves after completing the procedure. */}
      {entry.result && (
        <SectionBlock heading="Result · Kết quả đạt được" id="result">
          <Bilingual en={entry.result.en} vi={entry.result.vi} />
        </SectionBlock>
      )}

      {/* 13. Constraints — pitfalls renamed to SAP terminology. */}
      {(entry.constraints?.length > 0 || entry.pitfalls?.length > 0) && (
        <SectionBlock heading="Constraints · Hạn chế & lỗi thường gặp" id="constraints">
          <ul className="help-list help-list-pit">
            {(entry.constraints || []).map((s, i) => <BiItem key={`c-${i}`} value={s} icon="⚠️" />)}
            {(entry.pitfalls || []).map((s, i) => <BiItem key={`p-${i}`} value={s} icon="⚠️" />)}
          </ul>
        </SectionBlock>
      )}

      {/* 14. Best practices — tips renamed. */}
      {entry.tips?.length > 0 && (
        <SectionBlock heading="Best practices · Thực hành tốt" id="tips">
          <ul className="help-list help-list-tips">
            {entry.tips.map((s, i) => <BiItem key={i} value={s} icon="💡" />)}
          </ul>
        </SectionBlock>
      )}

      {/* 15. See also — relatedTabs renamed to SAP terminology. */}
      {entry.relatedTabs?.length > 0 && (
        <SectionBlock heading="See also · Xem thêm" id="see-also">
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
                  {rel.title.vi} <span className="help-related-en">({rel.title.en})</span>
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
  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? GLOSSARY.filter(g => `${g.term} ${g.en} ${g.vi}`.toLowerCase().includes(q))
    : GLOSSARY;
  return (
    <article className="help-content">
      <header className="help-content-header">
        <div className="help-breadcrumb">GLOSSARY · TỪ ĐIỂN</div>
        <h2 className="help-content-title">
          <span className="help-title-en">Glossary</span>
          <span className="help-title-vi">Từ điển chuyên ngành</span>
        </h2>
        <dl className="help-meta-row">
          <dt>Count · Số lượng</dt>
          <dd>{filtered.length} / {GLOSSARY.length} terms · thuật ngữ</dd>
        </dl>
      </header>
      <SectionBlock heading="Domain terms · Thuật ngữ" id="glossary-terms">
        <dl className="help-glossary">
          {filtered.map(g => (
            <div key={g.term} className="help-glossary-entry">
              <dt className="help-glossary-term">{g.term}</dt>
              <dd>
                <div className="help-bi-en">{g.en}</div>
                {g.vi && g.vi !== g.en && <div className="help-bi-vi">{g.vi}</div>}
              </dd>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="help-glossary-empty">
              <div>No terms match &quot;{query}&quot;</div>
              <div className="help-empty-vi">Không có thuật ngữ khớp với &quot;{query}&quot;</div>
            </div>
          )}
        </dl>
      </SectionBlock>
    </article>
  );
}

export default function HelpTab() {
  // Deep-link: any tab can set window.__helpTarget to a help entry id
  // before navigating here via F1. We read it on mount + on each focus
  // to support the use-F1-twice case (close + re-open with a new target).
  const initialId = (typeof window !== 'undefined' && window.__helpTarget && HELP_CONTENT[window.__helpTarget])
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
      const hits = index[section].filter(e => matchesQuery(e, query));
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
    <div className="help-tab" role="region" aria-label="Help">
      <div className="help-toolbar">
        <div className="help-toolbar-left">
          <h2 className="help-page-title">Help · Hướng dẫn sử dụng</h2>
          <span className="help-tip-pill">
            Tip · Mẹo: press <kbd>F1</kbd> inside any tab to jump here · nhấn <kbd>F1</kbd> ở bất kỳ tab nào để mở Help
          </span>
          <span className="help-version-pill" title={`Updated · Cập nhật ${HELP_META.lastUpdated}`}>
            {HELP_META.version} · {HELP_META.totalEntries} entries · mục
          </span>
        </div>
        <div className="help-toolbar-right">
          <button type="button" className="help-btn" onClick={handleExport}>
            ⬇ Word
          </button>
          <button type="button" className="help-btn help-btn-ghost" onClick={handlePrint}>
            🖨 Print
          </button>
        </div>
      </div>

      <div className="help-body">
        <aside className="help-sidebar">
          <input
            type="search"
            className="help-search"
            placeholder="Search · Tìm kiếm (keyword, field name, formula)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search help topics · Tìm chủ đề trợ giúp"
          />
          <nav className="help-index" aria-label="Help sections">
            {/* Glossary — always visible at the top of the index. SAP
                convention: domain vocabulary is a first-class reference,
                not a nested appendix. */}
            <div className="help-index-section">
              <div className="help-index-section-label">
                Từ điển <span className="help-index-section-en">(Glossary)</span>
              </div>
              <button
                type="button"
                className={`help-index-item ${selected === '__glossary' ? 'active' : ''}`}
                onClick={() => setSelected('__glossary')}
              >
                <span className="help-index-vi">Từ điển chuyên ngành</span>
                <span className="help-index-en">Glossary · {GLOSSARY.length} terms</span>
              </button>
            </div>

            {HELP_SECTIONS.map((s) => {
              const entries = shownIndex[s.key] || [];
              if (entries.length === 0) return null;
              return (
                <div key={s.key} className="help-index-section">
                  <div className="help-index-section-label">
                    {s.label.vi} <span className="help-index-section-en">({s.label.en})</span>
                  </div>
                  {entries.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className={`help-index-item ${e.id === selected ? 'active' : ''}`}
                      onClick={() => setSelected(e.id)}
                    >
                      <span className="help-index-vi">{e.title.vi}</span>
                      <span className="help-index-en">{e.title.en}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            {Object.keys(shownIndex).length === 0 && (
              <div className="help-index-empty">No results · Không tìm thấy</div>
            )}
          </nav>
        </aside>

        <main className="help-main" ref={contentRef}>
          {selected === '__glossary'
            ? <GlossaryView query={query} />
            : <HelpContentView entry={selectedEntry} onRelatedClick={setSelected} />}
        </main>
      </div>
    </div>
  );
}
