/**
 * Tests for measure-languages.mjs — the classifier and the share maths, plus
 * a shape check on the committed snapshot the About tab renders.
 *
 * Runner: node --test apps/scripts/measure-languages.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { languageOf, summarize, LANGUAGES, OTHER, OUTPUT } from './measure-languages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = (file) => languageOf(file)?.name ?? null;

test('languageOf: maps extensions the way linguist does', () => {
  assert.equal(name('apps/client/src/App.jsx'), 'JavaScript');
  assert.equal(name('apps/scripts/x.mjs'), 'JavaScript');
  assert.equal(name('apps/client/src/a.css'), 'CSS');
  assert.equal(name('tools/deploy/INSTALL.command'), 'Shell');
  assert.equal(name('tools/deploy/deploy.ps1'), 'PowerShell');
  assert.equal(name('tools/deploy/START_SERVER.BAT'), 'Batchfile');
  // Installer scripts under build/ are source, not build output.
  assert.equal(name('apps/desktop/build/installer.nsh'), 'NSIS');
});

test('languageOf: data, prose, vendored, docs and tooling paths do not count', () => {
  for (const f of [
    'package.json',
    'README.md',
    'apps/server/db/schema.sql',
    'apps/client/public/logo.svg',
    'node_modules/react/index.js',
    'apps/client/dist/assets/index.js',
    'apps/client/public/pdf.worker.min.js',
    'docs/examples/demo.js',
    '.agents/skills/x/run.sh',
    '.github/workflows/ci.js',
  ]) {
    assert.equal(languageOf(f), null, f);
  }
});

test('summarize: sorts by size and rounds to one decimal', () => {
  const r = summarize([
    { path: 'a.js', bytes: 905 },
    { path: 'b.css', bytes: 73 },
    { path: 'c.sh', bytes: 22 },
    { path: 'notes.md', bytes: 5000 },
  ]);
  assert.equal(r.files, 3);
  assert.equal(r.total_bytes, 1000);
  assert.deepEqual(
    r.languages.map((l) => [l.name, l.percent]),
    [
      ['JavaScript', 90.5],
      ['CSS', 7.3],
      ['Shell', 2.2],
    ]
  );
});

test('summarize: languages that round to 0.0% fold into Other', () => {
  const r = summarize([
    { path: 'a.js', bytes: 99_990 },
    { path: 'b.html', bytes: 4 },
    { path: 'c.py', bytes: 6 },
  ]);
  assert.deepEqual(
    r.languages.map((l) => l.name),
    ['JavaScript', 'Other']
  );
  assert.equal(r.languages[1].bytes, 10);
  assert.equal(r.languages[1].color, OTHER.color);
});

test('summarize: nothing countable gives an empty list, not NaN', () => {
  assert.deepEqual(summarize([{ path: 'a.md', bytes: 10 }]), {
    files: 0,
    total_bytes: 0,
    languages: [],
  });
});

test('the committed snapshot is well-formed', () => {
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', OUTPUT), 'utf8'));
  assert.match(snap.measured_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(snap.files > 0 && snap.total_bytes > 0);
  const known = new Map([...LANGUAGES, OTHER].map((l) => [l.name, l.color]));
  let sum = 0;
  snap.languages.forEach((l, i) => {
    assert.equal(l.color, known.get(l.name), `${l.name} colour`);
    if (l.name !== OTHER.name && i > 0) {
      assert.ok(l.bytes <= snap.languages[i - 1].bytes, 'sorted by size');
    }
    sum += l.bytes;
  });
  assert.equal(sum, snap.total_bytes);
});
