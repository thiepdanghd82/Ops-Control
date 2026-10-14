# Phương án sắp xếp lại cấu trúc Ops-Control

Ngày 2026-10-14 · trên `main` @ `1a4d433` · trạng thái: **ĐÃ THỰC HIỆN đợt 0–4** trên nhánh
`chore/restructure-repo` của bản sao `NPI cost module/ops-control` (repo gốc không đổi).

> **Khác với phương án dưới đây khi thực hiện:**
>
> - `.agents/` giữ tên (đó là quy ước chung cho skill nhiều agent), không đổi thành `.ai/`. Lesson learned ở
>   `.agents/rules/lessons-learned.md`, được `CLAUDE.md` nạp bằng `@import`.
> - `CONTEXT.md` và `docs/SECURITY.md` giữ chỗ (test mirror + quy ước GitHub).
> - `scripts/` vào `apps/scripts/` cùng ba app, để `apps/` có đúng bố cục thư mục `app/` trong gói DMG — các
>   đường dẫn `../server`, `../scripts`, `../client/dist` giữa chúng không đổi.
> - Code tìm `.env`/`package.json` ở cạnh `server/` trước rồi tới gốc repo; server headless giữ bố cục phẳng
>   (deploy.sh/.ps1 đồng bộ từng thư mục về chỗ cũ). Xem mục "Ba bố cục" trong `README.md`.
>
> Những phần mô tả "hiện trạng" bên dưới là trạng thái TRƯỚC khi sắp xếp.

Ràng buộc: sau khi sắp xếp, chương trình và dữ liệu đang chạy **không được bị ảnh hưởng**.

---

## 1. Hiện trạng (audit)

### 1.1 Thư mục gốc đang lẫn lộn

Thư mục gốc có **~30 file + 20 thư mục**, trộn 5 loại nội dung:

| Loại                                      | Đang nằm ở gốc                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code ứng dụng                             | `client/` (521 file), `server/` (218), `desktop/` (45), `scripts/` (90)                                                                                                                                                                                                                                                       |
| Cấu hình dev                              | `package.json`, `eslint.config.js`, `commitlint.config.js`, `.prettierrc.json`, `.husky/`, `.github/`, `.env.example`, `security-allowlist.json`, `skills-lock.json`                                                                                                                                                          |
| Script vận hành/triển khai                | `deploy.sh`, `deploy.ps1`, `deploy.bat`, `START_SERVER.command`, `START_SERVER.bat`, `INSTALL.command`, `deploy/fleet-license/`, `test-data-consolidation.js`                                                                                                                                                                 |
| Tài liệu (14 file .md ở gốc + 4 nơi khác) | `CHANGELOG.md`, `MAINTAINERS.md`, `MIGRATION_GUIDE.md`, `SOLUTION_v1.2.md`, `UPGRADE_LOG.md`, `RELEASE-NOTES-v1.6.0.md`, `RELEASE_NOTES_v1.3.md`, `IMPROVEMENT_BRIEF.md`, `DESIGN.md`, `CONTRIBUTING.md`…; thêm `docs/` (139 file), `README FIRST/` (7), `Use guide/` (3 file docx/xlsx), `dist/` (release notes + checksums) |
| Dữ liệu AI / Claude                       | `CLAUDE.md` (**713 KB, 1713 dòng**), `AGENT_PRINCIPLES.md`, `AUTO_EXECUTE.md`, `CONTEXT.md`, `.agents/` (rules + skills), `.claude/skills/`, `.claude/4. CLAUDE OUTPUT/`                                                                                                                                                      |

Các điểm cụ thể:

- **Không có `README.md` ở gốc.** README thật lại nằm trong `README FIRST/README.md`, và thư mục đó còn có `README 1.md` (bản trùng) cùng một `CLAUDE.md` thứ hai.
- **Tên thư mục có dấu cách** (`README FIRST`, `Use guide`, `docs/Use guide`, `Data for import/`). Dấu cách gây lỗi cho công cụ build: lỗi `node-hid` hôm nay là một ví dụ.
- **Tài liệu trùng lặp.** `Use guide/OpsControl_GoLiveGuide_v1.2.docx`, `docs/Use guide/` và `client/public/help/*.docx` (file sinh tự động lúc build) chứa cùng loại nội dung.
- **`apps/kiosk/` là thư mục rỗng** (không có trong git).
- **`CLAUDE.md` quá lớn.** Claude nạp file này vào mọi phiên làm việc. 713 KB chiếm rất nhiều context, và phần lớn là lịch sử lesson, không phải luật đang áp dụng.
- **`server/` đang chuyển dở sang kiến trúc domain** (ADR 0008/0009/0011). `server/domains/{basis,costing,library,mes,quality,sales,security}` đã có, nhưng phần lớn router vẫn ở `server/routes/` (27 file) và `server/services/` (99 file). Hiện tồn tại hai cách tổ chức song song.
- **`client/src` phần lớn theo module.** `modules/cost/` chiếm 170 file, nhưng `services/` (100 file) và `components/` lại là thư mục dùng chung ở mức trên.

### 1.2 Code và dữ liệu đang chạy liên kết với nhau thế nào (quyết định độ an toàn)

**App đã cài KHÔNG đọc gì từ repo.** Khi build DMG, `desktop/package.json` → `extraResources` chép code vào trong gói app theo sơ đồ cố định:

```
Ops Control.app/Contents/Resources/app/
├── server/          ← từ ../server
├── client/dist/     ← từ ../client/dist
├── scripts/         ← từ ../scripts (chỉ *.js)
├── package.json     ← từ ../package.json
└── node_modules/
```

Lúc chạy, `desktop/main.js:172` tìm server ở `process.resourcesPath/app`. Server gọi `../scripts/seed-admin.js` (`server/index.js:1206`). Vì vậy:

- Di chuyển thư mục trong repo **không ảnh hưởng app đang chạy**, chừng nào chưa build và cài DMG mới.
- Muốn DMG mới vẫn chạy y như cũ thì giữ nguyên **vế đích** (`to: app/server`…) và chỉ sửa **vế nguồn** (`from:`).

**Dữ liệu thật không nằm trong repo.** Trên server (iMac), dữ liệu nằm ở `~/Library/Application Support/ops-control-desktop/data/`:

```
data/
├── ops.db                       (SQLite: báo giá…)
├── Library/
│   ├── MaterialCost/            ← npi_materials.json, ifs_materials.json, sourcing_db.json, materials.json
│   ├── NpiParts/  Rate/  DDL/  Finance/  InkCalc/  PrintArea/  MachineTechnical/
│   ├── QuoteHistory/  ReleasedQuotation/  RFQTracker/  SampleTracking/  SummarizeDB/
│   ├── Users/                   ← users.json, totp_secrets.enc, audit_log.json
│   └── SystemConfig/  PermissionGroups/  Notifications/  Fleet/
├── Products layout/
└── Backup/{Data,Code,PackageBackups}/
```

Có **~40 chỗ trong code** ghép tên các thư mục này bằng chuỗi cố định (`'Library'`, `'MaterialCost'`, `'NpiParts'`…). Backup, mirror và chức năng restore backup cũ cũng phụ thuộc vào đúng sơ đồ này.

**Kết luận an toàn:** sắp xếp **repo** thì an toàn nếu có cổng kiểm tra (mục 4). Đổi tên **thư mục dữ liệu đang chạy** thì không an toàn: phải viết migration, sửa ~40 chỗ, và backup cũ sẽ không restore được nữa. Phương án này **không đụng** vào dữ liệu đang chạy.

---

## 2. Nguyên tắc (theo thông lệ dân code chuyên nghiệp)

1. **Gốc repo chỉ giữ thứ công cụ bắt buộc phải ở gốc:** `README.md`, `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CLAUDE.md`/`AGENTS.md` (Claude và Codex đọc ở gốc), các file cấu hình (`package.json`, `eslint.config.js`, `.gitignore`, `.github/`, `.husky/`…).
2. **Code ứng dụng gom vào một thư mục cha.** Thông lệ monorepo (Nx, Turborepo, pnpm workspaces) gọi là `apps/` cho từng ứng dụng chạy được, và `packages/` cho thư viện dùng chung. Tên "codes" như anh ví dụ đúng ý, nhưng `apps/` là tên dân code quen, công cụ cũng nhận ra.
3. **Tài liệu gom vào `docs/`** theo loại: hướng dẫn, kiến trúc/ADR, vận hành, release.
4. **Thứ không phải phần mềm thì ra khỏi repo:** file Excel/Word nguồn, dữ liệu import, file DMG đã build, kết quả Claude xuất ra. Đặt chúng trong một thư mục **workspace** cạnh repo.
5. **Không dùng dấu cách hay chữ hoa trong tên thư mục code** (`kebab-case`).
6. **Mỗi bước di chuyển là một PR riêng, dùng `git mv`** để giữ lịch sử, và đều qua cùng một cổng kiểm tra.

---

## 3. Cấu trúc đích

### 3.1 Repo `Ops-Control/` (chỉ phần mềm)

```
Ops-Control/
├── README.md                ← MỚI: giới thiệu, cách chạy dev, sơ đồ thư mục
├── CHANGELOG.md  CONTRIBUTING.md
├── CLAUDE.md                ← RÚT GỌN còn luật đang áp dụng (≈ 30–60 KB)
├── AGENTS.md                ← (tuỳ chọn) trỏ về CLAUDE.md cho Codex/agent khác
├── package.json  package-lock.json  eslint.config.js  commitlint.config.js
├── .github/  .husky/  .env.example  .gitignore  .prettierrc.json
│
├── apps/                    ← "codes": mọi ứng dụng chạy được
│   ├── server/              ← Express API (giữ nguyên bên trong)
│   ├── client/              ← React/Vite UI
│   ├── desktop/             ← Electron shell + build DMG/EXE
│   └── scripts/             ← script mà server cần lúc chạy (seed-admin…)
│
├── tools/                   ← công cụ cho dev/ops, KHÔNG đóng gói vào app
│   ├── build/               ← build-mac-installers.mjs, build-windows-installers.mjs, overlay check
│   ├── deploy/              ← deploy.sh/.ps1/.bat, START_SERVER.*, INSTALL.command, autostart
│   ├── license/             ← fleet-license (mint/check)
│   ├── audit/               ← audit/ hiện tại (rules, run-audit.*)
│   └── dev/                 ← test-data-consolidation.js, bench…
│
├── docs/
│   ├── README.md            ← mục lục
│   ├── user-guide/          ← Use guide/ + docs/Use guide/ (gộp, bỏ bản trùng)
│   ├── architecture/        ← ARCHITECTURE.md, DESIGN.md, CONTEXT.md, SOLUTION_v1.2.md
│   ├── adr/                 ← giữ nguyên
│   ├── operations/          ← ops/, golive/, cutover/, windows/, retention/ (gộp)
│   ├── releases/            ← RELEASE-NOTES-*, dist/RELEASE_NOTES_*, MIGRATION_GUIDE.md, UPGRADE_LOG.md
│   ├── quality/             ← uat/, tests/, audit/ (báo cáo audit cũ), ci/
│   ├── maintainers/         ← MAINTAINERS.md, legal/
│   ├── plans/               ← sprints/, superpowers/, IMPROVEMENT_BRIEF.md, các phương án như file này
│   └── archive/             ← README 1.md, CLAUDE.md cũ trong README FIRST, erpag-survey…
│
└── .ai/                     ← dữ liệu dành cho AI (thay .agents/)
    ├── rules/               ← agent-principles, context, security-review
    ├── skills/              ← skill dự án (đang ở .agents/skills + .claude/skills)
    ├── lessons/             ← lesson learned TÁCH TỪ CLAUDE.md, mỗi chủ đề 1 file
    └── AUTO_EXECUTE.md  AGENT_PRINCIPLES.md
```

Ghi chú:

- **Phải giữ `.claude/skills/`**, vì Claude Code chỉ tìm skill dự án ở đó. Có thể để thành symlink trỏ về `.ai/skills/`, hoặc giữ nguyên như hiện tại.
- **`CLAUDE.md` phải ở gốc**, vì Claude Code chỉ tự nạp file này khi nó nằm ở gốc. Cách làm: tách phần lesson sang `.ai/lessons/`, rồi trong `CLAUDE.md` chỉ giữ luật tóm tắt kèm đường dẫn tới từng lesson.
- **Bên trong `apps/server` và `apps/client` giữ nguyên ở đợt này.** Chuyển nốt `server/routes` và `server/services` sang `server/domains/*` đã có kế hoạch riêng (ADR 0008/0009), cứ làm tiếp theo kế hoạch đó, không gộp vào đợt dời thư mục này.

### 3.2 Workspace cạnh repo (không phải phần mềm)

Gợi ý tạo `3. PROJECTS/Ops-Control-workspace/`, nằm **ngoài git**:

```
Ops-Control-workspace/
├── Data/                        ← dữ liệu NGUỒN để import, không phải dữ liệu đang chạy
│   ├── Materials/
│   │   ├── NPI/                 ← file Excel NPI Materials gốc
│   │   ├── IFS/                 ← file export IFS
│   │   └── Sourcing/
│   ├── NPI-Parts/
│   ├── Rates/  DDL/  Finance/
│   └── _samples/                ← dữ liệu mẫu cho test tay
├── Releases/                    ← DMG/EXE đã build + checksums, theo phiên bản (1.6.0/…)
├── Handover/                    ← bộ chuyển máy 2026-10-14 (thư mục OpsControl hiện tại)
├── Training/                    ← xlsx/docx đào tạo, slide
├── Claude-output/               ← ".claude/4. CLAUDE OUTPUT" hiện tại
└── Licenses-issued/             ← bản sao license đã cấp (KHÔNG có khoá bí mật)
```

Những thứ **không đổi chỗ**:

- **Khoá bí mật** vẫn ở `~/OpsControl-license-keys` và `~/ops-control-secrets`. Không đặt vào workspace, vì workspace dễ bị chép đi lung tung.
- **Lịch sử và memory của Claude** phải ở `~/.claude/projects/…`, vì Claude Code chỉ đọc ở đó. Thứ cần dùng chung với người khác thì đưa vào `.ai/lessons/` trong repo.
- **Dữ liệu đang chạy** vẫn ở `~/Library/Application Support/ops-control-desktop/data/` (mục 1.2).

Về ví dụ của anh, "Materials → NPI, IFS": trong **dữ liệu đang chạy**, `Library/MaterialCost/` đã gom sẵn `npi_materials.json`, `ifs_materials.json`, `sourcing_db.json` vào một chỗ. Sơ đồ `Materials/NPI`, `Materials/IFS` nên áp cho **thư mục dữ liệu nguồn trong workspace**. Không đổi tên thư mục dữ liệu đang chạy. Nếu muốn giao diện hiện tên dễ hiểu hơn, đổi nhãn hiển thị là đủ, không cần đổi tên thư mục.

---

## 4. Cổng kiểm tra "không ảnh hưởng chương trình" (bắt buộc cho mỗi PR)

Ghi lại dấu vân tay của bản build **trước** khi di chuyển, rồi so với bản build **sau**:

1. `cd apps/client && npm test` → vẫn **2215/2215** test đạt.
2. `DATA_DIR="$(mktemp -d)" npm test` → vẫn **1145 test đạt / 0 lỗi** + license 17 + manifest 3 + utils 27.
3. `npm run lint`, `npm run format:check`, CI xanh.
4. Build `server` và `client` DMG.
5. **So cây file trong gói app trước/sau.** Đây là bằng chứng mạnh nhất: liệt kê `Resources/app/**` cùng `npx @electron/asar list app.asar`, rồi `diff` hai danh sách. Kết quả phải **giống hệt**, ngoại trừ các file sinh ra có dấu thời gian. Cây file giống nhau thì app chạy giống nhau.
6. Cài bản CLIENT trên máy này, mở lên. Log phải có `License OK` và `Loading URL: http://10.102.3.252:3100`.
7. **Không cài bản SERVER lên iMac** trong cả đợt sắp xếp. Chỉ cài khi có một release thật, và trước đó phải bấm **Mirror ngay**.

Rút lui: mỗi bước là một PR riêng. Nếu sai thì `git revert` PR đó. App đã cài và dữ liệu không bị đụng, nên không có gì phải khôi phục.

---

## 5. Lộ trình theo độ rủi ro

| Đợt   | Việc                                                                                                                                                                                                                                         | Rủi ro                                                                                                                                                     | Cần sửa                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | Tạo workspace; chuyển ra ngoài repo: `.claude/4. CLAUDE OUTPUT`, `Use guide/*.xlsx`, DMG cũ, dữ liệu import; xoá `apps/kiosk/` rỗng                                                                                                          | **Không**: toàn thứ không có trong git hoặc không phải code                                                                                                | —                                                                                                                                                                                                                                                                                                                                                                                   |
| **1** | Gom tài liệu: 9 file .md ở gốc (DESIGN, CONTEXT, SOLUTION_v1.2, MAINTAINERS, MIGRATION_GUIDE, UPGRADE_LOG, IMPROVEMENT_BRIEF, 2 release notes) + `README FIRST/` + `Use guide/` + `dist/*.md` → `docs/…`; viết `README.md` mới; bỏ bản trùng | **Rất thấp**                                                                                                                                               | 4 chỗ code đọc file tài liệu: `scripts/summarise-upgrade-log.mjs` (UPGRADE_LOG), `scripts/build-training-guide.js` (Use guide), `scripts/contextMirror.test.js` (CONTEXT.md), `scripts/sprint-history-sha.js` (CLAUDE.md). Các chỗ còn lại chỉ là comment nhắc "CLAUDE.md Lesson N"                                                                                                 |
| **2** | Tách lesson khỏi `CLAUDE.md` → `.ai/lessons/*.md`, gộp `.agents/` vào `.ai/`                                                                                                                                                                 | **Thấp** với app; cần làm cẩn thận vì luật cho Claude nằm ở đây                                                                                            | Đổi đường dẫn trong `skills-lock.json` / `eslint.config.js`; giữ `.claude/skills`                                                                                                                                                                                                                                                                                                   |
| **3** | Dời script vận hành ở gốc → `tools/deploy`, `tools/license`, `tools/audit`, `tools/build`                                                                                                                                                    | **Thấp**                                                                                                                                                   | `INSTALL.command`/`deploy.sh` gọi nhau; `scripts/verify-backup.js` và `server/utils/trustProxy.js` nhắc `deploy.sh`; script trong `package.json`                                                                                                                                                                                                                                    |
| **4** | `server/ client/ desktop/ scripts/` → `apps/*`                                                                                                                                                                                               | **Trung bình**: đổi nhiều đường dẫn, nhưng bốn thư mục vẫn là anh em của nhau nên các đường dẫn `../server`, `../client`, `../scripts` bên trong không đổi | `desktop/package.json` `extraResources.from` (thêm một cấp `../`); các đường dẫn `../../` trỏ lên gốc (~105 file, phần lớn là import nội bộ client, cần rà); `package.json` gốc; `.github/workflows/ci.yml`, `.husky`, `eslint.config.js`, `.prettierignore` (39 chỗ); 305 đường dẫn ghi trong `CLAUDE.md`; skill dự án; LaunchAgent/script dev nào gọi `server/index.js` trực tiếp |

**Khuyến nghị:**

- **Đợt 0 → 3:** làm ngay. Thư mục gốc sẽ gọn từ ~50 mục xuống ~15. Gần như không có rủi ro.
- **Đợt 4:** làm sau, trong một PR riêng, khi không có nhánh nào đang mở dở. Lý do: đợt này lợi ích thẩm mỹ nhiều hơn lợi ích kỹ thuật, trong khi chi phí lại thật (mọi PR đang mở sẽ xung đột, và 305 tham chiếu trong `CLAUDE.md` phải sửa). Nếu chỉ muốn thấy code nằm "một chỗ", có thể thêm mục _Sơ đồ thư mục_ vào `README.md` mà không cần dời.
- **Dữ liệu đang chạy:** không đổi.
