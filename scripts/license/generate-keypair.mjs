#!/usr/bin/env node
/**
 * generate-keypair.mjs — generate Ed25519 license signing keypair.
 *
 * Run on a SECURE machine (preferably air-gapped). Output:
 *   - private.pem  (PKCS#8) — KEEP OFFLINE. Used by generate-license.mjs.
 *   - public.pem   (SPKI)   — bake into client app via OPS_LICENSE_PUBKEY env
 *                            at build time, OR ship as resources/license-pubkey.pem.
 *
 * Usage:
 *   node scripts/license/generate-keypair.mjs prod-2026
 *
 * Output files:
 *   scripts/license/prod-2026-private.pem
 *   scripts/license/prod-2026-public.pem
 *
 * After generation:
 *   1. Move private.pem to offline vault (1Password / cold storage / USB-in-safe).
 *   2. NEVER commit private.pem to git.
 *   3. Bake public.pem into installer build:
 *        OPS_LICENSE_PUBKEY="$(cat prod-2026-public.pem)" \
 *          npx electron-builder --mac --arm64
 *      OR copy to:
 *        cp prod-2026-public.pem desktop/license-pubkey.pem
 *      and add to electron-builder config.extraResources.
 *   4. Schedule re-keying — see ROTATION RUNBOOK in this file's footer.
 */
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function main() {
  const label = process.argv[2];
  if (!label || !/^[\w-]+$/.test(label)) {
    console.error('Usage: node generate-keypair.mjs <label>');
    console.error('  Label must match /^[\\w-]+$/. Suggested: prod-YYYY or env-region.');
    process.exit(1);
  }

  const privPath = path.join(__dirname, `${label}-private.pem`);
  const pubPath  = path.join(__dirname, `${label}-public.pem`);

  if (fs.existsSync(privPath) || fs.existsSync(pubPath)) {
    console.error(`Refusing to overwrite existing keys at ${label}-*.pem`);
    console.error('Pick a different label or move the existing keys first.');
    process.exit(1);
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  fs.writeFileSync(privPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  fs.writeFileSync(pubPath,  publicKey.export({ format: 'pem', type: 'spki' }),    { mode: 0o644 });

  console.log(`✅ Generated Ed25519 keypair "${label}"`);
  console.log(`   private (chmod 600): ${privPath}`);
  console.log(`   public               : ${pubPath}`);
  console.log('');
  console.log('🔒 NEXT STEPS:');
  console.log(`   1. Move ${path.basename(privPath)} to offline vault. NEVER commit.`);
  console.log(`   2. Add to .gitignore: scripts/license/*-private.pem`);
  console.log(`   3. Bake public key into installer build:`);
  console.log(`        OPS_LICENSE_PUBKEY="$(cat ${path.basename(pubPath)})" npm run desktop:build:mac`);
  console.log(`   4. Document this label + creation date in docs/SECURITY.md key-rotation log.`);
}

main();

/* ─────────────────────────────────────────────────────────────────
 * KEY ROTATION RUNBOOK
 * ─────────────────────────────────────────────────────────────────
 *
 * When to rotate:
 *   - Suspected private-key compromise (e.g. laptop with key was stolen)
 *   - Annual cycle (recommended for production)
 *   - Compliance mandate (e.g. ISO/TS audit finding)
 *
 * Effect of rotation:
 *   - All licenses signed with the OLD private key still verify against
 *     the OLD public key BAKED INTO existing installs. They keep working
 *     until either:
 *       (a) the license itself expires (`expires_at`)
 *       (b) the customer updates to a new installer build that ships
 *           the NEW public key — old licenses then fail with bad-signature
 *   - NEW licenses signed with the NEW key only verify on installs that
 *     ship the NEW public key.
 *
 * Procedure:
 *   1. Generate new keypair with this script:
 *        node scripts/license/generate-keypair.mjs prod-2027
 *
 *   2. PRE-RELEASE phase (overlap window):
 *      - Build installer with BOTH keys verified — bake an array of
 *        public keys so the verifier accepts either signature.
 *        (This requires extending desktop/license.js#getPublicKey to
 *        return an array and verifyLicense to try each in turn.)
 *      - Customers update to the new installer.
 *      - All NEW licenses still signed with OLD key.
 *
 *   3. CUTOVER:
 *      - When >95% of customers on new installer:
 *        switch generate-license.mjs to use NEW private key.
 *      - All new licenses signed with NEW key.
 *      - Customers still on old installer have a grace period equal
 *        to their license's expires_at.
 *
 *   4. OLD KEY RETIREMENT:
 *      - When all old-installer customers have either upgraded or
 *        let their license lapse:
 *        ship installer that drops the OLD key from the verifier.
 *      - Move old private key to "expired" archive (still keep — for
 *        forensic verification of historical licenses if needed).
 *
 * Document each rotation in docs/SECURITY.md with: label, date,
 * reason, customers affected, rollback decision deadline.
 * ───────────────────────────────────────────────────────────────── */
