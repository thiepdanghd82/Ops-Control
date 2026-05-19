# Risk Register — Quote Export UAT

Three risks identified at MVP-2 close that fall outside the automated test
boundary. Each captures probability + impact + mitigation. The UAT
session is the first chance to confirm or refute them with real
hardware + real customers.

Severity scoring:

- **Probability**: Low / Medium / High (qualitative — engineer's gut against the codebase + Lesson log)
- **Impact**: Low (cosmetic) / Medium (operator workaround needed) / High (blocks customer-share until fix)

---

## R1 — Sheet-protection UX inconsistent between Mac Excel and Windows Excel

### Probability

**Medium.** ExcelJS's `sheet.protect(password, opts)` writes the `sheetProtection` XML element with options matching the legacy XOR cipher. The cipher is widely supported, but the _user-visible behaviour when an edit is attempted_ varies subtly across Office build channels (Mac 16.x vs Windows 365 vs LTSC).

### Impact

**Medium.** If the dialog wording on one platform implies the file is corrupted (vs. simply "protected"), customers may panic or refuse to open. The file is fine — the UX signal is the risk.

### Mitigation

1. SCN3 of [uat-export-flow.md](uat-export-flow.md) explicitly tests Mac + Windows + LibreOffice in sequence — surfaces drift immediately.
2. **Pre-customer-send rule**: send via the same platform family as the customer where possible (Vietnamese customers overwhelmingly Windows → operator-side test on Windows is the load-bearing one).
3. If a platform shows unacceptable wording, document under MES-3-FIX-<n> and warn the operator to send a one-line note alongside the file ("This file is read-only by design — to make edits, please ask us for a revision").
4. **Watch for**: Excel's "Protected View" yellow banner. That's a SmartScreen / origin warning, NOT a sheet-protection thing. If it appears it means the file was downloaded from an untrusted zone — fix is server-side `Content-Type` + signed download, NOT in MVP-2 scope.

### Pre-existing context

- ExcelJS does NOT support workbook-level open-password (Microsoft compound document format) per CLAUDE.md MVP-2 sprint note. So "the open-password dialog never appears" is by design, not a defect.
- Per-export password is random 16-byte hex; raw value discarded post-stamp; only sha256(password) in audit log. Operator CANNOT recover the raw password to share with the customer. This is intentional tamper-resistance, not a missing feature.

---

## R2 — Watermark fidelity drift on LibreOffice / Numbers

### Probability

**Medium-High.** ARGB fill `FFF5E0E0` is a non-standard pastel pink. Excel renders it correctly. LibreOffice Calc 7.6+ typically renders Office ARGB faithfully, but pre-7.4 versions may darken or shift hue. Numbers iOS is the wild card — historical Numbers releases have flattened pattern fills to solid + adjusted hue toward the system palette.

The text styling (dark-red, bold, italic) is more portable than the fill colour.

### Impact

**Low-Medium.** The watermark is a visual cue, not a security feature. If LibreOffice renders the cell as light-grey instead of pink-grey, the message "CUSTOMER COPY" still reads — semantic intent preserved. If Numbers flattens to white background, the text is still legible. The risk degrades to "weak signal" rather than "broken signal".

The defence-in-depth gradient is:

1. AA1 cell text "CUSTOMER COPY" (most portable — survives across all spreadsheet apps)
2. Bold + italic styling (very portable)
3. Dark-red foreground colour (portable; may shift exact hue)
4. Pink-grey fill (least portable; first to drift)

### Mitigation

1. SCN4 captures fidelity per renderer with screenshots — documents drift rather than fixing.
2. If LibreOffice drift unacceptable, consider follow-up MES-3-FIX to add a second watermark via Excel's actual `header/footer` mechanism (cross-renderer-strong) in MVP-2.1. Out of UAT scope.
3. **Pre-customer-send rule**: assume the customer opens in Excel for Windows. If they're known to be on LibreOffice or Numbers, attach a PDF render of the cover page as a second confirmation that they have the customer variant.

### Pre-existing context

- Watermark lives only at AA1 (col 27 = "AA") to clear the widest banner span (col S = 19, Processes sheet). No collision risk with merged cells.
- `_Audit` + `_Schema` (hidden sheets) explicitly NOT watermarked — surfacing them via Format → Unhide and finding no watermark is a passing test, not a bug.

---

## R3 — HMAC verification fails on prod due to `.env` key drift

### Probability

**Low.** Sprint S-EXPORT-MVP-2 + Sprint 11 P2-1 deploy scripts (`deploy.sh` + `deploy.ps1`) explicitly merge prod `.env` rather than clobber, and preserve `OPS_EXPORT_HMAC_KEY` alongside `OPS_TOTP_KEY` + `OPS_KIOSK_KEY`. Preflight (`npm run preflight`) refuses to boot if missing or shape-invalid.

But: this UAT is the first time the prod env-key path is exercised. Two known vectors that COULD bite:

- Operator-initiated `.env` edit (someone "tidies up" the file)
- Deploy from a fresh dev machine where the source `.env.example` has a placeholder

### Impact

**High.** If verify fails, EVERY xlsx in the field becomes untrustable. Recovery playbook in CLAUDE.md (Section "OPS_EXPORT_HMAC_KEY lost or rotated mid-cycle") covers this:

- Files issued pre-loss STILL OPEN + READ FINE (visible sheets unencrypted; XOR sheet-protect uses random password embedded in xlsx, independent of HMAC key)
- MVP-3 re-import will REFUSE pre-loss exports — operator must re-export from source quote
- Audit log forensic trace intact (sha256 of payload + per-tier `tier_audit[]` rows)

So R3 doesn't break the UAT — but discovering a key-mismatch mid-UAT undermines confidence in MVP-2 generally and forces a key-rotation runbook execution.

### Mitigation

1. SCN5 of [uat-export-flow.md](uat-export-flow.md) is a server-admin sub-task that round-trips one fresh export through `verify.js` BEFORE the operator starts the customer-facing scenarios. If it fails, halt and run the recovery playbook before continuing.
2. Capture the prod `OPS_EXPORT_HMAC_KEY` fingerprint (first 8 chars of sha256 of the key value, NOT the key itself) into the UAT report so future audits can cross-check.
3. After UAT, store one signed-and-verified xlsx in `/4. CLAUDE OUTPUT/uat-2026-XX-XX/golden.xlsx` as a forever-reference sample for catching future key drift.

### Pre-existing context

- `OPS_EXPORT_HMAC_KEY` must be 64 hex chars per `scripts/preflight-env.js`.
- HMAC is over the DECODED payload BUFFER, not the base64 string, so the signature is invariant under base64 alphabet drift (theoretical concern; in practice Node + Excel produce identical b64 — kept in the contract for cleanliness).
- Symmetric HMAC chosen over Ed25519 because we're proving "came from THIS server install", not building a multi-party trust chain. Same box signs + verifies.

---

## Risks NOT in this register (and why)

- **Re-import / round-trip fidelity** — MVP-3 scope; not yet built.
- **Customer-supplied filename clashes** — server sanitize() strips diacritics + special chars; ASCII-only filenames; verified MVP-1.
- **CSRF bypass on export endpoint** — defence-in-depth at multiple layers (CSRF token + `requireTabAccess('quote-history')` + auth middleware); covered by existing server tests.
- **Audit log spam** — every export adds one row; current quote volume <100/day; no growth concern at current scale. Re-evaluate at 1k/day.
- **Large-quote performance** — covered by SCN6 in the UAT flow.

## Risks to escalate to MVP-3 scope discussion

(Updated as UAT runs; intentionally empty at framework-creation time)

- (none yet)
