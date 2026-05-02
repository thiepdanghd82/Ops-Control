# Antigravity Prompts — Sprint MES-2 (Shop-floor kiosk + dispatch)

> Companion to `MES_ANTIGRAVITY_PROMPTS.md` (Sprint MES-1). Generated at end of Sprint MES-1
> retrospective. Paste prompts sequentially into a fresh Antigravity session when ready to
> start Sprint MES-2.
>
> Branch from: `release/v1.3` (after merging `feature/mes-1-work-order`)
> New branch: `feature/mes-2-kiosk-dispatch`
>
> Auto mode: OFF for prompts #1–#4 (preflight, context, /spec, /plan).
> Auto mode: ON for prompts #5+ (build tasks).

---

## Prompt #1 — Sprint MES-2 kick-off (Context load + 6-question verification)

**Auto mode: OFF**

```
Sprint MES-2 kick-off — Shop-floor kiosk + dispatch.

Read in order (full content, do NOT skip):
1. README FIRST/README.md
2. README FIRST/ARCHITECTURE.md (focus §5 — apps/ shells boot)
3. CLAUDE.md (root)
4. docs/MES_EXTENSION_PLAN.md (read carefully §3.1, §3.3, §6.5)
5. docs/MES_PROMPTING_GUIDE.md §4.2 (MES-2 prompt template)
6. server/domains/planning/README.md (current state)
7. domains/planning/server/index.js (mountPlanning factory pattern)
8. domains/planning/server/routes/workOrderV2.js (RFC-7807 envelope pattern to mirror)
9. domains/planning/server/domain/workOrderTransition.js (extend for op-status state machine)
10. domains/planning/shared/constants/workOrderStates.js (WO_OP_STATUSES already exported)
11. domains/planning/server/services/workOrderService.js (atomic-with-audit pattern)
12. server/db/schema.sql (where to append the schema additions, idempotent style)

Then answer 6 questions (≤350 words total):

A. What does Sprint MES-2 require? (3 bullets from MES_EXTENSION_PLAN.md §3.3 +
   PRD §10.2 acceptance in the prompting guide §4.2)

B. Schema additions needed — extend work_order_op (status transitions PENDING →
   DISPATCHED → SETUP → RUNNING → PAUSED → DONE → ACCEPTED) + reason_code seed
   table. Required columns?

C. New endpoints (per Plan §3.1, the 6 deferred endpoints):
   POST /operations/:id/start, /pause, /resume, /complete, /scan
   GET /dispatch-list?machineId=
   Path + verb + auth model (machine-token vs user JWT) + idempotency key.

D. Op-status state machine — draw ASCII transitions (PENDING → DISPATCHED → SETUP →
   RUNNING ⇄ PAUSED → DONE → ACCEPTED, plus invalid edges).

E. apps/kiosk/ deployment: separate Vite project? same client/?
   PWA manifest? IndexedDB queue when offline? machine-token via one-time URL?

F. Reusable artifacts from MES-1 (MUST reuse, NOT recreate):
   - workOrderTransition (extend for op-status, OR new opStatusTransition)
   - useMesWorkOrderFlag pattern (likely need useMesKioskFlag)
   - api.js fetcher pattern + RFC-7807 parser
   - mountPlanning factory + /v2/config endpoint pattern
   - BmesError class
   - Modal primitive (NOT applicable for kiosk — touch-first PWA)

DO NOT propose, DO NOT code. Only answer 6 questions A–F. I will verify before /spec.

Constraints (carry from MES-1):
- Stay on existing stack (ADR-0001): Express + better-sqlite3 + React 19 + Vite.
- No Postgres / Redis / Kafka / Keycloak / Camunda.
- Schema changes go through scripts/migrations/ + schema.sql append (idempotent).
- Every state transition writes to audit_log within db.transaction (atomicity NFR).
- New routes register via mountPlanning(app) — no app.use directly in apps/server.
- i18n strings register per-domain via client/src/i18n/domains/planning.js +
  EN+VN parity (CI lint enforced).
- All errors RFC-7807 application/problem+json.
- Reuse Shared/Modal.jsx for any planner-side modals; touch-first kiosk needs
  bespoke UX (NOT a port of the planner modal pattern).
- Tests: contract per endpoint + state-machine unit + at least 1 atomicity
  integration test + 1 timed e2e (Playwright if installed by then,
  Node-based otherwise).

Pre-spec decision points (FLAG these in your A-F answers):

1. Machine-token auth: kiosk pairs to one machine_code via what?
   (a) one-time URL token issued by planner; kiosk persists in localStorage
   (b) static per-machine API key in env at kiosk install
   (c) device-bound TLS cert
   Recommend (a) — operator-friendly, revocable.

2. Offline strategy: kiosk loses network, operator still scans/clicks.
   (a) IndexedDB queue → flush oldest-first when online (24h cap)
   (b) refuse mutations when offline (read-only fallback)
   (c) optimistic update + rollback toast on flush failure
   Recommend (a) per Plan §3.3 — matches edge-gateway buffer pattern in MES-4.

3. Op-status state machine: extend workOrderTransition with a parallel
   opStatusTransition function, OR generic stateMachineTransition factory?
   The two state machines have different state sets — sharing the engine
   adds complexity. Recommend separate function + same return-shape contract
   so route-layer error handling reuses translateNoChange().

4. Kiosk UX divergence: Plan §3.3 says ≥80×80px buttons, single-hand
   operable, big numerals for counts, IBM Plex Sans Bold, dark-on-light
   theme by default. Different from the planner UI — need fresh CSS,
   maybe fresh component library (or just CSS overrides in a new
   apps/kiosk/styles/kiosk.css)? Recommend latter (no new component lib).

5. Test infra: MES-1 deferred Playwright. MES-2 kiosk inherently
   needs DOM-level testing for touch flows. Strong reason to install
   @playwright/test in this sprint. Effort: ~1 day setup + 2h per
   scenario. Decide before /spec.

After I confirm A-F, will trigger /spec with goal:
"Implement apps/kiosk/ MVP per MES_EXTENSION_PLAN.md §3.3 — touch-first
PWA paired to one machine_code, online dispatch list + offline IndexedDB
queue, 6 operation-status mutation endpoints, FR-acceptance: kiosk
operator can start + pause-with-reason + resume + complete an operation
in ≤4 button-presses per action."

Reference branch: feature/mes-1-work-order (7 commits, MES-1 complete).
This sprint depends on MES-1 schema + service layer; do NOT modify
MES-1 files except via additive extension (e.g., add op-status mutation
methods to workOrderService following the existing transition() helper
pattern).
```

---

## Prompt #2 — `/spec` (after A–F verified)

**Auto mode: OFF**

```
A–F answers verified. Now run /spec for Sprint MES-2.

Goal (one sentence): Implement apps/kiosk/ MVP per MES_EXTENSION_PLAN.md §3.3 —
touch-first PWA paired to one machine_code, online dispatch list + offline
IndexedDB queue, 6 operation-status mutation endpoints.

PRD output sections (write in English):

1. Problem statement (≤100 words)
2. User personas: Shop-floor Operator, Production Planner (assigns dispatch),
   IT Admin (machine pairing setup)
3. Functional requirements (numbered, each with 1 acceptance sentence)
4. Non-functional requirements:
   - p95 < 500ms for /dispatch-list endpoint
   - Operator action ≤ 4 button-presses per state mutation
   - All buttons ≥80×80px, single-hand operable
   - Survives 8-hour offline period without data loss (IndexedDB)
   - Audit log entry for every op-status transition
   - i18n VN+EN parity at sprint exit
5. Out of scope (explicit list):
   - OPC UA / MQTT machine telemetry (MES-4 edge gateway)
   - OEE computation (MES-3)
   - Lot/batch genealogy (MES-5)
   - Real Playwright if not installed
6. Schema additions: SQL DDL exact (work_order_op status transitions are
   already encoded in WO_OP_STATUSES from MES-1.2; add reason_code seed table)
7. API contract: 6 new endpoints with request/response shape (mount under
   /api/planning/v2/operations/:id/* + GET /api/planning/v2/dispatch-list)
8. Op-status state machine: transitions table + ASCII diagram
9. Security: machine-token auth (option (a) from prompt #1) — one-time URL
   token issued by planner, kiosk stores in localStorage. Token grants access
   to ONE machine_code's operations only.
10. Test plan:
    - Unit tests for opStatusTransition pure function
    - Integration test: dispatch → start → pause+reason → resume → complete
    - Contract test for each of 6 endpoints
    - Timed e2e (Playwright if installed) — ≤4 clicks per action
11. Migration: scripts/migrations/2026-XX-mes-2-reason-codes.sql
12. Rollout: feature flag mes.kiosk.enabled (default false, separate from
    mes.workOrder.enabled which gates MES-1)
13. Risks + mitigations (≥3 risks, each with mitigation)

DO NOT code. Output PRD only. I will review before /plan.
```

---

## Prompt #3 — `/plan` (after PRD approved)

**Auto mode: OFF**

```
PRD approved. Run /plan to decompose into PR-sized tasks. Output for each task:

- Task ID: MES-2.<n>
- Title (imperative, ≤8 words)
- Files touched (exact paths)
- Estimated effort (S/M/L)
- Dependencies (which task must complete first)
- Acceptance criteria (≥3 measurable checkboxes)
- Test files to create
- /build prompt template

Suggested 6-7 tasks in build order:

1. Schema: reason_code seed table + WO_OP_STATUSES validation
2. Op-status state machine pure function + unit tests
3. Service layer: dispatch + 5 op-status mutations + audit
4. Express routes: 6 endpoints + machine-token middleware + contract tests
5. apps/kiosk/ scaffolding (Vite + PWA manifest + offline detection)
6. Kiosk UI: pairing screen + dispatch list + 5 action buttons
7. Kiosk UI: offline IndexedDB queue + flush logic + pending indicator

No task merging. No further splitting. Each task = 1 PR, ≤300 LOC code-only diff
(structural overhead for transactional + audit similar to MES-1.3 = +40 LOC OK).

End with: "Ready to /build task MES-2.1?"
```

---

## Prompts #4+ (build tasks)

Follow the same flow as Sprint MES-1 prompts #5–#8: paste task /build prompts
sequentially, review diff after each, commit before next task. Reuse the
same MES_ANTIGRAVITY_PROMPTS.md sections #5/#6/#7/#8 structure with task IDs
swapped.

---

## Reusable from MES-1 — DO NOT recreate

**Server:**

- `domains/planning/server/domain/workOrderTransition.js` — pattern for opStatusTransition
- `domains/planning/server/services/workOrderService.js` — atomicity + audit emit pattern
- `domains/planning/server/repositories/workOrderRepo.js` — extend for op-status methods
- `domains/planning/server/index.js` — mountPlanning factory + /v2/config pattern
- `domains/planning/server/errors.js` — BmesError class
- `domains/planning/server/featureFlag.js` — flag reader (extend for `mes.kiosk.enabled`)
- `domains/planning/shared/schema/` — RFC-7807 inline validators
- `domains/planning/shared/constants/workOrderStates.js` — WO_OP_STATUSES already exported

**Client:**

- `client/src/modules/planning/v2/api.js` — extend with machine-token fetcher
- `client/src/modules/planning/v2/useMesWorkOrderFlag.js` — clone for `useMesKioskFlag`
- `client/src/modules/planning/v2/formHelpers.jsx` — Field + mapServerErrors

**Tests:**

- `domains/planning/tests/integration/contracts/_harness.js` — reuse for kiosk contract tests
- `domains/planning/tests/e2e/wo-create-flow.timed.test.js` — pattern for kiosk timed test

**Infra:**

- `server/data/Library/SystemConfig/feature-flags.json` — append `mes.kiosk.enabled`

---

## Pre-MES-2 work items (reference)

Before starting MES-2, complete:

1. Manual browser smoke for MES-1 (6 scenarios from CHANGELOG checklist) — ~2 hours
2. Install Playwright + port wo-create-flow.timed.test.js to real DOM spec — ~1 day
3. Staging deploy + 2 pilot planner walkthrough — ~3 hours

Items 1 + 3 are mandatory. Item 2 is highly recommended given kiosk's DOM-test needs.

---

> Owner: Thiep · Sprint MES-2 prompt generated: 2026-04-30 · Source: MES-1 sprint review
