# Branch Protection Policy — Ops Control

**Effective:** Upon Phase 0 cascade merge (Debug Playbook 2026-06-20)
**Owner:** Henry (repo admin)
**Backup:** Hương (post-onboarding D+30)

> Mục tiêu: chấm dứt **admin-merge culture** kéo dài từ Sprint S-D21 (2026-06-09) → 178+ PRs merge với CI đỏ chronic. Sau Phase 0 cascade, CI sẽ green và mọi PR mới phải tuân thủ check + review trước khi land trên `main`.

## Quy tắc (áp dụng tại GitHub Settings → Branches → main)

### A. Bắt buộc

| Setting                                                              | Value                                                                                                                                                       | Lý do                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Require a pull request before merging**                            | ✅ ON                                                                                                                                                       | Mọi commit lên `main` phải qua PR — không direct push                                                        |
| **Require approvals**                                                | **1**                                                                                                                                                       | Minimum 1 reviewer khác tác giả (sẽ là Hương sau onboarding; tạm Henry self-approve trong window 1-engineer) |
| **Dismiss stale pull request approvals when new commits are pushed** | ✅ ON                                                                                                                                                       | Sửa code sau review = phải re-review                                                                         |
| **Require review from Code Owners**                                  | ✅ ON                                                                                                                                                       | Đúng người duyệt đúng path (`.github/CODEOWNERS`)                                                            |
| **Require status checks to pass before merging**                     | ✅ ON                                                                                                                                                       | CI xanh hoặc không merge                                                                                     |
| **Required status checks**                                           | Vulnerability scan, Lint + format, Runtime deps declared, Commit messages, Router has sibling tests, Commit-msg hook smoke test, Server tests, Client tests | Bao gồm cả `Security allowlist hygiene` (mới)                                                                |
| **Require branches to be up to date before merging**                 | ✅ ON                                                                                                                                                       | Tránh "passed CI on old base, broke after merge"                                                             |
| **Require conversation resolution before merging**                   | ✅ ON                                                                                                                                                       | Review comment phải resolve trước merge                                                                      |
| **Require signed commits**                                           | ⚠️ OPTIONAL                                                                                                                                                 | Nice-to-have, defer Q4 2026 (yêu cầu setup GPG key cho mọi committer)                                        |

### B. Không cấm tuyệt đối (cần process bao quanh)

| Setting                | Value                   | Lý do                                                  |
| ---------------------- | ----------------------- | ------------------------------------------------------ |
| **Allow force pushes** | ❌ OFF                  | Force-push trên `main` = mất audit trail               |
| **Allow deletions**    | ❌ OFF                  | Xóa branch `main` = catastrophe                        |
| **Lock branch**        | ❌ OFF (read-only mode) | Cần merge được; lock chỉ dùng khi freeze trước go-live |

### C. Bypass policy (break-glass)

**Admin override được phép** nhưng phải:

1. **Justify ngay trong PR description**: tại sao cần override (hotfix P0, CI infra down, etc.)
2. **Post-mortem trong 24h** committed vào `docs/break-glass/<YYYY-MM-DD>-<short-desc>.md` với:
   - Tình huống (timeline, blocker)
   - Tại sao chọn override thay vì wait-for-CI
   - Hành động đã làm
   - Bài học rút ra (CI fix nếu CI down, process fix nếu process gap)
3. **Revoke admin tạm 1 tuần** nếu không có post-mortem (Hương enforces, hoặc Henry self-enforce nếu chưa onboarding)
4. **Telemetry**: tổng số override / tháng tracked trong sprint review — > 2/tháng = red flag, scope back process

## Cách apply

### Lần đầu (Henry, sau merge PR-D)

GitHub UI (KHUYẾN NGHỊ vì có preview UI):

1. Truy cập `https://github.com/thiepdanghd82/Ops-Control/settings/branches`
2. Click "Add rule" hoặc edit rule cho `main`
3. Apply table A + B above
4. Save changes
5. Test: tạo throwaway PR + verify (a) cần review, (b) cần CI xanh, (c) CODEOWNER được auto-request

CLI alternative (cần admin token):

```bash
gh api -X PUT "/repos/thiepdanghd82/Ops-Control/branches/main/protection" \
  -F required_status_checks.strict=true \
  -F required_status_checks.contexts[]='Vulnerability scan' \
  -F required_status_checks.contexts[]='Lint + format' \
  -F required_status_checks.contexts[]='Runtime deps declared' \
  -F required_status_checks.contexts[]='Commit messages' \
  -F required_status_checks.contexts[]='Router has sibling tests' \
  -F required_status_checks.contexts[]='Commit-msg hook smoke test' \
  -F required_status_checks.contexts[]='Server tests' \
  -F required_status_checks.contexts[]='Client tests' \
  -F enforce_admins=false \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F required_pull_request_reviews.dismiss_stale_reviews=true \
  -F required_pull_request_reviews.require_code_owner_reviews=true \
  -F restrictions=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -F required_conversation_resolution=true
```

Lưu ý: `enforce_admins=false` cho phép admin override per Section C above. Nếu muốn lock TUYỆT ĐỐI (không break-glass): `enforce_admins=true`.

### Cập nhật khi thêm status check

Mỗi khi `.github/workflows/ci.yml` thêm job mới (vd: Phase 1 die-cut golden tests), update danh sách required_status_checks.contexts[] tương ứng. Không tự động pick-up.

## Migration path (1-engineer → 2-engineer review)

**Hiện tại** (Henry solo):

- Required approvals = 1
- Henry self-approve được vì là PR author hay không? GitHub branch protection **cấm self-approve** nếu `required_approving_review_count > 0`. Workaround: trong window 1-engineer, Henry hoặc:
  - (A) Disable `Require review from Code Owners` tạm thời, hoặc
  - (B) Approve = 0 + chỉ enforce CI checks
- Khuyến nghị (A) — giữ checks active, defer review-required cho khi Hương sẵn sàng

**Post Hương onboarding D-7 + on-call rotation D+0** (2026-08-23 → 2026-08-30):

- Bật `Require review from Code Owners`
- Required approvals = 1 (Hương approves Henry's PRs; Henry approves Hương's)
- Self-approve disabled

**Post 6 tháng** (Q1 2027):

- Required approvals = 2 nếu team đạt 3+ engineers
- Audit log integrity hash chain (R3 trong B-2 retention strategy) protect break-glass abuse

## Cross-reference

- [Debug Playbook Phase 0.5](ci-triage.md)
- [CODEOWNERS](../../.github/CODEOWNERS)
- [Re-evaluation B-3 SPOF người](../../) — Henry as solo SPOF, Hương onboarding gates this policy
- Break-glass posts archived in `docs/break-glass/` (folder created on first incident)
