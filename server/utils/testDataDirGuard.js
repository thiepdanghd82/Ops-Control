/**
 * testDataDirGuard — refuse to open the LIVE production database while running
 * under the node:test runner.
 *
 * Why: this box is both dev and prod (see CLAUDE.md Lesson 33). On 2026-06-24 a
 * verification run set DATA_DIR to the live userData dir and then ran the test
 * suite in the same shell; quotesStore's SQLite shadow-write landed CONCUR-*
 * test rows in the live ops.db and wiped 100 real quotes. node:test sets
 * NODE_TEST_CONTEXT in every test process, so we can detect "running under the
 * test runner" and hard-fail before opening a production-looking ops.db.
 *
 * This is a no-op in production (the app never sets NODE_TEST_CONTEXT) and a
 * no-op for legitimate tests (they use server/data or a temp dir, not the
 * Electron userData path).
 */

import path from 'path';

/**
 * True when `p` is the Electron userData (production) data location for this
 * app — macOS "…/Library/Application Support/ops-control-desktop/…" or Windows
 * "…/AppData/(Roaming|Local)/ops-control-desktop/…". Repo `server/data` and
 * temp dirs return false.
 */
export function isProdDataPath(p) {
  if (!p) return false;
  const s = path.resolve(String(p)).replace(/\\/g, '/');
  return (
    /\/Library\/Application Support\/ops-control-desktop(\/|$)/i.test(s) ||
    /\/AppData\/(Roaming|Local)\/ops-control-desktop(\/|$)/i.test(s)
  );
}

/**
 * Throw if we're under the test runner AND about to touch a production ops.db.
 * @param {string} dbPath  the resolved ops.db path
 * @param {object} [env]   defaults to process.env (injectable for tests)
 */
export function assertNotProdDbUnderTest(dbPath, env = process.env) {
  if (env.NODE_TEST_CONTEXT && isProdDataPath(dbPath)) {
    throw new Error(
      `[test-guard] REFUSING to open the LIVE production database under the test runner:\n` +
        `  ${dbPath}\n` +
        `Tests write + wipe data. Unset DATA_DIR (uses repo server/data) or run with ` +
        `DATA_DIR="$(mktemp -d)". See CLAUDE.md Lesson 33 / .claude/skills/prod-data-safety.`
    );
  }
}
