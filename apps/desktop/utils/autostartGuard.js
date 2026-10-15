/**
 * autostartGuard — the SERVER build must not start with the computer.
 *
 * Our own autostart scripts installed launchd jobs that start the app (or a
 * headless server) at login/boot, and their KeepAlive relaunches it after it
 * is closed — the opposite of "the server runs only while the app is open".
 *
 * The user-domain LaunchAgents belong to the logged-in user, so the app
 * switches them off itself: the plist is moved into a sub-folder launchd does
 * not read (reversible, never deleted), and the job is booted out of launchd
 * — at quit if launchd started this very app (booting it out earlier would
 * SIGTERM the app mid-start), else at once. The system LaunchDaemon of the
 * headless install needs admin rights, so it is only reported, with the
 * exact commands.
 */

'use strict';
const path = require('node:path');

const USER_AGENT_LABELS = ['vn.ccldesign.opscontrol.server', 'com.ccldesign.opscontrol-server'];
const SYSTEM_DAEMON_LABEL = 'com.opscontrol.server';
const ASIDE_DIR = 'Disabled by Quoted Module';

function findAutostart({ home, exists }) {
  const agentsDir = path.join(home, 'Library', 'LaunchAgents');
  const userAgents = USER_AGENT_LABELS.map((label) => ({
    label,
    plist: path.join(agentsDir, `${label}.plist`),
  })).filter((a) => exists(a.plist));
  const daemonPlist = `/Library/LaunchDaemons/${SYSTEM_DAEMON_LABEL}.plist`;
  const systemDaemons = exists(daemonPlist)
    ? [{ label: SYSTEM_DAEMON_LABEL, plist: daemonPlist }]
    : [];
  return { userAgents, systemDaemons };
}

// launchd sets XPC_SERVICE_NAME to the job label for processes it starts.
function launchedByAgent(env) {
  return USER_AGENT_LABELS.includes(env.XPC_SERVICE_NAME) ? env.XPC_SERVICE_NAME : null;
}

// Move each agent's plist into a sub-folder (launchd only reads the folder
// itself), so it is not loaded at the next login. Never throws.
function moveAgentsAside(agents, { mkdir, rename, exists }) {
  return agents.map((a) => {
    const dir = path.join(path.dirname(a.plist), ASIDE_DIR);
    let to = path.join(dir, path.basename(a.plist));
    try {
      mkdir(dir);
      if (exists(to)) to = `${to}.${Date.now()}`;
      rename(a.plist, to);
      return { ...a, movedTo: to };
    } catch (err) {
      return { ...a, error: err.message };
    }
  });
}

function bootoutArgs(label, uid) {
  return ['bootout', `gui/${uid}/${label}`];
}

function daemonRemovalCommands({ label, plist }) {
  return [`sudo launchctl bootout system/${label}`, `sudo rm "${plist}"`];
}

module.exports = {
  USER_AGENT_LABELS,
  SYSTEM_DAEMON_LABEL,
  ASIDE_DIR,
  findAutostart,
  launchedByAgent,
  moveAgentsAside,
  bootoutArgs,
  daemonRemovalCommands,
};
