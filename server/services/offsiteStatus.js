/**
 * Off-site mirror health, for Settings → Backup.
 *
 * The off-site job is a LaunchAgent shell script outside this app, so the app
 * does not run it and must not parse its log. The script drops a small status
 * file instead; this reads it and turns it into a verdict the card can show.
 *
 * Why it exists: the mirror ran every 4 hours for 84 days and skipped every
 * single time because its target drive was never plugged in. 478 runs, 0
 * successes, and nothing anywhere said so — the only trace was a log file
 * nobody opens. A backup you cannot see the health of is a backup you are
 * guessing about.
 *
 * So the number that matters is not "did the last run work" but **how long
 * since one actually succeeded**. A run that dutifully reports SKIP forever
 * looks healthy under any last-run check, which is exactly how this hid.
 */
import fs from 'fs';
import path from 'path';

export const OFFSITE_STATUS_FILE = 'offsite-status.json';

/** Hours since the last success before the card stops calling it healthy. */
export const STALE_AFTER_HOURS = 24;

export function offsiteStatusPath(dataRoot) {
  return path.join(dataRoot, 'Library', 'SystemConfig', OFFSITE_STATUS_FILE);
}

export function readOffsiteStatus(dataRoot) {
  try {
    const j = JSON.parse(fs.readFileSync(offsiteStatusPath(dataRoot), 'utf-8'));
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null; // never configured, or unreadable — resolve() calls it 'none'
  }
}

/**
 * @returns {{tone:'ok'|'warn'|'bad'|'none', reason:string, lastOkAt:string|null,
 *            lastRunAt:string|null, ageHours:number|null, dest:string|null,
 *            detail:string|null}}
 *
 * `reason` is a stable code, not a sentence — the client owns the wording so
 * it can translate it.
 */
export function resolveOffsiteHealth(status, nowMs = Date.now()) {
  const base = {
    lastOkAt: null,
    lastRunAt: null,
    ageHours: null,
    dest: null,
    detail: null,
  };
  if (!status || typeof status !== 'object') {
    return { ...base, tone: 'none', reason: 'not_configured' };
  }

  const out = {
    ...base,
    lastOkAt: typeof status.last_ok_at === 'string' ? status.last_ok_at : null,
    lastRunAt: typeof status.last_run_at === 'string' ? status.last_run_at : null,
    dest: typeof status.dest === 'string' ? status.dest : null,
    detail: typeof status.detail === 'string' ? status.detail : null,
  };

  // Never succeeded. The job may well be running on schedule — that is the
  // trap, not a mitigation — so this is the worst state, not a warning.
  if (!out.lastOkAt) {
    return { ...out, tone: 'bad', reason: 'never_succeeded' };
  }

  const okMs = Date.parse(out.lastOkAt);
  if (!Number.isFinite(okMs)) {
    return { ...out, tone: 'bad', reason: 'unreadable_timestamp' };
  }

  out.ageHours = Math.max(0, (nowMs - okMs) / 3_600_000);
  if (out.ageHours > STALE_AFTER_HOURS) {
    return { ...out, tone: 'warn', reason: 'stale' };
  }
  // Fresh success, but say so if the most recent attempt still failed —
  // the mirror is intact yet drifting, and that is worth seeing early.
  if (status.last_run_state && status.last_run_state !== 'ok') {
    return { ...out, tone: 'warn', reason: 'last_run_failed' };
  }
  return { ...out, tone: 'ok', reason: 'ok' };
}
