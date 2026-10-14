// @ts-check
/**
 * Pure helpers for the Settings → Account Control "Phiên bản client"
 * column. Decides badge color (green/orange/gray) from raw audit data
 * + current server version + clock.
 *
 * Inputs are deliberately framework-free so node:test can exercise them
 * without React or fetch. The Settings.jsx integration imports this
 * helper directly; the server route just returns the raw audit data
 * (latest CLIENT_UPGRADE_NUDGE_SHOWN + CLIENT_VERSION_MATCH_AFTER_UPGRADE
 * per username).
 */

export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * @typedef {{
 *   event: 'CLIENT_UPGRADE_NUDGE_SHOWN' | 'CLIENT_VERSION_MATCH_AFTER_UPGRADE',
 *   ts: string,        // ISO timestamp
 *   client_version: string,
 *   server_version: string,
 * }} ClientVersionEvent
 *
 * @typedef {{
 *   kind: 'green' | 'orange' | 'gray',
 *   client_version: string | null,
 *   server_version: string | null,
 *   ts: string | null,
 * }} ClientVersionBadge
 */

/**
 * Decide badge state for a single user.
 *
 * Rules:
 *   - No events at all                 → gray ("? offline")
 *   - Latest event > 7 days old        → gray
 *   - Latest is MATCH + client_version === currentServerVersion → green
 *   - Latest is NUDGE_SHOWN            → orange (still mismatched)
 *   - Latest is MATCH but client_version ≠ currentServerVersion → orange
 *       (a newer server version landed AFTER this match)
 *
 * @param {ClientVersionEvent[]} userEvents — events for ONE user, any order
 * @param {string|null} currentServerVersion
 * @param {number} nowMs
 * @returns {ClientVersionBadge}
 */
export function getClientVersionBadge(userEvents, currentServerVersion, nowMs) {
  if (!Array.isArray(userEvents) || userEvents.length === 0) {
    return { kind: 'gray', client_version: null, server_version: null, ts: null };
  }
  // Pick the most-recent event by timestamp.
  let latest = null;
  for (const e of userEvents) {
    if (!e || !e.ts) continue;
    if (!latest || e.ts > latest.ts) latest = e;
  }
  if (!latest) {
    return { kind: 'gray', client_version: null, server_version: null, ts: null };
  }

  const ageMs = nowMs - Date.parse(latest.ts);
  if (Number.isFinite(ageMs) && ageMs > STALE_AFTER_MS) {
    return {
      kind: 'gray',
      client_version: latest.client_version || null,
      server_version: latest.server_version || null,
      ts: latest.ts,
    };
  }

  if (latest.event === 'CLIENT_VERSION_MATCH_AFTER_UPGRADE') {
    if (currentServerVersion && latest.client_version === currentServerVersion) {
      return {
        kind: 'green',
        client_version: latest.client_version,
        server_version: latest.server_version || null,
        ts: latest.ts,
      };
    }
    // The user matched server at the time, but server has since moved.
    return {
      kind: 'orange',
      client_version: latest.client_version || null,
      server_version: currentServerVersion || latest.server_version || null,
      ts: latest.ts,
    };
  }

  // NUDGE_SHOWN — still in mismatch (the next match would have produced
  // a more-recent MATCH event and won the "latest" tiebreak above).
  return {
    kind: 'orange',
    client_version: latest.client_version || null,
    server_version: latest.server_version || null,
    ts: latest.ts,
  };
}

/**
 * Parse the audit-log row shape from `/api/users/client-versions` into
 * the per-user event arrays consumed by getClientVersionBadge.
 *
 * Input rows look like:
 *   { ts, event, user, detail: '{"client_version":"1.5.10","server_version":"1.5.11","platform":"darwin"}' }
 *
 * Output:
 *   Map<username, ClientVersionEvent[]>
 *
 * Bad/unparseable detail rows are skipped silently (no throw — Lead
 * shouldn't see a Settings crash because one audit row is malformed).
 *
 * @param {Array<{ ts: string, event: string, user: string, detail: string|object }>} rows
 * @returns {Map<string, ClientVersionEvent[]>}
 */
export function groupClientVersionEventsByUser(rows) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const r of rows) {
    if (!r || !r.user || !r.event || !r.ts) continue;
    let detail = r.detail;
    if (typeof detail === 'string') {
      try {
        detail = JSON.parse(detail);
      } catch {
        continue;
      }
    }
    if (!detail || typeof detail !== 'object') continue;
    const ev = {
      event: r.event,
      ts: r.ts,
      client_version: String(detail.client_version || ''),
      server_version: String(detail.server_version || ''),
    };
    if (!ev.client_version) continue;
    const arr = map.get(r.user) || [];
    arr.push(ev);
    map.set(r.user, arr);
  }
  return map;
}
