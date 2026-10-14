/**
 * Source-level guard for the two save cascades and the cancel path.
 *
 * `saveBlob` (binary) and `saveCsv` (text) run the SAME three tiers in the same
 * order: Electron bridge → File System Access → download anchor. They are two
 * functions rather than one because `saveCsv` hands the bridge a string and its
 * tests assert on that string; routing it through a Blob would change what
 * `ops:fs.writeFile` receives on a working, operator-facing path for no gain.
 *
 * What can drift is the ORDER. The bridge must come first: it is the only tier
 * that behaves identically on the embedded SERVER and the insecure thin CLIENT,
 * where `showSaveFilePicker` does not exist at all. Reorder one file and the
 * two topologies quietly diverge, with every test still green.
 *
 * The cancel assertions are the other half. A Save dialog the operator
 * dismissed must write nothing AND announce nothing — `onSuccess` pops an alert
 * naming the file, and showing "exported foo.xlsx" to someone who just pressed
 * Cancel states the opposite of what happened.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(p, 'utf8');

const SAVE_BLOB = read(join(HERE, 'saveFile.js'));
const SAVE_CSV = read(join(HERE, 'csvExport.js'));
const EXPORT_API = read(join(HERE, 'quoteExportApi.js'));
const MODAL = read(join(HERE, '..', 'modules', 'cost', 'tabs', 'QuoteHistory', 'ExportModal.jsx'));

/** Where each tier's distinguishing call appears, or -1. */
function tierOrder(src) {
  return {
    bridge: src.indexOf('fsBridge.showSaveDialog'),
    picker: src.search(/(win|window)\.showSaveFilePicker\(/),
    anchor: src.indexOf('.download = '),
  };
}

for (const [name, src] of [
  ['saveBlob (binary)', SAVE_BLOB],
  ['saveCsv (text)', SAVE_CSV],
]) {
  test(`${name}: all three tiers are present`, () => {
    const o = tierOrder(src);
    for (const [tier, at] of Object.entries(o)) {
      assert.notEqual(at, -1, `${name} is missing the ${tier} tier`);
    }
  });

  test(`${name}: bridge first, then picker, then anchor`, () => {
    const o = tierOrder(src);
    assert.ok(
      o.bridge < o.picker,
      `${name} must try the Electron bridge BEFORE showSaveFilePicker — the ` +
        'bridge is the only tier that exists on the insecure thin CLIENT, so ' +
        'reversing them makes SERVER and CLIENT behave differently.'
    );
    assert.ok(o.picker < o.anchor, `${name} must try the picker before the download anchor`);
  });
}

test('the export API awaits the save and reports where it went', () => {
  assert.match(
    EXPORT_API,
    /const savedTo = await downloadImpl\(/,
    'the save must be awaited, or a cancel cannot be detected'
  );
  assert.match(EXPORT_API, /savedTo\s*\}/, 'savedTo must reach the caller');
});

test('a cancelled save is not announced as a successful export', () => {
  assert.match(
    MODAL,
    /if \(out\.savedTo !== null\) onSuccess\?\.\(/,
    'ExportModal must gate onSuccess on savedTo — onSuccess alerts the filename, ' +
      'and saying "exported" to someone who pressed Cancel is the opposite of true'
  );
});

test('the quote export no longer defaults to the bare download anchor', () => {
  // The whole point of the change: <a download> drops the file in the browser's
  // folder with no say, and on the thin CLIENT it was already diagnosed as
  // doing nothing at all.
  assert.match(EXPORT_API, /downloadImpl = saveBlob/);
  assert.doesNotMatch(
    EXPORT_API,
    /downloadImpl = triggerBlobDownload/,
    'triggerBlobDownload stays exported as the tier-3 fallback, but must not be the default'
  );
});
