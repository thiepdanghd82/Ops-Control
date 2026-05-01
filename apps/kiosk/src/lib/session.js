// localStorage wrapper for the kiosk session blob — Sprint MES-2.6.
// Key: 'opskiosk.session.v1'. Schema-version suffix per CLAUDE.md
// Lesson 18 (usePersistentInputs pattern) so a future shape change can
// roll forward without crashing on stale blobs.
const KEY = 'opskiosk.session.v1';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Minimum-viable shape check — anything missing → treat as missing.
    if (!parsed || typeof parsed !== 'object' || !parsed.session_jwt || !parsed.machine_code) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    // Corrupted blob — clear so next save() starts fresh.
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* private mode */
    }
    return null;
  }
}

export function save(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch (e) {
    // Quota exceeded or private mode — kiosk falls back to in-memory only;
    // operator will need to re-pair on reload. Surface to console so
    // observability picks it up; UI continues without throwing.
    console.warn('[kiosk] session.save failed', e);
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
