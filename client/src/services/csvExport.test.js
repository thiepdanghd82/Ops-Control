import test from 'node:test';
import assert from 'node:assert/strict';
import { csvEscape, buildCsv, saveCsv } from './csvExport.js';

// UTF-8 BOM that buildCsv prepends so Excel decodes correctly on
// non-UTF-8 default code pages. Strip it in tests that compare body.
const BOM = '﻿';

test('csvEscape — null + undefined → empty string', () => {
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});

test('csvEscape — plain string passes through', () => {
  assert.equal(csvEscape('hello'), 'hello');
  assert.equal(csvEscape('Panasonic'), 'Panasonic');
});

test('csvEscape — empty string → empty', () => {
  assert.equal(csvEscape(''), '');
});

test('csvEscape — number → toString without quoting', () => {
  assert.equal(csvEscape(0), '0');
  assert.equal(csvEscape(1234.56789), '1234.56789');
  assert.equal(csvEscape(-5), '-5');
});

test('csvEscape — comma triggers wrap', () => {
  assert.equal(csvEscape('a, b'), '"a, b"');
  assert.equal(csvEscape('Body sticker, gold'), '"Body sticker, gold"');
});

test('csvEscape — embedded double-quote escaped to ""', () => {
  // RFC 4180 — embedded " becomes "" and the field gets wrapped in "...".
  assert.equal(csvEscape('a"b'), '"a""b"');
  assert.equal(csvEscape('"hello"'), '"""hello"""');
});

test('csvEscape — newline triggers wrap', () => {
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(csvEscape('cr\rlf'), '"cr\rlf"');
});

test('csvEscape — combination: comma + quote + newline', () => {
  // Was buggy pre-fix: only wrapped on comma, embedded quote leaked.
  assert.equal(csvEscape('a, "b", c\n'), '"a, ""b"", c\n"');
});

test('buildCsv — starts with UTF-8 BOM (Excel encoding hint)', () => {
  const csv = buildCsv([], ['a', 'b']);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'first code unit is U+FEFF BOM');
  assert.equal(csv, BOM + 'a,b');
});

test('buildCsv — empty rows still emits header', () => {
  const csv = buildCsv([], ['a', 'b', 'c']);
  assert.equal(csv, BOM + 'a,b,c');
});

test('buildCsv — picks fields by column keys', () => {
  const rows = [
    { a: 1, b: 2, c: 3 },
    { a: 4, b: 5, c: 6 },
  ];
  assert.equal(buildCsv(rows, ['a', 'c']), BOM + 'a,c\n1,3\n4,6');
});

test('buildCsv — missing field becomes empty cell', () => {
  const rows = [{ a: 1 }];
  assert.equal(buildCsv(rows, ['a', 'b']), BOM + 'a,b\n1,');
});

test('buildCsv — null row defensively handled', () => {
  assert.equal(buildCsv([null], ['a']), BOM + 'a\n');
});

test('buildCsv — opts.headers overrides header row, body still uses cols keys', () => {
  // Summarize CSV passes operator-facing labels via opts.headers so the
  // header row reads "End Customer" not the internal key `project`
  // (S-PROJFIX / Lesson 21 aliasMap).
  const rows = [{ project: 'WiiM', rfq_no: 'RFQ-1' }];
  const csv = buildCsv(rows, ['rfq_no', 'project'], {
    headers: ['RFQ NO', 'End Customer'],
  });
  assert.equal(csv, BOM + 'RFQ NO,End Customer\nRFQ-1,WiiM');
});

test('buildCsv — opts.headers escaped same as keys (comma in label is quoted)', () => {
  const csv = buildCsv([{ a: 1 }], ['a'], { headers: ['Direct, Customer'] });
  assert.equal(csv, BOM + '"Direct, Customer"\n1');
});

test('buildCsv — missing opts (legacy callers) keeps using cols as header', () => {
  // Backward-compat path: 3rd argument absent should still work.
  const csv = buildCsv([{ x: 1 }], ['x']);
  assert.equal(csv, BOM + 'x\n1');
});

test('buildCsv — opts without headers field falls back to cols', () => {
  const csv = buildCsv([{ x: 1 }], ['x'], {});
  assert.equal(csv, BOM + 'x\n1');
});

test('buildCsv — operator-style row with all quoting cases', () => {
  const rows = [
    {
      rfq_no: 'RFQ-2026-S0019',
      direct_cu: 'Panasonic',
      description: 'BODY STICKER, FC AS "TL1G"',
      moq: 1000,
      gm_pct: 0.158,
    },
  ];
  const csv = buildCsv(rows, ['rfq_no', 'direct_cu', 'description', 'moq', 'gm_pct']);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  // BOM is prepended to the header line, so the slice starts after it.
  assert.equal(lines[0], BOM + 'rfq_no,direct_cu,description,moq,gm_pct');
  assert.equal(lines[1], 'RFQ-2026-S0019,Panasonic,"BODY STICKER, FC AS ""TL1G""",1000,0.158');
});

test('buildCsv — pre-fix bug regression: embedded quote no longer leaks', () => {
  // Pre-fix: csv = `BODY,STICKER "BX"` → splits into 2 cells, second has unmatched quote.
  // Post-fix: wrapped + doubled quote = 1 cell, parses cleanly.
  const rows = [{ desc: 'BODY,STICKER "BX"' }];
  const csv = buildCsv(rows, ['desc']);
  // Round-trip parse check: regex-based naïve CSV parser
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  // The data row should have exactly 1 field (1 cell, properly quoted).
  // BOM only on header line (line 0), data line is unaffected.
  assert.equal(lines[1], '"BODY,STICKER ""BX"""');
});

// ─── saveCsv dispatch (MES-3-FIX CSV-CLIENT) ───────────────────────
// DIAGNOSE: on the thin CLIENT (loadURL http://<remote-ip>:3100) the page is
// NOT a secure context, so window.showSaveFilePicker is undefined and the old
// code fell to the <a download> blob anchor (silent / unreliable in Electron).
// Fix: prefer the Electron fs IPC bridge (window.ops.fs) which works in BOTH
// roles regardless of secure context. These tests pin the dispatch order +
// that the UTF-8 BOM survives every path.

function withWindow(win, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const prev = globalThis.window;
  globalThis.window = win;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (had) globalThis.window = prev;
      else delete globalThis.window;
    });
}

test('saveCsv — prefers Electron fs bridge (works on insecure thin client)', async () => {
  const calls = {};
  const win = {
    isSecureContext: false, // thin client on http://<ip>:3100
    // No showSaveFilePicker (undefined in insecure context) + no document.
    ops: {
      fs: {
        showSaveDialog: async (opts) => {
          calls.opts = opts;
          return { canceled: false, filePath: '/Users/op/Downloads/summarize.csv' };
        },
        writeFile: async (p, data) => {
          calls.path = p;
          calls.data = data;
          return { ok: true, bytes: data.length, path: p };
        },
      },
    },
  };
  let ret;
  await withWindow(win, async () => {
    ret = await saveCsv(BOM + 'h1,h2\n1,2', 'summarize.csv');
  });
  assert.equal(ret, '/Users/op/Downloads/summarize.csv');
  assert.equal(calls.path, '/Users/op/Downloads/summarize.csv');
  assert.ok(calls.data.startsWith(BOM), 'UTF-8 BOM preserved in bytes written via bridge');
  assert.match(calls.data, /h1,h2\n1,2/);
  assert.equal(calls.opts.defaultPath, 'summarize.csv');
});

test('saveCsv — fs bridge cancel → null, no write', async () => {
  let wrote = false;
  const win = {
    ops: {
      fs: {
        showSaveDialog: async () => ({ canceled: true }),
        writeFile: async () => {
          wrote = true;
        },
      },
    },
  };
  let ret;
  await withWindow(win, async () => {
    ret = await saveCsv('x,y', 'z.csv');
  });
  assert.equal(ret, null);
  assert.equal(wrote, false, 'must not write when the user cancels the dialog');
});

test('saveCsv — no bridge + secure context → File System Access API picker', async () => {
  let written = null;
  const handle = {
    name: 'out.csv',
    createWritable: async () => ({
      write: async (d) => {
        written = d;
      },
      close: async () => {},
    }),
  };
  const win = {
    isSecureContext: true,
    showSaveFilePicker: async () => handle,
    // no ops.fs bridge (pure web build)
  };
  let ret;
  await withWindow(win, async () => {
    ret = await saveCsv(BOM + 'a\n1', 'out.csv');
  });
  assert.equal(ret, 'out.csv');
  assert.ok(written.startsWith(BOM), 'BOM preserved via showSaveFilePicker path');
});

test('saveCsv — no bridge + no picker → legacy <a download> anchor', async () => {
  const anchor = {
    click() {
      this.clicked = true;
    },
  };
  // Anchor path uses global Blob/URL/document/setTimeout — mock them.
  const prevDoc = globalThis.document;
  const prevCreate = globalThis.URL.createObjectURL;
  const prevRevoke = globalThis.URL.revokeObjectURL;
  globalThis.document = {
    createElement: () => anchor,
    body: { appendChild() {}, removeChild() {} },
  };
  globalThis.URL.createObjectURL = () => 'blob:fake';
  globalThis.URL.revokeObjectURL = () => {};
  try {
    const win = { isSecureContext: false }; // no ops.fs, no showSaveFilePicker
    let ret;
    await withWindow(win, async () => {
      ret = await saveCsv(BOM + 'a\n1', 'fallback.csv');
    });
    assert.equal(ret, 'fallback.csv');
    assert.equal(anchor.clicked, true, 'anchor.click() fired');
    assert.equal(anchor.download, 'fallback.csv', 'download attr set to suggested name');
  } finally {
    globalThis.document = prevDoc;
    globalThis.URL.createObjectURL = prevCreate;
    globalThis.URL.revokeObjectURL = prevRevoke;
  }
});
