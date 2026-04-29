/**
 * Basis domain i18n (v1.3 K1).
 *
 * SAP-BC analogue. Owns: in-app chat (Phase 10A-10F), bootstrap task
 * progress, settings panels, backup/restore, system health.
 *
 * Currently shipping: chat.* (34 keys). Bootstrap and settings keys
 * will migrate from strings.js as those modules are touched in
 * subsequent sprints.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  'chat.open':              { en: 'Open chat',  vi: 'Mở chat' },
  'chat.close':             { en: 'Close chat', vi: 'Đóng chat' },
  'chat.header_rooms':      { en: 'Messages',   vi: 'Tin nhắn' },
  'chat.header_mentions':   { en: 'Mentions',   vi: 'Lượt nhắc' },
  'chat.back_to_rooms':     { en: 'Back to rooms', vi: 'Quay lại danh sách' },
  'chat.mentions_button':   { en: 'Your @mentions', vi: 'Lượt nhắc đến bạn' },
  'chat.search_placeholder':{ en: 'Search messages…', vi: 'Tìm trong tin nhắn…' },
  'chat.search_searching':  { en: 'Searching…',     vi: 'Đang tìm…' },
  'chat.search_no_match':   { en: 'No matches',     vi: 'Không có kết quả' },
  'chat.rooms_empty': {
    en: 'No rooms yet. Open a DM from a teammate to start chatting.',
    vi: 'Chưa có phòng nào. Mở DM với đồng nghiệp để bắt đầu trò chuyện.',
  },
  'chat.mentions_empty': {
    en: 'No mentions yet. You\'ll see a badge here when someone @mentions you.',
    vi: 'Chưa có lượt nhắc nào. Bạn sẽ thấy thông báo ở đây khi có người @nhắc đến.',
  },
  'chat.messages_empty':    { en: 'No messages yet. Say hi 👋', vi: 'Chưa có tin nhắn. Chào một câu 👋' },
  'chat.loading':           { en: 'Loading…', vi: 'Đang tải…' },
  'chat.loading_older':     { en: 'Loading older…', vi: 'Đang tải tin nhắn cũ…' },
  'chat.conversation_start':{ en: '— beginning of conversation —', vi: '— đầu cuộc trò chuyện —' },
  'chat.compose_placeholder':{ en: 'Type a message, Enter to send', vi: 'Nhập tin nhắn, nhấn Enter để gửi' },
  'chat.send':              { en: 'Send', vi: 'Gửi' },
  'chat.sending':           { en: '…',   vi: '…' },
  'chat.edit':              { en: 'Edit', vi: 'Sửa' },
  'chat.delete':            { en: 'Delete', vi: 'Xóa' },
  'chat.edit_save':         { en: 'Save', vi: 'Lưu' },
  'chat.edit_cancel':       { en: 'Cancel', vi: 'Hủy' },
  'chat.edited_mark':       { en: ' · edited', vi: ' · đã sửa' },
  'chat.deleted_body':      { en: '(message deleted)', vi: '(tin nhắn đã xóa)' },
  'chat.delete_confirm': {
    en: 'Delete this message? This cannot be undone.',
    vi: 'Xóa tin nhắn này? Không thể hoàn tác.',
  },
  'chat.recall':            { en: 'Unsend', vi: 'Thu hồi' },
  'chat.recall_confirm': {
    en: 'Unsend this message? The recipient will see it was recalled.',
    vi: 'Thu hồi tin nhắn này? Người nhận sẽ thấy tin đã bị thu hồi.',
  },
  'chat.delete_forever':    { en: 'Delete permanently', vi: 'Xóa hoàn toàn' },
  'chat.purge_confirm': {
    en: 'Permanently delete this message? It will be removed from everyone\'s view and leaves no trace.',
    vi: 'Xóa vĩnh viễn tin nhắn này? Tin sẽ biến mất khỏi mọi người và không để lại dấu vết.',
  },
  'chat.more_actions':      { en: 'More actions', vi: 'Thêm hành động' },
  'chat.emoji_picker':      { en: 'Emoji', vi: 'Emoji' },
  'chat.discuss':           { en: '💬 Discuss', vi: '💬 Thảo luận' },
  'chat.discuss_title':     { en: 'Discuss this quote in chat', vi: 'Thảo luận quote này trong chat' },
  'chat.unavailable':       { en: 'Chat unavailable: {msg}', vi: 'Chat không khả dụng: {msg}' },
});
