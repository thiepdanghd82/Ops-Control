// @ts-check
/**
 * Surfaces that are not needed at first paint stay out of the app shell
 * (MES-3-FIX-62, 2026-09-30).
 *
 * The shell (`index`) measured 545,982 of its 550,000-byte budget, and the
 * floating chat (ChatDrawer + UserPickerModal + UnreadLoginPopup, ~21 kB) and
 * the import dialog (~4 kB) were bundled into it although none of them is
 * needed to draw the first screen. They are lazy-loaded from App.jsx now.
 * One static `import X from` in App.jsx pulls a module back into the shell
 * with nothing red but the size gate, weeks later — this pins it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = fs.readFileSync(path.join(HERE, 'App.jsx'), 'utf8');

const LAZY = {
  ChatDrawer: './components/Chat/ChatDrawer',
  UnreadLoginPopup: './components/Chat/UnreadLoginPopup',
  ImportDialog: './components/Shared/ImportDialog',
};

for (const [name, spec] of Object.entries(LAZY)) {
  test(`${name} is lazy-loaded, not bundled into the shell`, () => {
    const esc = spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    assert.doesNotMatch(
      APP,
      new RegExp(`import\\s+${name}\\s+from\\s+'${esc}(\\.jsx)?'`),
      'no static import'
    );
    assert.match(
      APP,
      new RegExp(
        `const\\s+${name}\\s*=\\s*lazy\\(\\s*\\(\\)\\s*=>\\s*import\\('${esc}(\\.jsx)?'\\)`
      ),
      'lazy import'
    );
  });
}

test('the import dialog chunk loads on first open and then stays mounted', () => {
  // Rendered behind a latch set by the open handler: nothing is fetched until
  // the dialog is opened, and closing keeps it mounted so its "import into"
  // choice survives to the next open, as it did when it was bundled eagerly.
  assert.match(APP, /\{importOpened && \(/, 'mounted behind the first-open latch');
  assert.match(
    APP,
    /setImportOpened\(true\);\s*setShowImport\(true\);/,
    'the open handler sets the latch'
  );
  assert.doesNotMatch(APP, /setImportOpened\(false\)/, 'the latch is never reset');
});
