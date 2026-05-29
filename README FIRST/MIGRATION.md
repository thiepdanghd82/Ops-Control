# Migration map — Ops Control v1.2 → v1.3

This document maps every meaningful v1.2 source path to its v1.3 destination. Use it when porting
a v1.2 sprint forward into v1.3.

> Convention: paths shown without leading `./` are relative to the project root of each version.

---

## 1. Apps (deployment shells)

| v1.2                               | v1.3                                          |
| ---------------------------------- | --------------------------------------------- |
| `client/index.html`                | `apps/client/index.html`                      |
| `client/vite.config.js`            | `apps/client/vite.config.js`                  |
| `client/package.json`              | `apps/client/package.json`                    |
| `client/src/main.jsx`              | `apps/client/src/main.jsx`                    |
| `client/src/App.jsx`               | `apps/client/src/App.jsx` (router shell only) |
| `server/index.js`                  | `apps/server/index.js`                        |
| `desktop/main.cjs` + `preload.cjs` | `apps/desktop/main.cjs` + `preload.cjs`       |
| `desktop/package.json`             | `apps/desktop/package.json`                   |
| `desktop/native/`                  | `apps/desktop/native/`                        |

## 2. Platform (cross-cutting)

| v1.2                                                    | v1.3                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `server/services/authService.js`                        | `platform/auth/server/authService.js`                                 |
| `server/services/loginAnomaly.js`                       | `platform/auth/server/loginAnomaly.js`                                |
| `server/middleware/auth.js`                             | `platform/auth/server/middleware.js`                                  |
| `client/src/context/AuthContext.jsx`                    | `platform/auth/client/AuthContext.jsx`                                |
| `client/src/components/Auth/*`                          | `platform/auth/client/components/*`                                   |
| `server/repositories/auditStore.js`                     | `platform/audit/server/auditStore.js`                                 |
| `server/services/auditRetention.js`                     | `platform/audit/server/auditRetention.js`                             |
| `server/utils/etag.js`                                  | `platform/cache/server/etag.js`                                       |
| `client/src/hooks/useCachedFetch.js`                    | `platform/cache/client/useCachedFetch.js`                             |
| `server/routes/sync.js`                                 | `platform/sync/server/syncRouter.js`                                  |
| `server/services/dataSync.js`                           | `platform/sync/server/dataSync.js`                                    |
| `client/src/i18n/strings.js` (single file)              | Split → `domains/<each>/shared/i18n.js` + `platform/i18n/registry.js` |
| `client/src/i18n/useI18n.js`                            | `platform/i18n/client/useI18n.js`                                     |
| `client/src/components/Shared/Button.jsx`               | `platform/ui-kit/client/Button.jsx`                                   |
| `client/src/components/Shared/Modal.{jsx,css}`          | `platform/ui-kit/client/Modal.{jsx,css}`                              |
| `client/src/components/Shared/StatusBadge.jsx`          | `platform/ui-kit/client/StatusBadge.jsx`                              |
| `client/src/components/Shared/SkeletonTable.jsx`        | `platform/ui-kit/client/SkeletonTable.jsx`                            |
| `client/src/components/Shared/EmptyState.jsx`           | `platform/ui-kit/client/EmptyState.jsx`                               |
| `client/src/components/Shared/LangFlagToggle.{jsx,css}` | `platform/ui-kit/client/LangFlagToggle.{jsx,css}`                     |
| `client/src/components/Shared/TabBarOverflow.{jsx,css}` | `platform/ui-kit/client/TabBarOverflow.{jsx,css}`                     |
| `client/src/components/Shared/ErrorBoundary.js`         | `platform/ui-kit/client/ErrorBoundary.js`                             |
| `client/src/components/Shared/ConflictModal.{jsx,css}`  | `platform/ui-kit/client/ConflictModal.{jsx,css}`                      |
| `server/middleware/validate.js`                         | `platform/http/server/validate.js`                                    |
| `server/middleware/rateLimit.js`                        | `platform/http/server/rateLimit.js`                                   |
| `server/middleware/siteAccess.js`                       | `platform/http/server/siteAccess.js`                                  |
| `server/utils/safeError.js`                             | `platform/http/server/safeError.js`                                   |
| `server/services/atomicWrite.js`                        | `platform/storage/server/atomicWrite.js`                              |
| `server/repositories/shadowWrite.js`                    | `platform/storage/server/shadowWrite.js`                              |
| `server/db/*`                                           | `platform/storage/server/db/*`                                        |
| `server/utils/asyncLock.js`                             | `platform/storage/server/asyncLock.js`                                |
| `server/utils/metrics.js`                               | `platform/observability/server/metrics.js`                            |

## 3. Domains

### 3.1 Costing (CO)

| v1.2                                                                  | v1.3                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `client/src/modules/cost/tabs/StandardCalc/*`                         | `domains/costing/client/standard/*`                         |
| `client/src/modules/cost/tabs/ComplexCalc/*`                          | `domains/costing/client/complex/*`                          |
| `client/src/modules/cost/tabs/PrintAreaCalc.{jsx,css}`                | `domains/costing/client/print-area/PrintAreaCalc.{jsx,css}` |
| `client/src/modules/cost/tabs/InkCalculator.{jsx,css}`                | `domains/costing/client/ink/InkCalculator.{jsx,css}`        |
| `client/src/modules/cost/tabs/DesignTools/*`                          | `domains/costing/client/design-tools/*`                     |
| `client/src/modules/cost/tabs/DesignTools/presses/gallusEngine.js`    | `domains/costing/server/domain/gallusEngine.js`             |
| `client/src/modules/cost/tabs/DesignTools/presses/gallusInventory.js` | `domains/costing/shared/gallusInventory.js`                 |
| `client/src/modules/cost/tabs/DesignTools/presses/GallusCalc.jsx`     | `domains/costing/client/design-tools/GallusCalc.jsx`        |
| `server/routes/costApi.js` (cost-related handlers)                    | `domains/costing/server/routes/costing.js`                  |
| `server/repositories/quotesStore.js`                                  | `domains/costing/server/repositories/quotesStore.js`        |
| `server/repositories/quoteVersions.js`                                | `domains/costing/server/repositories/quoteVersions.js`      |
| `server/utils/quoteShape.js`                                          | `domains/costing/server/domain/quoteShape.js`               |

### 3.2 Library (MM)

| v1.2                                                     | v1.3                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `client/src/modules/cost/tabs/MaterialLibrary.{jsx,css}` | `domains/library/client/material/MaterialLibrary.{jsx,css}` |
| `client/src/modules/cost/tabs/LibRate.{jsx,css}`         | `domains/library/client/rate/LibRate.{jsx,css}`             |
| `client/src/modules/cost/tabs/LibFinance.{jsx,css}`      | `domains/library/client/finance/LibFinance.{jsx,css}`       |
| `client/src/modules/cost/tabs/LibDDL.{jsx,css}`          | `domains/library/client/ddl/LibDDL.{jsx,css}`               |
| `client/src/modules/cost/tabs/LibMfg.jsx`                | `domains/library/client/mfg-structure/LibMfg.jsx`           |
| `client/src/modules/cost/tabs/LibRop.jsx`                | `domains/library/client/routing-ops/LibRop.jsx`             |
| `server/services/librarySchema.js`                       | `domains/library/server/services/librarySchema.js`          |
| `server/data/Library/*`                                  | `data/library/*` (rebased; same internal layout)            |

### 3.3 Planning (PP)

| v1.2                                                          | v1.3                                                |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `client/src/modules/planning/tabs/OrderEntry.{jsx,css}`       | `domains/planning/client/order-entry/*`             |
| `client/src/modules/planning/tabs/WorkOrders.{jsx,css}`       | `domains/planning/client/work-orders/*`             |
| `client/src/modules/planning/tabs/WIPTracker.{jsx,css}`       | `domains/planning/client/wip/*`                     |
| `client/src/modules/planning/tabs/CapacityPlanning.{jsx,css}` | `domains/planning/client/capacity/*`                |
| `client/src/modules/planning/tabs/BOMExplosion.{jsx,css}`     | `domains/planning/client/bom/*`                     |
| `client/src/modules/planning/tabs/MaterialCheck.{jsx,css}`    | `domains/planning/client/material-check/*`          |
| `server/routes/planning.js`                                   | `domains/planning/server/routes/planning.js`        |
| `server/services/planningStore.js`                            | `domains/planning/server/services/planningStore.js` |
| `server/data/planning/`                                       | `data/planning/`                                    |

### 3.4 Sales (SD)

| v1.2                                                     | v1.3                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `client/src/modules/cost/tabs/RFQTracker.{jsx,css}`      | `domains/sales/client/rfq/RFQTracker.{jsx,css}`           |
| `client/src/modules/cost/tabs/QuoteHistory.{jsx,css}`    | `domains/sales/client/quote-history/*`                    |
| `client/src/modules/cost/tabs/QuoteAnalysis.{jsx,css}`   | `domains/sales/client/quote-analysis/*`                   |
| `client/src/modules/cost/tabs/FormalQuotation.{jsx,css}` | `domains/sales/client/formal-quotation/*`                 |
| `client/src/components/Shared/QuoteVersionDiff.jsx`      | `domains/sales/client/quote-history/QuoteVersionDiff.jsx` |
| `client/src/components/Shared/RfqInfoCard.jsx`           | `domains/sales/client/rfq/RfqInfoCard.jsx`                |
| `client/src/components/Shared/CostSummaryBar.jsx`        | `domains/sales/client/quote-analysis/CostSummaryBar.jsx`  |

### 3.5 Quality (QM)

| v1.2                                                    | v1.3                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `client/src/modules/cost/tabs/SampleTracking.{jsx,css}` | `domains/quality/client/sample-tracking/*`                      |
| `client/src/modules/cost/tabs/TrackerLegendModal.jsx`   | `domains/quality/client/sample-tracking/TrackerLegendModal.jsx` |

### 3.6 Security (SU)

| v1.2                                                       | v1.3                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `client/src/modules/cost/tabs/PermissionGroupsSection.jsx` | `domains/security/client/permissions/PermissionGroupsSection.jsx` |
| `client/src/modules/cost/tabs/PendingApprovalsInbox.jsx`   | `domains/security/client/approvals/PendingApprovalsInbox.jsx`     |
| `client/src/components/Shared/Approval*.jsx`               | `domains/security/client/approvals/*`                             |
| `server/repositories/approvalWorkflow.js`                  | `domains/security/server/repositories/approvalWorkflow.js`        |
| `server/services/permissionService.js`                     | `domains/security/server/services/permissionService.js`           |

### 3.7 Basis (BC)

| v1.2                                                                                                 | v1.3                                                  |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `client/src/modules/cost/tabs/Settings.{jsx,css}`                                                    | `domains/basis/client/settings/*`                     |
| `client/src/modules/cost/tabs/AdminMetrics.{jsx,css,helpers.js,test.js}`                             | `domains/basis/client/admin-metrics/*`                |
| `client/src/modules/cost/tabs/Dashboard.jsx`                                                         | `domains/basis/client/dashboard/Dashboard.jsx`        |
| `client/src/modules/cost/tabs/AboutSection.{jsx,css}`                                                | `domains/basis/client/about/*`                        |
| `client/src/modules/cost/tabs/ImportLegacySection.{jsx,css}`                                         | `domains/basis/client/import/*`                       |
| `client/src/modules/cost/tabs/Summarize.{jsx,css}`                                                   | `domains/basis/client/summarize/*`                    |
| `client/src/modules/cost/tabs/Messages/*`                                                            | `domains/basis/client/messages/*`                     |
| `server/routes/import.js` + `importWizard.js`                                                        | `domains/basis/server/routes/import.js`               |
| `server/services/importParse.js` + `importPipeline.js` + `importTypeCoerce.js` + `importDatasets.js` | `domains/basis/server/services/import/*`              |
| `server/services/backupScheduler.js`                                                                 | `domains/basis/server/services/backupScheduler.js`    |
| `server/services/notifications.js`                                                                   | `domains/basis/server/services/notifications.js`      |
| `server/services/eventBus.js` + `chatBus.js`                                                         | `domains/basis/server/services/eventBus.js`           |
| `server/repositories/dashboardStats.js`                                                              | `domains/basis/server/repositories/dashboardStats.js` |
| `server/repositories/chatStore.js` + `routes/chat.js`                                                | `domains/basis/server/{services,routes}/chat*`        |
| `client/src/components/Chat/*`                                                                       | `domains/basis/client/chat/*`                         |

### 3.8 MES

| v1.2                                                         | v1.3                                     |
| ------------------------------------------------------------ | ---------------------------------------- |
| `client/src/modules/cost/tabs/IFSInventory.{jsx,css}`        | `domains/mes/client/ifs-inventory/*`     |
| `client/src/modules/cost/tabs/MachineTechnicalTab.{jsx,css}` | `domains/mes/client/machine-technical/*` |
| `client/src/modules/cost/tabs/HardwareSection.{jsx,css}`     | `domains/mes/client/hardware/*`          |
| `client/src/modules/cost/tabs/ModeSection.{jsx,css}`         | `domains/mes/client/mode/*`              |

## 4. Help & user docs

| v1.2                        | v1.3                                |
| --------------------------- | ----------------------------------- |
| `client/src/modules/help/*` | `apps/client/src/help/*` (UI shell) |
| `client/src/help/*`         | `docs/user-guide/in-app/*`          |
| `client/public/help/*`      | `apps/client/public/help/*`         |
| `Use guide/*.docx,xlsx`     | `docs/user-guide/training/*`        |

## 5. Scripts

Split by purpose. Tests stay next to the script.

| v1.2 (`scripts/...`)                                                                                                                                                              | v1.3                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `build-desktop.sh`, `build-mac-installers.mjs`, `build-windows-installers.mjs`, `build-bytecode.js`, `patch-pdfjs-worker.mjs`, `sign-macos.sh`, `sign-windows.ps1`, `release.sh`  | `scripts/build/`      |
| `backup-offsite.sh`, `verify-backup.js`, `setup-https-caddy.sh`, `recover-sys-user.js`, `reset-totp.js`, `rotate-totp-key.js`, `cleanup-legacy-passwords*.js`, `smoke-runtime.sh` | `scripts/ops/`        |
| `migrate-planning-data.js` (referenced from package.json), `migrate-quote-va*.js`, `migrate-to-sqlite.js`, `backfill-audit-log.js`, `backfill-quote-results*.js`                  | `scripts/migrations/` |
| `verify-install*.js`, `preflight-env.js`, `check-perf-budget*.js`, `verify-parity.js`, `build-training-guide.js`, `help/*`                                                        | `scripts/dev/`        |

## 6. Documentation

| v1.2                              | v1.3                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `CLAUDE.md` (35K, mixed concerns) | `CLAUDE.md` (entry-point only) + `docs/adr/*` for decisions + `docs/runbooks/*` for ops |
| `DESIGN.md`                       | `docs/architecture/design-system.md`                                                    |
| `MAINTAINERS.md`                  | `docs/runbooks/maintainers.md`                                                          |
| `SOLUTION_v1.2.md`                | `docs/sprints/v1.2-solution-baseline.md`                                                |
| `CHANGELOG.md`                    | `CHANGELOG.md` (kept at root)                                                           |
| `docs/audit-2026-04-17/*`         | `docs/sprints/2026-04-17-audit/*`                                                       |
| `docs/sprints/*`                  | `docs/sprints/*` (verbatim)                                                             |
| `docs/DESKTOP_DEPLOYMENT.md`      | `docs/runbooks/desktop-deployment.md`                                                   |
| `docs/ENTERPRISE_HARDENING.md`    | `docs/runbooks/enterprise-hardening.md`                                                 |
| `docs/GO_LIVE_GUIDE.md`           | `docs/runbooks/go-live.md`                                                              |
| `docs/GO_LIVE_READINESS.md`       | `docs/runbooks/go-live-readiness.md`                                                    |
| `docs/INTERNAL_TRUST_SETUP.md`    | `docs/runbooks/internal-trust-setup.md`                                                 |
| `docs/LAN_*.md`                   | `docs/runbooks/lan-*.md`                                                                |

## 7. Infra & deploy

| v1.2                                      | v1.3                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `deploy.sh` / `deploy.ps1` / `deploy.bat` | `infra/deploy/`                                                                   |
| `INSTALL.command`                         | `infra/deploy/install.command`                                                    |
| `START_SERVER.{bat,command}`              | `infra/deploy/start-server.*`                                                     |
| `desktop/` electron-builder configs       | Alongside `apps/desktop/` + `infra/installers/` for shared entitlements / signing |

## 8. Test housing

| v1.2                            | v1.3                                                                        |
| ------------------------------- | --------------------------------------------------------------------------- |
| `server/**/*.test.js`           | Stays adjacent to source — but source moved per tables 1–3, so tests follow |
| `scripts/**/*.test.js`          | `scripts/**/*.test.js` (stays adjacent)                                     |
| (no e2e in v1.2)                | `tests/e2e/` — new in v1.3                                                  |
| `scripts/check-perf-budget*.js` | `scripts/dev/check-perf-budget.js` + `tests/perf/budget.test.js`            |

## 9. Migration sequencing

The full move is staged across sprints (see `docs/sprints/v1.3-migration-plan.md`):

1. **Sprint 1.3.0** — Skeleton + AI config + docs (this PR)
2. **Sprint 1.3.1** — Platform layer first (auth, http, storage, observability)
3. **Sprint 1.3.2** — Library + Costing (the largest consumers of platform)
4. **Sprint 1.3.3** — Planning + Sales + Quality
5. **Sprint 1.3.4** — Security + Basis (touches every domain — last)
6. **Sprint 1.3.5** — MES + cleanup + lint enforcement (`eslint-plugin-boundaries`)
7. **Sprint 1.3.6** — Cut v1.3.0 release; archive v1.2 with a freeze tag

During the migration, **v1.2 is the source of truth**. v1.3 is built up file-by-file; only when
all domains are ported and CI is green does v1.3 take over.
