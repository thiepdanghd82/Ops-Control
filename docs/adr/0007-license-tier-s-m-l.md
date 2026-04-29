# ADR-0007 — License tier model: S = 15, M = 20, L = 50 active users

**Status:** Accepted (autonomous v1.3 upgrade pass, 2026-04-29)
**Deciders:** Henry Đặng (NPI/Engineer Manager, CCL Vietnam) · v1.3 Senior Architect persona
**Consulted:** IMPROVEMENT_BRIEF.md §4.5 (customer-supplied requirement)
**Supersedes:** none
**Superseded by:** none

---

## Context

CCL Design Vietnam needs to monetise on-prem Ops Control deployments
across multiple plant sizes without adopting a SaaS billing stack
(no Stripe/internet-required activation, plant LANs may be air-gapped).
The customer-facing pitch was set at three tiers in the improvement
brief — **S = 15, M = 20, L = 50** active users — and we need to:

1. Enforce the seat cap so customers cannot exceed their tier without
   re-licensing (drives upgrade revenue).
2. Make the cap operationally tolerable: hitting it must NOT lock out
   existing users or block sys recovery.
3. Verify licenses offline (no phone-home), but make compromise of one
   install useless against other customers (asymmetric crypto).

## Decision

### Tier table

| Tier | Active users | Use case |
|---|---|---|
| **S** | 15 | Single-shift plant, ~1 supervisor + ~12 operators + 2 admin |
| **M** | 20 | Two-shift plant, +5 cross-shift seats |
| **L** | 50 | Multi-site or multi-line plant, includes QC + planning teams |

`max_users` baked into the license JSON exactly matches `TIER_LIMITS[tier]`;
mismatch (e.g. tier S claiming `max_users=50`) rejects with
`tier-mismatch` BEFORE signature verification.

### What counts as "active"

A user counts against the cap iff:

- `deleted_at IS NULL` (not soft-deleted), AND
- `role !== 'sys'` (sys recovery accounts are infrastructure, not users)

This means soft-deleting a user **immediately** frees a seat — no
"30-day reaping" rule. Sys recovery accounts NEVER consume a seat
(if they did, plants stuck above their cap couldn't run the recovery
script).

### Enforcement points

| Layer | Code | Behaviour |
|---|---|---|
| Server middleware | `requireSeatAvailable()` in `server/services/licenseService.js` | `POST /api/auth/users` returns 402 `LICENSE_LIMIT_EXCEEDED` when at cap |
| Server diagnostic | `GET /api/license/status` (admin/sys) | Reads tier + counts, exposes `seats_remaining` for admin UI |
| Client UX | (deferred to v1.3.1) | Disable the "Add user" button when status returns `seats_remaining === 0` |
| Bypass prevention | Server-only enforcement | Client UI changes don't allow more users; the curl path also fails |

### Why these specific numbers

- **15 / 20 / 50** match the brief verbatim. They are not derived from
  internal cost models — Henry set them based on plant headcount
  segmentation observed at CCL Vietnam (S = 1 plant we already have,
  M = the next tier of regional plants, L = HQ + multi-line plants).
- 5-seat gap between S and M is intentional: plants on S who hire
  one supervisor for the second shift hit the cap quickly and have a
  motive to upgrade.
- 30-seat gap between M and L lets large plants hire freely without
  hitting the next-tier wall on day one.
- We do NOT offer "unlimited" — every install must declare a tier
  so capacity planning + revenue forecasting is unambiguous.

### What does NOT vary by tier in v1.3

- All 8 SAP-domains accessible regardless of tier.
- All security features (audit, TOTP, lockout, permission groups).
- Bug fixes + critical updates.

In future, `features[]` array in the license payload could feature-flag
per tier (e.g. tier S excludes `mes/hardware`), but v1.3 ships all
tiers with `features = ['costing', 'library', 'sales', 'planning',
'quality', 'mes']`. ADR for any future feature-tiering must
explicitly supersede this section.

## Consequences

### Positive

- Single source of truth: `TIER_LIMITS` constant in
  `server/services/licenseService.js` and `desktop/license.js` —
  changing a number changes both server enforcement and client UI.
- Tier upgrade is a license re-issue, not a rebuild — operator
  installs the new license JSON, server caches invalidate on restart.
- Sys recovery never blocked by license — preserves the recovery path
  documented in `docs/SECURITY.md §1`.

### Negative

- The cap is enforced at create-user time, not at login — a tier S
  customer who has 16 users today (somehow) won't be able to add a
  17th, but their existing 16 keep logging in. Acceptable for v1.3;
  future v1.3.x can add a "license-overage" warning banner in the UI.
- License audit cadence: there is no automatic alarm when active_users
  approaches max_users. Operators will hit a hard wall instead of a
  soft warning. `GET /api/license/status` exposes `seats_remaining` so
  the admin UI CAN render a warning — out of scope for v1.3 and
  tracked in v1.3.1 backlog.
- License JSON is bound to `installation_id` (machine fingerprint) —
  hardware migration requires a new license. We accept the friction
  because it's the primary anti-piracy mechanism.

### Reversal cost

Low. To remove tier enforcement entirely:
1. Remove `requireSeatAvailable` from `POST /api/auth/users`.
2. Sign all customer licenses with `max_users` set to a large number.
3. Update CHANGELOG.md.

To split into more tiers (e.g. add tier XL = 100): trivial — extend
`TIER_LIMITS` and the license-issuer CLI; no client install changes
required if `features[]` stays unchanged.

## Alternatives considered

### Time-based licensing (no seat cap)

Rejected. Doesn't capture revenue scaling with plant size — a 50-user
plant pays the same as a 5-user plant. Henry's pricing model needs
seat-based scaling.

### Online activation (license server)

Rejected. CCL plants are LAN-deployed, sometimes air-gapped (regulatory
mandate at certain customers). Phone-home would lock out compliant
installs.

### Symmetric HMAC license keys (v1.2 baseline)

Rejected (superseded). Single embedded secret means leak from one
client install = forgery for ALL customers. v1.3 P1.3 replaced with
Ed25519 asymmetric — covered in ADR-0003 (existing).

### Time-bombed binaries (license expires by hard-coding date)

Rejected. Forces operator to update the binary annually; we want
license re-issue to be a JSON file swap, not a reinstall.

## Compliance + audit

- Every license issuance logged in `scripts/license/generate-license.mjs`
  output (CCL HQ side; not visible to customer).
- Every license verification logged via `audit('LICENSE_LOAD', ...)`
  on server boot (sys-only audit log).
- `LICENSE_LIMIT_EXCEEDED` returns trigger an audit row server-side
  so we can detect "operator tried to add user 16 on tier S" patterns.

## References

- `IMPROVEMENT_BRIEF.md` §4.5 — original customer requirement
- `server/services/licenseService.js` — `getLicense`, `requireSeatAvailable`, `TIERS`
- `desktop/license.js` — client-side `verifyLicense` + `TIER_LIMITS`
- `scripts/license/generate-license.mjs` — CCL HQ signing CLI
- `scripts/license/generate-keypair.mjs` — Ed25519 keypair generator
- `docs/SECURITY.md §3` — license verification chain
- `docs/ARCHITECTURE.md §5` — license flow diagram
- ADR-0003 — Ed25519 license signing (asymmetric replaces HMAC)
