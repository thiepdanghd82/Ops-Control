/**
 * auditChain.js unit tests — Phase 2.2 of Debug Playbook (2026-06-20).
 *
 * Tampering scenarios pinned by intentional break-then-verify pattern:
 *   - Genesis-only chain (single entry) verifies clean
 *   - Multi-entry chain verifies clean
 *   - Mutated entry → verifier reports breakIndex
 *   - Inserted entry → verifier reports breakIndex
 *   - Deleted entry → verifier reports breakIndex
 *   - Reordered entries → verifier reports breakIndex
 *   - Legacy log (no CHAIN_INIT) → verifier ok=true (skipped)
 *   - Mixed legacy + chain (CHAIN_INIT in middle) → verifies only post-genesis
 *
 *   node --test server/services/auditChain.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalEntryJson,
  hashEntry,
  appendHashed,
  preChainFingerprint,
  buildGenesisEntry,
  verifyChain,
} from './auditChain.js';

const SAMPLE_ENTRY = {
  ts: '2026-06-20T10:00:00.000Z',
  event: 'LOGIN_OK',
  user: 'henry',
  ip: '127.0.0.1',
  detail: '{"session_id":"abc"}',
};

// ─── Canonical JSON ──────────────────────────────────────────────

test('canonicalEntryJson — deterministic field order regardless of input key order', () => {
  const a = canonicalEntryJson({ user: 'h', ip: '1.1.1.1', ts: 'T', event: 'E', detail: 'd' });
  const b = canonicalEntryJson({ event: 'E', detail: 'd', ts: 'T', ip: '1.1.1.1', user: 'h' });
  assert.equal(a, b);
});

test('canonicalEntryJson — defaults user/ip to "-" and detail to "" when missing', () => {
  const out = canonicalEntryJson({ ts: 'T', event: 'E' });
  assert.equal(out, '{"ts":"T","event":"E","user":"-","ip":"-","detail":""}');
});

test('canonicalEntryJson — IGNORES extra chain fields (prev_hash/hash)', () => {
  const a = canonicalEntryJson(SAMPLE_ENTRY);
  const b = canonicalEntryJson({ ...SAMPLE_ENTRY, prev_hash: 'xyz', hash: 'abc' });
  assert.equal(a, b);
});

// ─── hashEntry ───────────────────────────────────────────────────

test('hashEntry — deterministic across runs', () => {
  const h1 = hashEntry('prev123', SAMPLE_ENTRY);
  const h2 = hashEntry('prev123', SAMPLE_ENTRY);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64, 'sha256 hex is 64 chars');
});

test('hashEntry — different prev_hash produces different hash', () => {
  const h1 = hashEntry('A', SAMPLE_ENTRY);
  const h2 = hashEntry('B', SAMPLE_ENTRY);
  assert.notEqual(h1, h2);
});

test('hashEntry — null prev_hash treated as empty string (genesis edge)', () => {
  const h1 = hashEntry(null, SAMPLE_ENTRY);
  const h2 = hashEntry('', SAMPLE_ENTRY);
  assert.equal(h1, h2);
});

// ─── appendHashed ────────────────────────────────────────────────

test('appendHashed — returns new object with prev_hash + hash attached', () => {
  const out = appendHashed('prev', SAMPLE_ENTRY);
  assert.equal(out.prev_hash, 'prev');
  assert.ok(typeof out.hash === 'string' && out.hash.length === 64);
  assert.equal(out.event, SAMPLE_ENTRY.event, 'original fields preserved');
});

test('appendHashed — does not mutate input', () => {
  const input = { ...SAMPLE_ENTRY };
  appendHashed('p', input);
  assert.equal(input.prev_hash, undefined, 'input untouched');
  assert.equal(input.hash, undefined);
});

// ─── preChainFingerprint ─────────────────────────────────────────

test('preChainFingerprint — empty array → sha256 of empty string', () => {
  const f = preChainFingerprint([]);
  // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  assert.equal(f, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('preChainFingerprint — order-sensitive (different order → different fingerprint)', () => {
  const a = preChainFingerprint([{ ts: 'T1' }, { ts: 'T2' }]);
  const b = preChainFingerprint([{ ts: 'T2' }, { ts: 'T1' }]);
  assert.notEqual(a, b);
});

// ─── buildGenesisEntry ───────────────────────────────────────────

test('buildGenesisEntry — emits CHAIN_INIT with valid chain fields', () => {
  const genesis = buildGenesisEntry({
    ts: '2026-06-20T00:00:00.000Z',
    user: 'henry',
    preChainRows: [SAMPLE_ENTRY],
  });
  assert.equal(genesis.event, 'CHAIN_INIT');
  assert.equal(genesis.user, 'henry');
  assert.ok(typeof genesis.hash === 'string' && genesis.hash.length === 64);
  assert.ok(typeof genesis.prev_hash === 'string' && genesis.prev_hash.length === 64);
  const detail = JSON.parse(genesis.detail);
  assert.equal(detail.pre_chain_row_count, 1);
  assert.equal(detail.chain_version, 1);
  assert.ok(detail.pre_chain_sha256);
});

// ─── verifyChain — clean chains ──────────────────────────────────

test('verifyChain — empty rows → ok=true', () => {
  assert.deepEqual(verifyChain([]), { ok: true, chainStart: -1, chainLength: 0 });
});

test('verifyChain — single genesis entry → ok=true, chainLength=1', () => {
  const genesis = buildGenesisEntry({ ts: 'T0' });
  const r = verifyChain([genesis]);
  assert.equal(r.ok, true);
  assert.equal(r.chainStart, 0);
  assert.equal(r.chainLength, 1);
});

test('verifyChain — multi-entry chain (genesis + 3 entries) → ok=true', () => {
  const genesis = buildGenesisEntry({ ts: 'T0' });
  const e1 = appendHashed(genesis.hash, { ...SAMPLE_ENTRY, ts: 'T1' });
  const e2 = appendHashed(e1.hash, { ...SAMPLE_ENTRY, ts: 'T2', event: 'LOGIN_OK' });
  const e3 = appendHashed(e2.hash, { ...SAMPLE_ENTRY, ts: 'T3', event: 'LOGOUT' });
  const r = verifyChain([genesis, e1, e2, e3]);
  assert.equal(r.ok, true);
  assert.equal(r.chainStart, 0);
  assert.equal(r.chainLength, 4);
});

// ─── verifyChain — tampering detection ───────────────────────────

test('verifyChain — mutated entry → breakIndex points at the tampered entry', () => {
  const genesis = buildGenesisEntry({ ts: 'T0' });
  const e1 = appendHashed(genesis.hash, { ...SAMPLE_ENTRY, ts: 'T1' });
  // Attacker mutates e1's user field WITHOUT recomputing hash
  const tampered = { ...e1, user: 'mallory' };
  const r = verifyChain([genesis, tampered]);
  assert.equal(r.ok, false);
  assert.equal(r.breakIndex, 1);
  assert.match(r.message, /hash=/);
});

test('verifyChain — inserted entry → breakIndex at insertion (prev_hash mismatch)', () => {
  const genesis = buildGenesisEntry({ ts: 'T0' });
  const e1 = appendHashed(genesis.hash, { ...SAMPLE_ENTRY, ts: 'T1' });
  const e2 = appendHashed(e1.hash, { ...SAMPLE_ENTRY, ts: 'T2' });
  // Attacker inserts a fake entry between genesis and e1 (prev_hash
  // points at genesis but hash is recomputed to fool simple checks)
  const fake = appendHashed(genesis.hash, { ts: 'T0.5', event: 'FAKE', user: 'mallory' });
  const r = verifyChain([genesis, fake, e1, e2]);
  assert.equal(r.ok, false);
  // Break surfaces at index 2 (e1) because its prev_hash points at
  // genesis.hash, but the chain walk now expects fake.hash
  assert.equal(r.breakIndex, 2);
  assert.match(r.message, /prev_hash=/);
});

test('verifyChain — deleted entry → breakIndex at the next entry', () => {
  const genesis = buildGenesisEntry({ ts: 'T0' });
  const e1 = appendHashed(genesis.hash, { ...SAMPLE_ENTRY, ts: 'T1' });
  const e2 = appendHashed(e1.hash, { ...SAMPLE_ENTRY, ts: 'T2' });
  const e3 = appendHashed(e2.hash, { ...SAMPLE_ENTRY, ts: 'T3' });
  // Attacker deletes e2 — chain now: [genesis, e1, e3]
  // e3.prev_hash points at e2.hash (deleted), but walk expects e1.hash
  const r = verifyChain([genesis, e1, e3]);
  assert.equal(r.ok, false);
  assert.equal(r.breakIndex, 2);
});

test('verifyChain — reordered entries → breakIndex at first out-of-order', () => {
  const genesis = buildGenesisEntry({ ts: 'T0' });
  const e1 = appendHashed(genesis.hash, { ...SAMPLE_ENTRY, ts: 'T1' });
  const e2 = appendHashed(e1.hash, { ...SAMPLE_ENTRY, ts: 'T2' });
  // Swap e1 and e2 — chain breaks immediately at the new position 1
  const r = verifyChain([genesis, e2, e1]);
  assert.equal(r.ok, false);
  assert.equal(r.breakIndex, 1);
});

// ─── verifyChain — legacy + mixed scenarios ──────────────────────

test('verifyChain — legacy log (no CHAIN_INIT) → ok=true with explanatory message', () => {
  // Pre-chain entries; verifier accepts them as best-effort legacy
  // (their integrity can't be proven retroactively) and reports OK.
  const r = verifyChain([SAMPLE_ENTRY, { ...SAMPLE_ENTRY, ts: 'T1' }]);
  assert.equal(r.ok, true);
  assert.equal(r.chainStart, -1);
  assert.equal(r.chainLength, 0);
  assert.match(r.message, /No CHAIN_INIT/);
});

test('verifyChain — pre-chain entries before genesis are SKIPPED, post-genesis verified', () => {
  // Realistic scenario: existing audit_log.json has 1000 pre-chain
  // entries, then migration writes CHAIN_INIT, then new entries
  // accumulate. Verifier walks only post-genesis.
  const preChain = [
    { ts: 'T-2', event: 'OLD1', user: 'a', ip: '-', detail: '' },
    { ts: 'T-1', event: 'OLD2', user: 'b', ip: '-', detail: '' },
  ];
  const genesis = buildGenesisEntry({ ts: 'T0', preChainRows: preChain });
  const e1 = appendHashed(genesis.hash, { ...SAMPLE_ENTRY, ts: 'T1' });
  const r = verifyChain([...preChain, genesis, e1]);
  assert.equal(r.ok, true);
  assert.equal(r.chainStart, 2, 'genesis is at index 2 (after 2 pre-chain entries)');
  assert.equal(r.chainLength, 2);
});

test('verifyChain — post-genesis entry missing chain fields → reported as break', () => {
  const genesis = buildGenesisEntry({ ts: 'T0' });
  // Someone wrote a row via the OLD audit() that doesn't attach hash
  const naked = { ts: 'T1', event: 'NAKED', user: 'h', ip: '-', detail: '' };
  const r = verifyChain([genesis, naked]);
  assert.equal(r.ok, false);
  assert.equal(r.breakIndex, 1);
  assert.match(r.message, /missing chain fields/);
});
