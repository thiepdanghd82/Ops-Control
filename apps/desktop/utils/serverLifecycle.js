/**
 * serverLifecycle — in the SERVER build the embedded server lives exactly
 * as long as the app: opening the app starts it, closing the app stops it,
 * and nothing starts it with the Mac.
 *
 * Before this, closing the window on macOS left the app in the Dock/tray
 * with the server still running, and quitting sent SIGTERM without waiting,
 * so a server that did not stop in time was left running on its own.
 */

'use strict';

// Whether closing the last window should quit the app (and so stop the
// server). Never mid-startup, on any platform: the setup wizard and
// first-run windows close before the main window exists (a cancelled wizard
// quits explicitly). Windows/Linux then always quit, as before. macOS quits
// whenever this app runs an embedded server — the SERVER build, or a CLIENT
// build that fell back to embedded — instead of lingering in the Dock with
// the server still serving the LAN; a thin CLIENT keeps the Dock behaviour.
function shouldQuitOnAllWindowsClosed({ platform, buildRole, startupDone, hasEmbeddedServer }) {
  if (!startupDone) return false;
  if (platform !== 'darwin') return true;
  return buildRole === 'server' || !!hasEmbeddedServer;
}

// Stop the server child and resolve once it is gone; never rejects.
// Ask through the IPC channel first: the server maps 'disconnect' to its
// graceful shutdown (drain, flush sessions, close SQLite) on every platform,
// whereas on Windows child.kill('SIGTERM') is TerminateProcess — an instant
// hard kill. Without a channel, SIGTERM is the request (POSIX only). After
// graceMs it is SIGKILLed.
function stopChildProcess(
  child,
  { graceMs = 8000, killMs = 2000, platform = process.platform } = {}
) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve({ alreadyExited: true, forced: false });
      return;
    }
    let forced = false;
    let via = null;
    const giveUp = setTimeout(
      () => resolve({ forced: true, exited: false, via }),
      graceMs + killMs
    );
    const graceTimer = setTimeout(() => {
      forced = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, graceMs);
    child.once('exit', (code, signal) => {
      clearTimeout(graceTimer);
      clearTimeout(giveUp);
      resolve({ code, signal, forced, exited: true, via });
    });
    try {
      if (child.connected) {
        via = 'ipc';
        child.disconnect();
      } else if (platform !== 'win32') {
        via = 'SIGTERM';
        child.kill('SIGTERM');
      }
    } catch {
      /* already gone — the exit event still fires */
    }
  });
}

module.exports = { shouldQuitOnAllWindowsClosed, stopChildProcess };
