/**
 * Guard for `deploy/macos-offsite-backup/install.sh`.
 *
 * That installer ends in `launchctl load`. The off-site agent has been held
 * disabled since 2026-09-17 because it has never once succeeded unattended
 * (CLAUDE.md Lesson 44), and the hold is expressed by renaming the plist to
 * `<LABEL>.plist.disabled-<date>`. The installer writes `<LABEL>.plist` — a
 * DIFFERENT filename — so before the check it existed it neither saw nor
 * overwrote the hold; it simply created a fresh enabled agent beside it, and
 * the installer's own header tells you to re-run it after editing the script.
 *
 * Re-enabling is silent and its damage is silent too: every scheduled run
 * takes `write_status error`, reddening Settings → Backup every four hours
 * while manual runs keep writing `ok`. A health signal that flickers is worse
 * than one steadily wrong, because nobody can tell which state to believe.
 *
 * This test lives in `scripts/` rather than beside the shell script because
 * the CI glob is `server/**` + `scripts/**` — a test under `deploy/` would
 * never run, which is the same class of mistake as a guard nobody executes.
 *
 * It drives the REAL installer against a throwaway HOME with `launchctl`
 * stubbed on PATH, so no branch can touch this machine's launchd.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLER = join(REPO, 'deploy', 'macos-offsite-backup', 'install.sh');
const LABEL = 'vn.ccldesign.opsbackup.offsite';

/**
 * Run the installer in an isolated HOME.
 * @param {{marker?: boolean, force?: boolean}} opts
 */
function runInstaller({ marker = false, force = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ops-install-guard-'));
  const home = join(root, 'home');
  const agents = join(home, 'Library', 'LaunchAgents');
  const bin = join(root, 'bin');
  mkdirSync(agents, { recursive: true });
  mkdirSync(bin, { recursive: true });

  const lcLog = join(root, 'launchctl.log');
  writeFileSync(join(bin, 'launchctl'), `#!/bin/bash\necho "$*" >> "${lcLog}"\nexit 0\n`);
  chmodSync(join(bin, 'launchctl'), 0o755);
  writeFileSync(lcLog, '');

  if (marker) writeFileSync(join(agents, `${LABEL}.plist.disabled-20260917`), '<plist/>');

  const stdout = execFileSync('bash', [INSTALLER], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      PATH: `${bin}:${process.env.PATH}`,
      OPS_FORCE_ENABLE_AGENT: force ? '1' : '0',
    },
  });

  return {
    stdout,
    launchctl: readFileSync(lcLog, 'utf8'),
    enabledPlistWritten: existsSync(join(agents, `${LABEL}.plist`)),
    scriptInstalled: existsSync(
      join(home, 'Library', 'Application Support', 'ops-offsite-backup', 'offsite-backup.sh')
    ),
  };
}

test('a disabled marker stops the installer enabling the agent', () => {
  const r = runInstaller({ marker: true });
  assert.equal(
    r.launchctl,
    '',
    'launchctl must not be invoked at all while the agent is held disabled'
  );
  assert.equal(
    r.enabledPlistWritten,
    false,
    `the installer must not write ${LABEL}.plist beside the disabled marker — ` +
      'that is precisely how the hold gets bypassed, since the two filenames differ'
  );
});

test('it still updates the script, which is the half that is always safe', () => {
  const r = runInstaller({ marker: true });
  assert.equal(r.scriptInstalled, true);
  assert.match(r.stdout, /Script updated/);
});

test('it says WHY, not just that it refused', () => {
  const r = runInstaller({ marker: true });
  assert.match(r.stdout, /DISABLED/);
  assert.match(r.stdout, /Lesson 44/, 'point the reader at the reason, not just the refusal');
  assert.match(r.stdout, /OPS_FORCE_ENABLE_AGENT=1/, 'name the escape hatch');
});

test('OPS_FORCE_ENABLE_AGENT=1 overrides the hold', () => {
  const r = runInstaller({ marker: true, force: true });
  assert.match(r.launchctl, /load/);
  assert.equal(r.enabledPlistWritten, true);
});

test('with no marker a normal install is untouched', () => {
  // The control. Without it a guard that simply always refused would pass
  // every assertion above and quietly break installing on a fresh machine.
  const r = runInstaller({ marker: false });
  assert.match(r.launchctl, /load/);
  assert.equal(r.enabledPlistWritten, true);
  assert.equal(r.scriptInstalled, true);
});
