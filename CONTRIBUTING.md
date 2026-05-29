# Contributing to Ops Control v1.3

> Internal CCL Vietnam project. Authoritative pattern guide for the next sprints.

## 1. Where to put new code

Use this decision tree to find the right home for a new file. The
v1.3 layout is being introduced incrementally — when in doubt, copy
the pattern of an already-migrated module.

```
┌── Is the change UI-only? ──────────────────► client/src/modules/cost/tabs/<existing-or-new-file>
│
├── Is it cross-cutting (auth/audit/storage)? ► server/services/<topic>.js + companion .test.js
│   ├── auth                                  ► server/services/authService.js (+ .test.js)
│   ├── audit                                 ► server/repositories/auditStore.js
│   ├── license                               ► server/services/licenseService.js (+ .test.js)
│   └── i18n keys                             ► client/src/i18n/domains/<domain>.js  (calls registerStrings)
│
└── Is it a new HTTP route? ─────────────────► server/domains/<sap-letter>/routes/<topic>.js
    │  Then mount in server/index.js BEFORE costApiRouter
    │  (so it wins the route match against the wildcard handler).
    │
    ├── If owner is security (audit, users, perms, license, totp)
    │   └── server/domains/security/routes/<topic>.js
    │
    ├── If owner is costing (calc, ink, print-area, design tools, master cyl)
    │   └── server/domains/costing/routes/<topic>.js
    │
    ├── If owner is library (material, rate, finance, ddl, mfg, routing)
    │   └── server/domains/library/routes/<topic>.js
    │
    ├── sales        (rfq, quote-history, analysis, formal)
    ├── planning     (orders, wip, capacity, bom)
    ├── quality      (samples)
    ├── basis        (settings, backup, sync, health, import)
    └── mes          (ifs-inventory, machine-tech, hardware, mode)
```

## 2. Template — new domain router

Copy `server/domains/security/routes/license.js` as the canonical
template. Highlights:

```js
import express from 'express';
import { authMiddleware as defaultAuth } from '../../../middleware/auth.js';

/**
 * @param {object} deps
 * @param {() => number} deps.someCounter   — inject so router stays decoupled
 * @param {RequestHandler} [deps.auth]       — INJECTABLE for tests (default = real session auth)
 */
export function createXxxRouter({ someCounter, auth = defaultAuth }) {
  const router = express.Router();

  router.get('/status', auth, (req, res) => {
    // req.user.user.role available; check role here, not in middleware,
    // so the route stays self-documenting.
    if (req.user.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    // ... handler ...
  });

  return router;
}

export default createXxxRouter;
```

Mount in `server/index.js`:

```js
import { createXxxRouter } from './domains/<sap>/routes/xxx.js';

app.use('/api/xxx', createXxxRouter({ someCounter: () => /* live count */ }));
app.use('/api/v1/xxx', createXxxRouter({ someCounter: () => /* live count */ }));
```

## 3. Template — new test file

Two flavours both supported:

**A. Pure unit (preferred for services / pure logic):**

```js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeFoo } from './foo.js';

describe('computeFoo', () => {
  test('handles empty input', () => {
    assert.equal(computeFoo([]), 0);
  });
});
```

Run: `node --test path/to/foo.test.js`

**B. Express integration (router + middleware):**
See `server/domains/security/routes/license.test.js` for the canonical
shape — ad-hoc Express app with a stub auth, then `fetch()` the route
on a random port.

## 4. Required checks before "done"

Each PR / sprint checkpoint passes:

```bash
# 1. syntax + types
npm run lint
node --check <touched-files>

# 2. tests
npm test                              # server (jest + node:test)
cd client && npm test                 # client (node:test)
node --test desktop/license.test.js   # desktop (CJS tests)

# 3. coverage delta — at minimum, don't drop. See package.json:jest.coverageThreshold.
npx jest --coverage --silent          # if jest path applies

# 4. vuln gate
npm audit --audit-level=high          # all 3 packages (root, client, desktop)

# 5. build still ships
cd client && npm run build
cd desktop && npx electron-builder --mac --arm64 --config.npmRebuild=false
```

CI (`.github/workflows/ci.yml`) runs all of the above on push.

## 5. Conventional commits

```
feat(security): add license-status endpoint
fix(costing): handle bleed=0 backwards-compat in print-area calc
refactor(server): extract audit router to security domain
chore: bump electron 33 → 38
docs(security): document key rotation runbook
test(license): add seat enforcement integration test
```

`commitlint` runs in CI; non-conformant commits get rejected.

## 6. Security review triggers

If your change touches ANY of:

- `server/services/authService.js` (login, password, TOTP)
- `server/services/licenseService.js` (tier enforcement)
- `server/middleware/auth.js` (`requireRole`, `authMiddleware`)
- `desktop/license.js`
- `desktop/main.js` (`webPreferences`, CSP, navigation)
- `scripts/license/*`

→ flag in PR description: **"Security review required"**. The
`security-auditor` agent will review against the checklist in
`docs/SECURITY.md §10`.

## 7. Architectural decisions (ADR)

When in doubt about WHERE a new piece of code goes, consult:

- `docs/ARCHITECTURE.md §9` — current ADR table (6 entries).
- For NEW architectural decisions: write `docs/adr/NNNN-<short-name>.md`
  (numbered, dated, lists alternatives + rationale + impact).

## 8. Migrating v1.2 endpoints to v1.3 domain folders

Tracked in `MIGRATION_GUIDE.md §9`. The pattern is:

1. Pick one cohesive group of endpoints from `server/routes/costApi.js`
   (e.g., all `/api/library/material/*`).
2. Create `server/domains/library/routes/material.js` exporting a
   `createMaterialRouter({ ...injected deps })` factory.
3. Move the handler bodies; replace inline closures-over-DATA_DIR with
   injected dependencies.
4. Mount in `server/index.js` BEFORE `costApiRouter`.
5. Remove the now-dead handlers from `costApi.js`.
6. Add an integration test for the new router.
7. Bump the migration table row in `MIGRATION_GUIDE.md`.

Aim for **one domain per sprint** until `costApi.js` is < 500 LOC.

## 9. License signing keys

- **Dev:** `scripts/license/dev-{private,public}.pem` — checked in,
  used by `npm test` and local development.
- **Production:** generated via `node scripts/license/generate-keypair.mjs prod-YYYY`,
  private key MOVED OFFLINE before any commit. Public key baked into
  installer via `OPS_LICENSE_PUBKEY` env at build time.
- **Rotation:** see footer of `scripts/license/generate-keypair.mjs`
  (5-step procedure with overlap window).

## 10. Quick reference

| Need                       | File                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| Add an HTTP endpoint       | `server/domains/<sap>/routes/*.js` (NOT `costApi.js`)                |
| Add password-related logic | `server/services/authService.js`                                     |
| Add license tier behaviour | `server/services/licenseService.js`                                  |
| Add CSP / nav lockdown     | `desktop/main.js` (createMainWindow block)                           |
| Add a new wizard step      | `desktop/setupWizard.js` (extend renderServerWizard)                 |
| Add an i18n key            | `client/src/i18n/domains/<domain>.js` (new) or `strings.js` (legacy) |
| Add a test                 | sibling `*.test.js` of the file under test                           |
| Document a decision        | `docs/adr/NNNN-<name>.md`                                            |
