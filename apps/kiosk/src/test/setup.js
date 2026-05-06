// Test setup — Sprint MES-3-V2 KIOSK-004.
// Wires testing-library matchers (toBeInTheDocument, toHaveAttribute, …)
// and provides default browser-API stubs that jsdom doesn't ship with.
import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
// fake-indexeddb wires window.indexedDB to an in-memory shim so the
// `idb` library used by queue.js can run inside jsdom. Imported as a
// side-effect — no symbols to call.
import 'fake-indexeddb/auto';

// jsdom doesn't implement matchMedia; ConnBadge + others read it
// indirectly via window.navigator.onLine which IS provided.

// Default fetch mock — individual tests override per-call. Without a
// default, any unmocked fetch in a component effect would explode the
// whole suite.
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn();
} else {
  globalThis.fetch = vi.fn();
}

// localStorage stub: jsdom provides one but it's shared between tests,
// so reset between each so reason-codes cache + session data don't leak.
afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

// crypto.randomUUID — jsdom 25 has it, but pin a deterministic stub for
// idempotency-key generation tests. Wrapper checks for crypto first;
// override is shallow and safe.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = { randomUUID: () => 'test-uuid-0000' };
}
