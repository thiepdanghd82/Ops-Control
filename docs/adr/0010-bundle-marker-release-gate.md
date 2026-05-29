# ADR-0010 — Bundle marker as release gate

**Status:** Accepted (v1.3 K3, 2026-04-29)
**Deciders:** v1.3 Senior Architect persona
**Context:** Builds on ADR-0008 (extract-first), ADR-0009 (dual-mount), and the v1.3 F4/G5 bundle marker work.
**Supersedes:** none

---

## Context

A signed CCL Vietnam customer install is supposed to:

1. Boot from a known-good electron-builder DMG.
2. Verify its embedded license against the public key baked into the
   binary.
3. Be **the same code** that passed CI and that the operator
   downloaded — no swap-in-flight, no re-pack, no "hot patch".

We have license verification (Ed25519, ADR-0003). What we DIDN'T
have until F4 was a way to prove the BINARY ITSELF is the one CI
produced. The bundle marker (Vite-injected literal string) closes
that gap, but only if it's actually checked at the right moments.

This ADR codifies WHEN the marker check is mandatory and WHO is on
the hook to run it.

## Decision

The bundle marker (`opsctl-v1.3-marker:<build-id>:<iso-ts>`) IS a
release gate. A DMG without a verifiable matching marker MUST NOT
be:

1. Tagged as a release in git.
2. Posted to the customer download page.
3. Listed in `RELEASE_NOTES_v1.3.md` or `dist/checksums.txt`.
4. Installed on a CCL Vietnam plant production machine.

### Build-time invariants

| Stage          | Required                                                                                                           | Where enforced                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Vite build     | `OPS_BUILD_ID` env set, embedded into chunk via `define.__OPS_BUNDLE_MARKER__`                                     | `client/vite.config.js`                         |
| Local dev      | Fallback to `local`-tagged marker so dev boot doesn't crash                                                        | same                                            |
| CI build       | `OPS_BUILD_ID=<ref>-<sha>`, post-build grep verifies presence + match                                              | `.github/workflows/ci.yml` build job (G5)       |
| CI release     | `scripts/verify-bundle-marker.sh` runs against the DMG, fails the job if marker missing or build-id mismatch       | `.github/workflows/ci.yml` build-installers job |
| Manual release | Engineer runs `bash scripts/verify-bundle-marker.sh dist/<dmg> <expected-build-id>` for each DMG before publishing | release runbook                                 |

### Customer-side invariants

We do NOT ask customers to verify the marker (they can't be expected
to run a bash script). The marker is a chain-of-custody mechanism:

- CCL HQ verifies before publishing → checksum is in
  `dist/checksums.txt` → customer verifies SHA-256 of the DMG they
  downloaded matches the checksum.

If the SHA-256 matches, the marker matches by construction (the
marker is part of the bytes covered by the hash).

### Marker rotation

The marker is regenerated EVERY build (timestamp changes). Two
DMGs from the same source commit but different build runs will
have DIFFERENT markers — that's intentional. When the build-id is
the FULL `<ref>-<sha>` string (CI default), two CI runs at the same
sha produce different timestamps but the same prefix; verifier
matches on the prefix portion only.

`grep -q ":$EXPECTED:"` in `verify-bundle-marker.sh` does this —
it looks for `<expected-build-id>:` in the marker, ignoring the
trailing timestamp. Safe because the build-id portion is what
identifies the COMMIT, not the build run.

## Consequences

### Positive

- **Supply-chain swap detected.** A DMG whose bytes have been
  modified post-build will fail SHA-256 check, and even if the
  attacker fixed the SHA, the marker grep will surface that the
  marker chunk is gone (Vite chunks have hashes in filenames; the
  attacker would have to also fix every reference).
- **CI is a hard gate, not a recommendation.** Engineers can't
  ship a tag without the verify job passing — same shape as the
  vuln gate (`npm audit --audit-level=high`).
- **Forensic value.** Operators reporting a bug can copy
  `window.__OPS_BUNDLE_MARKER__` from devtools console; that
  uniquely identifies the source commit + build timestamp without
  any backend lookup.

### Negative

- **Build determinism not guaranteed.** Two CI runs at the same
  commit produce DIFFERENT markers (different timestamps), so we
  can't check "is THIS DMG the EXACT one CI produced 5 minutes
  ago?" — only "is this DMG from THIS commit?". For most attack
  models that's enough.
- **Build-id is operator-readable.** The marker contains the git
  ref + sha. An attacker reading the DMG learns the source commit;
  not a problem because the source code is internal to CCL but
  not secret-by-design.
- **Marker chunk size.** Adds ~80 bytes to the main chunk. Trivial.

### Reversal cost

Trivial. Remove the `define` block from `vite.config.js` + the
console.info call from `main.jsx`. CI verify steps would then
fail-soft (no marker = no match), so also remove those steps.
Restoring is the reverse.

## Alternatives considered

### Code-signing certificate as the single source of truth

Rejected for v1.3.0. We don't have a Developer ID Application
certificate in the build pipeline yet (see DMG build output:
"skipped macOS application code signing — cannot find valid
identity"). Until that's set up, customer can't tell signed from
unsigned just from the OS prompt. The marker bridges that gap.

When code-signing IS in place: marker becomes a defense-in-depth
layer (signed AND has marker = chain of custody confirmed). ADR
revisited then.

### Hashing the entire dist/ tree

Rejected. SHA-256 already covers that — it's already in
`dist/checksums.txt`. The marker is for a DIFFERENT question:
"is this binary from the source commit I claim?" — not "are these
bytes intact?". Different questions, different mechanisms.

### Embedding via electron-builder `extraMetadata`

Rejected. extraMetadata writes to the .app's `Info.plist`, which
is outside the JS chunk hash chain. Easier to swap. Vite-define
puts the literal INSIDE the JS chunk, which has Vite's content
hash in its filename — tampering breaks the filename match too.

## Operational checklist

When cutting a new release:

```
1. Confirm release/v1.3 HEAD is the commit you want shipped.
2. BUILD_ID="v1.3.0-<rcN>-$(git rev-parse --short HEAD)"
   export OPS_BUILD_ID="$BUILD_ID"
3. cd client && npm run build
   # Verify locally:
   grep -o "opsctl-v1.3-marker:$BUILD_ID:" dist/assets/index-*.js | head -1
4. cd ../desktop && npx electron-builder --mac --arm64 ...
5. cd .. && bash scripts/verify-bundle-marker.sh \
     "desktop/dist-electron/OpsControl <ROLE>-1.2.0-<arch>.dmg" \
     "$BUILD_ID"
6. Stage to dist/, generate checksums:
     cd dist && shasum -a 256 *.dmg | tee checksums.txt
7. git tag -a v1.3.0-<rcN> -m "..."
8. CI verifies on push (build + build-installers jobs).
9. Publish only when ALL jobs green.
```

## References

- F4 — Vite define block + verify script
- G5 — CI bundle-marker verification step
- J6 — actual DMG build with verified markers (rc.2)
- `client/vite.config.js` — define block
- `scripts/verify-bundle-marker.sh` — post-build verifier
- `.github/workflows/ci.yml` — CI gate
- ADR-0003 — Ed25519 license signing (sibling integrity mechanism)
