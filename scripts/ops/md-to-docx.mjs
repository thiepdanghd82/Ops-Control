#!/usr/bin/env node
/**
 * md-to-docx.mjs — lightweight Markdown → .docx converter for the ops runbooks.
 *
 * No pandoc on the box + no markdown parser in node_modules, so this hand-rolls
 * just the subset used by docs/ops/*.md: H1/H2/H3, paragraphs, **bold**,
 * `inline code`, [text](url), tables, "- " bullets, "- [ ]" checkboxes,
 * ``` fenced code, "> " blockquotes, "---" horizontal rule, emoji.
 *
 * Usage: node scripts/ops/md-to-docx.mjs <in.md> <out.docx> [more pairs...]
 */
import fs from 'node:fs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx';

const MONO = 'Consolas';
const BODY = 'Calibri';

// Inline parser → TextRun[]
function inlineRuns(text, base = {}) {
  const runs = [];
  const re = /(\*\*(.+?)\*\*)|(`([^`]+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let last = 0,
    m;
  const push = (t, opts) => {
    if (t) runs.push(new TextRun({ text: t, font: BODY, ...base, ...opts }));
  };
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index));
    if (m[2] !== undefined) push(m[2], { bold: true });
    else if (m[4] !== undefined)
      runs.push(new TextRun({ text: m[4], font: MONO, color: 'A4262C', ...base }));
    else if (m[6] !== undefined) push(m[6], { color: '0F62FE', underline: {} });
    last = re.lastIndex;
  }
  push(text.slice(last));
  return runs.length ? runs : [new TextRun({ text: '', font: BODY })];
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
function cell(text, { header = false } = {}) {
  return new TableCell({
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: header ? { type: ShadingType.CLEAR, fill: '0F62FE' } : undefined,
    children: [
      new Paragraph({
        children: inlineRuns(text, header ? { bold: true, color: 'FFFFFF' } : {}),
      }),
    ],
  });
}

function mdToBlocks(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.trimStart().startsWith('```')) {
      i++;
      const code = [];
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) code.push(lines[i++]);
      i++; // closing fence
      for (const c of code) {
        blocks.push(
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: 'F2F4F8' },
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: c || ' ', font: MONO, size: 18 })],
          })
        );
      }
      blocks.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      continue;
    }

    // table
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])
    ) {
      const rows = [];
      const split = (l) =>
        l
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((s) => s.trim());
      const header = split(line);
      i += 2; // header + separator
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) body.push(split(lines[i++]));
      rows.push(
        new TableRow({ tableHeader: true, children: header.map((h) => cell(h, { header: true })) })
      );
      for (const r of body)
        rows.push(new TableRow({ children: header.map((_, c) => cell(r[c] ?? '')) }));
      blocks.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: 'C1C7CD' },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: 'C1C7CD' },
            left: { style: BorderStyle.SINGLE, size: 2, color: 'C1C7CD' },
            right: { style: BorderStyle.SINGLE, size: 2, color: 'C1C7CD' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'DDE1E6' },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'DDE1E6' },
          },
        })
      );
      blocks.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }

    // headings
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      blocks.push(
        new Paragraph({
          heading:
            lvl === 1
              ? HeadingLevel.HEADING_1
              : lvl === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          spacing: { before: lvl === 1 ? 240 : 200, after: 100 },
          children: inlineRuns(h[2]),
        })
      );
      i++;
      continue;
    }

    // hr
    if (/^---+\s*$/.test(line) || /^___+\s*$/.test(line)) {
      blocks.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A8A8A8' } },
          spacing: { before: 80, after: 80 },
          children: [],
        })
      );
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      blocks.push(
        new Paragraph({
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: '0F62FE', space: 120 } },
          spacing: { after: 60 },
          children: inlineRuns(line.replace(/^>\s?/, ''), { italics: true, color: '525252' }),
        })
      );
      i++;
      continue;
    }

    // list item (bullet / checkbox / numbered)
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      let txt = li[3];
      const cb = /^\[([ xX])\]\s+(.*)$/.exec(txt);
      let prefix = '';
      if (cb) {
        prefix = cb[1].trim() ? '☑ ' : '☐ ';
        txt = cb[2];
      }
      blocks.push(
        new Paragraph({
          bullet: cb ? undefined : { level: Math.min(2, Math.floor(li[1].length / 2)) },
          indent: cb ? { left: 360 } : undefined,
          spacing: { after: 20 },
          children: inlineRuns(prefix + txt),
        })
      );
      i++;
      continue;
    }

    // blank
    if (line.trim() === '') {
      blocks.push(new Paragraph({ children: [], spacing: { after: 40 } }));
      i++;
      continue;
    }

    // paragraph
    blocks.push(new Paragraph({ spacing: { after: 80 }, children: inlineRuns(line) }));
    i++;
  }
  return blocks;
}

async function convert(inPath, outPath) {
  const md = fs.readFileSync(inPath, 'utf8');
  const doc = new Document({
    styles: {
      default: { document: { run: { font: BODY, size: 21 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', run: { size: 30, bold: true, color: '161616' } },
        { id: 'Heading2', name: 'Heading 2', run: { size: 25, bold: true, color: '0F62FE' } },
        { id: 'Heading3', name: 'Heading 3', run: { size: 22, bold: true, color: '161616' } },
      ],
    },
    sections: [{ properties: {}, children: mdToBlocks(md) }],
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buf);
  console.log(`✓ ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
}

const pairs = process.argv.slice(2);
if (pairs.length < 2 || pairs.length % 2 !== 0) {
  console.error('Usage: node scripts/ops/md-to-docx.mjs <in.md> <out.docx> [more pairs...]');
  process.exit(1);
}
for (let k = 0; k < pairs.length; k += 2) await convert(pairs[k], pairs[k + 1]);
