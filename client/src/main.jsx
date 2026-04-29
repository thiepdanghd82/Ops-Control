import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './components/Shared/draggableCard.css'
// v1.3 P3.3 — per-domain i18n registration. Each module side-effect-
// imports registerStrings() to merge its slice into the global STRINGS
// dict. Order is irrelevant for non-overlapping namespaces.
import './i18n/domains/security.js'
import App from './App.jsx'
import { startWebVitals } from './utils/webVitals.js'
import { installDraggableCards } from './components/Shared/draggableCard.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Sprint AW — Core Web Vitals beacon. Fires once per page at hide
// time; server aggregates into `web_vitals_ms` histogram visible in
// AdminMetrics. Outside React tree so StrictMode double-mount doesn't
// double-register the PerformanceObservers.
startWebVitals();

// Sprint S-DRAG — enable drag-to-move + resize on every overlay card
// marked with `data-ops-draggable-card`. Single delegated listener.
installDraggableCards();

// v1.3 F4 — Bundle marker. Vite injects __OPS_BUNDLE_MARKER__ at build
// time (see vite.config.js define block). Print to console once + expose
// on window so post-build `grep` finds the literal string in the chunk.
// Format: opsctl-v1.3-marker:<build-id>:<ISO-timestamp>.
// eslint-disable-next-line no-undef
const __marker = typeof __OPS_BUNDLE_MARKER__ !== 'undefined' ? __OPS_BUNDLE_MARKER__ : 'opsctl-v1.3-marker:dev:unknown';
if (typeof window !== 'undefined') window.__OPS_BUNDLE_MARKER__ = __marker;
console.info('[ops-control]', __marker);
