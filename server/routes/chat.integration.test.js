/**
 * Chat HTTP integration tests — Phase 10A.
 *
 * Boot the Express app on an ephemeral port, seed minimal user data,
 * issue authenticated requests using a direct session token (bypasses
 * the full login/TOTP flow — we're testing chat routes, not auth).
 *
 * Feature-flagged: all tests set OPS_CHAT_ENABLED=1 before import.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-chat-http-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_CHAT_ENABLED = '1';

// Seed minimal users.json BEFORE auth service initializes (it reads
// the file at boot).
fs.mkdirSync(path.join(tmp, 'Library', 'Users'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'Library', 'Users', 'users.json'),
  JSON.stringify(
    [
      {
        id: 1,
        username: 'hana',
        role: 'cost',
        pwd: 'x',
        pwd_bcrypt: '$2b$10$test',
        approval_roles: [],
      },
      {
        id: 2,
        username: 'sonia',
        role: 'user',
        pwd: 'x',
        pwd_bcrypt: '$2b$10$test',
        approval_roles: ['sales_mgr'],
      },
      {
        id: 3,
        username: 'felix',
        role: 'user',
        pwd: 'x',
        pwd_bcrypt: '$2b$10$test',
        approval_roles: ['finance_dir'],
      },
    ],
    null,
    2
  )
);

const { default: app } = await import('../index.js');
const { createSession } = await import('../services/authService.js');
const { saveQuotes } = await import('../repositories/quotesStore.js');

// Seed a single quote for the quote-room tests below. Shape mirrors
// what the real /save-all flow produces — id is numeric, metadata
// nests under `state`.
saveQuotes([
  {
    id: 101,
    type: 'standard',
    saved_at: new Date().toISOString(),
    version: 1,
    label: 'RFQ-42 / CCL-X1',
    result: {},
    state: { rfq_number: 'RFQ-42', ccl_pn: 'CCL-X1', site: 'VN' },
  },
]);

let server, baseUrl;
const tokenHana = createSession(1, { totpVerified: true });
const tokenSonia = createSession(2, { totpVerified: true });

test.before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    })
);
test.after(() => new Promise((resolve) => server.close(resolve)));

function h(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── Feature flag ──

test('GET /api/chat/rooms — 200 when enabled, populates default memberships', async () => {
  const r = await fetch(`${baseUrl}/api/chat/rooms`, { headers: h(tokenHana) });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  // hana has no approval_roles, so default membership = #everyone only.
  assert.ok(body.rooms.some((r) => r.key === 'team:everyone'));
});

test('sonia (sales_mgr) auto-joins #sales_mgr + #everyone', async () => {
  const r = await fetch(`${baseUrl}/api/chat/rooms`, { headers: h(tokenSonia) });
  const body = await r.json();
  const keys = body.rooms.map((r) => r.key);
  assert.ok(keys.includes('team:sales_mgr'));
  assert.ok(keys.includes('team:everyone'));
});

// ── DM flow ──

test('GET /api/chat/dm/sonia (from hana) creates DM room', async () => {
  const r = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.room.kind, 'dm');
  assert.equal(body.room.key, 'dm:1-2');
  assert.equal(body.room.title, '@sonia');
});

test('GET /api/chat/dm/UNKNOWN → 404', async () => {
  const r = await fetch(`${baseUrl}/api/chat/dm/ghost`, { headers: h(tokenHana) });
  assert.equal(r.status, 404);
});

test('GET /api/chat/dm/self → 400 (cannot DM yourself)', async () => {
  const r = await fetch(`${baseUrl}/api/chat/dm/hana`, { headers: h(tokenHana) });
  assert.equal(r.status, 400);
});

// ── Send + receive ──

test('POST message into DM, GET returns it', async () => {
  // Create DM first
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();

  const send = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'Hey @sonia, check RFQ-42' }),
  });
  assert.equal(send.status, 200);
  const sent = await send.json();
  assert.equal(sent.message.body, 'Hey @sonia, check RFQ-42');
  assert.equal(sent.message.author_id, 1);
  // mentions should include sonia's id (2)
  assert.deepEqual(JSON.parse(sent.message.mentions), [2]);

  // Fetch history from sonia's session
  const hist = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    headers: h(tokenSonia),
  });
  const histBody = await hist.json();
  assert.equal(histBody.messages.length, 1);
  assert.equal(histBody.messages[0].body, 'Hey @sonia, check RFQ-42');
});

test('empty/whitespace message body rejected', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const r = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: '   ' }),
  });
  assert.equal(r.status, 400);
});

test('HTML tags stripped from body server-side', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const send = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: '<script>alert(1)</script>plain' }),
  });
  const body = await send.json();
  assert.equal(body.message.body, 'alert(1)plain');
});

test('non-member cannot POST to a room', async () => {
  // Create a team room only sonia belongs to
  const soniaRooms = await fetch(`${baseUrl}/api/chat/rooms`, { headers: h(tokenSonia) });
  const { rooms } = await soniaRooms.json();
  const salesRoom = rooms.find((r) => r.key === 'team:sales_mgr');
  assert.ok(salesRoom, 'sales_mgr room should exist');

  // hana (non-member) tries to POST
  const r = await fetch(`${baseUrl}/api/chat/rooms/${salesRoom.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'cannot post here' }),
  });
  assert.equal(r.status, 403);
  const body = await r.json();
  assert.equal(body.error, 'not_a_member');
});

// ── Seen / unread ──

test('mark-seen updates last_seen_id', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const send = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenSonia),
    body: JSON.stringify({ body: 'msg from sonia' }),
  });
  const { message } = await send.json();

  const seen = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/seen`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ message_id: message.id }),
  });
  assert.equal(seen.status, 200);

  // Now rooms list should show unread_count=0 for this room
  const list = await fetch(`${baseUrl}/api/chat/rooms`, { headers: h(tokenHana) });
  const { rooms } = await list.json();
  const dmRoom = rooms.find((r) => r.id === room.id);
  assert.equal(dmRoom.unread_count, 0);
});

// ── Quote-scoped rooms (Phase 10B) ──

test('GET /api/chat/quote/:id creates a quote room with RFQ-based title', async () => {
  const r = await fetch(`${baseUrl}/api/chat/quote/101`, { headers: h(tokenHana) });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.room.kind, 'quote');
  assert.equal(body.room.key, 'quote:101');
  // Title composed from RFQ + CCL PN
  assert.ok(body.room.title.includes('RFQ-42'));
  assert.ok(body.room.title.includes('CCL-X1'));
  assert.equal(body.room.site, 'VN');
});

test('GET /api/chat/quote/:id is idempotent — second call returns same room', async () => {
  const r1 = await fetch(`${baseUrl}/api/chat/quote/101`, { headers: h(tokenHana) });
  const r2 = await fetch(`${baseUrl}/api/chat/quote/101`, { headers: h(tokenSonia) });
  const b1 = await r1.json();
  const b2 = await r2.json();
  assert.equal(b1.room.id, b2.room.id);
  // Both callers auto-joined as members; they can now post.
  const post = await fetch(`${baseUrl}/api/chat/rooms/${b1.room.id}/messages`, {
    method: 'POST',
    headers: h(tokenSonia),
    body: JSON.stringify({ body: 'scoped to the quote' }),
  });
  assert.equal(post.status, 200);
});

test('GET /api/chat/quote/:id — unknown quote → 404', async () => {
  const r = await fetch(`${baseUrl}/api/chat/quote/9999`, { headers: h(tokenHana) });
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.error, 'quote_not_found');
});

test('GET /api/chat/quote/bogus → 400', async () => {
  const r = await fetch(`${baseUrl}/api/chat/quote/abc`, { headers: h(tokenHana) });
  assert.equal(r.status, 400);
});

// ── Mentions inbox (Phase 10C) ──

test("sending @mention populates the recipient's inbox", async () => {
  // hana DMs sonia with @sonia → sonia gets a mention row
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'FYI @sonia needs your review' }),
  });
  const inbox = await fetch(`${baseUrl}/api/chat/mentions?unread=1`, {
    headers: h(tokenSonia),
  }).then((r) => r.json());
  assert.ok(inbox.unread_count >= 1);
  assert.ok(inbox.mentions.some((m) => m.message_body.includes('needs your review')));
});

test('self-mention is NOT fanned out', async () => {
  // hana DMs sonia but says @hana — should not hit hana's own inbox
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const before = await fetch(`${baseUrl}/api/chat/mentions?unread=1`, {
    headers: h(tokenHana),
  }).then((r) => r.json());
  await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'Reminder to @hana to double-check' }),
  });
  const after = await fetch(`${baseUrl}/api/chat/mentions?unread=1`, {
    headers: h(tokenHana),
  }).then((r) => r.json());
  assert.equal(after.unread_count, before.unread_count);
});

test('POST /api/chat/mentions/mark-read flips all unread', async () => {
  const mark = await fetch(`${baseUrl}/api/chat/mentions/mark-read`, {
    method: 'POST',
    headers: h(tokenSonia),
    body: JSON.stringify({}),
  });
  assert.equal(mark.status, 200);
  const inbox = await fetch(`${baseUrl}/api/chat/mentions?unread=1`, {
    headers: h(tokenSonia),
  }).then((r) => r.json());
  assert.equal(inbox.unread_count, 0);
});

// ── Search (Phase 10D) ──

test('GET /api/chat/search returns messages from accessible rooms', async () => {
  // hana sends to the #everyone room
  const roomsRes = await fetch(`${baseUrl}/api/chat/rooms`, { headers: h(tokenHana) });
  const { rooms: hanaRooms } = await roomsRes.json();
  const everyone = hanaRooms.find((r) => r.key === 'team:everyone');
  await fetch(`${baseUrl}/api/chat/rooms/${everyone.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'searchable unique-marker-zz' }),
  });

  const search = await fetch(`${baseUrl}/api/chat/search?q=unique-marker-zz`, {
    headers: h(tokenHana),
  });
  assert.equal(search.status, 200);
  const body = await search.json();
  assert.ok(body.results.length >= 1);
  assert.ok(body.results[0].body.includes('unique-marker-zz'));
});

test('search does NOT leak messages from rooms caller is not in', async () => {
  // Sonia posts to #sales_mgr (hana is not a member)
  const soniaRooms = await fetch(`${baseUrl}/api/chat/rooms`, { headers: h(tokenSonia) });
  const { rooms } = await soniaRooms.json();
  const salesRoom = rooms.find((r) => r.key === 'team:sales_mgr');
  await fetch(`${baseUrl}/api/chat/rooms/${salesRoom.id}/messages`, {
    method: 'POST',
    headers: h(tokenSonia),
    body: JSON.stringify({ body: 'confidential-keyword-qq' }),
  });

  // hana searches — should find nothing
  const hanaSearch = await fetch(`${baseUrl}/api/chat/search?q=confidential-keyword-qq`, {
    headers: h(tokenHana),
  }).then((r) => r.json());
  assert.equal(hanaSearch.results.length, 0);

  // sonia (member) finds it
  const soniaSearch = await fetch(`${baseUrl}/api/chat/search?q=confidential-keyword-qq`, {
    headers: h(tokenSonia),
  }).then((r) => r.json());
  assert.ok(soniaSearch.results.length >= 1);
});

test('search with 1-char query returns empty (not a 400)', async () => {
  const r = await fetch(`${baseUrl}/api/chat/search?q=a`, { headers: h(tokenHana) });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body.results, []);
});

// ── Metrics (Phase 10G) ──

test('chat operations increment Prometheus counters', async () => {
  const { renderPrometheus, _resetMetrics } = await import('../utils/metrics.js');
  _resetMetrics();

  // Exercise a send → edit → delete round-trip
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const sent = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'Hey @sonia metrics test' }),
  }).then((r) => r.json());
  await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}`, {
    method: 'PATCH',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'metrics test (edited)' }),
  });
  await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}`, {
    method: 'DELETE',
    headers: h(tokenHana),
  });
  await fetch(`${baseUrl}/api/chat/search?q=metrics`, { headers: h(tokenHana) });

  const text = renderPrometheus();
  // Each counter must appear with a non-zero value.
  assert.match(text, /chat_messages_sent_total\{kind="dm"\}\s+[1-9]/);
  assert.match(text, /chat_mentions_sent_total\s+[1-9]/);
  assert.match(text, /chat_messages_edited_total\s+[1-9]/);
  assert.match(text, /chat_messages_deleted_total\s+[1-9]/);
  assert.match(text, /chat_search_queries_total\s+[1-9]/);
});

// ── Edit / Delete (Phase 10E) ──

test('PATCH /api/chat/messages/:id — author can edit own message', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const sent = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'typo in message' }),
  }).then((r) => r.json());

  const edit = await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}`, {
    method: 'PATCH',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'fixed typo' }),
  });
  assert.equal(edit.status, 200);
  const body = await edit.json();
  assert.equal(body.message.body, 'fixed typo');
  assert.equal(body.message.original_body, 'typo in message');
  assert.ok(body.message.edited_at);
});

test('PATCH edit adding @mention pings the newly-mentioned user', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  // Post WITHOUT a mention
  const sent = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'thinking about this' }),
  }).then((r) => r.json());

  // Sonia clears any existing unread so we can isolate the edit's effect
  await fetch(`${baseUrl}/api/chat/mentions/mark-read`, {
    method: 'POST',
    headers: h(tokenSonia),
    body: JSON.stringify({}),
  });
  const before = await fetch(`${baseUrl}/api/chat/mentions?unread=1`, {
    headers: h(tokenSonia),
  }).then((r) => r.json());
  assert.equal(before.unread_count, 0);

  // Edit to ADD @sonia
  await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}`, {
    method: 'PATCH',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'hey @sonia — thinking about this' }),
  });

  const after = await fetch(`${baseUrl}/api/chat/mentions?unread=1`, {
    headers: h(tokenSonia),
  }).then((r) => r.json());
  assert.equal(after.unread_count, 1);
  assert.ok(after.mentions[0].message_body.includes('thinking about this'));
});

test('PATCH — non-author gets 403', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const sent = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'hana said this' }),
  }).then((r) => r.json());

  const edit = await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}`, {
    method: 'PATCH',
    headers: h(tokenSonia),
    body: JSON.stringify({ body: 'sonia hijacks' }),
  });
  assert.equal(edit.status, 403);
});

test('DELETE — author can soft-delete; history still returns the row', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const sent = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'will be deleted' }),
  }).then((r) => r.json());

  const del = await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}`, {
    method: 'DELETE',
    headers: h(tokenHana),
  });
  assert.equal(del.status, 200);

  const hist = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    headers: h(tokenHana),
  }).then((r) => r.json());
  const found = hist.messages.find((m) => m.id === sent.message.id);
  assert.ok(found, 'row still present for audit');
  assert.ok(found.deleted_at, 'deleted_at set');
});

test('chatEditRateLimit: 429 after burst of PATCH/DELETE', async () => {
  const { chatEditRateLimit } = await import('../middleware/rateLimit.js');
  chatEditRateLimit._reset();
  const max = chatEditRateLimit._max();

  // Get a fresh message id that we own
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();

  // Burst = max + 2 attempts. Past max should flip to 429.
  let saw429 = false;
  for (let i = 0; i < max + 2; i++) {
    // Post + immediately edit cycle — counts each as one operation
    // against the edit limiter (POST uses a different limiter).
    const sent = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
      method: 'POST',
      headers: h(tokenHana),
      body: JSON.stringify({ body: `burst ${i}` }),
    }).then((r) => r.json());
    const r = await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}`, {
      method: 'PATCH',
      headers: h(tokenHana),
      body: JSON.stringify({ body: `burst ${i} edited` }),
    });
    if (r.status === 429) {
      saw429 = true;
      break;
    }
  }
  assert.equal(saw429, true);
  chatEditRateLimit._reset(); // don't bleed into subsequent tests
});

test('DELETE ?hard=1 — purges the row entirely', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const sent = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'purge me' }),
  }).then((r) => r.json());
  const del = await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}?hard=1`, {
    method: 'DELETE',
    headers: h(tokenHana),
  });
  assert.equal(del.status, 200);
  const body = await del.json();
  assert.equal(body.purged, true);
  const hist = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    headers: h(tokenHana),
  }).then((r) => r.json());
  assert.ok(!hist.messages.some((m) => m.id === sent.message.id), 'row is gone');
});

test('DELETE ?hard=1 — non-author gets 403', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const sent = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'not yours to purge' }),
  }).then((r) => r.json());
  const r = await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}?hard=1`, {
    method: 'DELETE',
    headers: h(tokenSonia),
  });
  assert.equal(r.status, 403);
});

test('DELETE — second delete returns 410', async () => {
  const dmRes = await fetch(`${baseUrl}/api/chat/dm/sonia`, { headers: h(tokenHana) });
  const { room } = await dmRes.json();
  const sent = await fetch(`${baseUrl}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: h(tokenHana),
    body: JSON.stringify({ body: 'once' }),
  }).then((r) => r.json());

  await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}`, {
    method: 'DELETE',
    headers: h(tokenHana),
  });
  const again = await fetch(`${baseUrl}/api/chat/messages/${sent.message.id}`, {
    method: 'DELETE',
    headers: h(tokenHana),
  });
  assert.equal(again.status, 410);
});

// ── Users directory ──

test('GET /api/chat/users returns directory for autocomplete', async () => {
  const r = await fetch(`${baseUrl}/api/chat/users`, { headers: h(tokenHana) });
  const body = await r.json();
  assert.equal(body.users.length, 3);
  assert.ok(body.users.every((u) => u.id && u.username));
  // Passwords + bcrypt hashes NOT leaked
  assert.ok(body.users.every((u) => u.pwd == null && u.pwd_bcrypt == null));
});

// ── Feature flag OFF ──

test('chat disabled: returns 503 with clear error', async () => {
  process.env.OPS_CHAT_ENABLED = '0';
  const r = await fetch(`${baseUrl}/api/chat/rooms`, { headers: h(tokenHana) });
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.error, 'chat_disabled');
  process.env.OPS_CHAT_ENABLED = '1'; // restore for subsequent tests
});

test('unauthenticated → 401', async () => {
  const r = await fetch(`${baseUrl}/api/chat/rooms`);
  assert.equal(r.status, 401);
});
