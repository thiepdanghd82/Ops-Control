---
trigger: always_on
description: Core agent working principles + working modes for Ops Control.
---

# Agent working principles (read first)

> Behavioral guardrails for any agent (Claude Code / Antigravity) working in this repo.
> Distilled from Andrej Karpathy's notes on LLM coding pitfalls + battle-tested community
> practice, adapted to this project's existing conventions. These govern _how_ you work;
> the sprint history, lessons, checklists, and recovery playbooks in `CLAUDE.md` govern
> _what_ the system is and the exact steps to follow.

## Precedence

If anything here conflicts with `AUTO_EXECUTE.md`, another instruction file, or the
specific task you were given, **surface the conflict and ask** — do not silently pick a
side. In particular: the checkpoint-pause rule in principle 4 overrides any blanket
"run everything unattended" directive **unless** Henry has explicitly invoked
`AUTO_EXECUTE.md` for an approved upgrade in this session (see that file's dormant/opt-in
header).

---

## A. The four core principles

### 1. Think before coding

- State assumptions explicitly. If something is uncertain, ask rather than guess.
- When a request has more than one reasonable interpretation, present them — don't
  silently choose one and run with it.
- Push back when a simpler path exists, or when the request looks inconsistent with the
  codebase.
- When confused, name exactly what's unclear and stop. (Same spirit as Lesson 1 —
  "always ask which URL/surface first" before claiming a change is live.)

### 2. Simplicity first

- Write the minimum code that solves the stated problem. No features beyond what was
  asked, no abstractions for single-use code, no "flexibility" nobody requested.
- If 200 lines could be 50, rewrite it. Test: would a senior engineer call this
  overcomplicated?
- This does **not** loosen the rigor this repo already requires. Tests, defense-in-depth
  auth checks (`requireTabAccess`), schema validation on `Library/*` (Lesson 8), and the
  mandatory post-change checklist are **not** speculative — they stay. Simplicity is
  about the _shape of the solution_, never about skipping verification.
- Do NOT adopt a heavyweight end-to-end framework that "owns" the whole process — it
  hides bugs in the process itself. Prefer small, composable modes (Part B).

### 3. Surgical changes

- Touch only what the task requires. Don't "improve" adjacent code, comments, or
  formatting. Match the existing style even if you'd personally do it differently.
- Remove only the orphans **your** change created (now-unused imports/vars/functions) —
  consistent with the orphan-module lint in `deadCode.lint.test.js` (Lesson 2). Do not
  delete pre-existing dead code unless asked; mention it instead.
- Every changed line should trace directly back to the task.

### 4. Goal-driven execution with checkpoints

- Turn imperative tasks into verifiable goals: "write a test that reproduces the bug,
  then make it pass" beats "fix the bug"; "ensure tests pass before and after" beats
  "refactor X".
- For multi-step work, state a short plan with a verify step per phase:

  ```
  1. [Step] -> verify: [check]
  2. [Step] -> verify: [check]
  3. [Step] -> verify: [check]
  ```

  and **pause at each checkpoint** for confirmation before moving on. Do not execute the
  whole plan in one unattended pass (unless running under an explicitly-invoked
  `AUTO_EXECUTE.md` session).

- Definition of Done for any code change includes the existing
  **"After every UI/client-code change — MANDATORY checklist"** in `CLAUDE.md` (tests
  green -> rebuild -> restart node if `server/**` was touched -> bundle self-check ->
  stale-chunk 404 guard) **and** a cited commit SHA per Lesson 0.

---

## B. Working modes (lightweight, on-demand)

Every non-trivial task follows one spine: **Research → Plan → Execute → Review → Ship.**
Pick the focused loop that fits. Keep modes small and composable.

- **ALIGN — before any non-trivial change.** Grill Henry first: ask pointed questions
  about scope, edge cases, and which modules are touched, until the decision tree is
  resolved. Don't start coding until aligned. (This is principle 1 made active.)
- **DIAGNOSE — for bugs / regressions.** reproduce → minimise → hypothesise →
  instrument → fix → **regression-test**. Write the regression test BEFORE the fix.
  This matches how bugs actually surface here (hardware test → specific RFQ repro →
  narrow root cause; see Lessons + the MES-3-FIX entries).
- **TDD — for features / fixes with testable behavior.** red → green → refactor, one
  vertical slice at a time. Consistent with the repo's "tests first" checklist step.
- **ZOOM-OUT — unfamiliar code.** Explain the section in the context of the whole
  system before editing it (e.g. how a calcEngine field flows to exporter + UI).
- **HANDOFF — end of a long session / context running low.** Write a compact handoff
  note: what's done, what's left, open questions, and the relevant commit SHAs, so the
  next session resumes cleanly.

## C. Keep a shared language: CONTEXT.md

This codebase is dense with domain jargon (`bd_mat_setup`/`bd_mat_run`, MOQ tiers,
Indigo subtypes, kiss-cut, anilox, alt-materials "mirror", print-vs-cut canonical
fields, …). Maintain a short `CONTEXT.md` glossary at repo root so the agent decodes
terms consistently and names new code with the same words. Update it whenever a new term
or a hard-won decision appears — same habit as the SHA-tied lessons in `CLAUDE.md`.

## When to skip the rigor

Trivial edits (a typo, an obvious one-liner) don't need the full plan-and-checkpoint
flow. Use judgment — the goal is fewer costly mistakes on real work, not ceremony on
simple tasks.
