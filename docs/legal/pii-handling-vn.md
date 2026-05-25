# PII Handling Policy — VN Decree 13/2023 Compliance

> Inventory of personally-identifiable information (PII) in Ops Control + handling
> rules per Decree 13/2023 on Personal Data Protection (effective 2023-07-01).
>
> **Status**: DRAFT — pending legal counsel review. Production-applicable
> as good-faith compliance documentation; not legally binding.

## 1. PII Inventory

| Field path               | Storage                                              | Decree 13 category                                          | Retention                       | Access                    |
| ------------------------ | ---------------------------------------------------- | ----------------------------------------------------------- | ------------------------------- | ------------------------- |
| `quote.state.end_cu`     | `quote_history.json` + SQLite `quote_versions.state` | Basic personal data (customer name, organization name)      | 10 yr (Law on Acc. Art. 41)     | Sales + Leader perm group |
| `quote.state.direct_cu`  | (same)                                               | Basic (direct contact name)                                 | 10 yr                           | Sales + Leader            |
| `quote.state.npi_owner`  | (same)                                               | Basic (employee assignment)                                 | 10 yr                           | Internal-only             |
| `quote.state.sale_owner` | (same)                                               | Basic (employee assignment)                                 | 10 yr                           | Internal-only             |
| `users.json.username`    | `server/data/Library/Users/users.json`               | Basic (employee identifier)                                 | Employment + 5 yr               | `sys` role only           |
| `audit_log.user`         | `server/data/audit_log.db`                           | Basic (action trail)                                        | 12 mo rotation (S-AUDIT-RETENT) | Read-only via `sys` role  |
| `totp_secrets.enc`       | `server/data/Library/Users/totp_secrets.*`           | Sensitive (auth credentials, encrypted with `OPS_TOTP_KEY`) | Employment + 5 yr               | NEVER read in plaintext   |

No biometric, health, racial, religious, political-opinion, or other "sensitive personal data" per Decree 13 Art. 3.

## 2. Storage Location + Access Controls

- **All PII storage**: factory LAN at Yen Phong. NO data leaves Vietnam.
- **File system mode**: `chmod 600` enforced on `users.json`, `totp_secrets.*`, `.env`, `ops.db`.
- **Network access**: factory LAN-only (no public internet exposure). Firewall ACL limits ingress to operator subnet.
- **Application access**: 3-layer permission model (role + department + permission_group_id) per `server/services/permissionService.js`.
- **Audit logging**: every PII read/write recorded in `audit_log.db` (12-mo active + cold archive per retention policy).

## 3. Data Subject Rights (Decree 13 Art. 9-15)

| Right                 | Implementation                                                                     |
| --------------------- | ---------------------------------------------------------------------------------- |
| Access                | Data subject requests export → Sales Lead generates CSV via Quote History filter   |
| Correction            | Standard quote-edit flow with audit emit (`QUOTE_SAVE` event, see PR #70)          |
| Deletion              | Soft-delete via Trash UI (Sprint 13 deliverable); hard-delete on legal-hold expiry |
| Portability           | xlsx export already provides this (PR #58 multi-tier export)                       |
| Withdrawal of consent | N/A — processing basis is contract (Art. 17.1 b), not consent                      |

## 4. Data Subject Contact

**Designated PII contact at CCL Vietnam**:

- **Name**: <to be assigned by Plant Manager>
- **Email**: <TBD@ccldesignvn.com>
- **Phone**: <TBD>
- **Response SLA**: 30 days per Decree 13 Art. 19

**Internal escalation chain**:

1. PII contact (above)
2. Plant Manager
3. Legal counsel (external retainer)
4. Ministry of Public Security (MPS) for breach notification

## 5. Cross-Border Transfer

Per Decree 13 Art. 25: any cross-border transfer requires impact assessment + MPS notification.

**Current status**: NO cross-border transfer.

- Ops Control runs on-prem (Yen Phong factory LAN)
- Backups archive LOCALLY (USB or NAS, factory premises)
- No cloud APIs, no analytics SDKs, no telemetry, no third-party processors
- xlsx exports sent to customers via email are NOT considered transfers (customer is the data controller for their own data)

If cross-border ever becomes required (e.g. parent-company HQ access, SaaS migration), this section MUST be updated + MPS impact assessment filed BEFORE go-live.

## 6. Breach Notification

Per Decree 13 Art. 23: any incident risking PII confidentiality must be notified to MPS within 72 hours.

**Detection sources**:

- `audit_log` anomalous read patterns (e.g. bulk PII export by single user)
- Failed login lockouts (`LOGIN_LOCKED` events) — indicates credential-stuffing attempt
- Unauthorized file system access (host OS audit log)

**Notification path**:

1. Detect → engineer triages within 4 hours
2. Confirm PII exposure → notify Plant Manager + legal counsel
3. Plant Manager files MPS notification within 72-hour window
4. Lead Engineer (= sysadmin function) writes incident report; Backup Engineer (Hương) co-signs if she was incident first-responder → `docs/incidents/YYYY-MM-DD-<short-title>.md`

Reference: `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` §B.7-B.8 (operational communication during outage).

## 7. Compliance Verification (annual)

- **Q1**: Sample 10 random audit_log entries → verify PII access matches business need
- **Q2**: Test breach notification path with simulated incident
- **Q3**: Review PII inventory for new fields (especially after major releases)
- **Q4**: Refresh data subject contact + retention reminders

---

**Document version**: 1.0 (2026-06-02, D-7 cutover hardening)
**Owner**: Lead Engineer (Đặng Thế Thiệp) + Plant Manager (sign-off)
**Next review**: 2027-06-02 (annual)
