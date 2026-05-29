/**
 * Messages — Phase 11 inbox tab.
 *
 * 3-pane people-first inbox that sits alongside the existing
 * ChatDrawer. Shares the same chatApi + SSE stream, so messages sent
 * from the drawer appear instantly here (and vice-versa).
 *
 * Ownership boundary:
 *   - The tab owns the conversations list + the active conversation's
 *     messages. Composer sends go through chatApi like everywhere else.
 *   - Presence, delivery, read receipts are server-driven — we just
 *     render whatever the `peer.online`, `message.delivered_at`, and
 *     `last_seen_id` fields say.
 *
 * Intentional non-goals for v1:
 *   - No attachments (voice, image, file) — user scoped this out.
 *   - No threading/replies — flat feed, matches drawer behaviour.
 *   - No typing indicator — cheaper to add later if the need is real.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { chatApi, openChatStream } from '../../../../services/chatApi';
import UserPickerModal from '../../../../components/Chat/UserPickerModal';
import './MessagesTab.css';

// ── Helpers ──────────────────────────────────────────────────────

// Initials for avatar fallback when we have no profile image.
function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Relative "last seen" formatter for an offline peer. Kept short so
// it fits the sub-header of the feed.
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

// Short timestamp for the conversation list row. Same-day = HH:MM,
// older-in-this-week = weekday short, older = MM/DD.
function fmtListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isFinite(d)) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const ageDays = (now - d) / 86400000;
  if (ageDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

function fmtBubbleTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isFinite(d)) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Grouping: divider drawn when > 10 min separates consecutive msgs.
function fmtDivider(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isFinite(d)) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return hm;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${hm}`;
  return (
    d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + hm
  );
}

// Used to tell the server a message can be counted as "read" once the
// user actually focuses the conversation. 800 ms debounce so scrolling
// quickly through rooms doesn't spam /seen.
const SEEN_DEBOUNCE_MS = 800;

// ── Sub-components ──────────────────────────────────────────────

function Avatar({ kind, name, online, size }) {
  const cls = `msg-avatar ${kind === 'dm' ? '' : kind}`;
  const style = size ? { width: size, height: size, fontSize: Math.round(size * 0.35) } : undefined;
  return (
    <div className={cls} style={style}>
      {kind === 'quote' ? 'Q' : kind === 'team' ? '#' : initialsOf(name)}
      {kind === 'dm' && online != null && (
        <span className={`presence-dot ${online ? 'online' : ''}`} />
      )}
    </div>
  );
}

function ConversationRow({ conv, meId, active, onClick }) {
  const isDm = conv.kind === 'dm';
  const name = isDm
    ? conv.peer?.full_name || conv.peer?.username || 'Unknown'
    : conv.title || `#${conv.key}`;
  const last = conv.last_message;
  const isSelf = last && Number(last.author_id) === Number(meId);
  let preview = 'No messages yet';
  if (last) {
    if (last.deleted_at) preview = '(deleted)';
    else preview = (isSelf ? 'You: ' : '') + String(last.body || '').slice(0, 80);
  }
  const unread = conv.unread_count > 0 && !active;
  return (
    <div
      className={`msg-row ${active ? 'active' : ''} ${unread ? 'unread' : ''}`}
      onClick={onClick}
    >
      <Avatar kind={conv.kind} name={name} online={isDm ? conv.peer?.online : null} />
      <div className="msg-row-main">
        <div className="msg-row-top">
          <span className="msg-row-title">{name}</span>
          <span className="msg-row-time">{fmtListTime(conv.updated_at)}</span>
        </div>
        <div className="msg-row-top">
          <span className="msg-row-preview">{preview}</span>
          {unread && <span className="msg-row-badge">{conv.unread_count}</span>}
        </div>
      </div>
    </div>
  );
}

// Empty-state directory (Option 2) — shown in the feed pane when no
// conversation is active. Full user grid so small teams can start a
// chat with anyone in one click. Online users surface on top.
function EmptyStateDirectory({ users, meId, onlineSet, onOpen }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);

  const pick = async (u) => {
    if (busy) return;
    setBusy(u.username);
    try {
      const r = await chatApi.openDm(u.username);
      if (r?.ok && r.room?.id) onOpen(r.room.id);
    } finally {
      setBusy(null);
    }
  };

  const needle = q.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (!needle) return true;
    return (
      (u.username || '').toLowerCase().includes(needle) ||
      (u.full_name || '').toLowerCase().includes(needle) ||
      (u.role || '').toLowerCase().includes(needle)
    );
  });
  const online = filtered
    .filter((u) => Number(u.id) !== Number(meId) && onlineSet.has(Number(u.id)))
    .sort((a, b) =>
      (a.full_name || a.username || '').localeCompare(b.full_name || b.username || '')
    );
  const offline = filtered
    .filter((u) => Number(u.id) !== Number(meId) && !onlineSet.has(Number(u.id)))
    .sort((a, b) =>
      (a.full_name || a.username || '').localeCompare(b.full_name || b.username || '')
    );

  const card = (u) => {
    const isSelf = Number(u.id) === Number(meId);
    const isOnline = onlineSet.has(Number(u.id));
    const name = u.full_name || u.username;
    return (
      <div
        key={u.id}
        className={`msg-dir-card ${isSelf ? 'self' : ''}`}
        onClick={() => !isSelf && pick(u)}
        title={
          isSelf
            ? 'This is you'
            : isOnline
              ? 'Online — click to chat'
              : u.last_seen_at
                ? `Offline · last seen ${fmtLastSeen(u.last_seen_at)}`
                : 'Offline'
        }
      >
        <Avatar kind="dm" name={name} online={isOnline} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">
            {name}
            {isSelf ? ' (bạn)' : ''}
          </div>
          <div className="role">
            {u.role || '—'}
            {!isSelf && !isOnline && u.last_seen_at ? ` · ${fmtLastSeen(u.last_seen_at)}` : ''}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="msg-empty-dir">
      <h3>Bắt đầu cuộc trò chuyện mới</h3>
      <div className="sub">
        Chọn một thành viên để mở DM. Tin nhắn offline sẽ được giao ngay khi họ online.
      </div>
      <div className="msg-empty-search">
        <input
          type="text"
          placeholder="Tìm theo tên, username hoặc vai trò…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {online.length > 0 && (
        <div className="msg-dir-section">
          <h4>Online · {online.length}</h4>
          <div className="msg-dir-grid">{online.map(card)}</div>
        </div>
      )}
      {offline.length > 0 && (
        <div className="msg-dir-section">
          <h4>Offline · {offline.length}</h4>
          <div className="msg-dir-grid">{offline.map(card)}</div>
        </div>
      )}
      {online.length === 0 && offline.length === 0 && (
        <div className="msg-empty">Không có user nào khớp</div>
      )}
    </div>
  );
}

function ConversationList({
  conversations,
  meId,
  activeId,
  onSelect,
  onNewMessage,
  query,
  setQuery,
  filter,
  setFilter,
}) {
  const filtered = useMemo(() => {
    const needle = (query || '').trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'unread' && !(c.unread_count > 0)) return false;
      if (filter === 'dm' && c.kind !== 'dm') return false;
      if (filter === 'rooms' && c.kind === 'dm') return false;
      if (!needle) return true;
      const hay = [
        c.title || '',
        c.peer?.full_name || '',
        c.peer?.username || '',
        c.last_message?.body || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [conversations, query, filter]);

  return (
    <div className="msg-pane">
      <div className="msg-pane-header">
        <span>Messages</span>
        <span
          style={{
            fontSize: 10,
            color: '#9ca3af',
            fontWeight: 500,
            letterSpacing: 0,
            textTransform: 'none',
          }}
        >
          {filtered.length} of {conversations.length}
        </span>
        <button
          className="msg-compose-btn"
          onClick={onNewMessage}
          title="New message"
          aria-label="New message"
        >
          +
        </button>
      </div>
      <div className="msg-list-search">
        <input
          type="text"
          placeholder="Search name or message…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="msg-list-filter">
        {['all', 'unread', 'dm', 'rooms'].map((f) => (
          <button
            key={f}
            className={`msg-filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f === 'dm' ? 'DMs' : 'Rooms'}
          </button>
        ))}
      </div>
      <div className="msg-list">
        {filtered.length === 0 && <div className="msg-empty">No conversations match</div>}
        {filtered.map((c) => (
          <ConversationRow
            key={c.id}
            conv={c}
            meId={meId}
            active={c.id === activeId}
            onClick={() => onSelect(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DeliveryTick({ msg, isSelf, conv, meId }) {
  // Ticks only apply to outgoing messages — incoming already count as
  // "delivered to me" just by showing up.
  if (!isSelf) return null;
  // Read = the OTHER party's last_seen_id on this room is ≥ msg.id. In
  // group rooms this is best-effort (we only get our own member row),
  // so for non-DM we fall back to just sent/delivered.
  const delivered = !!msg.delivered_at;
  // For DMs the conversation row carries peer info and (for the
  // currently-viewing user) no read-receipt info — we rely on a
  // `peer_last_seen_id` field we'll populate from SSE. For v1 we show
  // delivered-vs-sent only; read ticks can come once the server
  // exposes peer last_seen_id via a dedicated event.
  let cls = 'tick-sent';
  let glyph = '✓';
  if (delivered) {
    cls = 'tick-delivered';
    glyph = '✓✓';
  }
  // Optional read upgrade — gated on a peer_last_seen_id hint the
  // parent will pass down as `conv.peer_last_seen_id` via SSE
  // eventually. Today this is almost always undefined, so the tick
  // stays at delivered — which is the honest truth.
  if (conv?.peer_last_seen_id && Number(conv.peer_last_seen_id) >= Number(msg.id)) {
    cls = 'tick-read';
  }
  void meId;
  return (
    <span className={`tick ${cls}`} title={delivered ? 'Delivered' : 'Sent'}>
      {glyph}
    </span>
  );
}

function Bubble({ msg, prev, meId, authorName, conv }) {
  if (msg.deleted_at) {
    return (
      <div className={`msg-bubble-row ${Number(msg.author_id) === Number(meId) ? 'out' : 'in'}`}>
        {Number(msg.author_id) !== Number(meId) && (
          <div className="mini-avatar">{initialsOf(authorName)}</div>
        )}
        <div className="msg-bubble deleted">(message deleted)</div>
      </div>
    );
  }
  const isSelf = Number(msg.author_id) === Number(meId);
  const isGrouped =
    prev &&
    Number(prev.author_id) === Number(msg.author_id) &&
    !prev.deleted_at &&
    new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 2 * 60 * 1000;
  const body = String(msg.body || '');
  // Jumbomoji — short emoji-only strings render bigger.
  const isEmojiOnly =
    /^(\s|\p{Extended_Pictographic}|\u200D|\uFE0F)+$/u.test(body.trim()) &&
    body.trim().length <= 12;
  return (
    <div className={`msg-bubble-row ${isSelf ? 'out' : 'in'} ${isGrouped ? 'grouped' : ''}`}>
      {!isSelf && <div className="mini-avatar">{initialsOf(authorName)}</div>}
      <div className={`msg-bubble ${isEmojiOnly ? 'jumbo' : ''}`}>
        {!isSelf && !isGrouped && conv?.kind !== 'dm' && <div className="author">{authorName}</div>}
        <div>{body}</div>
        <div className="msg-meta">
          <span>{fmtBubbleTime(msg.created_at)}</span>
          {msg.edited_at && <span title="edited">· edited</span>}
          <DeliveryTick msg={msg} isSelf={isSelf} conv={conv} meId={meId} />
        </div>
      </div>
    </div>
  );
}

function Feed({ messages, conv, meId, userById, loading }) {
  const scrollRef = useRef(null);
  const atBottomRef = useRef(true);

  // Track whether the user is already at the bottom — if so, auto-
  // scroll on new messages. Otherwise they're scrolled up reading, so
  // we must not yank them back.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      atBottomRef.current = dist < 80;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (loading) return <div className="msg-feed msg-loading">Loading messages…</div>;
  if (!conv) return <div className="msg-feed msg-loading">Select a conversation on the left.</div>;
  if (messages.length === 0)
    return <div className="msg-feed msg-loading">No messages yet — say hi.</div>;

  // Render loop with time dividers between > 10 min gaps.
  const nodes = [];
  let prev = null;
  for (const m of messages) {
    const needDivider =
      !prev ||
      new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 10 * 60 * 1000;
    if (needDivider)
      nodes.push(
        <div key={`d-${m.id}`} className="msg-divider">
          {fmtDivider(m.created_at)}
        </div>
      );
    const author = userById.get(Number(m.author_id));
    const name = author ? author.full_name || author.username : 'Unknown';
    nodes.push(<Bubble key={m.id} msg={m} prev={prev} meId={meId} authorName={name} conv={conv} />);
    prev = m;
  }
  return (
    <div className="msg-feed" ref={scrollRef}>
      {nodes}
    </div>
  );
}

function Composer({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const taRef = useRef(null);

  const submit = useCallback(async () => {
    const body = text.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    try {
      await onSend(body);
      setText('');
      // Reset textarea autosize
      if (taRef.current) taRef.current.style.height = '';
    } finally {
      setSending(false);
    }
  }, [text, sending, disabled, onSend]);

  const onKey = useCallback(
    (e) => {
      // Enter sends, Shift+Enter = newline. Matches most chat apps.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  // Auto-resize textarea up to 5 lines.
  const onInput = useCallback((e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = '';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  return (
    <div className="msg-composer">
      <textarea
        ref={taRef}
        rows={1}
        placeholder={
          disabled
            ? 'Select a conversation to reply…'
            : 'Type a message… (Enter to send, Shift+Enter = newline)'
        }
        value={text}
        onChange={onInput}
        onKeyDown={onKey}
        disabled={disabled}
      />
      <button onClick={submit} disabled={disabled || !text.trim() || sending}>
        {sending ? '...' : 'Send'}
      </button>
    </div>
  );
}

function InfoPanel({ conv, userById }) {
  if (!conv) {
    return (
      <div className="msg-pane msg-info">
        <div className="msg-pane-header">Info</div>
        <div className="msg-empty">No conversation selected</div>
      </div>
    );
  }
  const isDm = conv.kind === 'dm';
  const peer = isDm ? conv.peer : null;
  const name = isDm ? peer?.full_name || peer?.username || 'Unknown' : conv.title || conv.key;
  const subtitle = isDm
    ? peer?.online
      ? 'Online now'
      : peer?.last_seen_at
        ? `Last seen ${fmtLastSeen(peer.last_seen_at)}`
        : 'Offline'
    : conv.kind === 'quote'
      ? 'Quote discussion'
      : conv.kind === 'team'
        ? 'Team channel'
        : 'Group';
  return (
    <div className="msg-pane msg-info">
      <div className="msg-pane-header">Info</div>
      <div className="msg-info-body">
        <div className="msg-info-avatar">
          {isDm ? initialsOf(name) : conv.kind === 'quote' ? 'Q' : '#'}
        </div>
        <div className="msg-info-name">{name}</div>
        <div className="msg-info-sub">{subtitle}</div>

        {isDm && peer && (
          <div className="msg-info-section">
            <h5>Contact</h5>
            <div className="msg-info-kv">
              <span className="k">Username</span>
              <span className="v">{peer.username}</span>
            </div>
            <div className="msg-info-kv">
              <span className="k">Role</span>
              <span className="v">{peer.role || '—'}</span>
            </div>
            {peer.last_seen_at && !peer.online && (
              <div className="msg-info-kv">
                <span className="k">Last seen</span>
                <span className="v">{fmtLastSeen(peer.last_seen_at)}</span>
              </div>
            )}
          </div>
        )}

        <div className="msg-info-section">
          <h5>Conversation</h5>
          <div className="msg-info-kv">
            <span className="k">Kind</span>
            <span className="v">{conv.kind}</span>
          </div>
          {conv.site && (
            <div className="msg-info-kv">
              <span className="k">Site</span>
              <span className="v">{conv.site}</span>
            </div>
          )}
          <div className="msg-info-kv">
            <span className="k">Unread</span>
            <span className="v">{conv.unread_count || 0}</span>
          </div>
          <div className="msg-info-kv">
            <span className="k">Updated</span>
            <span className="v">{new Date(conv.updated_at).toLocaleString()}</span>
          </div>
        </div>
      </div>
      {void userById}
    </div>
  );
}

// ── Main tab ────────────────────────────────────────────────────

export default function MessagesTab() {
  const { user } = useAuth();
  const meId = Number(user?.id) || 0;

  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [infoOpen, setInfoOpen] = useState(true);
  const [onlineSet, setOnlineSet] = useState(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const seenTimerRef = useRef(null);

  const userById = useMemo(() => {
    const m = new Map();
    for (const u of users) m.set(Number(u.id), u);
    return m;
  }, [users]);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  // Enrich conversations with live online set so the sidebar updates
  // when peers come and go without re-fetching /conversations.
  const displayConversations = useMemo(() => {
    if (onlineSet.size === 0) return conversations;
    return conversations.map((c) => {
      if (c.kind !== 'dm' || !c.peer) return c;
      const online = onlineSet.has(Number(c.peer.id));
      if (online === c.peer.online) return c;
      return { ...c, peer: { ...c.peer, online } };
    });
  }, [conversations, onlineSet]);

  // ── Loaders ───────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      setConvLoading(true);
      const r = await chatApi.conversations();
      if (r?.ok) setConversations(r.conversations || []);
    } catch {
      /* silent — UI shows empty list with retry via SSE reconnect */
    } finally {
      setConvLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const r = await chatApi.users();
      if (r?.ok) setUsers(r.users || []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadMessages = useCallback(async (roomId) => {
    if (!roomId) {
      setMessages([]);
      return;
    }
    setMsgLoading(true);
    try {
      const r = await chatApi.messages(roomId, { limit: 100 });
      if (r?.ok) setMessages((r.messages || []).slice().sort((a, b) => a.id - b.id));
    } catch {
      setMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  // Debounced "mark seen" — every message id we render in the active
  // room pushes forward the last_seen_id server-side after 800 ms of
  // stillness. Keeps /seen calls cheap during active chat bursts.
  const scheduleMarkSeen = useCallback((roomId, messageId) => {
    if (!roomId || !messageId) return;
    if (seenTimerRef.current) clearTimeout(seenTimerRef.current);
    seenTimerRef.current = setTimeout(() => {
      chatApi.markSeen(roomId, messageId).catch(() => {});
      // Also optimistically zero out the unread count in our local list
      // so the sidebar badge disappears right away.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === roomId
            ? { ...c, unread_count: 0, last_seen_id: Math.max(c.last_seen_id || 0, messageId) }
            : c
        )
      );
    }, SEEN_DEBOUNCE_MS);
  }, []);

  // ── Initial load ──────────────────────────────────────────────

  useEffect(() => {
    loadConversations();
    loadUsers();
    chatApi
      .presence()
      .then((r) => {
        if (r?.ok) setOnlineSet(new Set((r.online || []).map(Number)));
      })
      .catch(() => {});
  }, [loadConversations, loadUsers]);

  // Deep-link from the login unread popup (and future places that
  // want to land the user directly on a conversation). The popup
  // writes `ops_pending_conv_id` to sessionStorage right before
  // firing the tab switch; we pick it up once the conversations
  // list arrives, then clear the key so a later reload doesn't
  // re-hijack the active room.
  useEffect(() => {
    if (conversations.length === 0) return;
    let pending;
    try {
      pending = sessionStorage.getItem('ops_pending_conv_id');
    } catch {
      return;
    }
    if (!pending) return;
    const id = Number(pending);
    if (Number.isFinite(id) && conversations.some((c) => c.id === id)) {
      setActiveId(id);
    }
    try {
      sessionStorage.removeItem('ops_pending_conv_id');
    } catch {
      /* ignore */
    }
  }, [conversations]);

  // ── Active room switching ────────────────────────────────────

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);

  // Mark seen whenever new messages render in the active room.
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    const lastId = messages[messages.length - 1].id;
    scheduleMarkSeen(activeId, lastId);
  }, [activeId, messages, scheduleMarkSeen]);

  // ── SSE live updates ─────────────────────────────────────────

  useEffect(() => {
    const stream = openChatStream({
      onEvent: (ev) => {
        switch (ev.type) {
          case 'message': {
            const msg = ev.message;
            const roomId = Number(ev.room_id);
            // Append to active room feed if it's the one we're viewing.
            setMessages((prev) => {
              if (activeId !== roomId) return prev;
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg].sort((a, b) => a.id - b.id);
            });
            // Bump the conversation row: new preview, timestamp, unread
            // count (unless it's the active room or our own message).
            setConversations((prev) => {
              const isSelf = Number(msg.author_id) === meId;
              const isActive = activeId === roomId;
              const next = prev.map((c) => {
                if (c.id !== roomId) return c;
                return {
                  ...c,
                  updated_at: msg.created_at,
                  last_message: {
                    id: msg.id,
                    author_id: msg.author_id,
                    body: msg.body,
                    created_at: msg.created_at,
                    deleted_at: msg.deleted_at || null,
                  },
                  unread_count:
                    isSelf || isActive ? c.unread_count || 0 : (c.unread_count || 0) + 1,
                };
              });
              // Re-sort by updated_at DESC so the fresh room floats up.
              return next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            });
            break;
          }
          case 'message_edited': {
            const m = ev.message;
            setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
            break;
          }
          case 'message_deleted':
          case 'message_purged': {
            const id = ev.message_id || ev.message?.id;
            if (ev.type === 'message_purged') {
              setMessages((prev) => prev.filter((x) => x.id !== id));
            } else {
              setMessages((prev) =>
                prev.map((x) =>
                  x.id === id
                    ? { ...x, deleted_at: ev.deleted_at || new Date().toISOString(), body: null }
                    : x
                )
              );
            }
            break;
          }
          case 'message_delivered': {
            // Server-broadcast when an offline recipient finally caught
            // our message. Upgrade the ticks on each affected msg.
            const delivered = Array.isArray(ev.delivered) ? ev.delivered : [];
            if (delivered.length === 0) break;
            const byId = new Map(delivered.map((d) => [Number(d.id), d.delivered_at]));
            setMessages((prev) =>
              prev.map((x) => (byId.has(x.id) ? { ...x, delivered_at: byId.get(x.id) } : x))
            );
            break;
          }
          case 'presence': {
            const uid = Number(ev.user_id);
            setOnlineSet((prev) => {
              const next = new Set(prev);
              if (ev.online) next.add(uid);
              else next.delete(uid);
              return next;
            });
            break;
          }
          case 'presence_snapshot': {
            setOnlineSet(new Set((ev.online || []).map(Number)));
            break;
          }
          default: /* ignore hello, mention, session_evicted — drawer handles those */
        }
      },
    });
    return () => stream?.close?.();
  }, [activeId, meId]);

  // ── Open a DM (from picker modal OR empty-state directory) ────
  //
  // Both compose entry points hand us a room id after chatApi.openDm
  // upserts the room. We make it active and — if it's brand new and
  // not already in the conversations list — synthesize a stub row so
  // the sidebar shows it immediately. The real row arrives on the
  // next refresh (triggered by the first message send or an SSE event).
  const handleOpenDm = useCallback(
    (roomId) => {
      if (!roomId) return;
      setActiveId(roomId);
      setConversations((prev) => {
        if (prev.some((c) => c.id === roomId)) return prev;
        // Refresh in the background so we get the full peer block.
        loadConversations();
        return prev;
      });
    },
    [loadConversations]
  );

  // ── Send ──────────────────────────────────────────────────────

  const onSend = useCallback(
    async (body) => {
      if (!activeId) return;
      const r = await chatApi.send(activeId, body);
      if (r?.ok && r.message) {
        // The SSE stream will echo this back, but append locally too so
        // the feed updates the instant the Send button is clicked (users
        // notice the 50–100 ms SSE round-trip).
        setMessages((prev) => {
          if (prev.some((m) => m.id === r.message.id)) return prev;
          return [...prev, r.message].sort((a, b) => a.id - b.id);
        });
      }
    },
    [activeId]
  );

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className={`msg-tab ${infoOpen ? '' : 'info-collapsed'}`}>
      <ConversationList
        conversations={displayConversations}
        meId={meId}
        activeId={activeId}
        onSelect={setActiveId}
        onNewMessage={() => setPickerOpen(true)}
        query={query}
        setQuery={setQuery}
        filter={filter}
        setFilter={setFilter}
      />
      <UserPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        users={users}
        meId={meId}
        onlineSet={onlineSet}
        onOpen={handleOpenDm}
      />
      <div className="msg-pane" style={{ borderRight: 0, background: '#f8fafc' }}>
        {activeConv ? (
          <>
            <div className="msg-feed-header">
              <Avatar
                kind={activeConv.kind}
                name={
                  activeConv.kind === 'dm'
                    ? activeConv.peer?.full_name || activeConv.peer?.username
                    : activeConv.title
                }
                online={activeConv.kind === 'dm' ? activeConv.peer?.online : null}
                size={36}
              />
              <div>
                <div className="msg-feed-title">
                  {activeConv.kind === 'dm'
                    ? activeConv.peer?.full_name || activeConv.peer?.username
                    : activeConv.title || activeConv.key}
                </div>
                <div className="msg-feed-sub">
                  {activeConv.kind === 'dm' && activeConv.peer?.online && (
                    <span className="dot-on">● Online</span>
                  )}
                  {activeConv.kind === 'dm' &&
                    !activeConv.peer?.online &&
                    (activeConv.peer?.last_seen_at
                      ? `Last seen ${fmtLastSeen(activeConv.peer.last_seen_at)}`
                      : 'Offline')}
                  {activeConv.kind !== 'dm' &&
                    (activeConv.kind === 'quote' ? 'Quote discussion' : 'Group channel')}
                </div>
              </div>
              <div className="msg-feed-actions">
                <button
                  className={`msg-icon-btn ${infoOpen ? 'active' : ''}`}
                  onClick={() => setInfoOpen((v) => !v)}
                  title={infoOpen ? 'Hide info panel' : 'Show info panel'}
                  aria-label="Toggle info panel"
                >
                  ⓘ
                </button>
              </div>
            </div>
            <Feed
              messages={messages}
              conv={activeConv}
              meId={meId}
              userById={userById}
              loading={msgLoading}
            />
            <Composer onSend={onSend} disabled={!activeId} />
          </>
        ) : (
          <>
            <div className="msg-feed-header">
              <div>
                <div className="msg-feed-title">Inbox</div>
                <div className="msg-feed-sub">
                  {convLoading
                    ? 'Loading conversations…'
                    : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'} · ${users.length} thành viên`}
                </div>
              </div>
            </div>
            <EmptyStateDirectory
              users={users}
              meId={meId}
              onlineSet={onlineSet}
              onOpen={handleOpenDm}
            />
          </>
        )}
      </div>
      {infoOpen && <InfoPanel conv={activeConv} userById={userById} />}
    </div>
  );
}
