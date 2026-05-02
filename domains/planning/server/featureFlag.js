/**
 * Feature-flag reader — Sprint MES-1.4.
 *
 * Source of truth: `<DATA_DIR>/Library/SystemConfig/feature-flags.json`.
 * Resolution rule: if the file is missing, unreadable, or the key is
 * absent → default `false` (fail-closed). Reload requires server restart;
 * MES-1 deliberately does not hot-reload to avoid the half-flipped-state
 * coordination problem during a deploy.
 *
 * Establishes the SystemConfig convention; future sprints reuse the same
 * file for additional flags.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function defaultDataDir() {
  return process.env.DATA_DIR || path.resolve(__dirname, '../../../server/data');
}

export function readFeatureFlag(name, dataDir = defaultDataDir()) {
  const file = path.join(dataDir, 'Library', 'SystemConfig', 'feature-flags.json');
  if (!fs.existsSync(file)) return false;
  try {
    const flags = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return flags[name] === true;
  } catch {
    return false;
  }
}
