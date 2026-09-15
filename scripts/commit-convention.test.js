/**
 * The commit-message docs must agree with the rules that actually reject.
 *
 * `CONTRIBUTING.md` §5 is where a contributor looks before writing a commit.
 * On 2026-09-15 two of its six examples used scopes that are NOT in
 * `scope-enum` — `refactor(server)` and `test(license)` — so the one place
 * that teaches the convention taught two messages the hook rejects. That is
 * worse than no documentation: people follow it and then fight the hook,
 * which is exactly the recurring friction MES-3-FIX-50 was filed for.
 *
 * So the docs are checked against the config rather than maintained beside
 * it. `.gitmessage` is generated from the same source, and these assert both
 * stay true.
 *
 * Runner: node --test scripts/commit-convention.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../commitlint.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SCOPES = config.rules['scope-enum'][2];
const HEADER_MAX = config.rules['header-max-length'][2];
const BODY_MAX = config.rules['body-max-line-length'][2];

/**
 * Every `type(scope):` header the doc presents as something to COPY.
 *
 * The "### Bad" block is excluded by design — it exists to show a rejected
 * message, and a guard that cannot tell a counter-example from a model
 * would force the doc to drop the most useful thing in it.
 */
function exampleHeaders(md) {
  const bad = md.indexOf('### Bad');
  let scanned = md;
  if (bad !== -1) {
    const open = md.indexOf('```', bad);
    const close = open === -1 ? -1 : md.indexOf('```', open + 3);
    if (close !== -1) scanned = md.slice(0, open) + md.slice(close + 3);
  }
  return [...scanned.matchAll(/^([a-z]+)\(([^)]+)\):/gm)].map((m) => ({
    type: m[1],
    scope: m[2],
    raw: m[0],
  }));
}

test('every scope shown in CONTRIBUTING.md is one commitlint accepts', () => {
  const bad = exampleHeaders(read('CONTRIBUTING.md')).filter((h) => !SCOPES.includes(h.scope));
  assert.deepEqual(
    bad.map((h) => h.raw),
    [],
    'these examples would be rejected by the hook that the doc is teaching'
  );
});

test('.gitmessage lists exactly the scopes commitlint accepts', () => {
  const tpl = read('.gitmessage');
  const missing = SCOPES.filter(
    (s) => !new RegExp(`(^|\\s)${s.replace('/', '\\/')}(\\s|$)`, 'm').test(tpl)
  );
  assert.deepEqual(missing, [], 'scopes in the config but absent from the template');
});

test('.gitmessage quotes the real limits, not remembered ones', () => {
  const tpl = read('.gitmessage');
  assert.ok(tpl.includes(String(HEADER_MAX)), `header limit ${HEADER_MAX} must appear`);
  assert.ok(tpl.includes(String(BODY_MAX)), `body limit ${BODY_MAX} must appear`);
});

test('CONTRIBUTING.md quotes the real limits', () => {
  const md = read('CONTRIBUTING.md');
  assert.ok(md.includes(`**${HEADER_MAX}**`), `header limit ${HEADER_MAX} must appear`);
  assert.ok(md.includes(`**${BODY_MAX}**`), `body limit ${BODY_MAX} must appear`);
});

test('the template names the scopes people reach for and do not exist', () => {
  // The whole point of the closed list. If someone widens the enum later,
  // this fails and they remove the name from the warning instead of leaving
  // the doc telling people a valid scope is invalid.
  const tpl = read('.gitmessage');
  for (const wrong of ['pricing', 'server', 'client', 'desktop', 'help', 'scripts', 'ops']) {
    assert.ok(
      !SCOPES.includes(wrong),
      `'${wrong}' is now a real scope — update the warning in .gitmessage and CONTRIBUTING.md`
    );
    assert.ok(tpl.includes(wrong), `the template should warn that '${wrong}' is not a scope`);
  }
});

test('the "Bad" example really is invalid, or it teaches nothing', () => {
  const md = read('CONTRIBUTING.md');
  const bad = md.indexOf('### Bad');
  assert.ok(bad !== -1, 'the counter-example is the most useful part — keep it');
  const open = md.indexOf('```', bad);
  const block = md.slice(open, md.indexOf('```', open + 3));
  const m = /^([a-z]+)\(([^)]+)\):/m.exec(block);
  assert.ok(m, 'the Bad block should show a full header');
  assert.ok(
    !SCOPES.includes(m[2]),
    `the counter-example uses '${m[2]}', which commitlint ACCEPTS — it is not a counter-example`
  );
});

test('the good example in CONTRIBUTING.md fits the header limit', () => {
  for (const h of exampleHeaders(read('CONTRIBUTING.md'))) {
    const line = read('CONTRIBUTING.md')
      .split('\n')
      .find((l) => l.startsWith(h.raw));
    if (line) assert.ok(line.length <= HEADER_MAX, `example header too long: ${line}`);
  }
});
