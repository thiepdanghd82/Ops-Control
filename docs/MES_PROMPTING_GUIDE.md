# MES Extension — Prompting Guide

> Companion to `MES_EXTENSION_PLAN.md`. How to drive Claude Code through the MES extension
> sprints using the `.claude/` slash commands already configured in this repo.

---

## 1. Read these first, in order

Tell the agent to read in this exact order at the start of every session:

1. `README FIRST/README.md` — what this project is.
2. `README FIRST/ARCHITECTURE.md` — bounded contexts, dependency rules, platform layer.
3. `CLAUDE.md` (root) — project-specific context the agent must respect.
4. `.claude/rules/security.md` — non-negotiable auth/audit invariants.
5. `docs/MES_EXTENSION_PLAN.md` — the new MES brief.
6. The README of the domain you are about to touch: `server/domains/<name>/README.md`.

If the agent skips any of these, stop it and ask it to re-read.

---

## 2. The slash-command flow (already configured)

The `.claude/` directory ships `/spec`, `/plan`, `/build`, `/test`, `/review`, `/deploy`,
`/debug`, `/simplify`. Use them in that order **per sprint**:

```
/spec       — turn a one-line goal into a full PRD-style spec
/plan       — decompose the spec into PR-sized tasks
/build      — implement one task (TDD enforced)
/test       — verify with the project's test suite
/review     — five-axis review (correctness / security / perf / UX / readability)
/deploy     — produce the deploy/release artefact
```

For minor tweaks, skip directly to `/build`. For anything touching auth, audit, or money,
always run `/spec` and `/review` even if it feels heavy.

---

## 3. Sprint-launch prompt template

Use this once at the start of every sprint (e.g. MES-1, MES-2…). Replace `<MES-N>` and the
goal sentence:

```
Sprint <MES-N> kick-off.

Goal (one sentence): <e.g. Implement Work Order header + Operation tables, REST endpoints,
and the planner UI list/detail/release flow per MES_EXTENSION_PLAN.md §3.1>

Read in order:
1. README FIRST/README.md, ARCHITECTURE.md
2. docs/MES_EXTENSION_PLAN.md (focus on the section for this sprint)
3. The target domain README: server/domains/<name>/README.md
4. .claude/rules/security.md, .claude/rules/database.md,
   .claude/rules/api-conventions.md

Then run `/spec` with the goal sentence. Stop after `/spec` and show me the output —
I want to review the PRD before you `/plan`.

Constraints:
- Stay on the existing stack (ADR-0001): Express + better-sqlite3 + React 19 + Vite.
- New schema changes go through scripts/migrations/ — never hand-edit existing rows.
- Every state transition writes to audit_log.
- Every new server route registers via the domain's mountX(app) function — no global
  app.use in apps/server/index.js.
- i18n strings register per-domain via platform/i18n; no monolithic strings file.
- Follow .claude/rules/code-style.md verbatim.
```

After `/spec` is approved, gửi prompt tiếp:

```
PRD looks good. Run `/plan` to decompose into PR-sized tasks. For each task, list:
- Files touched (paths under domains/<name>/...)
- Acceptance criteria (mirror MES_EXTENSION_PLAN.md acceptance)
- Test approach (which file, which describe block)
Stop after planning. I will pick the first task to /build.
```

After plan approval, gửi:

```
Pick task #1 from the plan and run `/build`. Use TDD — write the failing test before the
production code. When tests are green, run `/test` to confirm the full suite still passes,
then `/review` for self-check before I read the diff.
```

---

## 4. Five ready-to-use prompts for the first sprints

### 4.1 MES-1 — Production Control core

```
We are starting Sprint MES-1 from docs/MES_EXTENSION_PLAN.md.

Goal: implement the work_order + work_order_op SQLite schema, the Express routes listed in
§3.1, and a planner UI list page + detail page + release action. Do NOT implement
shop-floor execution flows in this sprint — those are MES-2.

Read in order: §1, §3.1, §6.1 (state machine semantics) of MES_EXTENSION_PLAN.md, plus
.claude/rules/database.md and .claude/rules/api-conventions.md.

Run `/spec`, then stop and show me the PRD. I will review before you /plan.

Acceptance (paste into PRD):
- Planner role can create + release a WO with ≥1 operation in <30 sec via planner UI.
- State transitions are guarded by a pure function workOrderTransition(from, to) — invalid
  → 409 with RFC-7807 body.
- Every transition writes a row to audit_log.
- New tables added via scripts/migrations/2026-XX-mes-1.sql, idempotent.
- Tests under domains/planning/tests/unit/ for state machine; integration test under
  domains/planning/tests/integration/ creating + releasing a WO end-to-end.
```

### 4.2 MES-2 — Shop-floor kiosk + dispatch

```
Sprint MES-2: ship apps/kiosk/ MVP per MES_EXTENSION_PLAN.md §3.3.

Read MES_EXTENSION_PLAN.md §3.1, §3.3, §6.5 (reason codes seed). Read README FIRST/
ARCHITECTURE.md §5 for how apps/ shells boot.

`/spec` then stop. Acceptance for the PRD:
- Kiosk pairs to one machine_code via a one-time URL token.
- Operator can see dispatch list (operations DISPATCHED to this machine), tap Start, tap
  Pause (with reason_code picker filtered by work-centre type), tap Resume, tap Complete
  (with good/scrap counts).
- Every action is queued in IndexedDB; flushes to /api/planning/operations/:id/<verb>
  when online. UI shows a "X actions pending" indicator when offline.
- All buttons ≥80×80px, single-hand operable.
- i18n VN/EN parity from sprint exit.
- E2E test (Playwright) drives a happy path on a stubbed API.
```

### 4.3 MES-3 — OEE engine

```
Sprint MES-3: production_event ingest + oee_minute aggregation per MES_EXTENSION_PLAN.md §3.2.

Read §3.2 carefully. Read .claude/rules/database.md (note our scaling notes about partitioning
high-volume tables).

`/spec` then stop. Acceptance:
- POST /api/mes/events/bulk accepts a payload of up to 5000 events, machine token auth
  (not user JWT), idempotent on event ID.
- On ingest, OEE for the affected (machine, minute) buckets is recomputed within 60 seconds.
- GET /api/mes/oee/current returns the latest minute snapshot for a machine in p95 < 100ms
  on a seeded DB of 4M production_event rows.
- Plant summary endpoint p95 < 300ms on the same dataset.
- Pure-function unit tests cover availability/performance/quality formulas; an integration
  test seeds events and asserts oee_minute is consistent.
- Performance test under tests/perf/ ingests 60 events/sec for 1 hour; assert no growing
  backlog.
```

### 4.4 MES-4 — Edge gateway

```
Sprint MES-4: apps/edge-gateway/ per MES_EXTENSION_PLAN.md §3.2 (edge gateway paragraph).

Read §3.2 + ADR-0007 (to be written) — this is a separate Node app, not Electron. Read
.claude/rules/security.md for machine-token auth.

`/spec` then stop. Acceptance:
- Connects to ≥1 OPC UA endpoint (use node-opcua) and ≥1 MQTT broker (mqtt.js).
- Subscribes to a configured node set per machine; normalizes to production_event shape.
- Buffers to local SQLite (data/edge-buffer.sqlite) when central /api/mes/events/bulk is
  unreachable. Flushes oldest-first when reachable.
- Reconnects within 15 sec of OPC UA endpoint flap.
- Survives 8-hour central outage (test by docker-pause central server) with no event loss.
- Adds ≤2 sec end-to-end latency from machine pulse to central ingest in normal operation.
- Ships with a tools/machine-sim/ Node OPC UA server we can use in tests.
```

### 4.5 MES-9 — Costing technology rules refactor

```
Sprint MES-9: split costing engine into per-technology strategies per
MES_EXTENSION_PLAN.md §6.

Read §3.8, §6.1–6.3. Read existing domains/costing/server/domain/ to map current code
(Standard/Complex pricing, Print Area, Ink, Master Cylinder, Gallus engine).

`/spec` then stop. Acceptance:
- New strategy files: flexoRules.js, dieCutFlatbedRules.js, dieCutRotaryRules.js under
  domains/costing/server/domain/strategies/.
- Existing Standard/Complex pricing UI continues to produce IDENTICAL outputs to today
  for a fixed snapshot of 50 historical quotes (regression test).
- Internal engine emits cost lines tagged with rule_id (e.g. flexo.substrate, rotary.die_solid).
- Inline FLEXO + ROTARY collapse rule (§6.3) implemented + tested.
- 6 parameterized tests covering scenarios in §3.8 of the earlier IMPLEMENTATION.md
  (now archived) — UV vs water vs solvent ink, plate reuse, color sequence, etc.
- Effort budget: this is a refactor — do NOT add or remove input fields in the costing UI.
```

---

## 5. Course-correction prompts (specific to this stack)

### 5.1 If the agent suggests adding Postgres / Kafka / Redis

```
Stop. ADR-0001 explicitly rejects Postgres/Kafka/Redis. We stay on better-sqlite3 +
Express + JSON-on-disk. Re-architect using only the existing platform layer
(platform/cache, platform/sync, platform/storage, platform/audit). Show me the alternative.
```

### 5.2 If the agent edits client/src/modules/cost/tabs/ (v1.2 path)

```
That path is v1.2. We are on v1.3. The destination for this work is
domains/costing/client/... per ARCHITECTURE.md. Move the change there. Reference
docs/MES_EXTENSION_PLAN.md §9 if you need the deprecation map.
```

### 5.3 If the agent skips audit logging on a state transition

```
Every WO state transition must write an audit_log row. Re-read .claude/rules/security.md.
Add the audit write inside the same transaction as the state change, or revert the change
and use the platform/audit helper.
```

### 5.4 If the agent forgets i18n

```
i18n strings register per-domain via platform/i18n. You added hardcoded strings in
<file>. Move them to domains/<name>/shared/strings/ with VN parity, then import via
useI18n(). See platform/i18n/README.md.
```

### 5.5 If the agent puts cross-domain shared logic in one of the domains

```
ARCHITECTURE.md §2 — domains MUST NOT import from other domains. The function you put in
domains/<x>/... is also used by domains/<y>/.... Lift it to platform/<appropriate>/. If
no platform package fits, propose a new one + ADR before continuing.
```

---

## 6. Daily flow (one sprint, one developer + agent)

```
Mon AM
  - /spec the sprint goal → I review → tweak.
  - /plan → I review task list → tweak.
  - Pick task #1 → /build.
Mon PM → Wed
  - One task per half-day: /build → /test → /review → I read diff → merge.
  - End-of-day: agent updates CHANGELOG.md.
Thu
  - Cross-domain integration test pass.
  - Hardening / docs / runbook updates.
Fri
  - /deploy dry-run.
  - Sprint demo (record video).
  - Move outstanding items to backlog.
```

---

## 7. Things to put in `.claude/rules/` (extend, do not replace)

The MES extension benefits from two more rules in `.claude/rules/`:

1. **`mes-domain.md`** — encode the rules in §6 of MES_EXTENSION_PLAN.md (technology-specific
   costing formulas, OEE telemetry signal map, reason codes). Agents touching costing or
   mes domain must reference it.
2. **`telemetry-volume.md`** — performance budget for production_event + oee_minute. Agents
   tempted to add per-second granularity should be redirected to per-minute.

I'll draft both in Sprint MES-1 onboarding.

---

> Owner: Thiep Dang · Last updated 2026-04-30 · Update each sprint as we learn.
