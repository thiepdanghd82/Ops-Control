/**
 * build-mac-installers.mjs — produces TWO Mac DMG installers from one
 * electron-builder config:
 *
 *   • Ops Control SERVER 1.0.0-arm64.dmg
 *   • Ops Control CLIENT 1.0.0-arm64.dmg
 *
 * Mirror of build-windows-installers.mjs but targets Apple Silicon DMG.
 * No NSIS post-install (Mac firewall is per-app prompt, not installer-
 * driven), so the only artifact difference between roles is the bundled
 * `desktop/build-role.json` — which drives the in-app first-run dialog.
 *
 * Usage:
 *   node scripts/build-mac-installers.mjs            # build both
 *   node scripts/build-mac-installers.mjs server     # only server
 *   node scripts/build-mac-installers.mjs client     # only client
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'desktop');
const ROLE_FILE = path.join(DESKTOP, 'build-role.json');

const ROLES = {
  server: {
    artifactName: 'Ops Control SERVER ${version}-${arch}.${ext}',
    label: 'SERVER',
  },
  client: {
    artifactName: 'Ops Control CLIENT ${version}-${arch}.${ext}',
    label: 'CLIENT',
  },
};

function spawnP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
  });
}

async function buildRole(role) {
  const cfg = ROLES[role];
  if (!cfg) throw new Error(`Unknown role: ${role}`);

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`  Building Ops Control ${cfg.label} (Mac DMG arm64)`);
  console.log(`══════════════════════════════════════════════════════════\n`);

  fs.writeFileSync(ROLE_FILE, JSON.stringify({ role }, null, 2) + '\n');

  await spawnP('npx', [
    'electron-builder',
    '--mac', 'dmg',
    '--arm64',
    '--config.npmRebuild=false',
    `--config.mac.artifactName=${cfg.artifactName}`,
  ], { cwd: DESKTOP });
}

async function main() {
  const requested = process.argv[2];
  const targets = requested ? [requested] : ['server', 'client'];

  for (const t of targets) {
    if (!ROLES[t]) {
      console.error(`Unknown role "${t}". Choices: server, client`);
      process.exit(1);
    }
  }

  let firstErr = null;
  for (const role of targets) {
    try {
      await buildRole(role);
    } catch (err) {
      firstErr = err;
      console.error(`✘ ${role} build failed: ${err.message}`);
      break;
    }
  }

  // Restore clean state — remove role marker so dev mode + manual builds
  // don't accidentally pick up a stale role.
  try { fs.unlinkSync(ROLE_FILE); } catch {}

  if (firstErr) process.exit(1);

  console.log(`\n✓ Done. Artifacts in desktop/dist-electron/`);
  for (const role of targets) {
    const name = ROLES[role].artifactName
      .replace('${version}', '1.2.0')
      .replace('${arch}', 'arm64')
      .replace('${ext}', 'dmg');
    const fp = path.join(DESKTOP, 'dist-electron', name);
    if (fs.existsSync(fp)) {
      const size = (fs.statSync(fp).size / (1024 * 1024)).toFixed(1);
      console.log(`  • ${name}   (${size} MB)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  try { fs.unlinkSync(ROLE_FILE); } catch {}
  process.exit(1);
});
