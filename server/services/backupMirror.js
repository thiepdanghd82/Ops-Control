/**
 * backupMirror — copy the data folder to a second disk, run by the app.
 *
 * Until 2026-10-14 this was a LaunchAgent shell script outside the app
 * (deploy/macos-offsite-backup). It now runs here, after each backup cycle
 * and on demand from Settings → Backup, to a destination the operator picks:
 * a mounted drive such as a USB stick, or any folder on the Mac.
 *
 * Rules carried over from the script, each paid for in production:
 * - Credentials never leave: they are excluded by name, and what actually
 *   landed is swept afterwards, because a name filter cannot see a key inside
 *   a renamed file (Lesson 39). A key found there fails the run.
 * - `--delete` only ever runs inside <dest>/ops-control-mirror/data, so a
 *   wrong destination can never empty someone else's folder.
 * - An unplugged drive is a SKIP, not an error, and deletes nothing; the
 *   status keeps last_ok_at apart from last_run_at so a mirror that skips
 *   forever cannot look healthy (Lesson 40).
 *
 * The status file and its shape are the ones the script wrote, so
 * offsiteStatus.js keeps grading it unchanged.
 */
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { offsiteStatusPath } from './offsiteStatus.js';

export const MIRROR_SUBDIR = 'ops-control-mirror';
const CONFIG_FILE = 'mirror-config.json';

// Relative to the data folder. Users/sessions/2FA secrets and .env files are
// credentials; the Library tarballs embed users.json and sessions.json; the
// licence and Fleet records publish machine fingerprints.
const EXCLUDES = [
  '*.env',
  'users.json*',
  'sessions.json*',
  'totp_secrets*',
  'license.json*',
  '/Backup/Library/',
  '/Library/Fleet/',
];
const CREDENTIAL_NAME = /^(users\.json|sessions\.json|totp_secrets|license\.json)/;
const KEY_LINE = /^[A-Z_]+=[0-9a-fA-F]{32,}/m;

let _running = null;

function configPath(dataDir) {
  return path.join(dataDir, 'Library', 'SystemConfig', CONFIG_FILE);
}

export function readMirrorConfig(dataDir) {
  try {
    const j = JSON.parse(fs.readFileSync(configPath(dataDir), 'utf-8'));
    return {
      ...j,
      dest: typeof j.dest === 'string' && j.dest ? j.dest : null,
      auto: j.auto !== false,
    };
  } catch {
    return { dest: null, auto: true };
  }
}

export function writeMirrorConfig(dataDir, { dest, auto }, user) {
  const next = {
    dest: dest || null,
    auto: auto !== false,
    updatedAt: new Date().toISOString(),
    updatedBy: user || null,
  };
  const p = configPath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2));
  return next;
}

function inside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Checks a destination the operator picked. Returns { ok, code, ... } —
 * `code` is stable so the client can word it.
 */
export function validateMirrorDest(dest, dataDir) {
  if (typeof dest !== 'string' || !path.isAbsolute(dest))
    return { ok: false, code: 'not_absolute' };
  const resolved = path.resolve(dest);
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    return { ok: false, code: 'missing' };
  }
  if (!st.isDirectory()) return { ok: false, code: 'not_directory' };
  const real = fs.realpathSync(resolved);
  const dataReal = fs.realpathSync(dataDir);
  if (inside(real, dataReal) || inside(dataReal, path.join(real, MIRROR_SUBDIR))) {
    return { ok: false, code: 'inside_data' };
  }
  try {
    fs.accessSync(real, fs.constants.W_OK);
  } catch {
    return { ok: false, code: 'not_writable' };
  }
  return { ok: true, code: 'ok', path: resolved, ...diskInfo(real, dataReal) };
}

function diskInfo(p, dataReal) {
  let freeBytes = null;
  let totalBytes = null;
  try {
    const s = fs.statfsSync(p);
    freeBytes = s.bavail * s.bsize;
    totalBytes = s.blocks * s.bsize;
  } catch {
    /* statfs unsupported — sizes stay unknown */
  }
  let sameDiskAsData = false;
  try {
    sameDiskAsData = fs.statSync(p).dev === fs.statSync(dataReal).dev;
  } catch {
    /* unknown — leave false */
  }
  return { freeBytes, totalBytes, sameDiskAsData };
}

function defaultVolumeRoots() {
  if (process.platform === 'darwin') return ['/Volumes'];
  if (process.platform === 'linux') {
    const u = process.env.USER || '';
    return [`/media/${u}`, `/run/media/${u}`, '/mnt'];
  }
  return [];
}

/** Mounted volumes the operator can pick, with free space and a same-disk flag. */
export function listMirrorTargets(dataDir, { volumesRoot } = {}) {
  const roots = volumesRoot ? [volumesRoot] : defaultVolumeRoots();
  const dataReal = fs.realpathSync(dataDir);
  const out = [];
  for (const root of roots) {
    let names;
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const p = path.join(root, name);
      let real;
      try {
        real = fs.realpathSync(p);
        if (!fs.statSync(real).isDirectory()) continue;
      } catch {
        continue;
      }
      if (real === '/') continue; // the boot disk's own alias in /Volumes
      let writable = true;
      try {
        fs.accessSync(real, fs.constants.W_OK);
      } catch {
        writable = false;
      }
      out.push({
        name,
        path: p,
        writable,
        hasMirror: fs.existsSync(path.join(p, MIRROR_SUBDIR)),
        ...diskInfo(real, dataReal),
      });
    }
  }
  return out;
}

function writeStatus(dataDir, state, dest, detail) {
  const p = offsiteStatusPath(dataDir);
  let lastOk = null;
  try {
    lastOk = JSON.parse(fs.readFileSync(p, 'utf-8')).last_ok_at || null;
  } catch {
    /* first run */
  }
  const now = new Date().toISOString();
  if (state === 'ok') lastOk = now;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    JSON.stringify(
      { last_run_at: now, last_run_state: state, last_ok_at: lastOk, dest, detail },
      null,
      2
    )
  );
}

function rsyncBinary() {
  for (const p of ['/usr/bin/rsync', '/opt/homebrew/bin/rsync', '/usr/local/bin/rsync']) {
    if (fs.existsSync(p)) return p;
  }
  return 'rsync';
}

function runRsync(src, dst) {
  return new Promise((resolve) => {
    const args = ['-a', '--delete'];
    for (const e of EXCLUDES) args.push('--exclude', e);
    args.push(`${src}/`, `${dst}/`);
    let err = '';
    let child;
    try {
      child = spawn(rsyncBinary(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      resolve({ code: -1, err: e.message });
      return;
    }
    child.stderr.on('data', (d) => {
      err = (err + d).slice(-2000);
    });
    child.on('error', (e) => resolve({ code: -1, err: e.message }));
    child.on('close', (code) => resolve({ code, err }));
  });
}

/** Removes anything credential-shaped that landed in the mirror. Returns the count. */
function sweepCredentials(dir) {
  let found = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!e.isFile() || e.name.startsWith('._')) continue;
      let leak = CREDENTIAL_NAME.test(e.name) || e.name.endsWith('.env');
      if (!leak) {
        try {
          const st = fs.statSync(p);
          if (st.size < 1024 * 1024 && KEY_LINE.test(fs.readFileSync(p, 'utf-8'))) leak = true;
        } catch {
          /* unreadable — leave it */
        }
      }
      if (!leak && e.name.endsWith('.tar.gz')) {
        const r = spawnSync('tar', ['tzf', p], { encoding: 'utf-8' });
        if (/users\.json|sessions\.json|totp_secrets/i.test(r.stdout || '')) leak = true;
      }
      if (leak) {
        fs.rmSync(p, { force: true });
        found += 1;
      }
    }
  };
  walk(dir);
  return found;
}

export function isMirrorRunning() {
  return _running != null;
}

/**
 * Mirrors the data folder to the configured destination. Single-flight: a
 * call while one is running returns that run's promise.
 * @returns {Promise<{state:'ok'|'skip'|'error'|'not_configured', detail:string, dest:string|null, durationMs:number}>}
 */
export function runMirror(dataDir) {
  if (_running) return _running;
  _running = (async () => {
    const start = Date.now();
    const done = (state, detail, dest) => ({ state, detail, dest, durationMs: Date.now() - start });
    const cfg = readMirrorConfig(dataDir);
    if (!cfg.dest) return done('not_configured', '', null);

    const base = path.resolve(cfg.dest);
    const mirrorRoot = path.join(base, MIRROR_SUBDIR);
    if (!fs.existsSync(base)) {
      writeStatus(dataDir, 'skip', mirrorRoot, 'destination not mounted');
      return done('skip', 'destination not mounted', mirrorRoot);
    }
    const v = validateMirrorDest(base, dataDir);
    if (!v.ok) {
      writeStatus(dataDir, 'error', mirrorRoot, `destination refused: ${v.code}`);
      return done('error', `destination refused: ${v.code}`, mirrorRoot);
    }

    const target = path.join(mirrorRoot, 'data');
    // The only folder --delete may touch.
    if (path.basename(path.dirname(target)) !== MIRROR_SUBDIR) {
      writeStatus(dataDir, 'error', mirrorRoot, 'unsafe destination');
      return done('error', 'unsafe destination', mirrorRoot);
    }
    fs.mkdirSync(target, { recursive: true });

    const r = await runRsync(dataDir, target);
    const leaks = sweepCredentials(mirrorRoot);
    let state = 'ok';
    let detail = '';
    if (r.code !== 0) {
      state = 'error';
      detail = `rsync exit ${r.code}: ${r.err.trim().split('\n').slice(-1)[0] || ''}`.trim();
    }
    if (leaks > 0) {
      state = 'error';
      detail = `${detail ? detail + '; ' : ''}${leaks} credential file(s) removed from the mirror`;
    }
    if (state === 'ok') {
      fs.writeFileSync(
        path.join(mirrorRoot, 'LAST_MIRROR_OK.txt'),
        new Date().toISOString() + '\n'
      );
    }
    writeStatus(dataDir, state, mirrorRoot, detail);
    return done(state, detail, mirrorRoot);
  })().finally(() => {
    _running = null;
  });
  return _running;
}
