/**
 * ActiveUsersIndicator — small TopBar widget showing how many users
 * are currently online + a popover listing them.
 *
 * Why: in 6-20 user LAN deploys, operators want to know "is Quynh on
 * right now? can I ping her about this RFQ?" without checking the
 * Chat drawer's online dot. This is a passive header indicator.
 *
 * Data source: GET /api/users/status — already exists, returns the
 * full user list with `online: bool` + `last_seen` per user. Server
 * marks online via heartbeat + login. We poll every 30s and refresh
 * on SSE quote/rfq/sample events too (those events imply someone is
 * active right now, so it's a free presence signal).
 *
 * UX: shows "● 3 online" pill. Click to open dropdown listing names +
 * last-seen for the offline users. Closes on outside click / ESC.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { costApi } from '../../services/api';
import { subscribeDataEvents } from '../../services/dataEventBus';
import './ActiveUsersIndicator.css';

const POLL_MS = 30000;

function fmtLastSeen(iso) {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins}m trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h trước`;
  return `${Math.floor(hrs / 24)}d trước`;
}

export default function ActiveUsersIndicator() {
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const popRef = useRef(null);
  const btnRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await costApi.getUsersStatus();
      const list = Array.isArray(res?.users) ? res.users : [];
      setUsers(list);
      setErr(null);
    } catch (e) {
      setErr(e?.message || 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + interval poll. Pause when document.hidden so we're not
  // burning a request every 30s on a backgrounded tab.
  useEffect(() => {
    refresh();
    let id = null;
    const start = () => {
      if (!id) id = setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (id) {
        clearInterval(id);
        id = null;
      }
    };
    start();
    const onVis = () => {
      document.hidden ? stop() : (refresh(), start());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  // SSE bonus: when ANY user emits a data change (save/update), they're
  // demonstrably online. Refresh presence so the indicator reflects
  // that without waiting for the next 30s tick.
  useEffect(() => {
    const unsub = subscribeDataEvents(
      ['quote.saved', 'rfq.updated', 'sample.updated', 'approval.transition'],
      () => {
        refresh();
      }
    );
    return unsub;
  }, [refresh]);

  // Outside-click + ESC to close popover
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onlineCount = users.filter((u) => u.online).length;
  const sortedOnline = users
    .filter((u) => u.online)
    .sort((a, b) => (a.full_name || a.username).localeCompare(b.full_name || b.username));
  const sortedRecentOffline = users
    .filter((u) => !u.online && u.last_seen)
    .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen))
    .slice(0, 8);

  return (
    <div className="active-users">
      <button
        ref={btnRef}
        type="button"
        className={`active-users-btn ${onlineCount > 0 ? 'has-online' : 'no-online'}`}
        onClick={() => setOpen((o) => !o)}
        title={`${onlineCount} người đang online — click để xem danh sách`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="active-users-dot" aria-hidden />
        <span className="active-users-count">{onlineCount}</span>
        <span className="active-users-label">online</span>
      </button>

      {open && (
        <div ref={popRef} className="active-users-pop" role="dialog" aria-label="Người dùng online">
          <div className="active-users-pop-head">
            <strong>{onlineCount} người online</strong>
            <button
              className="active-users-refresh"
              onClick={refresh}
              disabled={loading}
              title="Refresh"
              aria-label="Refresh"
            >
              ↻
            </button>
          </div>

          {err && <div className="active-users-err">⚠ {err}</div>}

          {sortedOnline.length === 0 && !err && (
            <div className="active-users-empty">Chưa ai online</div>
          )}

          {sortedOnline.length > 0 && (
            <ul className="active-users-list">
              {sortedOnline.map((u) => (
                <li key={u.id} className="active-users-item online">
                  <span className="active-users-item-dot" aria-hidden />
                  <span className="active-users-item-name">{u.full_name || u.username}</span>
                  {u.role && u.role !== 'user' && (
                    <span className="active-users-item-role">{u.role}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {sortedRecentOffline.length > 0 && (
            <>
              <div className="active-users-pop-sep">Online gần đây</div>
              <ul className="active-users-list">
                {sortedRecentOffline.map((u) => (
                  <li key={u.id} className="active-users-item offline">
                    <span className="active-users-item-dot offline" aria-hidden />
                    <span className="active-users-item-name">{u.full_name || u.username}</span>
                    <span className="active-users-item-when">{fmtLastSeen(u.last_seen)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
