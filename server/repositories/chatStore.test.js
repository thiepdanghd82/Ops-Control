/**
 * chatStore — Phase 10A.1 tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-chat-'));
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');

const {
  dmKey, teamKey, quoteKey,
  getOrCreateRoom, getRoom, getRoomByKey,
  addMember, removeMember, isMember, listMembers,
  listRoomsForUser,
  insertMessage, listMessages, listMessagesSince, markSeen,
  listMentionsForUser, countUnreadMentions, markMentionsRead,
  searchMessages,
  editMessage, deleteMessage, purgeMessage, EDIT_WINDOW_MS,
  pruneOldMessages,
  _wipeChatForTests,
} = await import('./chatStore.js');
const { getDb } = await import('../db/connection.js');

// ── Key helpers ──

test('dmKey: sorted + symmetrical', () => {
  assert.equal(dmKey(5, 12), 'dm:5-12');
  assert.equal(dmKey(12, 5), 'dm:5-12');
  assert.equal(dmKey('7', '3'), 'dm:3-7');
});

test('dmKey rejects NaN', () => {
  assert.throws(() => dmKey('abc', 1));
});

test('teamKey + quoteKey', () => {
  assert.equal(teamKey('sales_mgr'), 'team:sales_mgr');
  assert.equal(quoteKey(42), 'quote:42');
  assert.throws(() => teamKey(''));
  assert.throws(() => quoteKey(NaN));
});

// ── Room CRUD ──

test('getOrCreateRoom: creates new then returns same on second call', () => {
  _wipeChatForTests();
  const a = getOrCreateRoom({ kind: 'team', key: 'team:sales_mgr', title: '#sales' });
  const b = getOrCreateRoom({ kind: 'team', key: 'team:sales_mgr', title: '#sales' });
  assert.equal(a.id, b.id);
  assert.equal(a.key, 'team:sales_mgr');
  assert.equal(a.title, '#sales');
  assert.ok(a.created_at);
});

test('getRoom / getRoomByKey', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'quote', key: 'quote:7', title: 'Quote #7', site: 'VN' });
  assert.equal(getRoom(r.id).key, 'quote:7');
  assert.equal(getRoomByKey('quote:7').id, r.id);
  assert.equal(getRoom(9999), null);
  assert.equal(getRoomByKey('nope'), null);
});

// ── Membership ──

test('addMember is idempotent', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  addMember({ roomId: r.id, userId: 1 }); // double-add must not throw
  assert.equal(listMembers(r.id).length, 1);
});

test('isMember / removeMember', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'dm', key: dmKey(1, 2) });
  addMember({ roomId: r.id, userId: 1 });
  addMember({ roomId: r.id, userId: 2 });
  assert.ok(isMember({ roomId: r.id, userId: 1 }));
  assert.ok(!isMember({ roomId: r.id, userId: 99 }));
  removeMember({ roomId: r.id, userId: 1 });
  assert.ok(!isMember({ roomId: r.id, userId: 1 }));
  assert.equal(listMembers(r.id).length, 1);
});

// ── Messages + unread ──

test('insertMessage + listMessages round-trip (ascending order)', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:finance_dir' });
  addMember({ roomId: r.id, userId: 10 });
  const m1 = insertMessage({ roomId: r.id, authorId: 10, body: 'first' });
  const m2 = insertMessage({ roomId: r.id, authorId: 10, body: 'second' });
  const m3 = insertMessage({ roomId: r.id, authorId: 10, body: 'third' });
  const rows = listMessages({ roomId: r.id });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, m1.id);
  assert.equal(rows[2].id, m3.id);
  assert.equal(rows[1].body, 'second');
});

test('listMessages: paginated "before" scrolls backward', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const ids = [];
  for (let i = 0; i < 10; i++) {
    ids.push(insertMessage({ roomId: r.id, authorId: 1, body: `msg${i}` }).id);
  }
  const latest = listMessages({ roomId: r.id, limit: 3 });
  assert.equal(latest.length, 3);
  assert.deepEqual(latest.map(m => m.id), [ids[7], ids[8], ids[9]]);
  const older = listMessages({ roomId: r.id, before: latest[0].id, limit: 3 });
  assert.deepEqual(older.map(m => m.id), [ids[4], ids[5], ids[6]]);
});

test('insertMessage bumps room.updated_at for recency sort', async () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const created = r.updated_at;
  await new Promise(res => setTimeout(res, 10));
  insertMessage({ roomId: r.id, authorId: 1, body: 'hi' });
  const updated = getRoom(r.id).updated_at;
  assert.ok(updated > created, `${updated} should be > ${created}`);
});

test('mentions persisted + retrievable', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'dm', key: dmKey(1, 2) });
  addMember({ roomId: r.id, userId: 1 });
  insertMessage({ roomId: r.id, authorId: 1, body: '@bob @alice look', mentions: [2, 3] });
  const msgs = listMessages({ roomId: r.id });
  assert.equal(msgs.length, 1);
  assert.deepEqual(JSON.parse(msgs[0].mentions), [2, 3]);
});

test('empty mentions stored as null (not "[]")', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'dm', key: dmKey(1, 2) });
  addMember({ roomId: r.id, userId: 1 });
  insertMessage({ roomId: r.id, authorId: 1, body: 'no mentions' });
  assert.equal(listMessages({ roomId: r.id })[0].mentions, null);
});

// ── listRoomsForUser ──

test('listRoomsForUser: sorted by recency with unread + last msg', () => {
  _wipeChatForTests();
  const r1 = getOrCreateRoom({ kind: 'team', key: 'team:a' });
  const r2 = getOrCreateRoom({ kind: 'team', key: 'team:b' });
  addMember({ roomId: r1.id, userId: 1 });
  addMember({ roomId: r2.id, userId: 1 });
  insertMessage({ roomId: r1.id, authorId: 1, body: 'r1-1' });
  insertMessage({ roomId: r2.id, authorId: 1, body: 'r2-1' });
  insertMessage({ roomId: r2.id, authorId: 1, body: 'r2-2' });
  // r2 is most recent — listing should put it first
  const rooms = listRoomsForUser(1);
  assert.equal(rooms[0].id, r2.id);
  assert.equal(rooms[1].id, r1.id);
  assert.equal(rooms[0].last_message.body, 'r2-2');
  assert.equal(rooms[0].unread_count, 2);  // hasn't marked seen yet
});

test('listRoomsForUser: excludes rooms where user is not a member', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:secret' });
  addMember({ roomId: r.id, userId: 1 });
  insertMessage({ roomId: r.id, authorId: 1, body: 'hi' });
  assert.equal(listRoomsForUser(99).length, 0);
  assert.equal(listRoomsForUser(1).length, 1);
});

// ── markSeen + unread correctness ──

test('markSeen: unread drops to 0 after reading latest', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const m1 = insertMessage({ roomId: r.id, authorId: 2, body: 'hi' });
  const m2 = insertMessage({ roomId: r.id, authorId: 2, body: 'hey' });
  assert.equal(listRoomsForUser(1)[0].unread_count, 2);
  markSeen({ roomId: r.id, userId: 1, messageId: m1.id });
  assert.equal(listRoomsForUser(1)[0].unread_count, 1);
  markSeen({ roomId: r.id, userId: 1, messageId: m2.id });
  assert.equal(listRoomsForUser(1)[0].unread_count, 0);
});

test('markSeen: never decreases (lower messageId is a no-op)', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const m1 = insertMessage({ roomId: r.id, authorId: 2, body: 'a' });
  const m2 = insertMessage({ roomId: r.id, authorId: 2, body: 'b' });
  markSeen({ roomId: r.id, userId: 1, messageId: m2.id });
  markSeen({ roomId: r.id, userId: 1, messageId: m1.id }); // no-op
  assert.equal(listRoomsForUser(1)[0].unread_count, 0);
});

// ── listMessagesSince (SSE reconnect) ──

test('listMessagesSince returns only new messages across given rooms', () => {
  _wipeChatForTests();
  const rA = getOrCreateRoom({ kind: 'team', key: 'team:a' });
  const rB = getOrCreateRoom({ kind: 'team', key: 'team:b' });
  addMember({ roomId: rA.id, userId: 1 });
  addMember({ roomId: rB.id, userId: 1 });
  const m1 = insertMessage({ roomId: rA.id, authorId: 1, body: 'a1' });
  insertMessage({ roomId: rB.id, authorId: 1, body: 'b1' });
  const m3 = insertMessage({ roomId: rA.id, authorId: 1, body: 'a2' });
  const since = listMessagesSince({ roomIds: [rA.id, rB.id], sinceId: m1.id });
  assert.equal(since.length, 2); // b1 + a2
  assert.ok(since.every(m => m.id > m1.id));
  // Last entry is a2 (later id).
  assert.equal(since[since.length - 1].id, m3.id);
});

test('listMessagesSince: empty roomIds → empty result', () => {
  assert.deepEqual(listMessagesSince({ roomIds: [], sinceId: 0 }), []);
});

// ── Mentions inbox (Phase 10C) ──

test('insertMessage with mentions creates chat_mentions rows (skip self)', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:mentions' });
  [1, 2, 3].forEach(u => addMember({ roomId: r.id, userId: u }));
  // Author=1 mentions 2, 3, and self (1) — self filtered out.
  insertMessage({ roomId: r.id, authorId: 1, body: '@a @b @self', mentions: [2, 3, 1] });
  assert.equal(countUnreadMentions(1), 0); // self-mention skipped
  assert.equal(countUnreadMentions(2), 1);
  assert.equal(countUnreadMentions(3), 1);
});

test('listMentionsForUser returns newest-first with joined message + room', () => {
  _wipeChatForTests();
  const rA = getOrCreateRoom({ kind: 'team', key: 'team:a', title: '#a' });
  const rB = getOrCreateRoom({ kind: 'team', key: 'team:b', title: '#b' });
  [1, 5].forEach(u => {
    addMember({ roomId: rA.id, userId: u });
    addMember({ roomId: rB.id, userId: u });
  });
  insertMessage({ roomId: rA.id, authorId: 1, body: 'first ping', mentions: [5] });
  insertMessage({ roomId: rB.id, authorId: 1, body: 'second ping', mentions: [5] });
  const rows = listMentionsForUser({ userId: 5 });
  assert.equal(rows.length, 2);
  // Newest first
  assert.equal(rows[0].message_body, 'second ping');
  assert.equal(rows[0].room_title, '#b');
  assert.equal(rows[1].message_body, 'first ping');
  assert.equal(rows[1].room_title, '#a');
});

test('markMentionsRead: flip all or a subset', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 5].forEach(u => addMember({ roomId: r.id, userId: u }));
  insertMessage({ roomId: r.id, authorId: 1, body: 'a', mentions: [5] });
  insertMessage({ roomId: r.id, authorId: 1, body: 'b', mentions: [5] });
  insertMessage({ roomId: r.id, authorId: 1, body: 'c', mentions: [5] });
  assert.equal(countUnreadMentions(5), 3);

  // Mark one specific id
  const rows = listMentionsForUser({ userId: 5, unreadOnly: true });
  markMentionsRead({ userId: 5, ids: [rows[0].id] });
  assert.equal(countUnreadMentions(5), 2);

  // Mark all remaining
  const flipped = markMentionsRead({ userId: 5 });
  assert.equal(flipped, 2);
  assert.equal(countUnreadMentions(5), 0);
});

test('mentions unreadOnly filter', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 5].forEach(u => addMember({ roomId: r.id, userId: u }));
  insertMessage({ roomId: r.id, authorId: 1, body: 'a', mentions: [5] });
  insertMessage({ roomId: r.id, authorId: 1, body: 'b', mentions: [5] });
  markMentionsRead({ userId: 5 }); // both flip to read
  insertMessage({ roomId: r.id, authorId: 1, body: 'c', mentions: [5] });
  assert.equal(listMentionsForUser({ userId: 5, unreadOnly: true }).length, 1);
  assert.equal(listMentionsForUser({ userId: 5 }).length, 3);
});

test('mention fan-out dedupes duplicate ids in one message', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 5].forEach(u => addMember({ roomId: r.id, userId: u }));
  insertMessage({ roomId: r.id, authorId: 1, body: '@a @a @a', mentions: [5, 5, 5] });
  assert.equal(countUnreadMentions(5), 1);
});

// ── Search (Phase 10D) ──

test('searchMessages: basic LIKE match, newest first, members only', () => {
  _wipeChatForTests();
  const rA = getOrCreateRoom({ kind: 'team', key: 'team:a', title: '#a' });
  const rB = getOrCreateRoom({ kind: 'team', key: 'team:b', title: '#b' });
  addMember({ roomId: rA.id, userId: 1 });
  addMember({ roomId: rA.id, userId: 2 });
  addMember({ roomId: rB.id, userId: 2 });  // user 1 is NOT in rB

  insertMessage({ roomId: rA.id, authorId: 2, body: 'customer wants RFQ-42 review' });
  insertMessage({ roomId: rA.id, authorId: 2, body: 'also RFQ-99 please' });
  insertMessage({ roomId: rB.id, authorId: 2, body: 'secret RFQ-42 pricing in B' });

  const hits = searchMessages({ userId: 1, query: 'RFQ-42' });
  assert.equal(hits.length, 1);  // only rA is visible to user 1
  assert.equal(hits[0].body, 'customer wants RFQ-42 review');
  assert.equal(hits[0].room_title, '#a');
});

test('searchMessages: 1-char query returns empty', () => {
  assert.deepEqual(searchMessages({ userId: 1, query: 'x' }), []);
  assert.deepEqual(searchMessages({ userId: 1, query: '' }), []);
  assert.deepEqual(searchMessages({ userId: 1, query: '  ' }), []);
});

test('searchMessages: LIKE wildcard is escaped', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  insertMessage({ roomId: r.id, authorId: 1, body: '50 units' });
  insertMessage({ roomId: r.id, authorId: 1, body: '50% discount' });
  // Pre-escape: query "50%" would match both (% == wildcard).
  // Post-escape: matches only the literal "50%".
  const hits = searchMessages({ userId: 1, query: '50%' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].body, '50% discount');
});

test('searchMessages: respects limit', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  for (let i = 0; i < 10; i++) insertMessage({ roomId: r.id, authorId: 1, body: `hit ${i}` });
  assert.equal(searchMessages({ userId: 1, query: 'hit', limit: 3 }).length, 3);
});

// ── Edit / Delete (Phase 10E) ──

test('editMessage: author can edit, captures original body on first edit', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const m = insertMessage({ roomId: r.id, authorId: 1, body: 'oops typo' });
  const first = editMessage({ messageId: m.id, userId: 1, body: 'oops, fixed typo' });
  assert.equal(first.ok, true);
  assert.equal(first.message.body, 'oops, fixed typo');
  assert.equal(first.message.original_body, 'oops typo');
  assert.ok(first.message.edited_at);

  // Second edit: original_body unchanged (still the very first body),
  // body + edited_at update. edited_at may collide on ms-level so we
  // just assert it's set.
  const second = editMessage({ messageId: m.id, userId: 1, body: 'final version' });
  assert.equal(second.message.body, 'final version');
  assert.equal(second.message.original_body, 'oops typo');
  assert.ok(second.message.edited_at);
});

test('editMessage: non-author gets forbidden', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 2].forEach(u => addMember({ roomId: r.id, userId: u }));
  const m = insertMessage({ roomId: r.id, authorId: 1, body: 'hi' });
  const result = editMessage({ messageId: m.id, userId: 2, body: 'hijacked' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'forbidden');
});

test('editMessage: past the window → window_expired', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const m = insertMessage({ roomId: r.id, authorId: 1, body: 'old msg' });
  // Backdate created_at past the window by touching the DB directly.
  getDb().prepare(
    `UPDATE chat_messages SET created_at = ? WHERE id = ?`,
  ).run(new Date(Date.now() - EDIT_WINDOW_MS - 1000).toISOString(), m.id);

  const result = editMessage({ messageId: m.id, userId: 1, body: 'too late' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'window_expired');
});

test('editMessage: empty body rejected', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const m = insertMessage({ roomId: r.id, authorId: 1, body: 'hi' });
  assert.equal(editMessage({ messageId: m.id, userId: 1, body: '' }).reason, 'empty_body');
  assert.equal(editMessage({ messageId: m.id, userId: 1, body: '   ' }).reason, 'empty_body');
});

test('deleteMessage: author soft-deletes; listMessages still returns row', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const m = insertMessage({ roomId: r.id, authorId: 1, body: 'will delete' });
  const result = deleteMessage({ messageId: m.id, userId: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.room_id, r.id);
  const rows = listMessages({ roomId: r.id });
  // Row is still present (audit) but carries deleted_at
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, m.id);
  assert.ok(rows[0].deleted_at);
});

test('deleteMessage: double-delete returns already_deleted', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const m = insertMessage({ roomId: r.id, authorId: 1, body: 'bye' });
  deleteMessage({ messageId: m.id, userId: 1 });
  const second = deleteMessage({ messageId: m.id, userId: 1 });
  assert.equal(second.reason, 'already_deleted');
});

test('editMessage with new mentions fans out NEW inbox rows only', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 5, 9].forEach(u => addMember({ roomId: r.id, userId: u }));

  // Initial post: mentions user 5
  const m = insertMessage({ roomId: r.id, authorId: 1, body: '@a', mentions: [5] });
  assert.equal(countUnreadMentions(5), 1);
  assert.equal(countUnreadMentions(9), 0);

  // Edit: add user 9 while keeping 5 (same body for simplicity)
  const result = editMessage({
    messageId: m.id, userId: 1, body: '@a @b', mentions: [5, 9],
  });
  assert.equal(result.ok, true);
  // User 9: brand new mention
  assert.deepEqual(result.newly_mentioned, [9]);
  // User 5: still has their original row, NOT double-notified
  assert.equal(countUnreadMentions(5), 1);
  assert.equal(countUnreadMentions(9), 1);
});

test('editMessage removing a mention keeps the old inbox row', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 5].forEach(u => addMember({ roomId: r.id, userId: u }));
  const m = insertMessage({ roomId: r.id, authorId: 1, body: '@a', mentions: [5] });
  // Edit removes the mention
  editMessage({ messageId: m.id, userId: 1, body: 'no tags now', mentions: [] });
  // User 5's inbox row NOT retroactively deleted — author shouldn't
  // silently retract a notification someone may have seen.
  assert.equal(countUnreadMentions(5), 1);
});

test('deleted message body hidden from listMessages + listMessagesSince', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const a = insertMessage({ roomId: r.id, authorId: 1, body: 'secret pricing' });
  insertMessage({ roomId: r.id, authorId: 1, body: 'public note' });
  deleteMessage({ messageId: a.id, userId: 1 });

  const list = listMessages({ roomId: r.id });
  const delRow = list.find(m => m.id === a.id);
  assert.ok(delRow.deleted_at, 'deleted_at is present');
  assert.equal(delRow.body, null, 'body scrubbed in list');
  assert.equal(delRow.original_body, null, 'original_body scrubbed too');

  const since = listMessagesSince({ roomIds: [r.id], sinceId: 0 });
  const delSince = since.find(m => m.id === a.id);
  assert.equal(delSince.body, null, 'body scrubbed on SSE catch-up path');
});

test('deleted messages excluded from searchMessages', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const hit = insertMessage({ roomId: r.id, authorId: 1, body: 'unique-pricing-zz1' });
  insertMessage({ roomId: r.id, authorId: 1, body: 'visible-pricing-zz1' });
  deleteMessage({ messageId: hit.id, userId: 1 });

  const results = searchMessages({ userId: 1, query: 'pricing-zz1' });
  assert.equal(results.length, 1);
  assert.equal(results[0].body, 'visible-pricing-zz1');
  // Deleted row's body must not appear even as an empty hit
  assert.ok(!results.some(r => r.id === hit.id));
});

test('deleted mention body null in inbox but row remains', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 5].forEach(u => addMember({ roomId: r.id, userId: u }));
  const m = insertMessage({ roomId: r.id, authorId: 1, body: '@a ping', mentions: [5] });
  deleteMessage({ messageId: m.id, userId: 1 });
  const rows = listMentionsForUser({ userId: 5 });
  assert.equal(rows.length, 1, 'mention row preserved');
  assert.equal(rows[0].message_body, null, 'body scrubbed');
  assert.ok(rows[0].message_deleted_at, 'deleted_at surfaced for client UI');
});

test('purgeMessage: author hard-deletes; row gone from listMessages', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const a = insertMessage({ roomId: r.id, authorId: 1, body: 'gone' });
  insertMessage({ roomId: r.id, authorId: 1, body: 'kept' });
  const result = purgeMessage({ messageId: a.id, userId: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.room_id, r.id);
  const rows = listMessages({ roomId: r.id });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, 'kept');
});

test('purgeMessage: non-author gets forbidden', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 2].forEach(u => addMember({ roomId: r.id, userId: u }));
  const a = insertMessage({ roomId: r.id, authorId: 1, body: 'hi' });
  const result = purgeMessage({ messageId: a.id, userId: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'forbidden');
});

test('purgeMessage: past window → window_expired', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const a = insertMessage({ roomId: r.id, authorId: 1, body: 'old' });
  getDb().prepare(`UPDATE chat_messages SET created_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - EDIT_WINDOW_MS - 1000).toISOString(), a.id);
  assert.equal(purgeMessage({ messageId: a.id, userId: 1 }).reason, 'window_expired');
});

test('purgeMessage cascades chat_mentions via FK', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 5].forEach(u => addMember({ roomId: r.id, userId: u }));
  const a = insertMessage({ roomId: r.id, authorId: 1, body: '@a', mentions: [5] });
  assert.equal(countUnreadMentions(5), 1);
  purgeMessage({ messageId: a.id, userId: 1 });
  assert.equal(countUnreadMentions(5), 0);
});

test('editMessage on a deleted message → deleted reason', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  addMember({ roomId: r.id, userId: 1 });
  const m = insertMessage({ roomId: r.id, authorId: 1, body: 'bye' });
  deleteMessage({ messageId: m.id, userId: 1 });
  const result = editMessage({ messageId: m.id, userId: 1, body: 'come back' });
  assert.equal(result.reason, 'deleted');
});

// ── Retention / prune (Phase 10G) ──

test('pruneOldMessages deletes rows older than ttl and cascades mentions', () => {
  _wipeChatForTests();
  const r = getOrCreateRoom({ kind: 'team', key: 'team:x' });
  [1, 5].forEach(u => addMember({ roomId: r.id, userId: u }));
  const oldMsg = insertMessage({ roomId: r.id, authorId: 1, body: 'ancient', mentions: [5] });
  const newMsg = insertMessage({ roomId: r.id, authorId: 1, body: 'fresh', mentions: [5] });
  // Backdate the first msg
  getDb().prepare(`UPDATE chat_messages SET created_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - 400 * 86400 * 1000).toISOString(), oldMsg.id);

  const result = pruneOldMessages({ ttlDays: 30 });
  assert.equal(result.pruned, 1);
  const remaining = listMessages({ roomId: r.id });
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, newMsg.id);
  // Mention row for pruned message gone via ON DELETE CASCADE — user
  // 5's unread count drops from 2 to 1.
  assert.equal(countUnreadMentions(5), 1);
});

test('pruneOldMessages: invalid ttl → skipped', () => {
  assert.equal(pruneOldMessages({ ttlDays: 0 }).skipped, true);
  assert.equal(pruneOldMessages({ ttlDays: -5 }).skipped, true);
  assert.equal(pruneOldMessages({ ttlDays: NaN }).skipped, true);
});

// ── cleanup ──
test('cleanup', () => {
  _wipeChatForTests();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
});
