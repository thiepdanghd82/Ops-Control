// @ts-check
/**
 * fleetHeartbeat — desktop-only License Manager heartbeat (v1.6).
 *
 * When a desktop app connects to the server (any role), it reports its own
 * license status (metadata only — NEVER the license content/signature) so the
 * sys-admin License Manager tab can see the whole fleet. If the server has a
 * license queued for this machine, it is delivered in the heartbeat reply and
 * applied locally via the Electron IPC (verify + backup + write); the app then
 * prompts the user to restart (we never restart mid-session).
 *
 * On a web client (no `window.ops`) every entry point here is a safe no-op.
 */
import { licenseFleetApi } from './api';
import { buildHeartbeatPayload } from './licenseFleetView';

// Re-export the pure helpers (defined in licenseFleetView.js so node:test can
// import them without resolving the Vite-only api.js module).
export { deriveStatus, buildHeartbeatPayload } from './licenseFleetView';

/**
 * Send one heartbeat. Desktop-only; no-op on web. If the server delivers a
 * pending license, apply it locally and confirm distribution.
 * @returns {Promise<{ok:boolean, skipped?:string, applied?:boolean, needsRestart?:boolean, error?:string}>}
 */
export async function sendFleetHeartbeat() {
  const ops = typeof window !== 'undefined' ? window.ops : null;
  if (!ops?.license?.status) return { ok: false, skipped: 'not-desktop' };

  let info;
  try {
    info = await ops.license.status();
  } catch {
    return { ok: false, skipped: 'ipc-failed' };
  }
  const payload = buildHeartbeatPayload(info);
  if (!payload) return { ok: false, skipped: 'no-installation-id' };

  let resp;
  try {
    resp = await licenseFleetApi.heartbeat(payload);
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }

  // B3 — apply a delivered license locally (verify + backup + write happen in
  // the main process). Never restart automatically; surface needsRestart.
  if (resp?.pending_license && ops.license.applyFromFleet) {
    try {
      const applied = await ops.license.applyFromFleet(resp.pending_license);
      if (applied?.ok) {
        try {
          await licenseFleetApi.confirmDistributed(payload.installation_id);
        } catch {
          /* server will redeliver on next heartbeat if confirm failed */
        }
        return { ok: true, applied: true, needsRestart: !!applied.needsRestart };
      }
    } catch {
      /* leave queued; retry next heartbeat */
    }
  }
  return { ok: true, applied: false };
}
