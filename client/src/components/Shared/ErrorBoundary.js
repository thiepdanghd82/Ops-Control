// @ts-check
/**
 * Reusable React error boundary. Catches render-time errors in its
 * subtree and renders a fallback UI with a Retry button, keeping the
 * rest of the app usable.
 *
 * Ops Control ships a per-tab boundary via CostModule; before this
 * shared component the app had three gaps:
 *   1. Top-of-tree: if Sidebar / TopBar / WarningBar crashed, the
 *      whole screen went blank.
 *   2. PlanningModule: no tab boundary equivalent to CostModule's.
 *   3. ChatDrawer: a floating widget that can crash independently —
 *      a network parse error shouldn't take down the quoting UI.
 *
 * Props:
 *   - `label` (string): shown in the fallback header, e.g. "Cost Module".
 *   - `resetKey` (any): when it changes, the boundary auto-resets. Use
 *     the active-tab id so switching tabs recovers without a manual
 *     Retry click.
 *   - `onError` (fn): called on componentDidCatch with (error, info).
 *     Future telemetry hook.
 *   - `fallback` (fn): optional custom renderer that receives
 *     ({ error, reset }) so callers can provide a tailored empty state.
 *
 * Design notes:
 *   - Class component because React's error APIs
 *     (getDerivedStateFromError / componentDidCatch) are class-only.
 *   - File is .js using React.createElement rather than .jsx with JSX
 *     so `node --test` can import it for pure-logic regression tests
 *     without a JSX transform step.
 */
import React from 'react';

const h = React.createElement;

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const { label = 'Unknown', onError } = this.props;
    console.error(`[ErrorBoundary:${label}]`, error, info?.componentStack || info);

    // Stale-chunk auto-recovery. After a new deploy, the old index.js
    // still in the browser tries to import chunks at hashes that no
    // longer exist. Vite / ESM surface that in three flavours:
    //   - "Failed to fetch dynamically imported module"
    //   - "Importing a module script failed"
    //   - "'text/html' is not a valid JavaScript MIME type"
    //     (when the server fell back to index.html for a missing asset)
    // Rather than trap the user in a crashed tab, force-reload ONCE
    // (guarded by a session flag so an infinite loop on a genuine bug
    // can't melt their battery).
    try {
      const msg = String(error?.message || error || '');
      const isChunkLoadError =
        /Failed to fetch dynamically imported module/i.test(msg)
        || /Importing a module script failed/i.test(msg)
        || /'text\/html' is not a valid JavaScript MIME type/i.test(msg)
        || /Loading chunk \d+ failed/i.test(msg);
      if (isChunkLoadError && typeof window !== 'undefined' && window.sessionStorage) {
        if (!window.sessionStorage.getItem('ops_chunk_reload_done')) {
          window.sessionStorage.setItem('ops_chunk_reload_done', '1');
          console.warn('[ErrorBoundary] stale chunk detected — force-reloading page to fetch fresh bundle map');
          // Give React a tick to render the fallback first, then reload.
          setTimeout(() => window.location.reload(), 0);
          return;
        }
      }
    } catch { /* never crash the boundary itself */ }

    // Sprint T — beacon the crash to the server so ops can see client
    // errors in the request log even when the user never reports them.
    // sendBeacon is fire-and-forget (no response, survives page unload)
    // and is capped by the browser; if it's unavailable we fall back to
    // fetch({keepalive}). Both paths are wrapped so a telemetry failure
    // cannot itself crash the boundary.
    try {
      const payload = JSON.stringify({
        boundary: String(label).slice(0, 40),
        message: String(error?.message || error || '').slice(0, 200),
        url: typeof window !== 'undefined' ? String(window.location?.pathname || '').slice(0, 200) : '',
        stack: String(error?.stack || '').slice(0, 600),
      });
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = typeof navigator !== 'undefined'
        && typeof navigator.sendBeacon === 'function'
        && navigator.sendBeacon('/api/telemetry/client-error', blob);
      if (!sent && typeof fetch === 'function') {
        fetch('/api/telemetry/client-error', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => { /* telemetry best-effort */ });
      }
    } catch { /* never crash the boundary itself */ }
    if (typeof onError === 'function') {
      try { onError(error, info); } catch { /* never crash the boundary itself */ }
    }
  }

  componentDidUpdate(prevProps) {
    // Auto-reset when `resetKey` changes. Callers pass e.g. the
    // active-tab id so switching tabs recovers without a manual click.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { fallback, label = 'this section' } = this.props;
    if (typeof fallback === 'function') {
      return fallback({ error: this.state.error, reset: this.reset });
    }
    const msg = this.state.error?.message || 'An unexpected error occurred';
    return h('div', {
      role: 'alert',
      style: {
        padding: 24, margin: 16, border: '1px solid #fca5a5', background: '#fef2f2',
        borderRadius: 8, color: '#7f1d1d', fontFamily: 'system-ui, sans-serif',
      },
    },
      h('div', { style: { fontWeight: 700, fontSize: 15, marginBottom: 6 } },
        `\u26A0\uFE0F ${label} crashed`),
      h('div', {
        style: {
          fontSize: 12, marginBottom: 12, fontFamily: 'monospace',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        },
      }, msg),
      h('button', {
        type: 'button',
        onClick: this.reset,
        style: {
          padding: '6px 14px', background: '#dc2626', color: 'white',
          border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
        },
      }, 'Retry'),
      h('div', {
        style: { fontSize: 11, color: '#991b1b', marginTop: 8 },
      }, 'If this keeps happening, copy the error above and report it.'),
    );
  }
}
