# Antigravity Prompts — Sprint MES-1

> Bộ prompt copy-paste tuần tự để chạy Sprint MES-1 (Work Order foundation) qua Antigravity.
> Bạn paste từng prompt một vào ô chat của Antigravity, chờ agent xong + bạn review, rồi mới
> paste prompt tiếp theo. **Đừng skip checkpoint.**
>
> Antigravity Auto mode được khuyến nghị bật cho prompt #4 trở đi (sau khi PRD đã chốt).

---

## Cách dùng tài liệu này

| Prompt                                 | Mục đích                              | Auto mode | Thời gian agent | Bạn cần làm gì                  |
| -------------------------------------- | ------------------------------------- | --------- | --------------- | ------------------------------- |
| **#1 Preflight**                       | Verify môi trường, branch, build sạch | OFF       | 2–3 phút        | Đọc output, xác nhận            |
| **#2 Context load**                    | Agent đọc tất cả doc bắt buộc         | OFF       | 5–8 phút        | Đọc tóm tắt, chỉnh sửa nếu sai  |
| **#3 PRD (`/spec`)**                   | Sinh PRD cho Sprint MES-1             | OFF       | 10–15 phút      | Review từng acceptance criteria |
| **#4 Plan (`/plan`)**                  | Decompose thành 6 task PR-sized       | OFF       | 5–10 phút       | Approve thứ tự task             |
| **#5 Task 1: Schema migration**        | Tạo migration SQL + test              | ON        | 15–25 phút      | Review diff                     |
| **#6 Task 2: State machine + service** | Pure-fn transition + WO service       | ON        | 25–40 phút      | Review + chạy test              |
| **#7 Task 3: Routes + DTOs**           | Express routes + validation           | ON        | 25–40 phút      | Test curl + review              |
| **#8 Task 4: Planner UI**              | React list + detail + release         | ON        | 40–60 phút      | Test trên localhost:5173        |
| **#9 Sprint review**                   | Tổng kết + chuẩn bị MES-2             | OFF       | 5 phút          | Đọc summary                     |

---

## Prompt #1 — Preflight

**Bật Auto mode: OFF**

```
Preflight cho Sprint MES-1 — Brady MES extension trên Ops Control v1.3.

Chạy tuần tự các bash command sau và paste output:

1. pwd && git status
2. git branch --show-current
3. git log --oneline -10
4. node --version && npm --version
5. ls docs/MES_EXTENSION_PLAN.md docs/MES_PROMPTING_GUIDE.md README\ FIRST/ARCHITECTURE.md CLAUDE.md
6. npm test 2>&1 | tail -30
7. npm run build 2>&1 | tail -10

Sau đó trả lời:
- Branch hiện tại có phù hợp để start Sprint MES-1 không? Nếu không, đề xuất branch name.
- Có file nào trong list 5 không tồn tại không?
- Test suite có pass 100% không? Nếu không, list những test fail.

ĐỪNG sửa file gì cả. Chỉ verify môi trường.
```

**Checkpoint:** Nếu test fail hoặc thiếu file → fix trước khi đi tiếp. Nếu branch là `release/v1.3` thì cần tạo branch mới `feature/mes-1-work-order` trước khi sang prompt #2.

---

## Prompt #2 — Context load

**Bật Auto mode: OFF**

```
Bạn là senior backend engineer chịu trách nhiệm implement Sprint MES-1 của Brady MES
extension trên codebase Ops Control v1.3 (CCL Design Vietnam).

Đọc các file sau theo thứ tự (full content, không skip):

1. README FIRST/README.md
2. README FIRST/ARCHITECTURE.md
3. CLAUDE.md (root)
4. .claude/rules/security.md
5. .claude/rules/database.md
6. .claude/rules/api-conventions.md
7. .claude/rules/code-style.md
8. docs/MES_EXTENSION_PLAN.md (CHỦ ĐỘNG đọc kỹ §1, §2, §3.1, §6, §9)
9. docs/MES_PROMPTING_GUIDE.md
10. server/db/schema.sql
11. server/domains/planning/README.md (nếu có) hoặc tạo file để hiểu structure
12. server/domains/security/README.md (nếu có) — để biết audit_log convention
13. server/routes/planning.js (đọc lướt để biết style)

Sau đó trả lời cho tôi (≤300 từ tổng):

A. Sprint MES-1 yêu cầu gì cụ thể? (3 gạch đầu dòng từ §3.1 và §4)
B. Tables nào cần tạo mới? Cột bắt buộc?
C. Endpoints nào cần thêm? Path + verb + role yêu cầu?
D. State machine WO transitions hợp lệ là gì? (vẽ ASCII)
E. Audit log convention: khi nào ghi, ghi gì?
F. ADR-0001 cấm dùng gì?

ĐỪNG đề xuất, ĐỪNG code. Chỉ trả lời 6 câu A–F. Tôi sẽ verify rồi mới cho bạn /spec.
```

**Checkpoint:** Đọc 6 câu trả lời. Sai chỗ nào → correct ngay. Nếu agent nhầm `state_machine` của WO, MES-1 sẽ sai cả sprint → bắt nó re-read §3.1 + §6.1 của MES_EXTENSION_PLAN.md.

---

## Prompt #3 — Spec (PRD)

**Bật Auto mode: OFF**

```
Tóm tắt context của bạn ở prompt trước là chính xác. Bây giờ chạy `/spec` cho Sprint MES-1.

Goal (1 câu): Implement work_order + work_order_op SQLite schema, Express routes per
MES_EXTENSION_PLAN.md §3.1, và planner UI list/detail/release flow trong domains/planning,
KHÔNG bao gồm shop-floor execution (đó là MES-2).

PRD output phải có các section sau, viết bằng tiếng Anh:

1. Problem statement (≤100 words)
2. User personas affected: Production Planner, IT Admin
3. Functional requirements (numbered list, mỗi FR có 1 câu Acceptance)
4. Non-functional requirements:
   - p95 < 1.5s for list/detail endpoints
   - WO create + release < 30 seconds via UI
   - Audit log entry for EVERY status transition
   - i18n VN+EN parity at sprint exit
5. Out of scope (explicit list — kiosk, telemetry, OEE, mobile)
6. Schema changes: SQL DDL exact (copy từ MES_EXTENSION_PLAN.md §3.1)
7. API contract: 13 endpoints với request/response shape
8. State machine: transitions table + 1 ASCII diagram
9. Security: role check (production.planner, production.operator, production.manager)
10. Test plan:
    - Unit tests cho state machine (10+ cases)
    - Integration test: create + release WO end-to-end
    - Contract test cho mỗi endpoint
11. Migration: scripts/migrations/2026-XX-mes-1-work-order.sql
12. Rollout: feature flag `mes.workOrder.enabled` (default false trên prod, true trên staging)
13. Risks + mitigations

ĐỪNG code. Chỉ output PRD. Tôi sẽ review rồi gọi /plan.
```

**Checkpoint:** Đọc PRD rất kỹ. Đặc biệt:

- Section 7 (API contract): có đủ 13 endpoint không?
- Section 8 (state machine): có đủ 9 trạng thái + transition đúng không?
- Section 11 (migration): tên file đúng convention `scripts/migrations/...` chưa?

Nếu PRD ổn → prompt tiếp. Nếu thiếu → "Bổ sung mục X. Re-output toàn bộ PRD."

---

## Prompt #4 — Plan (decompose)

**Bật Auto mode: OFF**

```
PRD approved. Chạy `/plan` để decompose thành 6 task PR-sized. Output cho mỗi task:

- Task ID: MES-1.<n>
- Title (imperative, ≤8 words)
- Files touched (paths chính xác)
- Estimated effort (S/M/L)
- Dependencies (task nào phải xong trước)
- Acceptance criteria (≥3 checkboxes, đo được)
- Test files cần tạo
- /build prompt template tôi sẽ dùng

Đề xuất 6 task theo thứ tự build:

1. Schema migration + seed
2. State machine pure function + unit tests
3. Repository + service layer
4. Express routes + DTOs + validation
5. Planner UI: list + detail page
6. Planner UI: release action + audit integration

Không gộp task. Không split nhỏ hơn. Mỗi task 1 PR, ≤300 dòng diff.

Kết thúc bằng: "Ready to /build task 1?"
```

**Checkpoint:** Plan có thứ tự đúng không (schema → logic → routes → UI)? Có dependency rõ ràng? Nếu OK → prompt #5.

---

## Prompt #5 — Task 1: Schema migration

**Bật Auto mode: ON** (từ đây trở đi agent có thể tự chạy bash + edit)

```
/build task MES-1.1 (Schema migration + seed).

Yêu cầu:
1. Tạo file scripts/migrations/2026-04-30-mes-1-work-order.sql với DDL từ
   MES_EXTENSION_PLAN.md §3.1 (work_order + work_order_op).
2. Migration phải IDEMPOTENT (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
3. Cập nhật server/db/schema.sql để consolidate các table mới (giữ nguyên format hiện có).
4. Cập nhật server/db/init.js để run migration mới khi DB chưa có.
5. Tạo test scripts/migrations/2026-04-30-mes-1-work-order.test.js dùng node --test:
   - Spin up SQLite trong memory
   - Run migration
   - Assert 2 tables tồn tại
   - Insert sample row, query lại, verify
   - Run migration lần 2, không lỗi (idempotent)
6. Update CHANGELOG.md với section v1.4.0-mes-extension nếu chưa có.

Acceptance:
- [ ] npm test pass 100%
- [ ] node scripts/migrations/2026-04-30-mes-1-work-order.test.js pass
- [ ] Migration chạy 2 lần liên tiếp không lỗi
- [ ] schema.sql có comment trỏ về migration file

KHÔNG đụng:
- Bất kỳ file nào dưới client/
- Routes hoặc services
- Tables hiện có (chỉ ADD, không ALTER)

Khi xong, paste:
1. Output `npm test`
2. Output `node scripts/migrations/2026-04-30-mes-1-work-order.test.js`
3. Diff summary (git diff --stat)
4. Any TODO(decision): bạn để lại
```

**Checkpoint:** Verify diff. Đặc biệt schema.sql — agent không được xóa/sửa table cũ.

---

## Prompt #6 — Task 2: State machine + service layer

**Bật Auto mode: ON**

```
/build task MES-1.2 (State machine pure function + unit tests) và MES-1.3 (Repository
+ service layer) — làm gộp vì coupled chặt.

State machine theo MES_EXTENSION_PLAN.md §3.1:
CREATED → RELEASED → SCHEDULED → IN_PROGRESS → COMPLETED → QC_RELEASED → CLOSED
                                       ↓
                                   ON_HOLD ⇄ IN_PROGRESS
                                       ↓
                                   CANCELLED (terminal from any non-CLOSED)

Files cần tạo:

1. server/domains/planning/server/domain/workOrderTransition.js
   - export function canTransition(from, to) → boolean
   - export const VALID_TRANSITIONS (frozen object)
   - export class InvalidTransitionError extends Error (có code 'BMES-PLAN-001')
   - 100% pure: no DB, no I/O

2. server/domains/planning/tests/unit/workOrderTransition.test.js
   - node --test
   - ≥15 test cases: tất cả valid transition + 5 invalid transition + edge cases
   - Coverage: assert ≥95%

3. server/domains/planning/server/repositories/workOrderRepo.js
   - Sử dụng better-sqlite3 prepared statements
   - Methods: insert(wo), findById(id), findByStatus(status, paging), update(id, patch),
     softDelete(id, reason)
   - Tất cả method PURE — chỉ DB I/O, không business logic

4. server/domains/planning/server/services/workOrderService.js
   - Sử dụng workOrderRepo + workOrderTransition + platform/audit
   - Methods:
     * createWorkOrder(cmd, actor) → WO  (status=CREATED)
     * releaseWorkOrder(id, actor) → WO  (CREATED → RELEASED)
     * cancelWorkOrder(id, reason, actor)
     * addOperation(woId, opCmd, actor)
   - Mỗi state transition gọi audit() với event 'WO_<TRANSITION>'
   - Throw InvalidTransitionError với HTTP 409 mapping ở route layer

5. server/domains/planning/tests/integration/workOrderService.test.js
   - Spin up in-memory SQLite + chạy migration
   - Test happy path: create → release → cancel
   - Test invalid transition: CREATED → IN_PROGRESS phải throw
   - Test audit_log có row sau mỗi transition

Acceptance:
- [ ] 15+ unit tests pass cho transition
- [ ] 5+ integration tests pass cho service
- [ ] Coverage ≥85% cho package planning/server/
- [ ] Audit log có entry cho mọi state change (verify bằng query)
- [ ] Không có dependency mới ngoài better-sqlite3 (đã có)

Constraints:
- Không import từ domain khác (chỉ platform/* + own shared/)
- Không sửa schema.sql ở task này
- Mọi error trả về RFC 7807 từ route layer (sẽ làm task sau, ở task này throw error chuẩn)

Khi xong, paste:
1. Output toàn bộ test
2. Code coverage summary
3. List 3 quyết định bạn đã đưa ra (TODO(decision):)
```

**Checkpoint:** Đặc biệt verify audit*log có ghi đủ. Query thử: `SELECT \* FROM audit_log WHERE event LIKE 'WO*%' LIMIT 10`.

---

## Prompt #7 — Task 4: Express routes + DTOs

**Bật Auto mode: ON**

```
/build task MES-1.4 (Express routes + DTOs + validation).

Triển khai 13 endpoints từ MES_EXTENSION_PLAN.md §3.1 trong:
server/domains/planning/server/routes/workOrder.js

Files cần tạo/sửa:

1. server/domains/planning/server/routes/workOrder.js
   - Express Router
   - Mỗi route gọi workOrderService
   - Route guards: middleware checkRole(...) từ platform/auth
   - Validate body với platform/http/validate (zod schema or hand-rolled)
   - Idempotency-Key header support cho POST endpoints (deduplicate trong 24h)
   - Error mapping: InvalidTransitionError → 409, NotFound → 404, validation → 400
   - Tất cả response theo RFC 7807 ProblemDetail khi error

2. server/domains/planning/shared/schema/workOrderSchema.js
   - Zod schemas (or JSON Schema fallback) cho mọi DTO

3. server/domains/planning/server/index.js (mount function)
   - export function mountPlanning(app) {...}
   - app.use('/api/planning', router)

4. apps/server/index.js (hoặc server/index.js)
   - Add mountPlanning(app) call
   - VERIFY không break route hiện có

5. server/domains/planning/tests/integration/workOrderRoutes.test.js
   - Supertest hoặc fetch native
   - 13 happy path tests + 5 error tests (401, 403, 400, 404, 409)
   - Mock JWT cho production.planner role
   - Idempotency test: post 2 lần với cùng key, chỉ create 1 row

Acceptance:
- [ ] 18+ route tests pass
- [ ] curl vào localhost:3000/api/planning/work-orders với JWT → 200
- [ ] curl không token → 401 với RFC 7807 body
- [ ] Idempotency-Key dedup verified
- [ ] npm run build (client) vẫn pass
- [ ] Existing routes không vỡ — chạy server full test suite

KHÔNG đụng client/ ở task này.

Khi xong, paste:
1. Output `npm test`
2. Output curl test cho POST + GET + invalid transition (expect 409)
3. Diff summary
```

**Checkpoint:** Test curl thật trên `localhost:3000` với JWT của user `henry` để verify auth + role chạy đúng.

---

## Prompt #8 — Task 5+6: Planner UI

**Bật Auto mode: ON**

```
/build task MES-1.5 (Planner UI list + detail) và MES-1.6 (Release action + audit) — gộp.

Files cần tạo trong client/src/ (theo v1.3 layout):

1. server/domains/planning/client/pages/WorkOrderList.jsx
   - Bảng list với columns: code, customer, ccl_pn, qty_planned, due_date, status (badge)
   - Filter: status dropdown, date range, customer search
   - Pagination: 50/page
   - Click row → navigate detail
   - Use platform/cache useSWR pattern
   - Use platform/ui-kit Table, Badge, Skeleton

2. server/domains/planning/client/pages/WorkOrderDetail.jsx
   - Header: code, status badge, customer
   - Operations table (work_order_op rows)
   - Actions: Release (chỉ visible khi status=CREATED), Cancel
   - Audit timeline (read-only, từ audit_log filter event LIKE 'WO_%')

3. server/domains/planning/client/components/ReleaseWorkOrderModal.jsx
   - Confirm modal với checklist: "Materials reserved? Plates ready?"
   - On confirm → POST /api/planning/work-orders/:id/release
   - Show toast on success/error
   - Use platform/ui-kit Modal

4. server/domains/planning/client/hooks/useWorkOrders.js
   - useSWR wrapper cho list + detail
   - useWorkOrderActions() trả về release, cancel, addOperation

5. server/domains/planning/shared/strings/en.js + vn.js
   - i18n keys cho mọi label/button/error
   - Đảm bảo VN parity (không key nào missing)

6. server/domains/planning/client/index.js
   - Register sidebar item: "Work Orders" với icon
   - Register routes
   - Register i18n

7. apps/client/src/App.jsx
   - Mount domains/planning/client routes nếu chưa có

8. server/domains/planning/tests/integration/workOrderUi.test.jsx
   - Vitest + React Testing Library
   - Test list render, filter, pagination
   - Test release flow (mock API)
   - Test i18n switch EN/VN

Acceptance:
- [ ] Vitest pass
- [ ] Manual test trên localhost:5173: tạo WO qua API, thấy nó trong list, click detail, release
- [ ] EN/VN switch hoạt động trên list page
- [ ] No console error/warning
- [ ] Bundle size delta ≤ 30KB gzipped (kiểm bằng npm run perf-budget)
- [ ] Lighthouse accessibility ≥90 cho list page

Constraints:
- Không thêm UI library mới (dùng platform/ui-kit + plain CSS modules)
- Mỗi component file ≤300 LOC; vượt thì split
- Strict mode error-free

Khi xong, paste:
1. Output `npm test:client`
2. Output `npm run perf-budget`
3. Screenshot/text-mode mô tả 3 màn hình chính (mình không xem được hình, mô tả bằng text)
4. Localhost:5173 URL test instructions
```

**Checkpoint:** Mở localhost:5173, login làm `henry`, tạo 1 WO qua Postman/curl, refresh list, click detail, release. Verify audit_log có 2 row (CREATE + RELEASE).

---

## Prompt #9 — Sprint review + handoff

**Bật Auto mode: OFF**

```
Sprint MES-1 retrospective. Trả lời 7 câu sau:

1. List file đã tạo (paths) và LOC delta tổng.
2. Test coverage cuối sprint cho domain planning.
3. Đã có TODO(decision): nào chưa resolve? List đầy đủ.
4. Có gì lệch khỏi PRD ban đầu không? Nếu có, lý do.
5. Performance budget: bundle delta, p95 latency của các endpoint mới (đo bằng curl × 100).
6. 3 risks lớn nhất khi đưa vào prod (feature flag mes.workOrder.enabled).
7. Top 3 việc nên làm trước MES-2 (Shop-floor kiosk).

Sau đó tạo CHANGELOG entry cho v1.4.0-mes-extension section, list các thay đổi của sprint
này theo format Conventional Commit.

Cuối cùng generate prompt #1 cho Sprint MES-2 (theo cùng template tài liệu này), paste cho
tôi để tôi dùng cho session sau.
```

---

## 10. Tips chạy qua Antigravity

**Auto mode hoạt động tốt khi:**

- Task có acceptance đo được rõ ràng (test pass / tests fail).
- Có thể chạy bash để self-verify (npm test, curl).
- Diff dự kiến ≤500 dòng.

**Auto mode cần TẮT khi:**

- Spec/PRD/plan — bạn cần review từng line.
- Migration schema — đụng tới DB sản xuất, sai sót khó undo.
- Quyết định kiến trúc (chọn library, đặt boundary domain).

**Khi Antigravity chạy quá lâu (>30 phút 1 task):**

- Stop và split task nhỏ hơn.
- Hỏi nó "Show me your current diff before continuing" — đôi khi nó loop sửa cùng 1 file.

**Token usage:**

- Sau mỗi 4–5 prompt nên start session mới (Antigravity tab mới).
- Trước khi đóng session, paste prompt: "Tóm tắt các quyết định đã ra hôm nay vào CHANGELOG.md để session mới có thể đọc."

**Checkpoint trước mỗi prompt build:**

```
git status
git diff --stat
npm test 2>&1 | tail -5
```

3 dòng này nên xanh trước khi bắt đầu task tiếp theo.

---

## 11. Khi nào cần can thiệp thủ công

| Tình huống                            | Hành động                                    |
| ------------------------------------- | -------------------------------------------- |
| Antigravity sửa file ngoài scope task | Reject diff, paste lại constraint của prompt |
| Test fail liên tục >3 lần             | Tạm dừng, đọc test xem có flaky không        |
| Agent thêm dependency mới             | Reject + nhắc ADR-0001 stack                 |
| Auto mode chạy >45 phút               | Stop, hỏi current diff, split task           |
| Build vỡ trên client                  | git checkout client/ + replan task           |

---

> Owner: Thiep · Last updated 2026-04-30 · Cập nhật sau mỗi sprint với learnings.
