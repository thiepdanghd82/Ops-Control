/**
 * electron-builder afterPack hook — drop dev-only packages from the
 * embedded server's node_modules inside the packed app.
 *
 * build.extraResources copies the ROOT node_modules wholesale into
 * Resources/app/node_modules, because the server and the packaged
 * scripts resolve their dependencies from there. That copy also carried
 * every root devDependency (eslint, prettier, typescript, puppeteer,
 * commitlint, …): ~211 MB where the server needs ~61 MB.
 *
 * After packing (before signing / DMG / NSIS), this hook deletes every
 * path the root package-lock.json marks `"dev": true` — exactly what
 * `npm prune --omit=dev` would remove — and nothing else:
 *   - packages absent from the lock are left alone (desktop-only native
 *     overlays such as node-hid / serialport, extraneous installs);
 *   - the native overlay targets from build.extraResources are never
 *     touched, even if a nested path inside them matches a dev entry;
 *   - before deleting, it snapshots which package dependencies resolve
 *     inside the app; if pruning breaks any resolution that worked
 *     before, or a root `dependencies` entry stops resolving from
 *     app/server, the build fails.
 *
 * The packaged code is unchanged (asar, app/server, app/scripts); only
 * unused packages disappear. Escape hatch for an emergency build:
 *   OPS_SKIP_PRUNE_DEV_DEPS=1
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APP_NODE_MODULES = 'app/node_modules';

/** Every package directory under a node_modules tree (scoped + nested). */
function listPackageDirs(nodeModulesDir) {
  const out = [];
  const walk = (nm) => {
    let entries;
    try {
      entries = fs.readdirSync(nm, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const full = path.join(nm, e.name);
      if (e.name.startsWith('@')) {
        for (const s of fs.readdirSync(full, { withFileTypes: true })) {
          if (s.isDirectory()) visit(path.join(full, s.name));
        }
      } else {
        visit(full);
      }
    }
  };
  const visit = (pkgDir) => {
    if (fs.existsSync(path.join(pkgDir, 'package.json'))) out.push(pkgDir);
    walk(path.join(pkgDir, 'node_modules'));
  };
  walk(nodeModulesDir);
  return out;
}

/** Node's directory lookup for `dep`, from `fromDir` upward, never above `stopDir`. */
function resolvesWithin(dep, fromDir, stopDir) {
  let dir = fromDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'node_modules', dep, 'package.json'))) return true;
    if (dir === stopDir) return false;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * "pkg -> dep" for every non-optional dependency of every package under
 * appDir/node_modules that does not resolve inside appDir, plus
 * "(server) -> dep" for root `dependencies` not resolvable from appDir/server.
 */
function findBrokenDeps(appDir, rootDependencies) {
  const broken = new Set();
  for (const pkgDir of listPackageDirs(path.join(appDir, 'node_modules'))) {
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const optional = new Set(Object.keys(pkg.optionalDependencies || {}));
    for (const dep of Object.keys(pkg.dependencies || {})) {
      if (optional.has(dep)) continue;
      if (!resolvesWithin(dep, pkgDir, appDir)) {
        // '/'-separated like lock keys, so messages and tests read the same on Windows.
        broken.add(`${path.relative(appDir, pkgDir).split(path.sep).join('/')} -> ${dep}`);
      }
    }
  }
  const serverDir = path.join(appDir, 'server');
  for (const dep of rootDependencies) {
    if (!resolvesWithin(dep, serverDir, appDir)) broken.add(`(server) -> ${dep}`);
  }
  return broken;
}

/**
 * Delete the lock's dev-only paths under appDir. `protectedPaths` are
 * app-relative directories (e.g. 'node_modules/better-sqlite3') that must
 * survive along with everything inside them. Returns the removed paths.
 * Throws — after deleting nothing — if pruning would break a resolution.
 */
function pruneDevDeps({ appDir, lock, rootDependencies = [], protectedPaths = [] }) {
  const packages = (lock && lock.packages) || {};
  const isProtected = (rel) =>
    protectedPaths.some((p) => rel === p || rel.startsWith(p + '/') || p.startsWith(rel + '/'));

  const candidates = Object.keys(packages)
    .filter((key) => key && packages[key].dev === true)
    .filter((key) => !isProtected(key))
    .filter((key) => fs.existsSync(path.join(appDir, key)))
    .sort();
  // A nested dev path inside a dev parent goes with the parent.
  const targets = candidates.filter(
    (key, i) => !candidates.slice(0, i).some((parent) => key.startsWith(parent + '/'))
  );

  const before = findBrokenDeps(appDir, rootDependencies);

  // Dry run: would the remaining tree still resolve? Move targets aside first.
  const stash = path.join(appDir, '.prune-dev-deps-stash');
  fs.rmSync(stash, { recursive: true, force: true });
  const moved = [];
  try {
    for (const key of targets) {
      const dest = path.join(stash, key);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(path.join(appDir, key), dest);
      moved.push(key);
    }
    const after = findBrokenDeps(appDir, rootDependencies);
    const newlyBroken = [...after].filter((b) => !before.has(b));
    if (newlyBroken.length) {
      throw new Error(
        `[prune-dev-deps] pruning would break ${newlyBroken.length} resolution(s):\n  ` +
          newlyBroken.slice(0, 20).join('\n  ')
      );
    }
  } catch (err) {
    for (const key of moved.reverse()) {
      fs.mkdirSync(path.dirname(path.join(appDir, key)), { recursive: true });
      fs.renameSync(path.join(stash, key), path.join(appDir, key));
    }
    fs.rmSync(stash, { recursive: true, force: true });
    throw err;
  }
  fs.rmSync(stash, { recursive: true, force: true });
  return targets;
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSizeBytes(p);
    else if (e.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

function resourcesDir(context) {
  const platform = context.electronPlatformName || context.packager.platform.nodeName;
  if (platform === 'darwin' || platform === 'mas') {
    return path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents',
      'Resources'
    );
  }
  return path.join(context.appOutDir, 'resources');
}

async function afterPack(context) {
  if (process.env.OPS_SKIP_PRUNE_DEV_DEPS) {
    console.log('  • prune-dev-deps  skipped (OPS_SKIP_PRUNE_DEV_DEPS set)');
    return;
  }
  const projectDir = context.packager.projectDir;
  const config = context.packager.config || {};
  const extra = config.extraResources || [];
  const rootEntry = extra.find((r) => r && r.to === APP_NODE_MODULES);
  if (!rootEntry) {
    console.log('  • prune-dev-deps  skipped (no extraResources entry for app/node_modules)');
    return;
  }
  const rootDir = path.dirname(path.resolve(projectDir, rootEntry.from));
  const lock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
  const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const protectedPaths = extra
    .filter((r) => r && typeof r.to === 'string' && r.to.startsWith(APP_NODE_MODULES + '/'))
    .map((r) => r.to.slice('app/'.length));

  const appDir = path.join(resourcesDir(context), 'app');
  const nodeModules = path.join(appDir, 'node_modules');
  const sizeBefore = dirSizeBytes(nodeModules);
  const removed = pruneDevDeps({
    appDir,
    lock,
    rootDependencies: Object.keys(rootPkg.dependencies || {}),
    protectedPaths,
  });
  const sizeAfter = dirSizeBytes(nodeModules);
  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(
    `  • prune-dev-deps  removed ${removed.length} dev-only package(s) from app/node_modules: ` +
      `${mb(sizeBefore)} MB -> ${mb(sizeAfter)} MB`
  );
}

module.exports = afterPack;
module.exports.default = afterPack;
module.exports.pruneDevDeps = pruneDevDeps;
module.exports.findBrokenDeps = findBrokenDeps;
