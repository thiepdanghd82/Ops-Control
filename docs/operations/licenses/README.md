# Operator licenses — registry + mint workflow

Per-installation Ed25519 licenses for the CCL Vietnam Yen Phong deployment.
Each Ops Control install (Mac SERVER + Mac/Win CLIENTs) is HW-bound: the
runtime hashes a hardware fingerprint into a 64-hex-char **Installation
ID**, and the license file at `<userData>/license.json` must carry a
matching `installation_id` field signed by the corresponding private key.

Files in this directory are **metadata-only** registry entries — the
cryptographic `signature` is NOT committed (see "Storage policy" below).
Naming convention: `<YYYY-MM-DD>-<platform>-<operator>.json`.

## Storage policy

This is a **public** repo, so the registry stores **metadata only** —
enough for recovery / re-issue / audit (`installation_id`, `tier`,
`max_users`, `issued_at`, `expires_at`, `features`). Two fields are
sanitized:

- **`signature`** — redacted to `"REDACTED — stored offline, see registry
  README"`. The real Ed25519 signature is key material and never goes in a
  public repo.
- **`customer`** — recorded as a short internal code (e.g. `CCL-YP`) rather
  than the full account name.

The **full signed license file** (with the real `signature`) is kept
**OFFLINE** by the license admin — in the Lead Engineer's encrypted vault /
secure store. Its location is recorded out-of-band (never written into this
public repo, no personal machine paths in docs). To re-deliver or re-issue,
the admin pulls the full file from the offline store; the metadata here is
the input / cross-reference.

## Why we keep these in repo

- **Lost-license recovery** — operator loses local install (disk swap,
  re-imaging), we don't have to ask them to re-extract the Installation
  ID. We re-deliver from here.
- **Expiry re-issue** — when `expires_at` approaches, re-run the mint
  command with same `installation_id` + new expiry. Inputs are captured
  here.
- **Audit trail** — Lead can prove "this operator was provisioned on
  this date for this tier".

## Why this isn't a credentials leak

- Installation ID is HW-derived. Anyone cloning the repo can't use these
  licenses — their HW fingerprint won't match.
- The real Ed25519 signature is NOT in this repo (redacted per the Storage
  policy above; the full signed file lives offline). Even if it were, it
  only proves "the dev key signed this file" and is not forgeable without
  the **private** key.
- The dev **private** key (`scripts/license/dev-private.pem`) IS in
  repo too. That is intentional: paired with the in-repo dev pubkey
  embedded in `desktop/license.js`, dev builds are self-signing.
- For **production rotation**: see "Production key rotation" below.

## Mint a license for a new operator

```bash
# Operator runs the installer + sees "License không hợp lệ:
# installation-mismatch" dialog. They click "Copy Installation ID"
# and send the 64-char hex value to Lead (via Zalo / email / SSH).

# Lead runs on the dev box:
node scripts/license/generate-license.mjs \
  --installation-id <hex64 from operator> \
  --customer "CCL Design Vietnam — Yen Phong" \
  --tier M \
  --expires <YYYY-MM-DD, ~1 year out> \
  --out docs/operations/licenses/<YYYY-MM-DD>-<platform>-<operator>.json

# Lead sends the resulting JSON to operator via Zalo.
# Operator places it at:
#   macOS: ~/Library/Application Support/ops-control-desktop/license.json
#   Win:   %APPDATA%\ops-control-desktop\license.json
# (Renaming to plain `license.json` is mandatory — app expects that name.)

# Operator quits + relaunches Ops Control. License dialog gone, normal
# login flow resumes.
```

### Tier reference

| Tier  | `max_users` | Use case                                    |
| ----- | ----------- | ------------------------------------------- |
| S     | 15          | Small site (≤10 operator headcount)         |
| **M** | **20**      | **Yen Phong default — 6 operator + buffer** |
| L     | 50          | Plant-scale deployment                      |

### Features bitmap

`--features` defaults to all 6: `costing,library,sales,planning,quality,mes`.
Trim only if commercially justified (per-tier upsell). Yen Phong = full
unlock.

## Registry — provisioned operators

| Date       | Platform | Operator (OS user) | Installation ID prefix | Expires    | File                                                   |
| ---------- | -------- | ------------------ | ---------------------- | ---------- | ------------------------------------------------------ |
| 2026-05-29 | Win      | `mpham`            | `d550d6b9 2e78bc9f…`   | 2027-06-09 | [2026-05-29-win-mpham.json](2026-05-29-win-mpham.json) |

Append a row whenever a new license is minted. Keep the rows sorted by
date ascending so the registry reads as a chronological provisioning log.

## Production key rotation (deferred to v1.6.x post-go-live)

Current state: **dev key in repo**. Acceptable for LAN-only D-0 go-live
because there's no external attack surface — anyone able to clone the
repo already has filesystem access to the deploy box and can do worse
things directly.

Long-term plan:

1. `node scripts/license/generate-keypair.mjs` on a clean offline
   workstation → produces a new keypair
2. Move the private key to an offline encrypted vault (1Password, YubiKey,
   air-gapped USB — whichever discipline anh wants to commit to)
3. Replace the public key embedded in `desktop/license.js` with the new
   public key
4. Rebuild + redistribute SERVER/CLIENT installers — old licenses become
   invalid against the new pubkey
5. Re-mint every license under the new key + redistribute via Zalo

Single coordinated reset, ~1 day of work + 1 hour operator downtime per
seat. Schedule when the v1.5.x line is stable + before adding any
external user.

## Troubleshooting

### "installation-mismatch" recurring after license placed

The operator's HW fingerprint may have changed between the time they
copied the Installation ID and the time they pasted the license. Causes:

- Win 11 reset / large hardware swap (rare — fingerprint is meant to be
  stable across normal updates)
- Different OS user account on same machine (fingerprint hashes per-user
  context on some platforms)
- WSL vs native install on Windows (different namespaces)

Fix: ask operator to **re-open the error dialog**, click **Copy
Installation ID** again, send the NEW value to Lead. Mint a fresh
license against the new ID.

### "License expired" close to expiry date

The license file's `expires_at` is hard-checked at app boot. Operator
sees "License không hợp lệ: expired". Mint a new one with same
Installation ID + new expiry; replace the file. No reinstall needed.

### "Bad signature"

Either: (a) license file got corrupted in transit (Zalo image
re-encoding, copy-paste truncation), or (b) the pubkey embedded in the
installed CLIENT/SERVER doesn't match the privkey used to sign. (b) only
happens during a botched key rotation — see "Production key rotation"
above for the coordinated reset procedure.
