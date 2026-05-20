# Quote Export UAT — Hardware acceptance test, MVP-1 + 1.5 + 2 + UI

Sprint scope: end-to-end operator validation of the xlsx export pipeline
that landed across PRs #47 (MVP-1), #48 (MVP-1.5), #49 (MVP-2), #50
(client UI). Goal: operator runs the full flow on prod, sends real
artifacts to one or two customers, captures feedback that becomes the
input for MVP-3 (re-import + apply).

This folder ships the **framework only** — checklists, risk register,
test-data picker guide, feedback form, schedule. The actual UAT runs
LIVE with the operator (Đặng Thế Thiệp) on prod hardware in a window
allocated by you. **Framework docs trong folder này không touch prod
state. UAT execution thì chạy trên prod — xem
[risk-register.md](risk-register.md) cho mitigations.**

## Files

| File                                         | Purpose                                                              |
| -------------------------------------------- | -------------------------------------------------------------------- |
| [uat-export-flow.md](uat-export-flow.md)     | 8 scenarios with Steps / Expected / Acceptance / Bug-report stub     |
| [risk-register.md](risk-register.md)         | 5 risks flagged at MVP-2 close, not covered by automated tests       |
| [test-quotes.md](test-quotes.md)             | How to pick 5 representative prod quotes safely + anonymisation rule |
| [feedback-template.md](feedback-template.md) | Per-scenario operator + customer feedback form                       |
| [timeline.md](timeline.md)                   | 2-day execution plan (4 sessions)                                    |

## Decision Authority

| Quyết định | Người quyết | Trigger escalation |
|---|---|---|
| Halt vs continue UAT khi bug | Đặng Thế Thiệp | P0 bug (data loss/security), hoặc 2+ P1 bug cùng phiên |
| Gửi file cho customer hay hold | Đặng Thế Thiệp | Bất kỳ bug nào liên quan SCN6-8 (file integrity) |
| Bug severity classification | Đặng Thế Thiệp | Borderline P1/P2 |
| Final triage (fix-before-send / fix-MVP-2.1 / defer / wontfix) | Đặng Thế Thiệp | Tất cả bugs sau UAT |

Backup nếu decision-maker unavailable: N/A — solo project. Defer non-urgent decisions 24h until available. P0 leak = halt UAT, không proceed mà không có decision.

## Pre-flight before UAT day

- [ ] Prod server up + reachable; current bundle SHA matches `cc7efbd` or later
  - **Verify:** ask [dev name] to run `git log -1 --oneline` on prod deploy + paste output
  - **Hoặc:** check footer của Quote History page có hiện build hash không
- [ ] `OPS_EXPORT_HMAC_KEY` set on prod (preflight passes — `npm run preflight`)
- [ ] Operator account has `read` access to `quote-history` tab (sufficient for export — `edit` not needed)
- [ ] Mac + Windows test machines lined up; one with LibreOffice; one iPad/iPhone for Numbers test
- [ ] Customer recipient agreed in advance (one customer, one Cpx-type quote, with NDA in place)
- [ ] 5 test quotes picked + IDs noted in `test-quotes.md`
  - **CRITICAL:** customer names, PO numbers, pricing PHẢI được anonymised theo rule trong test-quotes.md trước khi đính kèm vào bug report hoặc feedback form. Real customer data chỉ ở trên prod machine, không leak vào git/Slack/PR comments.

## Customer artifact gate

File chỉ được gửi customer khi:
- SCN1-5 tất cả PASS (functional + integrity)
- SCN6-8 không có P0/P1 bug (file behavior on customer side)
- Decision-maker (xem Decision Authority) approve "go" trong vòng 1h sau khi SCN8 xong
- **Default nếu không phản hồi trong 1h:** HOLD. Operator không tự gửi customer. Reschedule với decision-maker sáng hôm sau.
- **Cách notify decision-maker:** Slack DM + tag trong `#ops-control-uat` channel với prefix `🟢 GO REQUEST:` để dễ search sau này

Nếu gửi rồi mới phát hiện bug:
- **P0 (data wrong/leaked):** notify customer + recall trong 1h
  - **Procedure:**
    1. Phone call customer contact ngay (không email — quá chậm)
    2. Request customer delete file + confirm bằng email reply
    3. Nếu customer đã forward nội bộ: request forwarding list + delete confirmation từng người
    4. Send corrected file CHỈ KHI bug đã fix + re-verified (không "vá nhanh")
    5. Log incident vào CLAUDE.md sprint history dưới `S-EXPORT-UAT-INCIDENT`
  - **Escalation:** P0 leak = legal/compliance review trước khi gửi corrected file. Tag <decision-maker> trong incident log.
- **P1 (UX confusion):** note in MVP-3 input, không recall
- **P2 (cosmetic):** log only

## After UAT day

- [ ] Feedback template entries filled per scenario
- [ ] Bug list triaged into: fix-before-customer-send / fix-MVP-2.1 / defer-MVP-3 / wontfix
- [ ] One short summary note appended to CLAUDE.md sprint history under "S-EXPORT-UAT"
  - **Format (1-2 dòng):** `S-EXPORT-UAT [date]: {X/8 SCN PASS}, {N} bugs ({a} P0, {b} P1, {c} P2), customer feedback: {1 line summary}, ship decision: {YES/NO/CONDITIONAL}`

## Out of scope

- Customer satisfaction survey beyond the single "is this enough to quote?" question — too early; full survey lands with MVP-3 deliverable
- Performance benchmarking (export latency under load) — needs separate stress harness; not UAT
- Re-import / apply flow (MVP-3) — by definition not yet built
