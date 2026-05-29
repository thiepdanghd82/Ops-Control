/**
 * build-all-docs.mjs — runs every Help / Legend Word generator in one
 * shot. Wired as a `prebuild` hook in client/package.json so a
 * `npm run build` always ships fresh offline docs alongside the code.
 *
 * If a generator fails the whole build aborts (non-zero exit). Keep
 * failures loud — stale docs on prod are worse than a red CI.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const jobs = [
  { name: 'User Guide', script: 'build-user-guide.mjs' },
  { name: 'Pricing Legend', script: 'build-legend-docx.mjs' },
  { name: 'Go-Live Guide', script: 'build-go-live-docx.mjs' },
];

async function run(job) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.resolve(__dirname, job.script)], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '../..'),
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${job.name} generator exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

console.log('── Generating offline help documents ─────────────');
for (const job of jobs) {
  console.log(`→ ${job.name}`);
  try {
    await run(job);
  } catch (err) {
    console.error(`✘ ${job.name} failed: ${err.message}`);
    process.exit(1);
  }
}
console.log('✓ All help documents generated.');
