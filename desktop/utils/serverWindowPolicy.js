/**
 * What closing the window and quitting mean on the SERVER build — kept pure so they can be
 * asserted without booting Electron.
 *
 * The SERVER app is the server: its embedded Express answers every client machine on the LAN.
 * Since 2026-10-14 nothing starts it at login, so the server runs exactly while the app runs.
 * Closing the window must therefore not stop it — the window hides, the app stays in the menu bar
 * — and quitting, which does stop it, asks first, because it disconnects every client.
 */

/**
 * @param {{ buildRole: string, isQuitting: boolean }} state
 * @returns {'hide' | 'close'}
 */
function closeAction({ buildRole, isQuitting }) {
  if (buildRole === 'server' && !isQuitting) return 'hide';
  return 'close';
}

/**
 * Whether a quit must be confirmed first. Not on the CLIENT build (nothing depends on it), not
 * once confirmed, and not while the system is shutting down or logging out — a dialog there would
 * hold up the shutdown.
 *
 * @param {{ buildRole: string, confirmed: boolean, shuttingDown: boolean }} state
 * @returns {boolean}
 */
function quitNeedsConfirm({ buildRole, confirmed, shuttingDown }) {
  return buildRole === 'server' && !confirmed && !shuttingDown;
}

module.exports = { closeAction, quitNeedsConfirm };
