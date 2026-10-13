/**
 * The desktop DMG must not carry the build machine's server/data.
 *
 * desktop/package.json copies ../server into the app. server/data is
 * gitignored, so a build from a clean worktree has none — but a build from
 * the shared checkout copied it in: a dev ops.db holding 21 CONCUR-* test
 * quotes, users.json with a sys account, sessions.json, audit_log.json and a
 * README_FIRST_LOGIN.txt with that account's password in plain text.
 *
 * Worse than inert: desktop/main.js seeds <userData>/data/ops.db from the
 * bundled server/data/ops.db on a fresh install, so a new machine started
 * with those test quotes. The server creates its own schema at boot
 * (initSchema() in server/index.js), so the seed is not needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop/package.json'), 'utf8'));

function serverEntry() {
  const entries = pkg.build.extraResources.filter((e) => e.from === '../server');
  assert.equal(entries.length, 1, 'expected exactly one extraResources entry copying ../server');
  return entries[0];
}

test('the ../server copy excludes server/data', () => {
  const filter = serverEntry().filter || [];
  assert.ok(
    filter.includes('!data/**'),
    `../server filter must exclude data/** — got ${JSON.stringify(filter)}`
  );
});

test('the server builds its own schema at boot, so no seed ops.db is needed', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
  assert.match(src, /^initSchema\(\);/m);
});
