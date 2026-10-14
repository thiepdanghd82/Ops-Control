# Ops Control

CCL Design Vietnam — Pricing (NPI cost) + Library + Planning + MES backbone cho xưởng in.
Web SPA (React 19 + Vite) · API (Express + better-sqlite3) · Desktop shell (Electron 41, Node 24).

Phiên bản: **1.6.0** · Ghi chú phát hành: [docs/releases/RELEASE-NOTES-v1.6.0.md](docs/releases/RELEASE-NOTES-v1.6.0.md)

---

## Sơ đồ thư mục

```
ops-control/
├── client/        Giao diện React/Vite (modules/cost = NPI cost, services, components)
├── server/        API Express + SQLite (domains/, routes/, services/, repositories/, db/)
├── desktop/       Electron shell, license, setup wizard, build DMG/EXE
├── scripts/       Script build, kiểm tra, vận hành (một phần được đóng gói vào app)
├── deploy/        Công cụ cấp license cho fleet
├── audit/         Bộ quy tắc + script audit tĩnh
├── docs/          Tài liệu — xem docs/README.md
├── .agents/       Rules + skills dùng chung cho AI agent
├── CLAUDE.md      Luật + lesson learned cho Claude Code (tự nạp mỗi phiên)
├── CONTEXT.md     Thuật ngữ nghiệp vụ (mirror ở .agents/rules/context.md)
├── CHANGELOG.md   Lịch sử thay đổi
└── CONTRIBUTING.md
```

Dữ liệu **đang chạy** không nằm trong repo: app lưu ở
`~/Library/Application Support/ops-control-desktop/data/` (SQLite `ops.db` + `Library/…`).
`server/data/` trong repo chỉ là dữ liệu thử khi chạy dev.

## Chạy dev

Yêu cầu: Node **24.x** (đúng phiên bản của Electron 41), Xcode Command Line Tools.

```bash
npm ci
cd client && npm ci && cd ..
cd desktop && npm ci && cd ..
```

```bash
cd client && npm run dev
```

## Kiểm tra

```bash
cd client && npm test && cd ..
DATA_DIR="$(mktemp -d)" npm test
```

Luôn chạy test server với `DATA_DIR` tạm — không bao giờ trỏ vào dữ liệu thật.

## Build bộ cài

```bash
cd desktop && npm run build:server:mac
```

```bash
cd desktop && npm run build:client:mac
```

Kết quả ở `desktop/dist-electron/`. Code chỉ có hiệu lực trên máy sau khi **cài** DMG mới.

## Tài liệu

- [docs/README.md](docs/README.md) — mục lục tài liệu
- [docs/operations/](docs/operations/) — cài đặt, go-live, vận hành, cutover
- [docs/adr/](docs/adr/) — quyết định kiến trúc
- [docs/maintainers/MAINTAINERS.md](docs/maintainers/MAINTAINERS.md) — người phụ trách
- [docs/SECURITY.md](docs/SECURITY.md) — bảo mật
