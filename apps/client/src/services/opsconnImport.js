/**
 * opsconnImport — Phase A.3a parser/validator for .opsconn profile files.
 *
 * Pure: no UI, no IPC, no fs. Takes raw JSON text, returns a structured
 * { ok, profile?, error?, warnings? } verdict. Lets the ModeSection UI
 * decide how to present errors and which mode to switch to.
 *
 * Validation tiers (per A.3 D2 decision):
 *   (a) HARD: kind === 'ops-connection-profile'
 *   (b) HARD: schemaVersion in supported list
 *   (c) HARD: server.url present, well-formed http(s) URL
 *   (d) SOFT: server.id RFC4122 v4 UUID — older exports may differ;
 *       surfaces as a warning, not a rejection.
 *
 * Trust boundary: .opsconn files arrive from outside the app (admin
 * email, USB stick, file manager), so anything beyond what this
 * validator vouches for must NOT be acted on.
 */

const REQUIRED_KIND = 'ops-connection-profile';
const SUPPORTED_SCHEMA_VERSIONS = [1];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseOpsconn(rawJson) {
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (e) {
    return { ok: false, error: 'Invalid JSON: ' + e.message };
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Expected JSON object at root' };
  }

  if (data.kind !== REQUIRED_KIND) {
    return { ok: false, error: 'Not a valid .opsconn file (wrong kind)' };
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(data.schemaVersion)) {
    return {
      ok: false,
      error:
        'Unsupported schema version: ' +
        data.schemaVersion +
        '. Supported: ' +
        SUPPORTED_SCHEMA_VERSIONS.join(', '),
    };
  }

  const server = data.server || {};
  if (!server.url || typeof server.url !== 'string') {
    return { ok: false, error: 'Missing or invalid server.url' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(server.url);
  } catch {
    return { ok: false, error: 'Malformed server.url' };
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { ok: false, error: 'server.url must be http or https' };
  }

  const warnings = [];
  if (server.id && !UUID_RE.test(server.id)) {
    warnings.push('server.id is not a valid RFC4122 UUID — may be older export');
  }

  return {
    ok: true,
    warnings,
    profile: {
      name: server.name || 'Imported Server',
      id: server.id || null,
      url: server.url,
      language: server.language || 'en',
      timezone: server.timezone || 'UTC',
      exportedBy: data.exportedBy || null,
      exportedAt: data.exportedAt || null,
    },
  };
}

export { REQUIRED_KIND, SUPPORTED_SCHEMA_VERSIONS };
