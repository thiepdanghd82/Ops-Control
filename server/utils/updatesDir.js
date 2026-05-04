/**
 * updatesDir — Phase A.4 path resolver for the auto-update artifact
 * directory served at /updates/*.
 *
 * Default: <DATA_DIR>/../updates (sibling of the data dir, so a
 * single deploy snapshot bundles app code + data + updates without
 * cross-volume issues).
 *
 * Override: OPS_UPDATES_DIR. Absolute paths are used as-is; relative
 * paths are resolved against the project root (one level above
 * server/), matching the same semantics that DATA_DIR uses in
 * server/index.js.
 *
 * Pure: no I/O, no side effects — easily unit-testable. The caller
 * (server/index.js) is responsible for the fs.existsSync gate and the
 * console.log.
 */

import path from 'path';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

export function resolveUpdatesDir(env = {}, dataDir, projectRoot = PROJECT_ROOT) {
  const override = env.OPS_UPDATES_DIR;
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(projectRoot, override);
  }
  return path.join(dataDir, '..', 'updates');
}
