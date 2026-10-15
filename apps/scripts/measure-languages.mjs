#!/usr/bin/env node
// @ts-check
/**
 * measure-languages — the GitHub-style "Languages" bar in Settings → About.
 *
 * Sums the bytes of every git-tracked file per language, following the rules
 * GitHub's linguist applies to a repository's language bar:
 *   - only programming and markup languages count; JSON, YAML, SQL, SVG,
 *     Markdown and images are data or prose and are left out;
 *   - vendored (node_modules/, dist/, vendor/, *.min.js) and documentation
 *     (docs/, examples/) paths are skipped;
 *   - a language whose share rounds to 0.0% folds into "Other".
 * Dot-directories (.agents/, .github/, .husky/) hold tooling around the repo,
 * not the app, so they are skipped as well.
 *
 * The packaged app ships no source, so the result goes to a committed
 * snapshot that dev, tests and every build read:
 *   apps/client/src/modules/cost/tabs/AboutSection.languages.json
 *
 * Usage (repo root, after a sizeable change):
 *   npm run languages
 */

import { execFileSync } from 'node:child_process';
import { lstatSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const OUTPUT = 'apps/client/src/modules/cost/tabs/AboutSection.languages.json';

// Colours are linguist's. NSIS has none there, so GitHub draws it grey.
export const LANGUAGES = [
  { name: 'JavaScript', color: '#f1e05a', ext: ['.js', '.jsx', '.mjs', '.cjs'] },
  { name: 'TypeScript', color: '#3178c6', ext: ['.ts', '.tsx', '.mts', '.cts'] },
  { name: 'CSS', color: '#663399', ext: ['.css'] },
  { name: 'SCSS', color: '#c6538c', ext: ['.scss'] },
  { name: 'HTML', color: '#e34c26', ext: ['.html', '.htm'] },
  { name: 'Shell', color: '#89e051', ext: ['.sh', '.bash', '.zsh', '.command'] },
  { name: 'PowerShell', color: '#012456', ext: ['.ps1', '.psm1', '.psd1'] },
  { name: 'Batchfile', color: '#c1f12e', ext: ['.bat', '.cmd'] },
  { name: 'NSIS', color: '#cccccc', ext: ['.nsi', '.nsh'] },
  { name: 'Python', color: '#3572a5', ext: ['.py'] },
];
export const OTHER = { name: 'Other', color: '#ededed' };

const BY_EXT = new Map(LANGUAGES.flatMap((l) => l.ext.map((e) => [e, l])));

const SKIPPED = [
  /(^|\/)node_modules\//,
  /(^|\/)(dist|vendors?|third[-_]?party|bower_components)\//,
  /(^|\/)([Dd]ocs?|[Dd]ocumentation|[Ee]xamples?)\//,
  /(^|\/)\.[^/]+\//,
  /[.-]min\.(js|css)$/,
];

/** @param {string} file repo-relative, forward slashes */
export function languageOf(file) {
  if (SKIPPED.some((re) => re.test(file))) return null;
  return BY_EXT.get(path.extname(file).toLowerCase()) || null;
}

/** @param {number} part @param {number} total */
const share = (part, total) => Math.round((part / total) * 1000) / 10;

/**
 * @param {Array<{ path: string, bytes: number }>} files
 * @returns {{ files: number, total_bytes: number,
 *   languages: Array<{ name: string, color: string, bytes: number, percent: number }> }}
 */
export function summarize(files) {
  /** @type {Map<(typeof LANGUAGES)[number], number>} */
  const totals = new Map();
  let total = 0;
  let counted = 0;
  for (const f of files) {
    const lang = languageOf(f.path);
    if (!lang) continue;
    totals.set(lang, (totals.get(lang) || 0) + f.bytes);
    total += f.bytes;
    counted++;
  }
  if (total === 0) return { files: 0, total_bytes: 0, languages: [] };

  const languages = [];
  let other = 0;
  for (const [lang, bytes] of [...totals].sort((a, b) => b[1] - a[1])) {
    const percent = share(bytes, total);
    if (percent === 0) other += bytes;
    else languages.push({ name: lang.name, color: lang.color, bytes, percent });
  }
  if (other > 0) languages.push({ ...OTHER, bytes: other, percent: share(other, total) });
  return { files: counted, total_bytes: total, languages };
}

function main() {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const files = [];
  for (const p of tracked) {
    try {
      const st = lstatSync(path.join(REPO_ROOT, p));
      if (st.isFile()) files.push({ path: p, bytes: st.size });
    } catch {
      /* tracked but deleted in the worktree */
    }
  }
  const out = { measured_at: new Date().toLocaleDateString('sv-SE'), ...summarize(files) };
  writeFileSync(path.join(REPO_ROOT, OUTPUT), JSON.stringify(out, null, 2) + '\n');
  for (const l of out.languages) {
    console.log(`${l.name.padEnd(12)} ${l.percent.toFixed(1).padStart(5)}%`);
  }
  console.log(`→ ${OUTPUT} (${out.files} files, ${out.total_bytes} bytes)`);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
