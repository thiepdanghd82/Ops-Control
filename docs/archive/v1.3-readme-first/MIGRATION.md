# Migration map — Ops Control v1.2 → v1.3

This document maps every meaningful v1.2 source path to its v1.3 destination. Use it when porting
a v1.2 sprint forward into v1.3.

> Convention: paths shown without leading `./` are relative to the project root of each version.

---

## 1. Apps (deployment shells)

| v1.2                               | v1.3                                          |
| ---------------------------------- | --------------------------------------------- |
| `apps/client/index.html`           | `apps/client/index.html`                      |
| `apps/client/vite.config.js`       | `apps/client/vite.config.js`                  |
| `apps/client/package.json`         | `apps/client/package.json`                    |
| `apps/client/src/main.jsx`         | `apps/client/src/main.jsx`                    |
| `apps/client/src/App.jsx`          | `apps/client/src/App.jsx` (router shell only) |
| `apps/server/index.js`             | `apps/server/index.js`                        |
| `desktop/main.cjs` + `preload.cjs` | `apps/desktop/main.cjs` + `preload.cjs`       |
| `apps/desktop/package.json`        | `apps/desktop/package.json`                   |
| `apps/desktop/native/`             | `apps/desktop/native/`                        |

## 2. Platform (cross-cutting)

| v1.2                                                         | v1.3                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `apps/server/services/authService.js`                        | `platform/auth/server/authService.js`                                 |
| `apps/server/services/loginAnomaly.js`                       | `platform/auth/server/loginAnomaly.js`                                |
| `apps/server/middleware/auth.js`                             | `platform/auth/server/middleware.js`                                  |
| `apps/client/src/context/AuthContext.jsx`                    | `platform/auth/client/AuthContext.jsx`                                |
| `apps/client/src/components/Auth/*`                          | `platform/auth/client/components/*`                                   |
| `apps/server/repositories/auditStore.js`                     | `platform/audit/server/auditStore.js`                                 |
| `apps/server/services/auditRetention.js`                     | `platform/audit/server/auditRetention.js`                             |
| `apps/server/utils/etag.js`                                  | `platform/cache/server/etag.js`                                       |
| `apps/client/src/hooks/useCachedFetch.js`                    | `platform/cache/client/useCachedFetch.js`                             |
| `apps/server/routes/sync.js`                                 | `platform/sync/server/syncRouter.js`                                  |
| `apps/server/services/dataSync.js`                           | `platform/sync/server/dataSync.js`                                    |
| `apps/client/src/i18n/strings.js` (single file)              | Split → `domains/<each>/shared/i18n.js` + `platform/i18n/registry.js` |
| `apps/client/src/i18n/useI18n.js`                            | `platform/i18n/client/useI18n.js`                                     |
| `apps/client/src/components/Shared/Button.jsx`               | `platform/ui-kit/client/Button.jsx`                                   |
| `apps/client/src/components/Shared/Modal.{jsx,css}`          | `platform/ui-kit/client/Modal.{jsx,css}`                              |
| `apps/client/src/components/Shared/StatusBadge.jsx`          | `platform/ui-kit/client/StatusBadge.jsx`                              |
| `apps/client/src/components/Shared/SkeletonTable.jsx`        | `platform/ui-kit/client/SkeletonTable.jsx`                            |
| `apps/client/src/components/Shared/EmptyState.jsx`           | `platform/ui-kit/client/EmptyState.jsx`                               |
| `apps/client/src/components/Shared/LangFlagToggle.{jsx,css}` | `platform/ui-kit/client/LangFlagToggle.{jsx,css}`                     |
| `apps/client/src/components/Shared/TabBarOverflow.{jsx,css}` | `platform/ui-kit/client/TabBarOverflow.{jsx,css}`                     |
| `apps/client/src/components/Shared/ErrorBoundary.js`         | `platform/ui-kit/client/ErrorBoundary.js`                             |
| `apps/client/src/components/Shared/ConflictModal.{jsx,css}`  | `platform/ui-kit/client/ConflictModal.{jsx,css}`                      |
| `apps/server/middleware/validate.js`                         | `platform/http/server/validate.js`                                    |
| `apps/server/middleware/rateLimit.js`                        | `platform/http/server/rateLimit.js`                                   |
| `apps/server/middleware/siteAccess.js`                       | `platform/http/server/siteAccess.js`                                  |
| `apps/server/utils/safeError.js`                             | `platform/http/server/safeError.js`                                   |
| `apps/server/services/atomicWrite.js`                        | `platform/storage/server/atomicWrite.js`                              |
| `apps/server/repositories/shadowWrite.js`                    | `platform/storage/server/shadowWrite.js`                              |
| `apps/server/db/*`                                           | `platform/storage/server/db/*`                                        |
| `apps/server/utils/asyncLock.js`                             | `platform/storage/server/asyncLock.js`                                |
| `apps/server/utils/metrics.js`                               | `platform/observability/server/metrics.js`                            |

## 3. Domains

### 3.1 Costing (CO)

| v1.2                                                                       | v1.3                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/client/src/modules/cost/tabs/StandardCalc/*`                         | `domains/costing/client/standard/*`                         |
| `apps/client/src/modules/cost/tabs/ComplexCalc/*`                          | `domains/costing/client/complex/*`                          |
| `apps/client/src/modules/cost/tabs/PrintAreaCalc.{jsx,css}`                | `domains/costing/client/print-area/PrintAreaCalc.{jsx,css}` |
| `apps/client/src/modules/cost/tabs/InkCalculator.{jsx,css}`                | `domains/costing/client/ink/InkCalculator.{jsx,css}`        |
| `apps/client/src/modules/cost/tabs/DesignTools/*`                          | `domains/costing/client/design-tools/*`                     |
| `apps/client/src/modules/cost/tabs/DesignTools/presses/gallusEngine.js`    | `domains/costing/server/domain/gallusEngine.js`             |
| `apps/client/src/modules/cost/tabs/DesignTools/presses/gallusInventory.js` | `domains/costing/shared/gallusInventory.js`                 |
| `apps/client/src/modules/cost/tabs/DesignTools/presses/GallusCalc.jsx`     | `domains/costing/client/design-tools/GallusCalc.jsx`        |
| `apps/server/routes/costApi.js` (cost-related handlers)                    | `domains/costing/server/routes/costing.js`                  |
| `apps/server/repositories/quotesStore.js`                                  | `domains/costing/server/repositories/quotesStore.js`        |
| `apps/server/repositories/quoteVersions.js`                                | `domains/costing/server/repositories/quoteVersions.js`      |
| `apps/server/utils/quoteShape.js`                                          | `domains/costing/server/domain/quoteShape.js`               |

### 3.2 Library (MM)

| v1.2                                                          | v1.3                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/client/src/modules/cost/tabs/MaterialLibrary.{jsx,css}` | `domains/library/client/material/MaterialLibrary.{jsx,css}` |
| `apps/client/src/modules/cost/tabs/LibRate.{jsx,css}`         | `domains/library/client/rate/LibRate.{jsx,css}`             |
| `apps/client/src/modules/cost/tabs/LibFinance.{jsx,css}`      | `domains/library/client/finance/LibFinance.{jsx,css}`       |
| `apps/client/src/modules/cost/tabs/LibDDL.{jsx,css}`          | `domains/library/client/ddl/LibDDL.{jsx,css}`               |
| `apps/client/src/modules/cost/tabs/LibMfg.jsx`                | `domains/library/client/mfg-structure/LibMfg.jsx`           |
| `apps/client/src/modules/cost/tabs/LibRop.jsx`                | `domains/library/client/routing-ops/LibRop.jsx`             |
| `apps/server/services/librarySchema.js`                       | `domains/library/server/services/librarySchema.js`          |
| `server/data/Library/*`                                       | `data/library/*` (rebased; same internal layout)            |

### 3.3 Planning (PP)

| v1.2                                                               | v1.3                                                |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| `apps/client/src/modules/planning/tabs/OrderEntry.{jsx,css}`       | `domains/planning/client/order-entry/*`             |
| `apps/client/src/modules/planning/tabs/WorkOrders.{jsx,css}`       | `domains/planning/client/work-orders/*`             |
| `apps/client/src/modules/planning/tabs/WIPTracker.{jsx,css}`       | `domains/planning/client/wip/*`                     |
| `apps/client/src/modules/planning/tabs/CapacityPlanning.{jsx,css}` | `domains/planning/client/capacity/*`                |
| `apps/client/src/modules/planning/tabs/BOMExplosion.{jsx,css}`     | `domains/planning/client/bom/*`                     |
| `apps/client/src/modules/planning/tabs/MaterialCheck.{jsx,css}`    | `domains/planning/client/material-check/*`          |
| `apps/server/routes/planning.js`                                   | `domains/planning/server/routes/planning.js`        |
| `apps/server/services/planningStore.js`                            | `domains/planning/server/services/planningStore.js` |
| `server/data/planning/`                                            | `data/planning/`                                    |

### 3.4 Sales (SD)

| v1.2                                                          | v1.3                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/client/src/modules/cost/tabs/RFQTracker.{jsx,css}`      | `domains/sales/client/rfq/RFQTracker.{jsx,css}`           |
| `apps/client/src/modules/cost/tabs/QuoteHistory.{jsx,css}`    | `domains/sales/client/quote-history/*`                    |
| `apps/client/src/modules/cost/tabs/QuoteAnalysis.{jsx,css}`   | `domains/sales/client/quote-analysis/*`                   |
| `apps/client/src/modules/cost/tabs/FormalQuotation.{jsx,css}` | `domains/sales/client/formal-quotation/*`                 |
| `apps/client/src/components/Shared/QuoteVersionDiff.jsx`      | `domains/sales/client/quote-history/QuoteVersionDiff.jsx` |
| `apps/client/src/components/Shared/RfqInfoCard.jsx`           | `domains/sales/client/rfq/RfqInfoCard.jsx`                |
| `apps/client/src/components/Shared/CostSummaryBar.jsx`        | `domains/sales/client/quote-analysis/CostSummaryBar.jsx`  |

### 3.5 Quality (QM)

| v1.2                                                         | v1.3                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `apps/client/src/modules/cost/tabs/SampleTracking.{jsx,css}` | `domains/quality/client/sample-tracking/*`                      |
| `apps/client/src/modules/cost/tabs/TrackerLegendModal.jsx`   | `domains/quality/client/sample-tracking/TrackerLegendModal.jsx` |

### 3.6 Security (SU)

| v1.2                                                            | v1.3                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/client/src/modules/cost/tabs/PermissionGroupsSection.jsx` | `domains/security/client/permissions/PermissionGroupsSection.jsx` |
| `apps/client/src/modules/cost/tabs/PendingApprovalsInbox.jsx`   | `domains/security/client/approvals/PendingApprovalsInbox.jsx`     |
| `apps/client/src/components/Shared/Approval*.jsx`               | `domains/security/client/approvals/*`                             |
| `apps/server/repositories/approvalWorkflow.js`                  | `domains/security/server/repositories/approvalWorkflow.js`        |
| `apps/server/services/permissionService.js`                     | `domains/security/server/services/permissionService.js`           |

### 3.7 Basis (BC)

| v1.2                                                                                                      | v1.3                                                  |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/client/src/modules/cost/tabs/Settings.{jsx,css}`                                                    | `domains/basis/client/settings/*`                     |
| `apps/client/src/modules/cost/tabs/AdminMetrics.{jsx,css,helpers.js,test.js}`                             | `domains/basis/client/admin-metrics/*`                |
| `apps/client/src/modules/cost/tabs/Dashboard.jsx`                                                         | `domains/basis/client/dashboard/Dashboard.jsx`        |
| `apps/client/src/modules/cost/tabs/AboutSection.{jsx,css}`                                                | `domains/basis/client/about/*`                        |
| `apps/client/src/modules/cost/tabs/ImportLegacySection.{jsx,css}`                                         | `domains/basis/client/import/*`                       |
| `apps/client/src/modules/cost/tabs/Summarize.{jsx,css}`                                                   | `domains/basis/client/summarize/*`                    |
| `apps/client/src/modules/cost/tabs/Messages/*`                                                            | `domains/basis/client/messages/*`                     |
| `apps/server/routes/import.js` + `importWizard.js`                                                        | `domains/basis/server/routes/import.js`               |
| `apps/server/services/importParse.js` + `importPipeline.js` + `importTypeCoerce.js` + `importDatasets.js` | `domains/basis/server/services/import/*`              |
| `apps/server/services/backupScheduler.js`                                                                 | `domains/basis/server/services/backupScheduler.js`    |
| `apps/server/services/notifications.js`                                                                   | `domains/basis/server/services/notifications.js`      |
| `apps/server/services/eventBus.js` + `chatBus.js`                                                         | `domains/basis/server/services/eventBus.js`           |
| `apps/server/repositories/dashboardStats.js`                                                              | `domains/basis/server/repositories/dashboardStats.js` |
| `apps/server/repositories/chatStore.js` + `routes/chat.js`                                                | `domains/basis/server/{services,routes}/chat*`        |
| `apps/client/src/components/Chat/*`                                                                       | `domains/basis/client/chat/*`                         |

### 3.8 MES

| v1.2                                                              | v1.3                                     |
| ----------------------------------------------------------------- | ---------------------------------------- |
| `apps/client/src/modules/cost/tabs/IFSInventory.{jsx,css}`        | `domains/mes/client/ifs-inventory/*`     |
| `apps/client/src/modules/cost/tabs/MachineTechnicalTab.{jsx,css}` | `domains/mes/client/machine-technical/*` |
| `apps/client/src/modules/cost/tabs/HardwareSection.{jsx,css}`     | `domains/mes/client/hardware/*`          |
| `apps/client/src/modules/cost/tabs/ModeSection.{jsx,css}`         | `domains/mes/client/mode/*`              |

## 4. Help & user docs

| v1.2                             | v1.3                                |
| -------------------------------- | ----------------------------------- |
| `apps/client/src/modules/help/*` | `apps/client/src/help/*` (UI shell) |
| `apps/client/src/help/*`         | `docs/user-guide/in-app/*`          |
| `apps/client/public/help/*`      | `apps/client/public/help/*`         |
| `docs/user-guide/*.docx,xlsx`    | `docs/user-guide/training/*`        |

## 5. Scripts

Split by purpose. Tests stay next to the script.

| v1.2 (`scripts/...`)                                                                                                                                                              | v1.3                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `build-desktop.sh`, `build-mac-installers.mjs`, `build-windows-installers.mjs`, `build-bytecode.js`, `patch-pdfjs-worker.mjs`, `sign-macos.sh`, `sign-windows.ps1`, `release.sh`  | `scripts/build/`      |
| `backup-offsite.sh`, `verify-backup.js`, `setup-https-caddy.sh`, `recover-sys-user.js`, `reset-totp.js`, `rotate-totp-key.js`, `cleanup-legacy-passwords*.js`, `smoke-runtime.sh` | `apps/scripts/ops/`   |
| `migrate-planning-data.js` (referenced from package.json), `migrate-quote-va*.js`, `migrate-to-sqlite.js`, `backfill-audit-log.js`, `backfill-quote-results*.js`                  | `scripts/migrations/` |
| `verify-install*.js`, `preflight-env.js`, `check-perf-budget*.js`, `verify-parity.js`, `build-training-guide.js`, `help/*`                                                        | `scripts/dev/`        |

## 6. Documentation

| v1.2                                      | v1.3                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `CLAUDE.md` (35K, mixed concerns)         | `CLAUDE.md` (entry-point only) + `docs/adr/*` for decisions + `docs/runbooks/*` for ops |
| `DESIGN.md`                               | `docs/architecture/design-system.md`                                                    |
| `MAINTAINERS.md`                          | `docs/runbooks/maintainers.md`                                                          |
| `SOLUTION_v1.2.md`                        | `docs/plans/sprints/v1.2-solution-baseline.md`                                          |
| `CHANGELOG.md`                            | `CHANGELOG.md` (kept at root)                                                           |
| `docs/quality/audit/2026-04-17/*`         | `docs/plans/sprints/2026-04-17-audit/*`                                                 |
| `docs/plans/sprints/*`                    | `docs/plans/sprints/*` (verbatim)                                                       |
| `docs/operations/DESKTOP_DEPLOYMENT.md`   | `docs/runbooks/desktop-deployment.md`                                                   |
| `docs/operations/ENTERPRISE_HARDENING.md` | `docs/runbooks/enterprise-hardening.md`                                                 |
| `docs/operations/GO_LIVE_GUIDE.md`        | `docs/runbooks/go-live.md`                                                              |
| `docs/operations/GO_LIVE_READINESS.md`    | `docs/runbooks/go-live-readiness.md`                                                    |
| `docs/operations/INTERNAL_TRUST_SETUP.md` | `docs/runbooks/internal-trust-setup.md`                                                 |
| `docs/LAN_*.md`                           | `docs/runbooks/lan-*.md`                                                                |

## 7. Infra & deploy

| v1.2                                      | v1.3                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `deploy.sh` / `deploy.ps1` / `deploy.bat` | `infra/deploy/`                                                                   |
| `INSTALL.command`                         | `infra/deploy/install.command`                                                    |
| `START_SERVER.{bat,command}`              | `infra/deploy/start-server.*`                                                     |
| `apps/desktop/` electron-builder configs  | Alongside `apps/desktop/` + `infra/installers/` for shared entitlements / signing |

## 8. Test housing

| v1.2                            | v1.3                                                                        |
| ------------------------------- | --------------------------------------------------------------------------- |
| `apps/server/**/*.test.js`      | Stays adjacent to source — but source moved per tables 1–3, so tests follow |
| `apps/scripts/**/*.test.js`     | `apps/scripts/**/*.test.js` (stays adjacent)                                |
| (no e2e in v1.2)                | `tests/e2e/` — new in v1.3                                                  |
| `scripts/check-perf-budget*.js` | `scripts/dev/check-perf-budget.js` + `tests/perf/budget.test.js`            |

## 9. Migration sequencing

The full move is staged across sprints (see `docs/plans/sprints/v1.3-migration-plan.md`):

1. **Sprint 1.3.0** — Skeleton + AI config + docs (this PR)
2. **Sprint 1.3.1** — Platform layer first (auth, http, storage, observability)
3. **Sprint 1.3.2** — Library + Costing (the largest consumers of platform)
4. **Sprint 1.3.3** — Planning + Sales + Quality
5. **Sprint 1.3.4** — Security + Basis (touches every domain — last)
6. **Sprint 1.3.5** — MES + cleanup + lint enforcement (`eslint-plugin-boundaries`)
7. **Sprint 1.3.6** — Cut v1.3.0 release; archive v1.2 with a freeze tag

During the migration, **v1.2 is the source of truth**. v1.3 is built up file-by-file; only when
all domains are ported and CI is green does v1.3 take over.
