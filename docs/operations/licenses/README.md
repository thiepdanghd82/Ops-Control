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
  only proves "the prod key signed this file" and is not forgeable without
  the **private** key.
- The signing **private** key is NOT in the repo. As of the 2026-06-04
  rotation it lives OFFLINE only (`~/OpsControl-license-keys/prod-private.pem`
  on the license admin's box). Only the **public** key is embedded in
  `desktop/license.js` + `server/services/licenseService.js`. Cloning the
  repo therefore does NOT let anyone forge licenses.
- See "Production key rotation" below for the rotation record.

## Mint a license for a new operator

```bash
# Operator runs the installer + sees "License không hợp lệ:
# installation-mismatch" dialog. They click "Copy Installation ID"
# and send the 64-char hex value to Lead (via Zalo / email / SSH).

# Lead runs on the box that holds the OFFLINE private key. --key is
# REQUIRED (no in-repo default since the 2026-06-04 rotation):
node scripts/license/generate-license.mjs \
  --installation-id <hex64 from operator> \
  --customer "CCL Design Vietnam — Yen Phong" \
  --tier M \
  --expires <YYYY-MM-DD, ~1 year out> \
  --key ~/OpsControl-license-keys/prod-private.pem \
  --out ~/OpsControl-license-keys/<YYYY-MM-DD>-<platform>-<operator>.json
# NOTE: write the signed --out file OUTSIDE the repo (it carries a real
# signature). Commit only the metadata-only registry entry per Storage policy.

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
| 2026-05-29 (re-issued 2026-06-04, key rotation) | Win | `mpham` | `d550d6b9 2e78bc9f…` | 2027-06-09 | [2026-05-29-win-mpham.json](2026-05-29-win-mpham.json) |

Append a row whenever a new license is minted. Keep the rows sorted by
date ascending so the registry reads as a chronological provisioning log.

## Production key rotation — DONE 2026-06-04

The old keypair was a **dev key whose private half had been committed to
this public repo**, so it had to be treated as permanently disclosed:
anyone with a clone could mint forged licenses. Rotation closed that hole.

What was done (branch `fix/license-key-rotation`):

1. Generated a fresh offline Ed25519 keypair — label `prod`, public
   SHA-256 fingerprint `044e1ad7d194154158183f409ec5dbb820a31093fc6076ce988f92ccf58cd36f`.
   Private key lives ONLY at `~/OpsControl-license-keys/prod-private.pem`
   (chmod 600, outside the repo, not in any cloud-sync zone).
2. Embedded the new **public** key in both verifiers
   (`desktop/license.js` + `server/services/licenseService.js`) and
   `git rm`'d the old `scripts/license/dev-{private,public}.pem`.
3. `generate-license.mjs` now REQUIRES `--key <offline-private-key>`
   (no in-repo default). Tests sign with runtime-ephemeral keypairs.
4. Re-minted every live license under the new key + rebuilt/redistributed
   the SERVER/CLIENT installers shipping the new pubkey. Old-key licenses
   no longer verify.

**Storage policy for the new key:** the private key never leaves
`~/OpsControl-license-keys/`; record its location + the public fingerprint
out-of-band (not in this repo). To rotate again, repeat with a new label
(`node scripts/license/generate-keypair.mjs prod-2027 --out-dir ~/OpsControl-license-keys`).
Because the old private key is public forever, rotation — not redaction —
is the only thing that invalidates it.

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
