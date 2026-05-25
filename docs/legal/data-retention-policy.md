# Data Retention Policy

> Retention schedule for Ops Control data per Vietnamese statutes.
>
> **Status**: DRAFT — pending legal counsel review. Production-applicable
> as good-faith compliance documentation; not legally binding.

## 1. Statutory Basis

| Data category              | Retention                           | Statute                           | Applies to                             |
| -------------------------- | ----------------------------------- | --------------------------------- | -------------------------------------- |
| Cost calculations + quotes | **10 years**                        | Law on Accounting Art. 41         | `quote_versions`, `quote_history.json` |
| Production records         | **5 years**                         | Civil Code Art. 608/2015          | `work_order`, `work_order_op`          |
| Personal data — employee   | Employment + 5 years                | Decree 13/2023 Art. 17            | `users.json`                           |
| Personal data — customer   | Until contract end + 5 years        | Decree 13/2023 Art. 17            | `state.end_cu`, `state.direct_cu`      |
| Audit log (action trail)   | 12 mo active + cold archive forever | Internal forensic requirement     | `audit_log.db`                         |
| Backup snapshots           | 30 days hot + 5 years cold          | Best practice + Art. 41 alignment | `server/data/Backup/`                  |

## 2. Current Implementation

| Mechanism                                      | Status                 | Gap                                                                                              |
| ---------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `OPS_BACKUP_RETENTION_DAYS=30` (hot)           | ✓ Configured           | Sufficient for operational rollback (24-720h window)                                             |
| `OPS_AUDIT_RETENTION=1` (daily scheduler)      | ✓ Configured           | Rotates audit_log to gzip monthly archives, 12 mo kept                                           |
| `OPS_OFFSITE_TARGET` (off-site backup)         | ✓ Configured           | Lead Engineer (sysadmin function) enables on D-8 per PROMPT 7 Part B                             |
| **Cold-archive media (LTO tape / S3 Glacier)** | ❌ **NOT PROVISIONED** | **Procurement required within 30 days post-go-live for 10-yr quote + 5-yr production retention** |

## 3. Cold-Archive Procurement Spec (post-go-live)

Recommended options (in priority order):

| Option                           | Cost (yr 1)            | Cost (yr 10)           | Pros                                      | Cons                                      |
| -------------------------------- | ---------------------- | ---------------------- | ----------------------------------------- | ----------------------------------------- |
| LTO-9 tape library               | $5K (drive + 10 tapes) | $7K (replace tapes 1×) | Air-gap; bit-rot resistant; one-time cost | Manual rotation; site-local               |
| Synology NAS + offline disk pull | $2K (NAS + 4× HDD)     | $4K (replace disks 2×) | Fast restore; trivial automation          | Not air-gapped; failure-prone HDDs        |
| Backblaze B2 (cloud cold tier)   | $60 (1 TB × 12 mo)     | $600                   | Off-site automatic; geo-redundant         | Cross-border data — MPS approval required |
| AWS S3 Glacier Deep Archive      | $1/mo per TB           | $120                   | Industry standard                         | Cross-border (US) — MPS approval required |

**Decision pending Plant Manager + Finance Lead**. Default recommendation = **LTO-9 tape library** (no cross-border issue + air-gap = ransomware-resistant + 1-time CapEx).

## 4. Quarterly Drill

- **Q1**: Restore most recent backup to staging box → verify integrity (`npm run verify-backup`)
- **Q2**: Pull 1 random tape/archive from cold storage → verify readability
- **Q3**: Calculate disk-fill projection vs `OPS_BACKUP_RETENTION_DAYS` — adjust if needed
- **Q4**: Review retention timeline for any data approaching statute end → flag for legal disposition

## 5. Legal Hold

If litigation or audit triggers a legal hold:

1. Plant Manager notifies Lead Engineer in writing
2. Lead Engineer sets `OPS_BACKUP_RETENTION_DAYS=99999` on prod
3. Mark affected data in `audit_log` via manual entry (`LEGAL_HOLD` event)
4. Block normal disposition until hold released

Operational backup + restore procedures referenced from `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` (Runbook A — software snapshot rollback) so legal-hold periods can be exercised without breaking the standard recovery flow.

---

**Document version**: 1.0 (2026-06-02, D-7 cutover hardening)
**Owner**: Lead Engineer + Plant Manager + Finance Lead (sign-off chain)
**Next review**: 2027-06-02 (annual) OR immediately upon any audit / litigation event
