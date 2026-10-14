/**
 * build-windows-installers.mjs — produces TWO Windows NSIS installers
 * from one electron-builder config:
 *
 *   • Ops Control SERVER Setup 1.2.0.exe   (firewall 3100 inbound, server defaults)
 *   • Ops Control CLIENT Setup 1.2.0.exe   (no inbound, client defaults + URL prompt)
 *
 * Both share the same productName / appId so a single machine can only
 * host one role at a time (intentional — avoids confusion for non-IT
 * operators). Differences live in `desktop/build-role.json` (read at app
 * boot to drive the first-run UX) and the swapped NSIS include
 * (`installer-server.nsh` vs `installer-client.nsh`).
 *
 * Output goes to `desktop/dist-electron/`. Pre-existing artifacts with
 * matching names are overwritten.
 *
 * Usage:
 *   node scripts/build-windows-installers.mjs            # build both
 *   node scripts/build-windows-installers.mjs server     # only server
 *   node scripts/build-windows-installers.mjs client     # only client
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'desktop');
const BUILD_DIR = path.join(DESKTOP, 'build');
const ROLE_FILE = path.join(DESKTOP, 'build-role.json');
const NSH_TARGET = path.join(BUILD_DIR, 'installer.nsh');
const NSH_BACKUP = path.join(BUILD_DIR, '.installer.nsh.bak');

const ROLES = {
  server: {
    artifactName: 'Ops Control SERVER Setup ${version}.${ext}',
    nshSource: 'installer-server.nsh',
    label: 'SERVER',
  },
  client: {
    artifactName: 'Ops Control CLIENT Setup ${version}.${ext}',
    nshSource: 'installer-client.nsh',
    label: 'CLIENT',
  },
};

function spawnP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
    );
  });
}

function backupNshOnce() {
  if (fs.existsSync(NSH_TARGET) && !fs.existsSync(NSH_BACKUP)) {
    fs.copyFileSync(NSH_TARGET, NSH_BACKUP);
  }
}

function restoreNsh() {
  if (fs.existsSync(NSH_BACKUP)) {
    fs.copyFileSync(NSH_BACKUP, NSH_TARGET);
    fs.unlinkSync(NSH_BACKUP);
  }
}

async function buildRole(role) {
  const cfg = ROLES[role];
  if (!cfg) throw new Error(`Unknown role: ${role}`);

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`  Building Ops Control ${cfg.label} (Windows NSIS x64)`);
  console.log(`══════════════════════════════════════════════════════════\n`);

  // 1. Write the role marker the runtime reads at app boot
  fs.writeFileSync(ROLE_FILE, JSON.stringify({ role }, null, 2) + '\n');

  // 2. Swap NSIS include
  backupNshOnce();
  const src = path.join(BUILD_DIR, cfg.nshSource);
  if (!fs.existsSync(src)) throw new Error(`NSH source missing: ${src}`);
  fs.copyFileSync(src, NSH_TARGET);

  // 3. Run electron-builder. Override only artifactName via CLI; the
  // include path stays the same (installer.nsh) — we swapped its
  // contents above, so the same package.json config picks up the
  // role-specific NSH script.
  await spawnP(
    'npx',
    [
      'electron-builder',
      '--win',
      'nsis',
      '--x64',
      '--config.npmRebuild=false',
      `--config.win.artifactName=${cfg.artifactName}`,
    ],
    { cwd: DESKTOP }
  );
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

  // Prebuild client bundle — electron-builder packages `client/dist`
  // via extraResources. Without this step, edits made on disk since the
  // last `vite build` ship STALE inside the installer even though the
  // source file looks current. MES-3-FIX-55 (2026-06-17) — mirror of
  // the Mac installer fix; same trap exists on Windows.
  if (!process.env.OPS_SKIP_CLIENT_REBUILD) {
    console.log('Prebuild: rebuilding client bundle (vite build)...');
    await spawnP('npm', ['--prefix', path.join(ROOT, 'client'), 'run', 'build'], { cwd: ROOT });
    console.log('  ✓ client/dist refreshed.\n');
  } else {
    console.warn(
      '⚠  OPS_SKIP_CLIENT_REBUILD=1 — skipping client bundle rebuild (emergency override).'
    );
  }

  // Preflight — verify every asar-unpacked native package has its
  // extraResources overlay. Without this, outside-asar code (the
  // embedded server) loads the wrong-ABI binary at runtime. See
  // CLAUDE.md "Lesson 28" / MES-3-FIX-19.
  if (!process.env.OPS_SKIP_NATIVE_OVERLAY_CHECK) {
    console.log('Preflight: native module overlay check...');
    await spawnP('node', [path.join(__dirname, 'build-native-overlay-check.mjs')], { cwd: ROOT });
  } else {
    console.warn(
      '⚠  OPS_SKIP_NATIVE_OVERLAY_CHECK=1 — skipping native overlay preflight (emergency override).'
    );
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

  // Always restore the on-disk state so dev mode + manual builds keep
  // working without leftover role markers.
  restoreNsh();
  try {
    fs.unlinkSync(ROLE_FILE);
  } catch {}

  if (firstErr) process.exit(1);

  console.log(`\n✓ Done. Artifacts in desktop/dist-electron/`);
  for (const role of targets) {
    const ext = 'exe';
    const name = ROLES[role].artifactName.replace('${version}', '1.2.0').replace('${ext}', ext);
    const fp = path.join(DESKTOP, 'dist-electron', name);
    if (fs.existsSync(fp)) {
      const size = (fs.statSync(fp).size / (1024 * 1024)).toFixed(1);
      console.log(`  • ${name}   (${size} MB)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  restoreNsh();
  try {
    fs.unlinkSync(ROLE_FILE);
  } catch {}
  process.exit(1);
});
