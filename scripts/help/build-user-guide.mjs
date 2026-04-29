/**
 * Build OpsControl_UserGuide.docx — reads the same content.js that
 * powers the in-app Help tab, so the Word file is always in sync
 * with what users see on screen.
 *
 * Usage:
 *   node scripts/help/build-user-guide.mjs
 *
 * Output: client/public/help/OpsControl_UserGuide.docx
 *   (also mirrored into 4. CLAUDE OUTPUT for reviewer convenience)
 *
 * The Help tab's "⬇ Word" button serves this file directly from
 * /help/OpsControl_UserGuide.docx — so rebuilding the guide is a
 * one-shot step after any content change. Run this in the deploy
 * pipeline after `npm run build` so the served bundle ships the
 * latest .docx with every release.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, TabStopType, TabStopPosition,
  PageBreak, TableOfContents, Bookmark, InternalHyperlink,
  PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo,
  PositionalTabLeader,
} from 'docx';

// ── Import the single source of truth ─────────────────────────────
// content.js is an ES module; Node 20+ imports it natively.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_PATH = path.resolve(__dirname, '../../client/src/help/content.js');
const { HELP_SECTIONS, getAllEntries, HELP_CONTENT, HELP_META } = await import(CONTENT_PATH);

// ── Style constants — mirror the in-app CSS palette ──────────────
const FONT = 'Arial';
const COLOR_ACCENT = '1E40AF';
const COLOR_HEAD_BG = 'E0E7FF';
const COLOR_TIP_BG = 'FFFBEB';
const COLOR_PIT_BG = 'FEF2F2';
const COLOR_CODE_BG = 'F3F4F6';

const bd = { style: BorderStyle.SINGLE, size: 6, color: 'D1D5DB' };
const allBorders = { top: bd, bottom: bd, left: bd, right: bd };

// ── Paragraph builders ────────────────────────────────────────────
const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({
    text, font: FONT,
    size: opts.size ?? 22,
    bold: opts.bold, italics: opts.italics, color: opts.color,
  })],
  spacing: opts.spacing ?? { before: 60, after: 60 },
  alignment: opts.alignment,
});

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: COLOR_ACCENT })],
  spacing: { before: 400, after: 160 },
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: '111827' })],
  spacing: { before: 280, after: 120 },
});

const h3 = (text, color = COLOR_ACCENT) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [new TextRun({ text, font: FONT, size: 22, bold: true, color })],
  spacing: { before: 200, after: 80 },
});

// Bilingual-aware paragraph: accepts either a plain string (EN-only)
// or a { en, vi } object. When bilingual, EN is on line 1 + VI on
// line 2 (italic gray) — matches the in-app BiItem renderer.
const biChildren = (value) => {
  if (value && typeof value === 'object') {
    const parts = [new TextRun({ text: value.en || '', font: FONT, size: 22 })];
    if (value.vi && value.vi !== value.en) {
      parts.push(new TextRun({ text: '\n' + value.vi, font: FONT, size: 20, italics: true, color: '6B7280', break: 1 }));
    }
    return parts;
  }
  return [new TextRun({ text: String(value ?? ''), font: FONT, size: 22 })];
};

const bullet = (text) => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  children: biChildren(text),
  spacing: { before: 30, after: 30 },
});

const numbered = (text) => new Paragraph({
  numbering: { reference: 'numbers', level: 0 },
  children: biChildren(text),
  spacing: { before: 30, after: 30 },
});

const code = (text) => new Paragraph({
  children: [new TextRun({ text, font: 'Consolas', size: 20 })],
  shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
  spacing: { before: 30, after: 30 },
});

const callout = (emoji, text, bgColor) => {
  const children = [];
  if (text && typeof text === 'object') {
    children.push(new TextRun({ text: `${emoji} ${text.en || ''}`, font: FONT, size: 22 }));
    if (text.vi && text.vi !== text.en) {
      children.push(new TextRun({ text: text.vi, font: FONT, size: 20, italics: true, color: '6B7280', break: 1 }));
    }
  } else {
    children.push(new TextRun({ text: `${emoji} ${text}`, font: FONT, size: 22 }));
  }
  return new Paragraph({
    children,
    shading: { fill: bgColor, type: ShadingType.CLEAR },
    spacing: { before: 50, after: 50 },
  });
};

// Bilingual helper: EN on top, VN italic underneath.
const bi = (en, vi) => {
  const out = [];
  if (en) out.push(new Paragraph({
    children: [new TextRun({ text: en, font: FONT, size: 22 })],
    spacing: { before: 40, after: 20 },
  }));
  if (vi) out.push(new Paragraph({
    children: [new TextRun({ text: vi, font: FONT, size: 20, italics: true, color: '4B5563' })],
    spacing: { before: 0, after: 60 },
  }));
  return out;
};

// ── Table helpers ────────────────────────────────────────────────
const CONTENT_W = 9026;  // A4 with 1" margins

const cell = (children, opts = {}) => new TableCell({
  borders: allBorders,
  width: { size: opts.width, type: WidthType.DXA },
  shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: Array.isArray(children) ? children : [children],
});

const cellText = (text, opts = {}) => cell(
  new Paragraph({
    children: [new TextRun({ text: String(text ?? ''), font: FONT, size: opts.size ?? 20, bold: opts.bold })],
    alignment: opts.alignment,
  }),
  opts,
);

const buildTable = (widths, rows) => new Table({
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths: widths,
  rows,
});

// ── Per-entry renderer (async for image embedding) ──────────────
async function renderEntryAsync(entry, sectionMeta) {
  // Re-implement with proper awaits for ImageRun import.
  const blocks = [];
  blocks.push(p(`${sectionMeta.label.en} · ${sectionMeta.label.vi}`, { size: 18, bold: true, color: '6B7280' }));
  // H2 heading — Word's TOC field picks this up via HeadingLevel.HEADING_2.
  blocks.push(h2(`${entry.title.vi} — ${entry.title.en}`));

  // IFS-style Function / Path header — two-row table right below the
  // title, exactly like the reference "IFS User Guide - Engineering.docx".
  if (entry.function || entry.path) {
    const headerWidths = [1400, 7626];
    const hdrRows = [];
    if (entry.function) {
      hdrRows.push(new TableRow({ children: [
        cellText('Function', { width: headerWidths[0], bold: true, fill: COLOR_HEAD_BG }),
        cellText(`${entry.function.en}${entry.function.vi ? '  ·  ' + entry.function.vi : ''}`,
          { width: headerWidths[1] }),
      ]}));
    }
    if (entry.path) {
      hdrRows.push(new TableRow({ children: [
        cellText('Path', { width: headerWidths[0], bold: true, fill: COLOR_HEAD_BG }),
        cell(new Paragraph({
          children: [new TextRun({ text: entry.path, font: 'Consolas', size: 20 })],
          shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
        }), { width: headerWidths[1] }),
      ]}));
    }
    blocks.push(buildTable(headerWidths, hdrRows));
    blocks.push(p('', { spacing: { before: 40, after: 60 } }));
  }

  if (entry.purpose) { blocks.push(h3('Purpose · Mục đích')); blocks.push(...bi(entry.purpose.en, entry.purpose.vi)); }
  if (entry.whenToUse) { blocks.push(h3('When to use · Khi nào dùng')); blocks.push(...bi(entry.whenToUse.en, entry.whenToUse.vi)); }

  if (entry.preRequisites?.length) {
    blocks.push(h3('Prerequisites · Điều kiện'));
    for (const item of entry.preRequisites) blocks.push(bullet(item));
  }
  if (entry.workflow?.length) {
    blocks.push(h3('Workflow · Quy trình'));
    for (const step of entry.workflow) blocks.push(numbered(step));
  }

  // IFS-style Procedures — one sub-heading per form panel, each with
  // optional Note + numbered steps + optional inline screenshot.
  if (entry.procedures?.length) {
    blocks.push(h3('Procedures · Thao tác chi tiết'));
    for (let i = 0; i < entry.procedures.length; i++) {
      const prc = entry.procedures[i];
      blocks.push(new Paragraph({
        heading: HeadingLevel.HEADING_4,
        children: [new TextRun({
          text: `${i + 1}. ${prc.title.vi} — ${prc.title.en}`,
          font: FONT, size: 22, bold: true, color: '1E3A8A',
        })],
        spacing: { before: 200, after: 60 },
      }));
      if (prc.note) {
        const noteText = prc.note.vi || prc.note.en || '';
        blocks.push(new Paragraph({
          children: [
            new TextRun({ text: 'Note: ', font: FONT, size: 20, bold: true, italics: true, color: '92400E' }),
            new TextRun({ text: noteText, font: FONT, size: 20, italics: true, color: '78350F' }),
          ],
          shading: { fill: 'FEF9C3', type: ShadingType.CLEAR },
          spacing: { before: 30, after: 60 },
        }));
      }
      for (const stp of prc.steps) blocks.push(numbered(stp));
      // Optional per-procedure screenshot — embeds inline after the steps.
      if (prc.screenshot) {
        const shotPath = path.resolve(__dirname, '../../client/public/help/screenshots', prc.screenshot);
        if (fs.existsSync(shotPath)) {
          const { ImageRun } = await import('docx');
          blocks.push(new Paragraph({
            children: [new ImageRun({
              type: 'png', data: fs.readFileSync(shotPath),
              transformation: { width: 500, height: 312 },
              altText: { title: prc.title.en, description: `Procedure: ${prc.title.en}`, name: `proc_${entry.id}_${i}` },
            })],
            spacing: { before: 80, after: 120 },
            alignment: AlignmentType.CENTER,
          }));
        }
      }
    }
  }

  if (entry.screenshot) {
    const shotPath = path.resolve(__dirname, '../../client/public/help/screenshots', entry.screenshot);
    if (fs.existsSync(shotPath)) {
      const { ImageRun } = await import('docx');
      blocks.push(new Paragraph({
        children: [new ImageRun({
          type: 'png',
          data: fs.readFileSync(shotPath),
          transformation: { width: 600, height: 375 },
          altText: { title: entry.title.en, description: `Screenshot of ${entry.id}`, name: entry.id },
        })],
        spacing: { before: 200, after: 200 },
        alignment: AlignmentType.CENTER,
      }));
    } else {
      blocks.push(p(`[Screenshot pending: ${entry.screenshot}]`, { size: 18, italics: true, color: '9CA3AF' }));
    }
  }

  if (entry.keyFields?.length) {
    blocks.push(h3('Key fields · Trường quan trọng'));
    const widths = [2400, 1800, 4826];
    const rows = [new TableRow({
      tableHeader: true,
      children: [
        cellText('Field',       { width: widths[0], bold: true, fill: COLOR_HEAD_BG }),
        cellText('Type',        { width: widths[1], bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
        cellText('Description', { width: widths[2], bold: true, fill: COLOR_HEAD_BG }),
      ],
    })];
    for (const f of entry.keyFields) {
      rows.push(new TableRow({ children: [
        cellText(f.name, { width: widths[0], bold: true }),
        cellText(f.type, { width: widths[1], alignment: AlignmentType.CENTER }),
        cellText(f.desc, { width: widths[2] }),
      ]}));
    }
    blocks.push(buildTable(widths, rows));
    blocks.push(p('', { spacing: { before: 60, after: 60 } }));
  }

  if (entry.formulas?.length) {
    blocks.push(h3('Formulas · Công thức'));
    for (const f of entry.formulas) {
      blocks.push(p(f.name, { bold: true, size: 22 }));
      blocks.push(code(f.expr));
      if (f.meaning) {
        const meaningText = typeof f.meaning === 'string' ? f.meaning : (f.meaning.vi || f.meaning.en);
        blocks.push(new Paragraph({
          children: [
            new TextRun({ text: 'Ý nghĩa · Meaning: ', font: FONT, size: 20, bold: true, color: '1E3A8A' }),
            new TextRun({ text: meaningText, font: FONT, size: 20, color: '1E3A8A' }),
          ],
          shading: { fill: 'EFF6FF', type: ShadingType.CLEAR },
          spacing: { before: 40, after: 40 },
        }));
      }
      if (f.example) {
        blocks.push(new Paragraph({
          children: [
            new TextRun({ text: 'Ví dụ · Example: ', font: FONT, size: 20, bold: true, color: '14532D' }),
          ],
          shading: { fill: 'F0FDF4', type: ShadingType.CLEAR },
          spacing: { before: 40, after: 20 },
        }));
        blocks.push(new Paragraph({
          children: [new TextRun({ text: f.example, font: 'Consolas', size: 19, color: '14532D' })],
          shading: { fill: 'F0FDF4', type: ShadingType.CLEAR },
          spacing: { before: 0, after: 40 },
          indent: { left: 240 },
        }));
      }
      if (f.notes) blocks.push(p(f.notes, { size: 20, italics: true, color: '6B7280' }));
    }
  }

  if (entry.tips?.length) {
    blocks.push(h3('Tips · Mẹo'));
    for (const t of entry.tips) blocks.push(callout('💡', t, COLOR_TIP_BG));
  }
  if (entry.pitfalls?.length) {
    blocks.push(h3('Pitfalls · Lỗi thường gặp'));
    for (const t of entry.pitfalls) blocks.push(callout('⚠️', t, COLOR_PIT_BG));
  }

  // IFS-style Appendices — bordered reference tables.
  if (entry.appendices?.length) {
    blocks.push(h3('Appendices · Phụ lục'));
    for (let i = 0; i < entry.appendices.length; i++) {
      const app = entry.appendices[i];
      const letter = String.fromCharCode(65 + i);
      blocks.push(p(`${letter}. ${app.title.vi} — ${app.title.en}`,
        { bold: true, size: 22, color: '1E40AF', spacing: { before: 120, after: 60 } }));
      const colCount = app.columns.length;
      const colWidth = Math.floor(CONTENT_W / colCount);
      const widths = Array(colCount).fill(colWidth);
      const rows = [new TableRow({
        tableHeader: true,
        children: app.columns.map(c => cellText(
          c.vi || c.en,
          { width: colWidth, bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER },
        )),
      })];
      for (const r of app.rows) {
        rows.push(new TableRow({ children: app.columns.map(c => cellText(String(r[c.key] ?? ''), { width: colWidth })) }));
      }
      blocks.push(buildTable(widths, rows));
      blocks.push(p('', { spacing: { before: 60, after: 60 } }));
    }
  }

  if (entry.relatedTabs?.length) {
    blocks.push(h3('Related · Liên quan'));
    const related = entry.relatedTabs.map(rid => HELP_CONTENT[rid]).filter(Boolean)
      .map(r => `• ${r.title.vi} (${r.title.en})`);
    for (const line of related) blocks.push(p(line, { size: 20 }));
  }

  blocks.push(new Paragraph({ children: [new PageBreak()] }));
  return blocks;
}

// ── Build all sections ───────────────────────────────────────────
const allEntries = getAllEntries();
const sectionMap = Object.fromEntries(HELP_SECTIONS.map(s => [s.key, s]));

// Title page
const titlePage = [
  new Paragraph({
    children: [new TextRun({ text: 'Ops Control', font: FONT, size: 64, bold: true, color: COLOR_ACCENT })],
    spacing: { before: 1800, after: 180 },
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Hướng dẫn Sử dụng', font: FONT, size: 40, bold: true })],
    spacing: { after: 120 },
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: 'User Guide', font: FONT, size: 28, color: '4B5563' })],
    spacing: { after: 1000 },
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: 'CCL Design Vietnam', font: FONT, size: 22, bold: true })],
    spacing: { after: 80 }, alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({
      text: `${HELP_META?.totalEntries || allEntries.length} entries · ${HELP_META?.version || 'current'} · ${HELP_META?.lastUpdated || new Date().toISOString().slice(0, 10)}`,
      font: FONT, size: 20, color: '6B7280',
    })],
    spacing: { after: 80 }, alignment: AlignmentType.CENTER,
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Table of contents ───────────────────────────────────────────
// Uses Word's built-in TOC field. When the user opens the .docx in
// Word / LibreOffice and clicks "Update Field", the TOC auto-populates
// from every HEADING_1 and HEADING_2 in the body — honoring live page
// numbers AND hyperlinks to the heading anchors. We avoid hand-built
// Bookmark components because docx-js has a known issue where multiple
// Bookmarks can emit colliding internal numeric ids, failing strict
// validation (and some Word versions render the second collision as a
// dead link).
const indexHeader = [h1('Table of contents · Mục lục')];
indexHeader.push(new TableOfContents('Click this line, then press F9 in Word (or Tools → Update) to populate.', {
  hyperlink: true,
  headingStyleRange: '1-2',
}));
indexHeader.push(p('— A plain index follows for viewers that don\'t auto-update fields —',
  { size: 18, italics: true, color: '6B7280', alignment: AlignmentType.CENTER }));

// Plain fallback index: visible everywhere, even in Google Docs /
// Preview.app which don't run the TOC field on first open.
const indexItems = [];
for (const sec of HELP_SECTIONS) {
  const entries = allEntries.filter(e => e.section === sec.key);
  if (entries.length === 0) continue;
  indexItems.push(p(`${sec.label.en} · ${sec.label.vi}`,
    { bold: true, size: 24, color: COLOR_ACCENT, spacing: { before: 200, after: 80 } }));
  for (const e of entries) {
    indexItems.push(p(`   • ${e.title.vi}  —  ${e.title.en}`, { size: 20 }));
  }
}
indexItems.push(new Paragraph({ children: [new PageBreak()] }));

// Body: one entry per page, H1 per section, H2 per entry (already
// emitted by renderEntryAsync). HEADING_1 / HEADING_2 styles are what
// the TOC field picks up — no Bookmark components needed.
const body = [];
for (const sec of HELP_SECTIONS) {
  const entries = allEntries.filter(e => e.section === sec.key);
  if (entries.length === 0) continue;
  body.push(h1(`${sec.label.en} · ${sec.label.vi}`));
  body.push(p(`${entries.length} tab${entries.length === 1 ? '' : 's'}`,
    { size: 20, italics: true, color: '6B7280' }));
  body.push(new Paragraph({ children: [new PageBreak()] }));
  for (const entry of entries) {
    const blocks = await renderEntryAsync(entry, sec);
    for (const b of blocks) body.push(b);
  }
}

// Footer
const footer = new Footer({
  children: [new Paragraph({
    children: [
      new TextRun({ text: 'Ops Control · User Guide · CCL Design Vietnam', font: FONT, size: 16, color: '6B7280' }),
      new TextRun({ text: '\t', font: FONT, size: 16 }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '6B7280' }),
      new TextRun({ text: ' / ', font: FONT, size: 16, color: '6B7280' }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: '6B7280' }),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
  })],
});

// Assemble
const doc = new Document({
  creator: 'CCL Design Vietnam · Ops Control',
  title: 'Ops Control — User Guide',
  description: 'Auto-generated from client/src/help/content.js',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: COLOR_ACCENT },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: '111827' },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: FONT, color: '374151' },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },  // A4 portrait
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    footers: { default: footer },
    children: [...titlePage, ...indexHeader, ...indexItems, ...body],
  }],
});

// ── Write outputs ────────────────────────────────────────────────
const PUBLIC_OUT = path.resolve(__dirname, '../../client/public/help/OpsControl_UserGuide.docx');
const REVIEW_OUT = path.resolve(__dirname, '../../../../4. CLAUDE OUTPUT/OpsControl_UserGuide.docx');

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(PUBLIC_OUT), { recursive: true });
fs.writeFileSync(PUBLIC_OUT, buffer);
try {
  fs.mkdirSync(path.dirname(REVIEW_OUT), { recursive: true });
  fs.writeFileSync(REVIEW_OUT, buffer);
} catch (e) {
  console.warn(`Could not mirror to review dir: ${e.message}`);
}

const size = (fs.statSync(PUBLIC_OUT).size / 1024).toFixed(1);
console.log(`✓ Wrote ${PUBLIC_OUT} (${size} KB)`);
console.log(`  Sections: ${HELP_SECTIONS.length}`);
console.log(`  Entries:  ${allEntries.length}`);
