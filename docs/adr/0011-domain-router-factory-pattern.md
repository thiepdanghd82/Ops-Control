# ADR-0011 — Domain router factory pattern

**Status:** Accepted (v1.3 L4, 2026-04-29)
**Deciders:** v1.3 Senior Architect persona
**Builds on:** ADR-0008 (extract-first), ADR-0009 (dual-mount), CONTRIBUTING.md §2
**Supersedes:** none

---

## Context

Across G1, H1, J1, K2 we extracted 7 routers from `costApi.js` into
`server/domains/<sap>/routes/`. Without a written-down convention,
every extraction reinvents:

- Where deps come from (closure over module-level globals?
  parameter? side-effect import?).
- How auth is wired (inline `getSessionUser` calls? imported
  middleware? injectable?).
- How the router is exported (default? named? class? function
  returning a router?).

Reinvention is fine for the first one; by the third it's a smell.
This ADR codifies the pattern so the 8th, 9th, 10th extractions
follow the same shape with zero negotiation.

## Decision

**Every domain router follows the FACTORY + INJECTED DEPS pattern:**

### 1. File layout

```
server/domains/<sap>/routes/<resource>.js          ← factory
server/domains/<sap>/routes/<resource>.test.js     ← contract tests
```

`<sap>` is one of: `costing | library | sales | planning | quality |
security | basis | mes` (matches the 8 SAP-aligned domains in
README.md).

### 2. File shape

```js
// @ts-check
/**
 * <Resource> router — <one-line purpose>.
 *
 * v1.3 <phase>. <Nth> domain extraction. Owns:
 *   <METHOD> /api/<sap>/<resource>[/<sub>]   — <description>
 *
 * Legacy URLs (per ADR-0009 dual-mount):
 *   <METHOD> /api/<legacy-path>                — kept in costApi.js
 *
 * <Optional notes about quirks, divergence from sibling routers, etc.>
 */

import express from 'express';
import path from 'node:path';   // optional
import fs from 'node:fs';        // optional

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.auth
 * @param {(reqUser: any) => boolean} [deps.isAdminPlus]
 * @param {(reqUser: any) => boolean} [deps.canWrite]
 * @param {() => string} [deps.getLibDir]
 * @param {(name: string) => string} [deps.safeFn]
 * @param {(p: string, def?: any) => any} [deps.readJson]
 * @param {(p: string, data: any) => void} [deps.writeJson]
 * @param {import('express').RequestHandler} [deps.<resourceSpecific>]
 */
export function create<Resource>Router(deps) {
  const router = express.Router();

  router.<verb>('/<path>', deps.auth, /* other middleware */, (req, res) => {
    // Role check — explicit, not in middleware (see ADR-0011 §4.3)
    if (deps.isAdminPlus && !deps.isAdminPlus(req.user)) {
      return res.status(403).json({ error: 'Forbidden — admin only' });
    }
    // ... handler ...
  });

  return router;
}

export default create<Resource>Router;
```

### 3. Mounting in `server/index.js`

```js
import { create<Resource>Router } from './domains/<sap>/routes/<resource>.js';

// One shared deps object reused by both URL aliases — keeps the
// closure identical so /api/* and /api/v1/* are byte-identical.
const <resource>Deps = {
  auth: <auth-middleware>,
  isAdminPlus: ...,
  // ... etc.
};
app.use('/api/<sap>/<resource>',    create<Resource>Router(<resource>Deps));
app.use('/api/v1/<sap>/<resource>', create<Resource>Router(<resource>Deps));
```

### 4. Architectural rules

#### 4.1 Factory function, not class

JS classes carry `this`-binding gotchas in Express (`router.get(path,
this.handler)` doesn't preserve `this`); functions don't. Plus
classes encourage state on the instance, which for a stateless
HTTP router is just a footgun.

#### 4.2 Single dep object — no positional args

`createRouter({ auth, getLibDir, ... })` is searchable, has named
JSDoc types, and survives reordering. Positional args
(`createRouter(auth, getLibDir, ...)`) break silently when callers
reorder.

#### 4.3 Role checks INSIDE the handler, not in middleware

Yes, you could write `router.post('/x', deps.auth, deps.requireAdmin,
handler)`. We don't. Reasons:

- The role rule is part of the route's PUBLIC contract — readers
  shouldn't have to follow a middleware import to learn that
  `/x` is admin-only.
- Middleware-based gates obscure WHICH branch the role check is
  on. Inline `if (!deps.isAdminPlus(req.user)) return 403` is
  immediately readable.
- Tests can drive the negative path through `req.headers
  ['x-test-role']` (stub auth pattern) without mocking middleware.

#### 4.4 NO module-level state

A factory must produce a fresh `Router()` on every call. This
matters for tests that boot multiple Express apps in parallel —
shared state between two apps would race.

#### 4.5 Inject EVERY external dependency

Including:

- `auth` middleware
- Role helpers (`isAdminPlus`, `canWrite`)
- File-system primitives (`getLibDir`, `safeFn`, `readJson`,
  `writeJson`, `atomicWriteFileSync`)
- Domain-specific helpers (`siteToCsvKey`, `rateRows`,
  `ddlToCsvRows`)
- Validation middleware factories (`validateBody({...})`)
- Rate limiters (optional with no-op fallback inside the factory)

Even pure functions get injected. The discipline pays off in
testing — every test file mocks via tmpdir + identity functions
without needing a real `authService.init()`.

#### 4.6 Two-level URL nesting maximum

`/api/<sap>/<resource>` (e.g. `/api/library/rate`) and
`/api/<sap>/<resource>/<sub>` (e.g. `/api/sales/quotations/:name`).
Three levels (`/api/sales/quotation/v2/release/:id/notify`) is a
sign that the router is doing too much — split into siblings.

### 5. Test file shape

```js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { create<Resource>Router } from './<resource>.js';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-<resource>-test-'));
  // ... setup ...
});

function buildApp() {
  const stubAuth = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'unauth' });
    req.user = { user: { role }, role };
    next();
  };
  const router = create<Resource>Router({
    auth: stubAuth,
    isAdminPlus: (u) => ['admin', 'sys'].includes(u?.user?.role || u?.role),
    canWrite:    (u) => (u?.user?.role || u?.role) !== 'viewonly',
    getLibDir:   () => tmpDir,
    safeFn:      (s) => String(s).replace(/[^\w.-]/g, '_'),
    readJson:    (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
    writeJson:   (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2)),
    // ... resource-specific deps ...
  });
  const app = express();
  app.use(express.json());
  app.use('/api/<sap>/<resource>', router);
  return app;
}

async function request(app, opts) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${opts.path}`, opts);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally { server.close(); }
}

describe('<resource> router — factory contract', () => {
  test('GET / unauth → 401', async () => { /* ... */ });
  test('POST / wrong role → 403', async () => { /* ... */ });
  test('POST / happy path → side effect on disk', async () => { /* ... */ });
  // ... cover every status code the router emits ...
});
```

Each test should drive a different URL × role × payload combination
toward a specific status code. Coverage target: 90 %+ lines,
80 %+ branches per the COVERAGE_BASELINE.md gate.

## Consequences

### Positive

- **New routers ship fast.** Once the pattern is internalised, a
  4-route resource + tests is ~30 minutes from blank file to
  green test.
- **Code review is mechanical.** Reviewers compare against this
  ADR's templates; deviations stand out at a glance.
- **Refactoring helpers is safe.** When `safeFn` moves from
  `authService.js` to `platform/storage`, only the
  `server/index.js` mount call changes — no router file touches.
- **Cross-domain consistency.** `library/rate.js`, `library/ddl.js`,
  `sales/released-quotation.js`, `security/license.js` all read
  the same way. Operators who learn one understand them all.

### Negative

- **Boilerplate up front.** A 3-route resource needs a 50-line
  factory + a 100-line test file. Manual class-based controllers
  would be shorter — but they wouldn't unit-test cleanly.
- **Deps object grows large.** `library/rate.js` injects 14 deps.
  Mitigation: shared `libRouterDeps` object in `server/index.js`
  spread into each call (current K2 mount uses this).
- **No DI container.** Each factory call passes deps explicitly.
  Could be replaced by an `awilix`/`tsyringe` container; we don't
  because the explicit-injection scope (~20 routers max) doesn't
  warrant a framework dependency.

### Reversal cost

Trivial. The pattern is a documentation contract — nothing
enforces it at compile time. To deviate, write a non-conforming
router; nothing breaks at runtime. This ADR's value is in REVIEW
discipline, not enforcement.

## Alternatives considered

### Class-based controllers

Rejected. `class FooController { handler = (req, res) => {...} }`
is more boilerplate than the factory and re-introduces `this`-
binding bugs.

### Express Router as a default-exported singleton

Rejected. `const router = Router(); router.get(...); export default
router;` couples the router to the module-load order. You can't
mount the same module at two URL prefixes (`/api/foo` AND
`/api/v1/foo`) without sharing routing state — which we DO need
for versioned aliases.

### Decorator-based routes (`@Get('/foo')`)

Rejected. Requires a TS or Babel decorator transform; we're plain
JS. Also obscures the URL → handler mapping behind a metadata
abstraction.

### NestJS-style modules

Rejected. NestJS would replace Express entirely. Not worth a
framework migration just for routing organisation.

## Currently-conforming routers (as of 2026-04-29)

| Router | Routes | Tests | Coverage (lines) |
|---|---|---|---|
| `server/domains/security/routes/audit.js` | 1 | (covered via integration)| n/a |
| `server/domains/security/routes/license.js` | 1 | 5 | 100 % |
| `server/domains/basis/routes/backup.js` | 3 | – (deferred) | – |
| `server/domains/library/routes/rate.js` | 4 | 8 | 90.8 % |
| `server/domains/library/routes/ddl.js` | 4 | 6 | 95.6 % |
| `server/domains/sales/routes/released-quotation.js` | 3 | 9 | 96.0 % |

7 routers · 16 endpoints · 28 contract tests · mean coverage 96 %.

## References

- ADR-0008 — extract-first-mount-later (when to extract)
- ADR-0009 — dual-mount-during-migration (how to retire legacy)
- CONTRIBUTING.md §2 — domain router factory template (shorter)
- `server/domains/library/routes/rate.js` — canonical example
- `server/domains/sales/routes/released-quotation.js` — most recent
