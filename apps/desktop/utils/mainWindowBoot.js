/**
 * How the main window gets from "app started" to "app page loaded" — two decisions, kept pure so
 * they can be asserted without booting Electron.
 *
 * Both raised a false "Không kết nối được tới http://127.0.0.1:3100" dialog on 2026-09-28, right
 * after an install, over an app that had loaded fine.
 */

/**
 * Show the connecting screen, wait for the server, then load the app — never overlapping.
 *
 * The connecting screen must finish loading before the app URL is loaded. Loading the app while
 * the connecting screen is committed but still loading aborts it, and Electron's loadURL() promise
 * for the app records that abort (-3, on the data: URL) and rejects after the app page has loaded.
 * On a busy boot that window is a few milliseconds wide; it was hit once in eleven boots.
 *
 * Drives only the window it is handed, so a second call cannot load the first call's window.
 *
 * @param {{ loadURL(url: string): Promise<void> }} win
 * @param {{ connectingUrl: string, appUrl: string, waitReady: () => Promise<boolean> }} opts
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'unreachable' }
 *   | { ok: false, reason: 'load-failed', err: unknown }>}
 */
async function connectThenLoad(win, { connectingUrl, appUrl, waitReady }) {
  const connecting = win.loadURL(connectingUrl).catch(() => {});
  const ready = await waitReady();
  if (!ready) return { ok: false, reason: 'unreachable' };
  await connecting;
  try {
    await win.loadURL(appUrl);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'load-failed', err };
  }
}

/**
 * What the macOS `activate` event should do with the main window.
 *
 * `activate` also fires while the app is starting — a Dock click, or the reopen event of a second
 * launch, in the seconds the embedded server takes to come up. Startup creates the main window
 * once the server is ready; a window created here as well meant two createMainWindow() calls whose
 * loads aborted each other, and the second false dialog. So until startup has created the window,
 * activate waits.
 *
 * @param {{ startupDone: boolean, windowCount: number }} state
 * @returns {'wait' | 'create' | 'show'}
 */
function activateAction({ startupDone, windowCount }) {
  if (!startupDone) return 'wait';
  return windowCount === 0 ? 'create' : 'show';
}

module.exports = { connectThenLoad, activateAction };
