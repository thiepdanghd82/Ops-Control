/**
 * autostartGuard.test.js — the SERVER build switches off our own launchd
 * autostart jobs so the server never starts with the Mac.
 *
 * Run with: node --test desktop/utils/autostartGuard.test.js
 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const g = require('./autostartGuard');

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-autostart-'));
  fs.mkdirSync(path.join(home, 'Library', 'LaunchAgents'), { recursive: true });
  return home;
}
const realFs = {
  mkdir: (d) => fs.mkdirSync(d, { recursive: true }),
  rename: fs.renameSync,
  exists: fs.existsSync,
};

test('finds exactly the launchd jobs our autostart scripts install', () => {
  const home = fakeHome();
  const agents = path.join(home, 'Library', 'LaunchAgents');
  for (const l of g.USER_AGENT_LABELS)
    fs.writeFileSync(path.join(agents, `${l}.plist`), '<plist/>');
  fs.writeFileSync(path.join(agents, 'com.example.other.plist'), '<plist/>');
  const daemon = `/Library/LaunchDaemons/${g.SYSTEM_DAEMON_LABEL}.plist`;
  const exists = (p) => p === daemon || fs.existsSync(p);
  const r = g.findAutostart({ home, exists });
  assert.deepEqual(r.userAgents.map((a) => a.label).sort(), [...g.USER_AGENT_LABELS].sort());
  assert.deepEqual(r.systemDaemons, [{ label: g.SYSTEM_DAEMON_LABEL, plist: daemon }]);
  fs.rmSync(home, { recursive: true, force: true });
});

test('nothing installed → nothing found', () => {
  const home = fakeHome();
  const r = g.findAutostart({ home, exists: fs.existsSync });
  assert.deepEqual(r, { userAgents: [], systemDaemons: [] });
  fs.rmSync(home, { recursive: true, force: true });
});

test('a launch by one of those jobs is recognised from XPC_SERVICE_NAME', () => {
  assert.equal(
    g.launchedByAgent({ XPC_SERVICE_NAME: 'vn.ccldesign.opscontrol.server' }),
    'vn.ccldesign.opscontrol.server'
  );
  assert.equal(
    g.launchedByAgent({ XPC_SERVICE_NAME: 'application.vn.ccldesign.opscontrol.1' }),
    null
  );
  assert.equal(g.launchedByAgent({}), null);
});

test('agents are moved out of the folder launchd reads, not deleted', () => {
  const home = fakeHome();
  const dir = path.join(home, 'Library', 'LaunchAgents');
  const plist = path.join(dir, 'vn.ccldesign.opscontrol.server.plist');
  fs.writeFileSync(plist, '<plist>keep me</plist>');
  const [r] = g.moveAgentsAside([{ label: 'vn.ccldesign.opscontrol.server', plist }], realFs);
  assert.equal(fs.existsSync(plist), false, 'no longer loaded at login');
  assert.equal(path.dirname(r.movedTo), path.join(dir, g.ASIDE_DIR));
  assert.equal(fs.readFileSync(r.movedTo, 'utf8'), '<plist>keep me</plist>');
  // A second disable of a re-installed agent does not overwrite the first copy.
  fs.writeFileSync(plist, '<plist>again</plist>');
  const [r2] = g.moveAgentsAside([{ label: 'x', plist }], realFs);
  assert.notEqual(r2.movedTo, r.movedTo);
  assert.equal(fs.readFileSync(r.movedTo, 'utf8'), '<plist>keep me</plist>');
  fs.rmSync(home, { recursive: true, force: true });
});

test('a plist that cannot be moved is reported, not thrown', () => {
  const r = g.moveAgentsAside([{ label: 'x', plist: '/nonexistent/x.plist' }], {
    ...realFs,
    mkdir: () => {},
  });
  assert.match(r[0].error, /ENOENT|no such file/i);
});

test('launchctl and sudo commands target the right domain', () => {
  assert.deepEqual(g.bootoutArgs('vn.ccldesign.opscontrol.server', 501), [
    'bootout',
    'gui/501/vn.ccldesign.opscontrol.server',
  ]);
  assert.deepEqual(
    g.daemonRemovalCommands({
      label: 'com.opscontrol.server',
      plist: '/Library/LaunchDaemons/com.opscontrol.server.plist',
    }),
    [
      'sudo launchctl bootout system/com.opscontrol.server',
      'sudo rm "/Library/LaunchDaemons/com.opscontrol.server.plist"',
    ]
  );
});
