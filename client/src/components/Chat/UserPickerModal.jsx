/**
 * UserPickerModal — shared "new chat" picker, used by both the
 * floating ChatDrawer and the full-screen Messages tab. Keeps the UX
 * identical across the two surfaces and lives outside the lazy tab
 * chunk so ChatDrawer (which ships in the main bundle) can import it
 * without pulling the Messages tab into the initial payload.
 *
 * Always refetches the directory on open — the caller's cached list
 * can be stale (user added, or the initial fetch silently failed).
 * Falls back to whatever the caller passes if the refetch also fails,
 * so a transient network blip never leaves the picker looking empty.
 */

import { useEffect, useState } from 'react';
import { chatApi } from '../../services/chatApi';
import Modal from '../Shared/Modal';
import './UserPickerModal.css';

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtLastSeen(iso) {
  if (!iso) return 'offline';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'offline';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function UserPickerModal({
  open,
  onClose,
  users: usersProp,
  meId,
  onlineSet,
  onOpen,
  title = 'New message',
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);
  const [localUsers, setLocalUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) {
      setQ('');
      setErr(null);
      return;
    }
    setLoading(true);
    chatApi
      .users()
      .then((r) => {
        if (r?.ok) {
          setLocalUsers(Array.isArray(r.users) ? r.users : []);
          setErr(null);
        } else {
          setErr(r?.error || 'Failed to load user directory');
        }
      })
      .catch((e) => {
        const msg = String(e?.message || e);
        setErr(
          msg.includes('chat_disabled') ? 'Chat chưa được bật — chưa tải được danh sách user.' : msg
        );
      })
      .finally(() => setLoading(false));
  }, [open]);

  const users = localUsers.length > 0 ? localUsers : usersProp || [];
  const onlineSetSafe = onlineSet || new Set();
  const needle = q.trim().toLowerCase();
  const filtered = users
    .filter((u) => Number(u.id) !== Number(meId))
    .filter((u) => {
      if (!needle) return true;
      return (
        (u.username || '').toLowerCase().includes(needle) ||
        (u.full_name || '').toLowerCase().includes(needle) ||
        (u.role || '').toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      const aOnline = onlineSetSafe.has(Number(a.id)) || a.online;
      const bOnline = onlineSetSafe.has(Number(b.id)) || b.online;
      const ao = aOnline ? 0 : 1;
      const bo = bOnline ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.full_name || a.username || '').localeCompare(b.full_name || b.username || '');
    });

  // Open a DM. Only closes the modal on SUCCESS — otherwise the user
  // sees the modal vanish with no feedback and wonders if they
  // clicked the wrong thing. Errors stay surfaced in the list area.
  const pick = async (u) => {
    if (busy) return;
    setBusy(u.username);
    setErr(null);
    try {
      const r = await chatApi.openDm(u.username);
      if (r?.ok && r.room?.id) {
        onOpen(r.room.id);
        onClose();
      } else {
        setErr(r?.error || r?.message || 'Không mở được DM với user này.');
      }
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(
        msg.includes('chat_disabled')
          ? 'Chat chưa được bật trên server. Set OPS_CHAT_ENABLED=1 (hoặc xoá OPS_CHAT_ENABLED=0).'
          : msg
      );
    } finally {
      setBusy(null);
    }
  };

  const subtitle = loading
    ? 'Loading directory…'
    : err
      ? 'Could not load directory'
      : `${filtered.length} of ${users.length - (users.some((u) => Number(u.id) === Number(meId)) ? 1 : 0)} user${users.length === 2 ? '' : 's'}`;

  return (
    <Modal open={open} onClose={onClose} size="sm" ariaLabelledBy="upm-title">
      <Modal.Header id="upm-title" title={title} subtitle={subtitle} />
      <Modal.Body className="flush">
        <div className="upm-search">
          <input
            autoFocus
            type="text"
            placeholder="Tìm theo tên, username hoặc role…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="upm-list">
          {loading && <div className="upm-empty">Đang tải danh sách…</div>}
          {!loading && err && <div className="upm-empty upm-err">{err}</div>}
          {!loading && !err && users.length === 0 && (
            <div className="upm-empty">
              Chưa có user nào được load. Kiểm tra OPS_CHAT_ENABLED=1.
            </div>
          )}
          {!loading && !err && users.length > 0 && filtered.length === 0 && (
            <div className="upm-empty">
              Không khớp "{q}" — tổng cộng {users.length} user
            </div>
          )}
          {filtered.map((u) => {
            const name = u.full_name || u.username;
            const online = onlineSetSafe.has(Number(u.id)) || u.online;
            return (
              <div
                key={u.id}
                className={`upm-row ${busy ? 'disabled' : ''}`}
                onClick={() => pick(u)}
              >
                <div className="upm-avatar">
                  {initialsOf(name)}
                  {online && <span className="upm-dot" />}
                </div>
                <div className="upm-row-main">
                  <div className="upm-row-name">{name}</div>
                  <div className="upm-row-meta">
                    {u.username}
                    {u.role ? ` · ${u.role}` : ''}
                  </div>
                </div>
                {online ? (
                  <span className="upm-online">● Online</span>
                ) : u.last_seen_at ? (
                  <span className="upm-meta">{fmtLastSeen(u.last_seen_at)}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </Modal.Body>
    </Modal>
  );
}
