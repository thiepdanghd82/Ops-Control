/**
 * UnreadLoginPopup — one-shot modal on login with a digest of unread
 * conversations. Click a row to jump into the Messages tab with that
 * conversation pre-selected.
 *
 * Trigger rules (kept narrow so it never nags):
 *   - Only fires on a real login transition (isAuthenticated null→true).
 *     A plain page reload of an already-authenticated session doesn't
 *     re-fire — we gate on a sessionStorage flag keyed by user id.
 *   - Only shown when at least one conversation has unread_count > 0.
 *   - Never shown twice in the same browser session. Logout clears the
 *     flag so the next login gets it again.
 *
 * Navigation: click a row → dispatch `ops-switch-tab` (existing event
 * listened to by App.jsx which calls setActiveModule('cost') +
 * setActiveTab('messages')) + write `ops_pending_conv_id` to
 * sessionStorage. MessagesTab reads that on mount and auto-selects.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { chatApi } from '../../services/chatApi';
import Modal from '../Shared/Modal';
import './UnreadLoginPopup.css';

// How many conversations to list before collapsing into "and N more".
// Five is enough to cover the common case without the modal becoming a
// scrollable wall — the overflow link sends the user to the full tab.
const VISIBLE_LIMIT = 5;

const FLAG_KEY = 'ops_unread_popup_seen_for';
const PENDING_ROOM_KEY = 'ops_pending_conv_id';

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isFinite(d)) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const age = (today - d) / 86400000;
  if (age < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

function openMessagesTab(roomId) {
  try {
    sessionStorage.setItem(PENDING_ROOM_KEY, String(roomId));
  } catch {
    /* ignore — private mode / quota */
  }
  // Reuses the existing App-level event that already handles
  // module + tab switching atomically.
  window.dispatchEvent(new CustomEvent('ops-switch-tab', { detail: 'messages' }));
}

export default function UnreadLoginPopup() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [convs, setConvs] = useState([]);

  // Fire once per (user id × browser session). We key on user id so
  // switching accounts in the same tab still shows the popup for the
  // new user. `sessionStorage` clears on tab dismiss — a fresh tab the
  // next day will show the popup again even without logging out.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const seenKey = `${FLAG_KEY}:${user.id}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(seenKey) === '1';
    } catch {
      /* ignore */
    }
    if (seen) return;

    let cancelled = false;
    (async () => {
      try {
        const r = await chatApi.conversations();
        if (cancelled) return;
        const unread = (r?.conversations || []).filter((c) => (c.unread_count || 0) > 0);
        if (unread.length === 0) {
          // Nothing to show — burn the flag anyway so we don't refetch
          // every time the component remounts during this session.
          try {
            sessionStorage.setItem(seenKey, '1');
          } catch {
            /* ignore */
          }
          return;
        }
        // Already sorted server-side by updated_at DESC; trust that.
        setConvs(unread);
        setOpen(true);
      } catch {
        // Chat might be disabled (503) or endpoint not deployed.
        // Either way, the popup is a nice-to-have — never block login.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  // ESC dismisses. Click backdrop dismisses. Click X dismisses. Each
  // path flips the seen-flag so we don't re-open on fast re-renders.
  // Not wrapped in useCallback — React Compiler handles it and the
  // project lint rule doesn't allow manual memoization here.
  const dismiss = () => {
    setOpen(false);
    if (user?.id) {
      try {
        sessionStorage.setItem(`${FLAG_KEY}:${user.id}`, '1');
      } catch {
        /* ignore */
      }
    }
  };

  const totalUnread = convs.reduce((s, c) => s + (c.unread_count || 0), 0);
  const visible = convs.slice(0, VISIBLE_LIMIT);
  const remaining = convs.length - visible.length;

  const jumpTo = (roomId) => {
    dismiss();
    openMessagesTab(roomId);
  };

  const openAll = () => {
    dismiss();
    // Don't preselect a room when "Xem tất cả" — just open the inbox.
    try {
      sessionStorage.removeItem(PENDING_ROOM_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent('ops-switch-tab', { detail: 'messages' }));
  };

  const title = `Bạn có ${totalUnread} tin chưa đọc`;
  const subtitle =
    convs.length > 1
      ? `Trong ${convs.length} cuộc trò chuyện — click để mở`
      : 'Click để mở, hoặc đóng lại xem sau';

  return (
    <Modal open={open} onClose={dismiss} size="md" severity="info" ariaLabelledBy="ulp-title">
      <Modal.Header id="ulp-title" title={title} subtitle={subtitle} severity="info" />
      <Modal.Body className="flush">
        <div className="ulp-list">
          {visible.map((c) => {
            const isDm = c.kind === 'dm';
            const name = isDm
              ? c.peer?.full_name || c.peer?.username || 'Unknown'
              : c.title || c.key;
            const last = c.last_message;
            const isSelf = last && Number(last.author_id) === Number(user?.id);
            const preview = !last
              ? 'No messages yet'
              : last.deleted_at
                ? '(deleted)'
                : (isSelf ? 'You: ' : '') + String(last.body || '').slice(0, 140);
            const avatarKind = isDm
              ? ''
              : c.kind === 'quote'
                ? 'quote'
                : c.kind === 'team'
                  ? 'team'
                  : 'group';
            return (
              <div key={c.id} className="ulp-row" onClick={() => jumpTo(c.id)}>
                <div className={`ulp-avatar ${avatarKind}`}>
                  {c.kind === 'quote' ? 'Q' : isDm ? initialsOf(name) : '#'}
                  {isDm && c.peer?.online && <span className="dot" title="Online" />}
                </div>
                <div className="ulp-row-main">
                  <div className="ulp-row-top">
                    <span className="ulp-name">{name}</span>
                    <span className="ulp-time">{fmtTime(c.updated_at)}</span>
                  </div>
                  <div className="ulp-row-top">
                    <span className="ulp-preview">{preview}</span>
                    <span className="ulp-badge">{c.unread_count}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {remaining > 0 && (
            <div className="ulp-more" onClick={openAll}>
              và {remaining} cuộc trò chuyện khác → Xem tất cả trong Inbox
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-ghost" onClick={dismiss}>
          Để sau
        </button>
        <button type="button" className="op-btn op-btn-primary" onClick={openAll}>
          Mở Inbox
        </button>
      </Modal.Footer>
    </Modal>
  );
}
