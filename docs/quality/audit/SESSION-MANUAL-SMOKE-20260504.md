# Manual Smoke Session — 2026-05-04

## Scope

Path B web client validation cho Phase A v2 deploy readiness.
Mac at home WiFi 192.168.1.17, Windows cross-machine same network.

## Outcomes

- 7 fixes shipped (4 BLOCKER, 1 MAJOR, 2 MINOR)
- 1647 tests pass, 0 regression
- B1/B2 WIP intact (32 files unstaged)
- 🟢 GO verdict for v1.5.1 prod deploy

## Commits

```
3fcc74f F-UI-2 useI18n destructure
cc0d1c6 F-UI-3 perm matrix scope
991c40a F-VERIFY-1 version 1.5.1
e38e1fa F-BOOT-3 pathToFileURL
f9156a0 F-BOOT-4 fu csp directives
b7663ee F-BOOT-4 hsts gate
f9c4b12 F-BOOT-2 eager initSchema
```

## Deploy caveats (next session)

1. Set OPS_TOTP_KEY mới trong prod .env
2. Set OPS_ALLOW_SAME_ORIGIN=1 cho HTTP deploy
3. Run setup wizard on prod first-boot
4. Document concurrent-session policy F-SEC-OBS-1 cho ops team

## Backlog (don't block ship)

- A.2-FU-1: ConnectionInfoSection unit tests
- F-UI-1: Disambiguate 2 "Connection" UIs in Settings
- F-A3-1: Update playbook null-id behavior doc
- F-SEC-OBS-1: Product decision concurrent-session
- F0-2: client/desktop package.json drift

## Recovery anchors intact

- B1/B2 WIP 32 files unstaged
- wip-snapshot-20260504-082812 git tag
- pre-sidebar-revert-20260504-090729 git tag
- /tmp/wip-backup-20260504-082812.tar.gz

## Next session prep

- Fresh state morning
- VPN connect to CCL VPN if deploying remote
- Read deploy.ps1 trước khi run
- Have STEP-G checklist ready
