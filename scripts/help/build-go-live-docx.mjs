/**
 * build-go-live-docx.mjs — convert docs/GO_LIVE_GUIDE.md → DOCX.
 *
 * Outputs:
 *   - client/public/help/OpsControl_GoLiveGuide_v1.2.docx   (canonical, inside worktree)
 *   - 4. CLAUDE OUTPUT/OpsControl_GoLiveGuide_v1.2.docx     (optional review mirror,
 *                                                            only when sibling dir is
 *                                                            writable — assumes CCL
 *                                                            Cowork layout. Skipped
 *                                                            silently on /tmp builds,
 *                                                            fresh clones, foreign hosts.)
 *
 * Override the mirror target with OPS_DOCS_MIRROR_DIR if needed.
 *
 * Reads the markdown source, parses headings (#, ##, ###), paragraphs,
 * tables, lists, code blocks, and renders them with consistent styling
 * via the `docx` npm package (already a dep, used by build-user-guide.mjs).
 *
 * Run:
 *   node scripts/help/build-go-live-docx.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Footer,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  PageNumber,
  PageBreak,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'docs', 'GO_LIVE_GUIDE.md');

// Canonical output — always inside the worktree, always succeeds.
const PUBLIC_OUT = path.join(ROOT, 'client', 'public', 'help', 'OpsControl_GoLiveGuide_v1.2.docx');

// Optional review mirror to the sibling "4. CLAUDE OUTPUT/" dir used by the
// canonical CCL Cowork layout. Override with OPS_DOCS_MIRROR_DIR; skipped
// when the target parent isn't writable (e.g. /tmp/ worktrees, fresh clones).
const MIRROR_DIR = process.env.OPS_DOCS_MIRROR_DIR
  ? path.resolve(process.env.OPS_DOCS_MIRROR_DIR)
  : path.resolve(ROOT, '..', '..', '4. CLAUDE OUTPUT');
const MIRROR_FILE = path.join(MIRROR_DIR, 'OpsControl_GoLiveGuide_v1.2.docx');

if (!fs.existsSync(SRC)) {
  console.error('[build-go-live-docx] source not found:', SRC);
  process.exit(1);
}

const md = fs.readFileSync(SRC, 'utf-8');

// ── Style constants ──────────────────────────────────────────────
const FONT = 'Arial';
const COLOR_ACCENT = '1E40AF'; // IBM blue 80
const COLOR_HEAD_BG = 'E0E7FF';
const COLOR_CODE_BG = 'F3F4F6';
const COLOR_NOTE_BG = 'FFFBEB'; // warm yellow for blockquotes
const COLOR_BORDER = 'D1D5DB';

const bd = { style: BorderStyle.SINGLE, size: 6, color: COLOR_BORDER };
const allBorders = { top: bd, bottom: bd, left: bd, right: bd };

// ── Helpers ──────────────────────────────────────────────────────

// Basic inline formatting: **bold**, `code`, and links [text](url).
// Returns array of TextRun.
function inlineRuns(text, baseOpts = {}) {
  const runs = [];
  let i = 0;
  const flush = (s, opts = {}) => {
    if (!s) return;
    runs.push(new TextRun({ text: s, font: FONT, size: 20, ...baseOpts, ...opts }));
  };
  while (i < text.length) {
    // Bold **...**
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > 0) {
        flush(text.slice(i + 2, end), { bold: true });
        i = end + 2;
        continue;
      }
    }
    // Inline code `...`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > 0) {
        flush(text.slice(i + 1, end), {
          font: 'Consolas',
          shading: { type: ShadingType.CLEAR, fill: COLOR_CODE_BG, color: 'auto' },
        });
        i = end + 1;
        continue;
      }
    }
    // Markdown link [text](url) — just keep text portion (docx hyperlinks are heavier; skip for now)
    if (text[i] === '[') {
      const linkEnd = text.indexOf(']', i);
      const parenStart = text.indexOf('(', linkEnd);
      const parenEnd = text.indexOf(')', parenStart);
      if (linkEnd > i && parenStart === linkEnd + 1 && parenEnd > parenStart) {
        const linkText = text.slice(i + 1, linkEnd);
        flush(linkText, { color: COLOR_ACCENT, underline: {} });
        i = parenEnd + 1;
        continue;
      }
    }
    // Italic *...* (single asterisk, not double)
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end > 0 && text[end + 1] !== '*') {
        flush(text.slice(i + 1, end), { italics: true });
        i = end + 1;
        continue;
      }
    }
    // Plain char accumulator
    let j = i;
    while (j < text.length && !'*`['.includes(text[j])) j++;
    if (j === i) j++; // edge case: lone special char
    flush(text.slice(i, j));
    i = j;
  }
  return runs.length ? runs : [new TextRun({ text, font: FONT, size: 20, ...baseOpts })];
}

const para = (text, opts = {}) =>
  new Paragraph({
    children: inlineRuns(text, opts.runOpts),
    spacing: { before: 80, after: 80 },
    ...opts,
  });

const heading = (text, level) => {
  const sizes = { 1: 36, 2: 28, 3: 22 }; // 18pt / 14pt / 11pt
  const colors = { 1: COLOR_ACCENT, 2: COLOR_ACCENT, 3: '111111' };
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        font: FONT,
        size: sizes[level] || 22,
        color: colors[level] || '000000',
      }),
    ],
    heading:
      level === 1
        ? HeadingLevel.HEADING_1
        : level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3,
    spacing: { before: level === 1 ? 360 : 240, after: level === 1 ? 180 : 120 },
    pageBreakBefore: level === 1,
  });
};

const codeBlock = (lines) =>
  new Paragraph({
    children: lines.flatMap((line, i) => [
      new TextRun({ text: line, font: 'Consolas', size: 18 }),
      ...(i < lines.length - 1 ? [new TextRun({ break: 1 })] : []),
    ]),
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: COLOR_CODE_BG, color: 'auto' },
    border: { top: bd, bottom: bd, left: bd, right: bd },
    indent: { left: 200, right: 200 },
  });

const blockquote = (text) =>
  new Paragraph({
    children: inlineRuns(text, { italics: true }),
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: COLOR_NOTE_BG, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: 'F59E0B' } },
    indent: { left: 240 },
  });

const bullet = (text, level = 0) =>
  new Paragraph({
    children: inlineRuns(text),
    bullet: { level },
    spacing: { before: 40, after: 40 },
  });

// Table parser — `| col | col |` rows, separator `|---|---|`
function parseTable(rows) {
  // First row = header, rest = body. Skip the separator row.
  const splitCells = (line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((s) => s.trim());
  const header = splitCells(rows[0]);
  const body = rows.slice(2).map(splitCells); // skip separator at index 1

  const headerRow = new TableRow({
    tableHeader: true,
    children: header.map(
      (h) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: COLOR_HEAD_BG, color: 'auto' },
          borders: allBorders,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: h, bold: true, font: FONT, size: 18, color: COLOR_ACCENT }),
              ],
            }),
          ],
        })
    ),
  });

  const bodyRows = body.map(
    (cells) =>
      new TableRow({
        children: cells.map(
          (c) =>
            new TableCell({
              borders: allBorders,
              children: [new Paragraph({ children: inlineRuns(c) })],
            })
        ),
      })
  );

  return new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: bd,
      bottom: bd,
      left: bd,
      right: bd,
      insideHorizontal: bd,
      insideVertical: bd,
    },
  });
}

// ── Markdown parser ──────────────────────────────────────────────
function parse(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines (they're paragraph separators, no output)
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(3, h[1].length);
      blocks.push(heading(h[2], level));
      i++;
      continue;
    }

    // Horizontal rule — emit a thin paragraph spacer
    if (/^-{3,}\s*$/.test(line) || /^\*{3,}\s*$/.test(line)) {
      blocks.push(
        new Paragraph({
          children: [new TextRun({ text: '' })],
          border: { bottom: bd },
          spacing: { before: 60, after: 60 },
        })
      );
      i++;
      continue;
    }

    // Code block ```lang ... ```
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      if (codeLines.length) blocks.push(codeBlock(codeLines));
      continue;
    }

    // Blockquote >
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(blockquote(buf.join(' ')));
      continue;
    }

    // Table — at least 2 lines starting with | and second is separator
    if (line.startsWith('|') && lines[i + 1] && /^\|[\s\-|]+\|/.test(lines[i + 1])) {
      const tblRows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tblRows.push(lines[i]);
        i++;
      }
      if (tblRows.length >= 2) blocks.push(parseTable(tblRows));
      continue;
    }

    // Bullet list (`- ` or `* `, optionally indented for nested)
    const bulletM = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletM) {
      const indent = bulletM[1].length;
      const level = indent >= 4 ? 1 : 0;
      blocks.push(bullet(bulletM[2], level));
      i++;
      continue;
    }

    // Numbered list `1. text`
    const numM = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (numM) {
      blocks.push(
        new Paragraph({
          children: inlineRuns(numM[2]),
          numbering: { reference: 'numbered', level: 0 },
          spacing: { before: 40, after: 40 },
        })
      );
      i++;
      continue;
    }

    // Default: paragraph (collapse consecutive non-block lines into one para)
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^(#|>|```|-{3,}|\d+\.|[-*]\s|\|)/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(para(paraLines.join(' ')));
  }
  return blocks;
}

// ── Build document ───────────────────────────────────────────────
const blocks = parse(md);

const doc = new Document({
  creator: 'Henry Dang — NPI Manager',
  title: 'Ops Control v1.2 — Hướng dẫn Go-Live toàn diện',
  description: 'CCL Design Vietnam — Integrated Cost & Planning Platform',
  styles: {
    default: {
      document: { run: { font: FONT, size: 20 } },
    },
  },
  numbering: {
    config: [
      {
        reference: 'numbered',
        levels: [
          {
            level: 0,
            format: 'decimal',
            text: '%1.',
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 360, hanging: 260 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: 'Ops Control v1.2 — Go-Live Guide · Henry Dang — NPI Manager · CCL Design Vietnam · ',
                  font: FONT,
                  size: 16,
                  color: '6B7280',
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: FONT,
                  size: 16,
                  color: '6B7280',
                }),
                new TextRun({ text: ' / ', font: FONT, size: 16, color: '6B7280' }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  font: FONT,
                  size: 16,
                  color: '6B7280',
                }),
              ],
            }),
          ],
        }),
      },
      children: blocks,
    },
  ],
});

// ── Write file ───────────────────────────────────────────────────
const buf = await Packer.toBuffer(doc);

// Canonical write — always inside the worktree, must succeed.
fs.mkdirSync(path.dirname(PUBLIC_OUT), { recursive: true });
fs.writeFileSync(PUBLIC_OUT, buf);

// Optional review mirror — skip silently when the parent isn't writable
// (e.g. running from a /tmp worktree where /private/4. CLAUDE OUTPUT/
// doesn't exist or isn't writable without sudo).
let mirrored = false;
try {
  fs.accessSync(path.dirname(MIRROR_DIR), fs.constants.W_OK);
  fs.mkdirSync(MIRROR_DIR, { recursive: true });
  fs.writeFileSync(MIRROR_FILE, buf);
  mirrored = true;
} catch (e) {
  console.log(`[build-go-live-docx] mirror dir not writable, skipping: ${MIRROR_DIR}`);
}

const sizeKb = (buf.length / 1024).toFixed(1);
console.log(`[build-go-live-docx] wrote ${PUBLIC_OUT}`);
if (mirrored) console.log(`[build-go-live-docx] mirrored to ${MIRROR_FILE}`);
console.log(`                     blocks=${blocks.length}  size=${sizeKb} KB`);
