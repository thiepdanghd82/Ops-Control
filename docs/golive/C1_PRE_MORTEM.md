# C-1 PRE-MORTEM — Workshop outcome scenarios

## 3 outcome scenarios + counter-actions · 3 kịch bản + hành động đối ứng

**Purpose · Mục đích**: Before C-1 workshop runs, Henry rehearses how to respond to each likely outcome. Saves decision time during the meeting and prevents on-the-fly scope-add disasters.

**Audience · Đối tượng**: Henry (self-brief, 5-10 min read before workshop)

---

## ✅ Scenario A — Stakeholder accepts Mac-only as proposed

### Stakeholder answer pattern · Pattern câu trả lời stakeholder

- Q1 = (a) Hai Duong-only pilot
- Q2 = A (off-site backup = Hybrid)
- Q3 = (b) business requirement OR (a) confirmed-but-Tier-1-only
- Q4 = (a) or (b) (no shift turnover surprise)
- Q5 = No stack change
- Q6 = ALL OUT
- Q7 = (a) Mac-only YES

### Probability assessment · Đánh giá xác suất

**~65%** — most likely outcome. Stakeholder briefing materials (SCOPE_LOCK, DEFERRAL_ROADMAP) make the Mac-only case clearly with quarter-dated promises for OUT items. Pilot-first is conservative and matches typical enterprise risk appetite.

### Henry's action · Hành động Henry

1. SIGN SCOPE_LOCK_v1.6.md immediately. Don't introduce new questions.
2. Update C1_DECISION_LOG.md within 4h with timestamp + signatures.
3. Update `project_golive` memory: C-1 ✅ DONE, freeze lifted, post-C-1 sequencing kicks in.
4. **Lift engineering freeze immediately** — sprint planning for post-C-1 work resumes that evening / next morning.
5. Send 1-line Zalo broadcast to Hương + sales team: "Scope locked Mac-only, on track for 2026-08-30 go-live."
6. Tee up next-priority work: per recommendation, **audit-chain wiring tickets (S-AUDIT-CHAIN-WIRE-AUTH/SQLITE/MIGRATE/CRON)** — scope-independent, gives Hypercare D+7-14 forensic depth.

### What to NOT do · Tránh

- Don't open a side-discussion on "what if we added X" — scope is LOCKED. New requests go to backlog.
- Don't start engineering work that depends on Q1=(b) or Q7=(b) — those are forbidden until next scope-lock cycle.

---

## 🟡 Scenario B — Stakeholder wants Windows in D-0

### Stakeholder answer pattern · Pattern câu trả lời stakeholder

- Q7 = (b) "must include Windows in v1.6"
- Other Q1-Q6 likely OK

### Probability assessment · Đánh giá xác suất

**~20%** — possible because Hai Duong office reportedly mixes Mac and Win workstations historically; not every operator's machine has been confirmed Mac-only. If sales team or back-office finance uses Win laptops, stakeholder may push for Day-1 parity.

### Henry's negotiation pre-script · Kịch bản đàm phán

**Henry**: "Adding S-WIN-PORT to v1.6 means roughly 2 additional sprints (~3 weeks). Two options:"

**Option B1 — Slip D-0 to 2026-09-15**

- Pros: Full Win support at go-live, fleet parity for sales
- Cons: Lose 16 days of buffer; D-7 training shifts to 2026-09-08
- Risk: Tighter testing window, post-go-live soak compressed
- Acceptance criterion: Stakeholder confirms slip is acceptable + reschedules training notification to operators

**Option B2 — Mac-pilot 2026-08-30 + Win hot-spare 2026-10-15**

- Pros: D-0 holds at 2026-08-30; Mac pilot derisks; Win added 6 weeks later as v1.6.1
- Cons: 2 deployments instead of 1; some operators in limbo for 6 weeks
- Risk: Operators on Win machines work in xlsx-only mode for 6 weeks, may resist later switch
- Acceptance criterion: Stakeholder agrees to phased rollout; operators on Win sign disclaimer

**Option B3 (counter-counter) — Defer go-live to 2026-09-30**

- Pros: Single go-live, all platforms ready, no phased deployment
- Cons: 1 month delay impacts business value
- Risk: Loss of training-window momentum
- Acceptance criterion: Stakeholder writes business justification for the delay

### Henry's action · Hành động Henry

1. PAUSE workshop sign-off. Do NOT sign SCOPE_LOCK_v1.6.md as-is.
2. Walk stakeholder through B1/B2/B3 options. Capture preference in DECISION_LOG.
3. If stakeholder picks B1: Update SCOPE_LOCK_v1.6.md to D-0=2026-09-15, re-circulate, sign within 3 days. Update `project_golive` memory.
4. If stakeholder picks B2: SIGN SCOPE_LOCK as-is + file `S-WIN-PORT-PHASE-1.6.1` for 2026-10-15. Document phased plan in `DEFERRAL_ROADMAP.md`.
5. If stakeholder picks B3: Major re-plan. File `S-V1.6-DELAY-2026-09-30`, redraw timeline, escalate to Henry's manager.
6. Notify Hương + sales: scope still in negotiation, training date pending.

---

## 🔴 Scenario C — Stakeholder insists Web/Hybrid/multi-site in D-0

### Stakeholder answer pattern · Pattern câu trả lời stakeholder

- Q1 = (b) global multi-site
- Q2 = B/C/D (cloud BI, web access, OR SaaS rewrite)
- Q7 = (c) Mac + web for managers (or worse, (b))
- Possibly Q6 SAP = IN

### Probability assessment · Đánh giá xác suất

**~10-15%** — would indicate stakeholder fundamentally hasn't internalized the v1.6 vs roadmap distinction in pre-read docs. Sometimes happens when stakeholder is C-level and saw the project pitch deck (which uses aspirational language) without reading SCOPE_LOCK detail.

### Capacity reality check · Kiểm tra năng lực thực tế

- **1 engineer × 10 weeks = 400 hours total**
- Mac SERVER + CLIENT hardening: ~200h committed (C-4 backup drill, C-5 UAT, Hypercare prep)
- Remaining: ~200h
- S-WIN-PORT alone: ~120h
- S-WEB-FIRST simplified: ~150-200h
- S-HYBRID-CLOUD (any flavor): ~300-500h
- SAP M-2 feasibility (NOT implementation): ~80h baseline
- **Total demand: 650-900h. Available: ~200h. Gap: 450-700h. NOT feasible.**

### Henry's counter-proposal pre-script · Kịch bản phản đề xuất

**Henry**: "What you're describing is roughly 16-22 weeks of engineering work for 1 engineer. We have 10 weeks remaining to D-0. Options:"

**Option C1 — Mac-only pilot 2026-08-30 + multi-platform v2 2027-Q1**

- Mac pilot stays in scope
- Web/Win/multi-site become formal **v2.0** project starting 2026-10 with: dedicated kick-off, full requirements gathering, hire/contract additional engineer(s) if budget permits, formal 6-month delivery to 2027-Q1
- Pros: Hai Duong gets value 2026-08-30; v2 done properly with capacity
- Cons: Stakeholder doesn't get "all platforms in v1.6"

**Option C2 — Dời go-live 2027-Q1, full multi-platform**

- v1.6 becomes v2.0; abandon 2026-08-30 target
- Add 2nd engineer (contract or hire) for capacity
- Pros: All-platforms together, clean release
- Cons: Hai Duong waits 6 more months; budget impact (engineer cost); risk of project losing momentum

**Option C3 — Stakeholder reduces scope ask**

- Walk through DEFERRAL_ROADMAP again. Show that OUT items aren't cancelled — Q4-2026 / 2027 timeline is binding commitment.
- If stakeholder agrees to "we'll get there, just not at D-0", revert to Scenario A.

### Henry's action · Hành động Henry

1. **DO NOT sign SCOPE_LOCK_v1.6.md.** Workshop output = ESCALATED, not signed.
2. Present C1/C2/C3 with capacity math (the 400h vs 650-900h calculation). Stakeholder MUST see numbers.
3. Capture stakeholder choice in DECISION_LOG with annotation "ESCALATION — pending Henry's manager + stakeholder leadership review".
4. Schedule 1-week follow-up with stakeholder + their manager + Henry's manager.
5. File `S-SCOPE-LOCK-ESCALATED-2026-06-26` blocking ticket.
6. Update `project_golive` memory: C-1 ESCALATED, freeze REMAINS, sprint planning halts until resolution.
7. Notify Hương + sales: scope under leadership review, training date may slip.
8. **Document the 400h vs 900h capacity math in the escalation memo** — leadership needs facts, not vibes.

### When to walk · Khi nào rời

If stakeholder cannot accept C1/C2/C3 after 2 escalation cycles (2-week elapsed), Henry escalates to "this project's scope is incompatible with timeline + capacity; recommend project re-charter or postponement." This is the nuclear option — only after exhausting good-faith negotiation.

---

## 📋 Summary table · Bảng tóm tắt

| Scenario                         | Probability | Workshop output               | Next-day action                         |
| -------------------------------- | ----------- | ----------------------------- | --------------------------------------- |
| A — Mac-only YES                 | 65%         | SIGNED                        | Lift freeze, ship audit-chain tickets   |
| B — Win in D-0                   | 20%         | PAUSED, re-sign within 3 days | Negotiate B1/B2/B3, update SCOPE_LOCK   |
| C — Web/Hybrid/Multi-site in D-0 | 15%         | ESCALATED                     | File blocking ticket, leadership review |

**Henry's mantra during workshop**: "I will leave today either with a signature, or with a written escalation. I will NOT leave with verbal promises or 'we'll figure it out later'."

> Mantra của Henry: "Hôm nay tôi sẽ rời buổi họp với chữ ký HOẶC bản leo thang bằng văn bản. KHÔNG rời với cam kết bằng miệng hay 'tính sau'."

---

## Cross-reference

- `docs/golive/C1_WORKSHOP_AGENDA.md` — Path A facilitation guide
- `docs/golive/C1_ASYNC_SIGNOFF.md` — Path B async fallback
- `docs/golive/C1_DECISION_LOG.md` — capture template
- `docs/golive/SCOPE_LOCK_v1.6.md` — document being signed
- `docs/golive/STAKEHOLDER_QUESTIONS.md` — 7 questions detail
- `docs/golive/DEFERRAL_ROADMAP.md` — OUT roadmap (the negotiation lever)
- [project_golive memory] — update post-workshop status
