import test from 'node:test';
import assert from 'node:assert/strict';
import { saveBlob } from './saveFile.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const blobOf = (s, type = XLSX) => new Blob([s], { type });

/** Minimal <a> + body stand-in so the legacy tier can be observed. */
function fakeDoc() {
  const clicks = [];
  const appended = [];
  return {
    clicks,
    appended,
    createElement: () => ({
      set href(v) {
        this._href = v;
      },
      get href() {
        return this._href;
      },
      click() {
        clicks.push({ href: this._href, download: this.download });
      },
    }),
    body: {
      appendChild: (el) => appended.push(el),
      removeChild: () => {},
    },
  };
}

// URL.createObjectURL / revokeObjectURL are absent under node:test.
globalThis.URL.createObjectURL ??= () => 'blob:stub';
globalThis.URL.revokeObjectURL ??= () => {};

// ── tier 1: Electron bridge ─────────────────────────────────────────

test('bridge: writes BINARY bytes to the path the dialog returned', async () => {
  const calls = {};
  const win = {
    // No showSaveFilePicker — the insecure thin CLIENT, where tier 2 does not
    // exist and the old <a download> was the whole story.
    ops: {
      fs: {
        showSaveDialog: async (opts) => {
          calls.opts = opts;
          return { canceled: false, filePath: '/Users/op/Desktop/q.xlsx' };
        },
        writeFile: async (p, data) => {
          calls.path = p;
          calls.data = data;
          return { ok: true };
        },
      },
    },
  };
  const out = await saveBlob(blobOf('PKbody'), 'q.xlsx', { win });
  assert.equal(out, '/Users/op/Desktop/q.xlsx');
  assert.equal(calls.path, '/Users/op/Desktop/q.xlsx');
  assert.ok(calls.data instanceof Uint8Array, 'xlsx/zip are binary — a string would corrupt them');
  assert.equal(new TextDecoder().decode(calls.data), 'PKbody');
  assert.equal(calls.opts.defaultPath, 'q.xlsx');
});

test('bridge: cancel writes NOTHING and returns null', async () => {
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
  const doc = fakeDoc();
  assert.equal(await saveBlob(blobOf('x'), 'q.xlsx', { win, doc }), null);
  assert.equal(wrote, false);
  assert.equal(
    doc.clicks.length,
    0,
    'cancel must NOT fall through to the download folder — a user who ' +
      'cancelled and then finds the file in Downloads has been ignored'
  );
});

test('bridge: dialog filters follow the extension', async () => {
  const seen = [];
  const mk = () => ({
    ops: {
      fs: {
        showSaveDialog: async (o) => {
          seen.push(o.filters);
          return { canceled: true };
        },
        writeFile: async () => {},
      },
    },
  });
  await saveBlob(blobOf('a'), 'q.xlsx', { win: mk() });
  await saveBlob(blobOf('a'), 'q.zip', { win: mk() });
  await saveBlob(blobOf('a'), 'q.weird', { win: mk() });
  assert.equal(seen[0][0].extensions[0], 'xlsx');
  assert.equal(seen[1][0].extensions[0], 'zip');
  assert.equal(seen[2][0].extensions[0], '*', 'unknown extension still offers a dialog');
});

// ── tier 2: File System Access API ──────────────────────────────────

test('secure context: writes through the picker handle', async () => {
  let written = null;
  const win = {
    showSaveFilePicker: async (opts) => {
      assert.equal(opts.suggestedName, 'q.xlsx');
      return {
        name: 'renamed.xlsx',
        createWritable: async () => ({
          write: async (b) => {
            written = b;
          },
          close: async () => {},
        }),
      };
    },
  };
  assert.equal(await saveBlob(blobOf('body'), 'q.xlsx', { win }), 'renamed.xlsx');
  assert.ok(written instanceof Blob);
});

test('secure context: cancel returns null without touching the fallback', async () => {
  const win = {
    showSaveFilePicker: async () => {
      const e = new Error('cancelled');
      e.name = 'AbortError';
      throw e;
    },
  };
  const doc = fakeDoc();
  assert.equal(await saveBlob(blobOf('x'), 'q.xlsx', { win, doc }), null);
  assert.equal(doc.clicks.length, 0);
});

test('secure context: a real I/O error propagates rather than silently falling back', async () => {
  const win = {
    showSaveFilePicker: async () => {
      throw new Error('disk full');
    },
  };
  await assert.rejects(() => saveBlob(blobOf('x'), 'q.xlsx', { win, doc: fakeDoc() }), /disk full/);
});

// ── tier 3: legacy ──────────────────────────────────────────────────

test('neither API: falls back to the download anchor', async () => {
  const doc = fakeDoc();
  const out = await saveBlob(blobOf('x'), 'q.xlsx', { win: {}, doc });
  assert.equal(out, 'q.xlsx');
  assert.equal(doc.clicks.length, 1);
  assert.equal(doc.clicks[0].download, 'q.xlsx');
});

test('no window and no document: returns null instead of throwing', async () => {
  assert.equal(await saveBlob(blobOf('x'), 'q.xlsx', { win: undefined, doc: undefined }), null);
});

// ── tier order ──────────────────────────────────────────────────────

test('the bridge wins over the picker when both exist', async () => {
  // Order matters on the embedded SERVER, where BOTH are available: the
  // bridge is the one that behaves identically on the thin CLIENT, so it
  // must be tried first or the two topologies diverge.
  let pickerCalled = false;
  const win = {
    showSaveFilePicker: async () => {
      pickerCalled = true;
      throw new Error('should not be reached');
    },
    ops: {
      fs: {
        showSaveDialog: async () => ({ canceled: false, filePath: '/p/q.xlsx' }),
        writeFile: async () => ({ ok: true }),
      },
    },
  };
  assert.equal(await saveBlob(blobOf('x'), 'q.xlsx', { win }), '/p/q.xlsx');
  assert.equal(pickerCalled, false);
});
