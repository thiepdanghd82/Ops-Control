# Ops Control

CCL Design Vietnam — Pricing (NPI cost) + Library + Planning + MES backbone cho xưởng in.
Web SPA (React 19 + Vite) · API (Express + better-sqlite3) · Desktop shell (Electron 41, Node 24).

Phiên bản: **1.6.0** · Ghi chú phát hành: [docs/releases/RELEASE-NOTES-v1.6.0.md](docs/releases/RELEASE-NOTES-v1.6.0.md)

---

## Sơ đồ thư mục

```
ops-control/
├── apps/          Toàn bộ code — cùng bố cục với thư mục app/ bên trong gói DMG
│   ├── client/    Giao diện React/Vite (modules/cost = NPI cost, services, components)
│   ├── server/    API Express + SQLite (domains/, routes/, services/, repositories/, db/)
│   ├── desktop/   Electron shell, license, setup wizard, build DMG/EXE
│   └── scripts/   Script build, kiểm tra, vận hành (*.js được đóng gói vào app)
├── package.json   Gói của server + công cụ dev (node_modules ở gốc)
├── tools/         Công cụ dev/ops, KHÔNG đóng gói vào app
│   ├── deploy/    deploy.sh/.ps1/.bat, START_SERVER.*, INSTALL.command
│   ├── license/   fleet-license (mint/check license)
│   ├── audit/     Bộ quy tắc + script audit tĩnh
│   └── dev/       Script kiểm tra tay cho dev
├── docs/          Tài liệu — xem docs/README.md
├── .agents/       Rules, lessons learned, skills dùng chung cho AI agent
├── CLAUDE.md      Luật + lesson learned cho Claude Code (tự nạp mỗi phiên)
├── CONTEXT.md     Thuật ngữ nghiệp vụ (mirror ở .agents/rules/context.md)
├── CHANGELOG.md   Lịch sử thay đổi
└── CONTRIBUTING.md
```

Dữ liệu **đang chạy** không nằm trong repo: app lưu ở
`~/Library/Application Support/ops-control-desktop/data/` (SQLite `ops.db` + `Library/…`).
`apps/server/data/` trong repo chỉ là dữ liệu thử khi chạy dev.

Ba bố cục cùng tồn tại, code tìm `.env` / `package.json` ở cả hai chỗ (cạnh `server/` trước, rồi tới gốc repo):

| Nơi chạy                         | `server/` nằm ở                   | `.env`, `package.json` |
| -------------------------------- | --------------------------------- | ---------------------- |
| Repo (dev)                       | `apps/server/`                    | gốc repo               |
| Gói DMG                          | `Resources/app/server/`           | `Resources/app/`       |
| Server headless (deploy.sh/.ps1) | `$APP_DIR/server/` (bố cục phẳng) | `$APP_DIR/`            |

Trên server headless, các lệnh `npm run …` của `package.json` trỏ vào `apps/…` nên **không dùng** — chạy thẳng
`node server/index.js`, `node scripts/preflight-env.js` (deploy.sh/.ps1 đã làm vậy).
`DATA_DIR` tương đối (vd `./server/data`) được tính từ thư mục chứa `server/`, nên vẫn giữ nguyên giá trị cũ.

## Chạy dev

Yêu cầu: Node **24.x** (đúng phiên bản của Electron 41), Xcode Command Line Tools.

```bash
npm ci
cd apps/client && npm ci && cd ../..
cd apps/desktop && npm ci && cd ../..
```

```bash
cd apps/client && npm run dev
```

## Kiểm tra

```bash
cd apps/client && npm test && cd ../..
DATA_DIR="$(mktemp -d)" npm test
```

Luôn chạy test server với `DATA_DIR` tạm — không bao giờ trỏ vào dữ liệu thật.

## Build bộ cài

```bash
cd apps/desktop && npm run build:server:mac
```

```bash
cd apps/desktop && npm run build:client:mac
```

Kết quả ở `apps/desktop/dist-electron/`. Code chỉ có hiệu lực trên máy sau khi **cài** DMG mới.

Khi đóng gói, hook `apps/desktop/prune-dev-deps.js` (electron-builder `afterPack`) bỏ khỏi `app/node_modules` mọi gói
`package-lock.json` đánh dấu `"dev": true` (~175 MB → ~63 MB) và dừng build nếu việc đó làm gãy một phụ thuộc.
Thêm thư viện mà server dùng lúc chạy thì phải khai báo ở `dependencies`, không phải `devDependencies`
(CI `check-runtime-deps` cũng kiểm tra điều này). Bỏ qua bước này khi cần gấp: `OPS_SKIP_PRUNE_DEV_DEPS=1`.

## Tài liệu

- [docs/README.md](docs/README.md) — mục lục tài liệu
- [docs/operations/](docs/operations/) — cài đặt, go-live, vận hành, cutover
- [docs/adr/](docs/adr/) — quyết định kiến trúc
- [docs/maintainers/MAINTAINERS.md](docs/maintainers/MAINTAINERS.md) — người phụ trách
- [docs/SECURITY.md](docs/SECURITY.md) — bảo mật
