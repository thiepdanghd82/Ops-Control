/**
 * <ClientUpdateIndicator> — P0 visibility-only nudge.
 *
 * Polls GET /api/version every 5 minutes. When server version ≠ client
 * version, renders a red banner (or collapsed chip) telling the operator
 * to contact Lead for a new installer. No download button at P0 — the
 * /downloads/ static-serve + IPC openExternal land at P0.1 after a
 * dedicated path-traversal review.
 *
 * Audit:
 *   - First mismatch detection per session → POST CLIENT_UPGRADE_NUDGE_SHOWN
 *     (gated by a React ref so poll #2 in same session doesn't re-emit).
 *   - On boot, if versions now match AND localStorage shows a prior
 *     mismatch record → POST CLIENT_VERSION_MATCH_AFTER_UPGRADE, then
 *     remove the LS key. See clientUpdateState.js#detectUpgradeTransition
 *     for the contract + the literal-vs-intent note.
 *
 * Failure handling: all fetch failures (server unreachable, audit POST
 * 401/500) are silently swallowed. The indicator is background-poll
 * UX; we never raise a toast or error UI from here.
 *
 * Pure helpers live in services/clientUpdateState.js so node:test can
 * exercise the logic without a JSX loader.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LS_COLLAPSED_KEY,
  LS_LAST_MISMATCH_KEY,
  decideIndicatorMode,
  detectUpgradeTransition,
  mapPlatform,
} from '../../services/clientUpdateState';
import './ClientUpdateIndicator.css';

// Injected by vite.config.js#define from client/package.json#version.
// Declared here so a missing inject (e.g. running outside Vite) collapses
// to undefined rather than ReferenceError-ing the whole app.
/* global __APP_VERSION__ */
const CLIENT_VERSION =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : null;

const POLL_INTERVAL_MS = 5 * 60 * 1000;

// LS access helpers — try/catch around every call so Safari private-
// browsing or quota errors don't crash the indicator.
function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

async function postAuditEvent(event, detail) {
  try {
    await fetch('/api/audit/client-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ event, detail }),
    });
    // 401/400 are silently swallowed: 401 just means we're not logged
    // in yet (banner may render on the login screen). The next mismatch
    // detection after login will emit. 400 is a contract bug — we'd
    // catch it in tests, not in user-facing UI.
  } catch {
    /* network down — silent */
  }
}

function readPlatform() {
  try {
    return mapPlatform(window.opsRuntime?.platform);
  } catch {
    return 'unknown';
  }
}

export default function ClientUpdateIndicator() {
  const [serverVersion, setServerVersion] = useState(null);
  const [collapsedFor, setCollapsedFor] = useState(() => lsGet(LS_COLLAPSED_KEY));
  const platformRef = useRef(readPlatform());

  // Session-scoped flag so CLIENT_UPGRADE_NUDGE_SHOWN emits once per
  // app launch (not per poll). Re-launching the app produces a new
  // record — the prompt's intent so Lead can count "operator opened
  // app N times while outdated".
  const nudgeEmittedThisSessionRef = useRef(false);

  // Boot-time upgrade audit: runs once after the first successful
  // /api/version response. We need the server version before we can
  // decide to fire CLIENT_VERSION_MATCH_AFTER_UPGRADE.
  const upgradeAuditDoneRef = useRef(false);

  const fetchVersion = useCallback(async (signal) => {
    try {
      const r = await fetch('/api/version', {
        signal,
        credentials: 'include',
      });
      if (!r.ok) return;
      const data = await r.json();
      if (data && typeof data.version === 'string') {
        setServerVersion(data.version);
      }
    } catch {
      // AbortError on unmount, NetworkError when server down. Both
      // silent.
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    // fetchVersion is async — setServerVersion runs inside the awaited
    // .json() callback, which is the "subscribe for updates from an
    // external system" pattern the react-compiler rule approves. The
    // disable below is for the rule's overly broad detection of any
    // setState reachable from an effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchVersion(ac.signal);
    const id = setInterval(() => fetchVersion(ac.signal), POLL_INTERVAL_MS);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [fetchVersion]);

  // Once we have a server version, run the per-session audit logic.
  useEffect(() => {
    if (!serverVersion || !CLIENT_VERSION) return;

    const lastMismatch = lsGet(LS_LAST_MISMATCH_KEY);
    const isMismatch = CLIENT_VERSION !== serverVersion;

    if (isMismatch) {
      // Persist the server version we mismatched against — boot-time
      // check on next session uses this to detect upgrade transition.
      lsSet(LS_LAST_MISMATCH_KEY, serverVersion);

      // Emit nudge-shown once per session.
      if (!nudgeEmittedThisSessionRef.current) {
        nudgeEmittedThisSessionRef.current = true;
        postAuditEvent('CLIENT_UPGRADE_NUDGE_SHOWN', {
          client_version: CLIENT_VERSION,
          server_version: serverVersion,
          platform: platformRef.current,
        });
      }
    } else {
      // Match. Fire upgrade-transition audit at most once per boot,
      // then clear the LS record so subsequent boots don't re-fire.
      if (!upgradeAuditDoneRef.current) {
        upgradeAuditDoneRef.current = true;
        if (
          detectUpgradeTransition({
            clientVersion: CLIENT_VERSION,
            serverVersion,
            lastMismatchServerVersion: lastMismatch,
          })
        ) {
          postAuditEvent('CLIENT_VERSION_MATCH_AFTER_UPGRADE', {
            client_version: CLIENT_VERSION,
            server_version: serverVersion,
            platform: platformRef.current,
          });
          lsRemove(LS_LAST_MISMATCH_KEY);
        }
      }
    }
  }, [serverVersion]);

  // Reflect banner presence on <html> via data attribute so other UI
  // (sidebars, toasts) can offset themselves if they care. CSS rule in
  // the stylesheet pads <body> by the banner height when this is set.
  const { mode } = decideIndicatorMode({
    clientVersion: CLIENT_VERSION,
    serverVersion,
    collapsedForVersion: collapsedFor,
  });
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (mode === 'banner') {
      document.documentElement.setAttribute('data-cui-banner', 'true');
      return () => document.documentElement.removeAttribute('data-cui-banner');
    }
    return undefined;
  }, [mode]);

  if (mode === 'hidden') return null;

  if (mode === 'chip') {
    return (
      <button
        type="button"
        className="cui-chip"
        title="Nhấn để mở thông báo cập nhật"
        onClick={() => {
          lsRemove(LS_COLLAPSED_KEY);
          setCollapsedFor(null);
        }}
      >
        ⚠ v{serverVersion} có sẵn — liên hệ Lead
      </button>
    );
  }

  // mode === 'banner'
  return (
    <div className="cui-banner" role="status" aria-live="polite">
      <div className="cui-banner-text">
        <strong>Phiên bản client đã cũ.</strong> Server đã lên v{serverVersion}, bạn đang dùng v
        {CLIENT_VERSION}. Vui lòng <strong>liên hệ Lead</strong> để nhận file cài đặt mới trước khi
        tiếp tục thao tác quan trọng.
      </div>
      <div className="cui-banner-actions">
        <button
          type="button"
          className="cui-banner-collapse-btn"
          onClick={() => {
            lsSet(LS_COLLAPSED_KEY, serverVersion);
            setCollapsedFor(serverVersion);
          }}
        >
          Thu gọn
        </button>
      </div>
    </div>
  );
}
