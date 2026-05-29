/**
 * ChatDrawer — Phase 10A floating chat UI.
 *
 * Bottom-right floating card (collapsed = icon button, expanded =
 * room list + message feed + composer). Decoupled from sidebar/tabs
 * so it stays visible across every tab the user switches to.
 *
 * State ownership:
 *   - Rooms list + unread counts — own useEffect, refetched on
 *     incoming SSE event or manual action.
 *   - Active room messages — own useEffect keyed on roomId.
 *   - SSE connection — one per mount (tab-scoped). Events dispatch
 *     to the right useState setter via the room-id filter.
 *
 * Known trade-offs:
 *   - No offline queuing. A message typed while offline is lost on
 *     network blip — acceptable for v1, chat isn't load-bearing.
 *   - Local optimistic echo happens AFTER server ack, not before.
 *     Slightly higher perceived latency but simpler + no rollback.
 *   - Scroll-to-bottom is naïve (only when user was already at the
 *     bottom). Fine for short threads; revisit for long channels.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../utils/useI18n';
import { chatApi, openChatStream } from '../../services/chatApi';
import UserPickerModal from './UserPickerModal';
import './ChatDrawer.css';

// Minimal format helper — message times shown as HH:mm relative, or
// MM/DD if older than today. Avoids pulling date-fns just for this.
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isFinite(d)) return '';
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Time divider heading shown between message groups spaced > 10 min
// apart. Match iMessage convention: same-day is just HH:MM (no
// "Today" prefix since that's redundant in the current session);
// yesterday gets "Yesterday HH:MM"; older gets "Mon 14 Apr · HH:MM".
function fmtTimeDivider(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isFinite(d)) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return hm;
  if (isYesterday) return `Yesterday ${hm}`;
  return (
    d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + hm
  );
}

// Unicode-aware emoji-only check for "jumbomoji" rendering (iOS parity).
// Accepts emoji + whitespace only — rejects any text/punct beyond that.
function isEmojiOnly(s) {
  if (!s) return false;
  const trimmed = String(s).trim();
  if (!trimmed) return false;
  if (trimmed.length > 16) return false; // cap to keep jumbo reasonable
  // Regex matches common emoji ranges + variation selectors + ZWJ.
  // Not every emoji, but covers 95% of day-to-day usage. Fallback is
  // normal-sized bubble, not a crash.
  return /^(\s|\p{Extended_Pictographic}|\u200D|\uFE0F)+$/u.test(trimmed);
}

// Curated emoji palette for the picker. Ordered by frequency of use
// in business chat (thumbs, smileys first). Intentionally ~60 so it
// fits an 8-col grid in roughly 8 rows — no scrolling for most users.
const EMOJI_PALETTE = [
  '👍',
  '👎',
  '🙏',
  '👏',
  '🙌',
  '✅',
  '❌',
  '⚠️',
  '😀',
  '😄',
  '😅',
  '😂',
  '🤣',
  '😊',
  '😉',
  '😍',
  '🤔',
  '🤨',
  '😐',
  '😬',
  '🙄',
  '😔',
  '😢',
  '😭',
  '😤',
  '😡',
  '🥲',
  '🤝',
  '👌',
  '🤞',
  '💪',
  '🫡',
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🖤',
  '🤍',
  '🎉',
  '🎊',
  '🔥',
  '⭐',
  '✨',
  '💯',
  '💡',
  '🚀',
  '📌',
  '📎',
  '📝',
  '📊',
  '📈',
  '📉',
  '💰',
  '💸',
  '🏷️',
  '📦',
  '🛠️',
  '🔧',
  '⚙️',
  '🧪',
  '🧾',
  '🧰',
];

export default function ChatDrawer() {
  const { user, isAuthenticated } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const [usersIndex, setUsersIndex] = useState(new Map()); // id → {username, full_name}
  // Phase 11 — compose entry point. Opens the shared UserPickerModal
  // so the user can start a DM without needing to click "Discuss this
  // quote" on a specific record. Complements the Messages tab picker.
  const [pickerOpen, setPickerOpen] = useState(false);
  // Phase 10C — mention inbox
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [mentions, setMentions] = useState([]);
  const [mentionsUnread, setMentionsUnread] = useState(0);
  // Phase 10D — search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // Phase 10E — inline edit state (message id + draft)
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  // Phase 10F — scroll-back pagination
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  // Phase 10I — iMessage polish
  const [openMenuFor, setOpenMenuFor] = useState(null); // message id whose context menu is open
  const [emojiOpen, setEmojiOpen] = useState(false);
  const feedRef = useRef(null);
  const composerRef = useRef(null);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) || null,
    [rooms, activeRoomId]
  );

  const totalUnread = useMemo(
    () => rooms.reduce((acc, r) => acc + (r.unread_count || 0), 0),
    [rooms]
  );

  // ─── Initial load ───
  const refreshRooms = useCallback(async () => {
    try {
      const r = await chatApi.rooms();
      setRooms(r.rooms || []);
    } catch (e) {
      // Chat disabled (503) — hide the drawer entirely.
      const msg = String(e?.message || '');
      if (msg.includes('chat_disabled')) setRooms([]);
      else setErr(msg);
    }
  }, []);

  const refreshMentions = useCallback(async () => {
    try {
      const r = await chatApi.mentions({ limit: 50 });
      setMentions(r.mentions || []);
      setMentionsUnread(r.unread_count || 0);
    } catch {
      /* chat disabled or unauthorized */
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshRooms();
    refreshMentions();
    chatApi
      .users()
      .then((r) => {
        const map = new Map();
        for (const u of r.users || []) map.set(u.id, u);
        setUsersIndex(map);
      })
      .catch(() => {
        /* chat disabled or unauthorized */
      });
  }, [isAuthenticated, refreshRooms, refreshMentions]);

  // ─── SSE stream ───
  useEffect(() => {
    if (!isAuthenticated) return;
    const { close } = openChatStream({
      onEvent: (evt) => {
        if (evt.type === 'message') {
          // Append to messages IF the event is for the active room;
          // always bump the unread count in the room list.
          if (evt.room_id === activeRoomId) {
            setMessages((prev) => [...prev, evt.message]);
          }
          refreshRooms();
        } else if (evt.type === 'mention') {
          // Targeted to the mentioned user. Bump the badge + refresh
          // the inbox lazily — user may not have opened it yet.
          setMentionsUnread((n) => n + 1);
          refreshMentions();
        } else if (evt.type === 'message_edited') {
          // Replace the row in-place so the edit mark shows up.
          setMessages((prev) => prev.map((m) => (m.id === evt.message.id ? evt.message : m)));
        } else if (evt.type === 'message_deleted') {
          setMessages((prev) =>
            prev.map((m) => (m.id === evt.message_id ? { ...m, deleted_at: evt.deleted_at } : m))
          );
        } else if (evt.type === 'message_purged') {
          // Hard delete — row is gone from the DB. Drop it from local
          // state entirely (no tombstone). Rooms list's last_message
          // catches up on the next refreshRooms tick.
          setMessages((prev) => prev.filter((m) => m.id !== evt.message_id));
          refreshRooms();
        }
      },
      onError: () => {
        /* EventSource auto-reconnects; no-op here */
      },
    });
    return close;
  }, [isAuthenticated, activeRoomId, refreshRooms, refreshMentions]);

  // ─── Load messages when active room changes ───
  useEffect(() => {
    if (activeRoomId == null) {
      setMessages([]);
      setHasMoreOlder(true);
      return undefined;
    }
    // AbortController cancels the previous room's fetch when the user
    // clicks a different room before the first response arrived —
    // otherwise messages from room A could overwrite room B's list.
    const ctrl = new AbortController();
    setMessagesLoading(true);
    setHasMoreOlder(true);
    chatApi
      .messages(activeRoomId, { limit: 50, signal: ctrl.signal })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        const msgs = r.messages || [];
        setMessages(msgs);
        // A page smaller than the limit means we've hit the start.
        if (msgs.length < 50) setHasMoreOlder(false);
        // Jump to the bottom so the user sees the LATEST message
        // when opening a room. The auto-scroll-on-new-message effect
        // only fires when already near-bottom, so it won't do this
        // on initial mount. requestAnimationFrame waits for the DOM
        // to flush the list before we measure scrollHeight.
        requestAnimationFrame(() => {
          const el = feedRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') setErr(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setMessagesLoading(false);
      });
    return () => ctrl.abort();
  }, [activeRoomId]);

  // Load older messages when the user scrolls to the top of the feed.
  // Server-side `before=<id>` pagination is already wired; we pass the
  // smallest id we have so the next page returns strictly older rows.
  const loadOlder = useCallback(async () => {
    if (activeRoomId == null || loadingOlder || !hasMoreOlder || messages.length === 0) return;
    const oldestId = messages[0].id;
    setLoadingOlder(true);
    try {
      const r = await chatApi.messages(activeRoomId, { before: oldestId, limit: 50 });
      const older = r.messages || [];
      if (older.length === 0) {
        setHasMoreOlder(false);
      } else {
        // Preserve scroll position: measure the current scrollHeight,
        // prepend the new chunk, then adjust scrollTop by the delta.
        // Without this, prepending shoves the user to the top every
        // time they paginate — unusable.
        const el = feedRef.current;
        const prevHeight = el ? el.scrollHeight : 0;
        setMessages((prev) => [...older, ...prev]);
        if (el) {
          // Wait one frame for DOM update before measuring.
          requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight - prevHeight;
          });
        }
        if (older.length < 50) setHasMoreOlder(false);
      }
    } catch (e) {
      setErr(e.message || 'load older failed');
    } finally {
      setLoadingOlder(false);
    }
  }, [activeRoomId, loadingOlder, hasMoreOlder, messages]);

  // Scroll listener — fires when the feed nears the top. Throttle by
  // skipping while a load is already in flight (the guard inside
  // loadOlder handles that too, but this avoids the call entirely).
  useEffect(() => {
    const el = feedRef.current;
    if (!el || activeRoomId == null) return;
    function onScroll() {
      if (el.scrollTop < 80 && hasMoreOlder && !loadingOlder) loadOlder();
    }
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [activeRoomId, hasMoreOlder, loadingOlder, loadOlder]);

  // Listen for deep-link requests from elsewhere in the app (e.g.
  // "Discuss this quote" in the Cost tab). Opens the drawer and
  // surfaces the target room. Rooms may not yet be in state if the
  // server just created one — refresh first, then select.
  useEffect(() => {
    if (!isAuthenticated) return;
    function handleOpen(e) {
      const roomId = Number(e?.detail?.roomId);
      if (!Number.isFinite(roomId)) return;
      setOpen(true);
      refreshRooms().finally(() => setActiveRoomId(roomId));
    }
    window.addEventListener('ops-open-chat', handleOpen);
    return () => window.removeEventListener('ops-open-chat', handleOpen);
  }, [isAuthenticated, refreshRooms]);

  // Auto-scroll to bottom on new message if already near bottom.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Mark-seen when switching into a room with unread, or when a new
  // message lands in the active room. Uses the latest visible id.
  useEffect(() => {
    if (activeRoomId == null || messages.length === 0) return;
    const latestId = messages[messages.length - 1].id;
    chatApi.markSeen(activeRoomId, latestId).catch(() => {});
    // Optimistic local update so the badge clears without waiting
    // for the next /rooms refresh.
    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoomId ? { ...r, unread_count: 0, last_seen_id: latestId } : r
      )
    );
  }, [activeRoomId, messages]);

  // Close any open overlay (context menu / emoji picker) on outside
  // click or Escape. Single listener shared so they can't "stick" if
  // a state update throws.
  useEffect(() => {
    if (!openMenuFor && !emojiOpen) return;
    function dismiss(e) {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown') {
        // Only close if click is outside both overlays.
        if (e.target.closest('.chat-msg-menu') || e.target.closest('.chat-emoji-picker')) return;
        if (e.target.closest('.chat-msg-menu-trigger')) return; // trigger handles itself
      }
      setOpenMenuFor(null);
      setEmojiOpen(false);
    }
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, [openMenuFor, emojiOpen]);

  const insertEmoji = useCallback(
    (emoji) => {
      const el = composerRef.current;
      if (!el) {
        setComposer((c) => c + emoji);
        return;
      }
      const start = el.selectionStart ?? composer.length;
      const end = el.selectionEnd ?? composer.length;
      const next = composer.slice(0, start) + emoji + composer.slice(end);
      setComposer(next);
      // Restore caret after React updates the value.
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.selectionStart = el.selectionEnd = start + emoji.length;
        } catch {
          /* textarea may have unmounted */
        }
      });
    },
    [composer]
  );

  // Debounced search — 250ms after the last keystroke.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return undefined;
    }
    // AbortController cancels the in-flight search when the user types
    // another character mid-request — avoids out-of-order responses
    // painting stale results on top of newer ones.
    const ctrl = new AbortController();
    setSearchLoading(true);
    const handle = setTimeout(() => {
      chatApi
        .search(q, { limit: 50, signal: ctrl.signal })
        .then((r) => {
          if (!ctrl.signal.aborted) setSearchResults(r.results || []);
        })
        .catch((e) => {
          if (e?.name !== 'AbortError' && !ctrl.signal.aborted) setSearchResults([]);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearchLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [searchQuery]);

  const handleEditStart = useCallback((m) => {
    setEditingId(m.id);
    setEditDraft(m.body);
  }, []);

  const handleEditSave = useCallback(async () => {
    const body = editDraft.trim();
    if (!body || editingId == null) {
      setEditingId(null);
      return;
    }
    try {
      await chatApi.editMessage(editingId, body);
      // Actual replacement flows through SSE 'message_edited' — no
      // local write needed. Fail-open: if SSE is slow, the next
      // listMessages fetch will reconcile.
    } catch (e) {
      setErr(e.message || 'edit failed');
    } finally {
      setEditingId(null);
      setEditDraft('');
    }
  }, [editingId, editDraft]);

  const handleDelete = useCallback(
    async (messageId) => {
      // iMessage calls this "Unsend"; we use the same cue on the
      // confirm dialog so the user understands the message will
      // disappear for all recipients (replaced with a tombstone).
      const ok = window.confirm(t('chat.recall_confirm'));
      if (!ok) return;
      try {
        await chatApi.deleteMessage(messageId);
        // SSE fanout will flip deleted_at locally; same fail-open rule.
      } catch (e) {
        setErr(e.message || 'recall failed');
      }
    },
    [t]
  );

  // Hard delete — purges the row entirely. Stronger confirmation since
  // it leaves no tombstone and no audit trace via the API.
  const handlePurge = useCallback(
    async (messageId) => {
      const ok = window.confirm(t('chat.purge_confirm'));
      if (!ok) return;
      try {
        await chatApi.purgeMessage(messageId);
        // SSE `message_purged` handles removal from state.
      } catch (e) {
        setErr(e.message || 'delete failed');
      }
    },
    [t]
  );

  const handleSend = useCallback(async () => {
    const body = composer.trim();
    if (!body || sending || activeRoomId == null) return;
    setSending(true);
    setErr(null);
    try {
      await chatApi.send(activeRoomId, body);
      setComposer('');
      // The inserted message arrives back via SSE, not by awaiting here.
    } catch (e) {
      setErr(e.message || 'send failed');
    } finally {
      setSending(false);
    }
  }, [composer, sending, activeRoomId]);

  const handleComposerKey = (e) => {
    // Enter to send, Shift+Enter for newline (matches Slack/Teams).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isAuthenticated) return null;

  // Bubble badge rolls up unread messages AND unread mentions so the
  // user sees a single truthful count without opening the drawer.
  const bubbleBadge = totalUnread + mentionsUnread;

  const openMentions = async () => {
    setMentionsOpen(true);
    setActiveRoomId(null);
    await refreshMentions();
    // Mark all flipped to read optimistically; the server call is
    // best-effort. Next refresh will reconcile.
    if (mentionsUnread > 0) {
      chatApi.markMentionsRead().catch(() => {});
      setMentionsUnread(0);
    }
  };

  // Collapsed = floating bubble with unread badge.
  if (!open) {
    return (
      <button
        className="chat-bubble"
        onClick={() => setOpen(true)}
        title={t('chat.open')}
        aria-label={t('chat.open')}
      >
        💬
        {bubbleBadge > 0 && (
          <span className="chat-bubble-badge">{bubbleBadge > 99 ? '99+' : bubbleBadge}</span>
        )}
      </button>
    );
  }

  return (
    <aside className="chat-drawer" data-ops-draggable-card role="complementary" aria-label="Chat">
      <header className="chat-drawer-head" data-ops-drag-handle>
        <strong>
          {mentionsOpen
            ? t('chat.header_mentions')
            : activeRoom
              ? activeRoom.title
              : t('chat.header_rooms')}
        </strong>
        <div className="chat-drawer-head-actions">
          {(activeRoom || mentionsOpen) && (
            <button
              className="chat-head-btn"
              onClick={() => {
                setActiveRoomId(null);
                setMentionsOpen(false);
              }}
              title={t('chat.back_to_rooms')}
              aria-label={t('chat.back_to_rooms')}
            >
              ←
            </button>
          )}
          {!activeRoom && !mentionsOpen && (
            <>
              <button
                className="chat-head-btn"
                onClick={() => setPickerOpen(true)}
                title="New chat"
                aria-label="New chat"
                style={{ fontWeight: 700 }}
              >
                +
              </button>
              <button
                className="chat-head-btn"
                onClick={openMentions}
                title={t('chat.mentions_button')}
                aria-label={t('chat.mentions_button')}
              >
                @
                {mentionsUnread > 0 && (
                  <span className="chat-head-badge">
                    {mentionsUnread > 9 ? '9+' : mentionsUnread}
                  </span>
                )}
              </button>
            </>
          )}
          <button
            className="chat-head-btn"
            onClick={() => setOpen(false)}
            title={t('chat.close')}
            aria-label={t('chat.close')}
          >
            ✕
          </button>
        </div>
      </header>

      {mentionsOpen && (
        <ul className="chat-room-list">
          {mentions.length === 0 && <li className="chat-empty">{t('chat.mentions_empty')}</li>}
          {mentions.map((m) => {
            const unread = m.read_at == null;
            const author = usersIndex.get(m.author_id);
            return (
              <li key={m.id}>
                <button
                  className={`chat-room-item ${unread ? 'unread' : ''}`}
                  onClick={() => {
                    // Jump to the source room via the same deep-link
                    // event that "Discuss this quote" uses.
                    setMentionsOpen(false);
                    setActiveRoomId(m.room_id);
                  }}
                >
                  <span className="chat-room-kind">@</span>
                  <span className="chat-room-title">{m.room_title || m.room_key}</span>
                  <div className="chat-room-preview">
                    <span className="chat-room-preview-author">
                      {author?.username || `user#${m.author_id}`}:
                    </span>
                    <span>
                      {' '}
                      {m.message_deleted_at
                        ? t('chat.deleted_body')
                        : String(m.message_body || '').slice(0, 80)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!activeRoom && !mentionsOpen && (
        <div className="chat-search">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('chat.search_placeholder')}
            aria-label={t('chat.search_placeholder')}
          />
          {searchQuery.trim().length >= 2 && (
            <ul className="chat-search-results">
              {searchLoading && <li className="chat-empty">{t('chat.search_searching')}</li>}
              {!searchLoading && searchResults.length === 0 && (
                <li className="chat-empty">{t('chat.search_no_match')}</li>
              )}
              {!searchLoading &&
                searchResults.map((r) => {
                  const author = usersIndex.get(r.author_id);
                  return (
                    <li key={r.id}>
                      <button
                        className="chat-room-item"
                        onClick={() => {
                          setSearchQuery('');
                          setActiveRoomId(r.room_id);
                        }}
                      >
                        <span className="chat-room-kind">
                          {r.room_kind === 'dm' ? '👤' : r.room_kind === 'quote' ? '📄' : '#'}
                        </span>
                        <span className="chat-room-title">{r.room_title || r.room_key}</span>
                        <div className="chat-room-preview">
                          <span className="chat-room-preview-author">
                            {author?.username || `user#${r.author_id}`}:
                          </span>
                          <span> {String(r.body || '').slice(0, 100)}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}

      {!activeRoom && !mentionsOpen && searchQuery.trim().length < 2 && (
        <ul className="chat-room-list">
          {rooms.length === 0 && <li className="chat-empty">{t('chat.rooms_empty')}</li>}
          {rooms.map((r) => (
            <li key={r.id}>
              <button className="chat-room-item" onClick={() => setActiveRoomId(r.id)}>
                <span className="chat-room-kind">
                  {r.kind === 'dm' ? '👤' : r.kind === 'quote' ? '📄' : '#'}
                </span>
                <span className="chat-room-title">{r.title || r.key}</span>
                {r.unread_count > 0 && <span className="chat-room-unread">{r.unread_count}</span>}
                {r.last_message && (
                  <div className="chat-room-preview">
                    <span className="chat-room-preview-author">
                      {usersIndex.get(r.last_message.author_id)?.username || 'user'}:
                    </span>
                    <span>
                      {' '}
                      {r.last_message.deleted_at
                        ? t('chat.deleted_body')
                        : (r.last_message.body || '').slice(0, 60)}
                    </span>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeRoom && (
        <>
          <div ref={feedRef} className="chat-feed">
            {messagesLoading && <div className="chat-empty">{t('chat.loading')}</div>}
            {!messagesLoading && messages.length === 0 && (
              <div className="chat-empty">{t('chat.messages_empty')}</div>
            )}
            {!messagesLoading && messages.length > 0 && loadingOlder && (
              <div className="chat-empty">{t('chat.loading_older')}</div>
            )}
            {!messagesLoading && messages.length > 0 && !hasMoreOlder && (
              <div className="chat-feed-start">{t('chat.conversation_start')}</div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const isSelf = m.author_id === user?.id;
              const author = usersIndex.get(m.author_id);
              const isDeleted = !!m.deleted_at;
              const isEdited = !!m.edited_at && !isDeleted;
              const isEditing = editingId === m.id;
              // iMessage grouping: same author + <2min gap = grouped.
              const sameAuthorPrev = prev && prev.author_id === m.author_id;
              const sameAuthorNext = next && next.author_id === m.author_id;
              const closePrev =
                prev && Date.parse(m.created_at) - Date.parse(prev.created_at) < 2 * 60 * 1000;
              const closeNext =
                next && Date.parse(next.created_at) - Date.parse(m.created_at) < 2 * 60 * 1000;
              const groupedTop = sameAuthorPrev && closePrev;
              const groupedBottom = sameAuthorNext && closeNext;
              // Time divider: first message OR gap > 10 min from prev.
              const tenMin = 10 * 60 * 1000;
              const showDivider =
                !prev || Date.parse(m.created_at) - Date.parse(prev.created_at) > tenMin;
              // Show sender name for others ONLY on the first msg of a group.
              const showAuthor = !isSelf && !groupedTop;
              // Jumbomoji: emoji-only bubble grows to 44px, no background.
              const jumbo = !isDeleted && !isEditing && isEmojiOnly(m.body);
              // 15-min recall/edit window — matches server-side guard.
              const canAct =
                isSelf && !isDeleted && Date.now() - Date.parse(m.created_at) < 15 * 60 * 1000;

              return (
                <div key={m.id}>
                  {showDivider && (
                    <div className="chat-time-divider">{fmtTimeDivider(m.created_at)}</div>
                  )}
                  <div
                    className={
                      `chat-msg-row ${isSelf ? 'self' : 'other'}` +
                      (groupedTop ? ' grouped-top' : '') +
                      (groupedBottom ? ' grouped-bottom' : '')
                    }
                  >
                    {showAuthor && (
                      <div className="chat-msg-author">
                        {author?.full_name || author?.username || `user#${m.author_id}`}
                      </div>
                    )}
                    {isEditing ? (
                      <div className="chat-msg-edit">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setEditingId(null);
                              setEditDraft('');
                            }
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleEditSave();
                            }
                          }}
                          rows={2}
                          aria-label="Edit message"
                        />
                        <div className="chat-msg-edit-actions">
                          <button
                            className="chat-msg-action"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft('');
                            }}
                          >
                            {t('chat.edit_cancel')}
                          </button>
                          <button
                            className="chat-msg-action primary"
                            onClick={handleEditSave}
                            disabled={!editDraft.trim()}
                          >
                            {t('chat.edit_save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={
                          `chat-msg ${isSelf ? 'self' : 'other'}` +
                          (isDeleted ? ' deleted' : '') +
                          (jumbo ? ' jumbomoji' : '')
                        }
                        onContextMenu={
                          canAct
                            ? (e) => {
                                e.preventDefault();
                                setOpenMenuFor(m.id);
                              }
                            : undefined
                        }
                      >
                        <span className={`chat-msg-body${isDeleted ? ' deleted' : ''}`}>
                          {isDeleted ? t('chat.deleted_body') : m.body}
                        </span>
                      </div>
                    )}
                    {!isEditing && canAct && (
                      <button
                        className="chat-msg-menu-trigger"
                        title={t('chat.more_actions')}
                        aria-label={t('chat.more_actions')}
                        onClick={() => setOpenMenuFor(openMenuFor === m.id ? null : m.id)}
                      >
                        ⋯
                      </button>
                    )}
                    {openMenuFor === m.id && canAct && (
                      <div
                        className="chat-msg-menu"
                        style={
                          isSelf
                            ? { right: 0, top: 'calc(100% + 4px)' }
                            : { left: 0, top: 'calc(100% + 4px)' }
                        }
                        role="menu"
                      >
                        <button
                          onClick={() => {
                            setOpenMenuFor(null);
                            handleEditStart(m);
                          }}
                        >
                          ✏️&nbsp;{t('chat.edit')}
                        </button>
                        <button
                          onClick={() => {
                            setOpenMenuFor(null);
                            handleDelete(m.id);
                          }}
                        >
                          ↩️&nbsp;{t('chat.recall')}
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            setOpenMenuFor(null);
                            handlePurge(m.id);
                          }}
                        >
                          🗑&nbsp;{t('chat.delete_forever')}
                        </button>
                      </div>
                    )}
                    <div className="chat-msg-meta">
                      <span>{fmtTime(m.created_at)}</span>
                      {isEdited && (
                        <span className="chat-msg-edited-mark">{t('chat.edited_mark')}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="chat-composer">
            {emojiOpen && (
              <div className="chat-emoji-picker" role="dialog" aria-label={t('chat.emoji_picker')}>
                <div className="chat-emoji-picker-header">{t('chat.emoji_picker')}</div>
                {EMOJI_PALETTE.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      insertEmoji(e);
                      setEmojiOpen(false);
                    }}
                    aria-label={`emoji ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            <button
              className="chat-composer-btn"
              onClick={() => setEmojiOpen((o) => !o)}
              title={t('chat.emoji_picker')}
              aria-label={t('chat.emoji_picker')}
              type="button"
            >
              😊
            </button>
            <div className="chat-composer-input-wrap">
              <textarea
                ref={composerRef}
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={handleComposerKey}
                placeholder={t('chat.compose_placeholder')}
                rows={1}
                aria-label={t('chat.compose_placeholder')}
              />
              <button
                className="chat-composer-btn send"
                onClick={handleSend}
                disabled={!composer.trim() || sending}
                title={t('chat.send')}
                aria-label={t('chat.send')}
                type="button"
              >
                {sending ? '…' : '↑'}
              </button>
            </div>
          </footer>
        </>
      )}

      {err && (
        <div className="chat-err" role="alert">
          {err}
        </div>
      )}

      {/* Phase 11 — shared New Chat picker. Opens a DM then jumps into
          it by setting `activeRoomId`. usersIndex entries carry the
          same id/username fields the picker expects as its fallback
          list; passing it prevents a blank state while the picker's
          own fetch is in flight. */}
      <UserPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        users={[...usersIndex.values()]}
        meId={user?.id}
        onlineSet={new Set()}
        onOpen={(roomId) => {
          setPickerOpen(false);
          setActiveRoomId(roomId);
          refreshRooms();
        }}
        title="New chat"
      />
    </aside>
  );
}
