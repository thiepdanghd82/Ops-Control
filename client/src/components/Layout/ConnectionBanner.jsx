/**
 * ConnectionBanner — top-of-app status banner (v1.3 P0).
 *
 * 3 states:
 *   - online (default): hidden
 *   - degraded (offline 5-30s): yellow "Đang kiểm tra kết nối..."
 *   - offline (>30s): red "⚠ Mất kết nối server. Đang thử lại trong Xs"
 *   - reconnected (just back online): green toast "✓ Kết nối lại — Refresh data"
 *     auto-fades after 8s
 *
 * Design: sticky top, 28px tall, doesn't push content (overlays). Aria-live.
 *
 * Wired into App.jsx near the top. Uses subscribeConnection from
 * services/connectionHealth.
 */

import React, { useEffect, useState } from 'react';
import { subscribeConnection, forceProbeConnection } from '../../services/connectionHealth';
import './ConnectionBanner.css';

export default function ConnectionBanner() {
  const [status, setStatus] = useState({ online: true });
  const [showReconnect, setShowReconnect] = useState(false);
  // 1Hz tick driving the offline-duration display. Owning the clock in
  // state keeps the render pure (no Date.now() in render path) and lets
  // React Compiler memoize correctly.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let prevOnline = true;
    const unsub = subscribeConnection((s) => {
      // Detect transition offline → online → flash reconnect toast
      if (!prevOnline && s.online) {
        setShowReconnect(true);
        setTimeout(() => setShowReconnect(false), 8000);
      }
      prevOnline = s.online;
      setStatus(s);
    });
    return unsub;
  }, []);

  // Hide entirely when online + no recent reconnect
  if (status.online && !showReconnect) return null;

  if (showReconnect && status.online) {
    return (
      <div className="cb-status-toast cb-status-ok" role="status" aria-live="polite">
        <span>✓ Kết nối lại — </span>
        <button className="cb-status-link" onClick={() => window.location.reload()}>
          Refresh trang
        </button>
        <button
          className="cb-status-dismiss"
          onClick={() => setShowReconnect(false)}
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>
    );
  }

  // Offline state
  const downSec = status.downSince
    ? Math.floor((now - new Date(status.downSince).getTime()) / 1000)
    : 0;
  const severity = downSec > 30 ? 'err' : 'warn';
  const msg =
    severity === 'err'
      ? `⚠ Mất kết nối server (${formatDuration(downSec)}). Đang thử lại...`
      : `Đang kiểm tra kết nối...`;

  return (
    <div className={`cb-status-banner cb-status-${severity}`} role="alert" aria-live="assertive">
      <span>{msg}</span>
      {status.lastError && <small className="cb-status-detail"> · {status.lastError}</small>}
      <button className="cb-status-link" onClick={() => forceProbeConnection()}>
        Thử lại ngay
      </button>
    </div>
  );
}

function formatDuration(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}
