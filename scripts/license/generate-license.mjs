#!/usr/bin/env node
/**
 * generate-license.mjs — Ed25519 license signer (CCL HQ ops tool).
 *
 * Run on the CCL HQ secure machine that holds the private key.
 * Signs a v2 license JSON for a customer and prints / writes it.
 *
 * Usage:
 *   node scripts/license/generate-license.mjs \
 *     --installation-id <hex64 from customer> \
 *     --customer "CCL Design Vietnam — Plant Hai Phong" \
 *     --tier M \
 *     --expires 2027-04-29 \
 *     [--features costing,library,sales,planning,quality,mes] \
 *     [--privkey scripts/license/dev-private.pem] \
 *     [--out license.json]
 *
 * Output: license.json (or stdout) with embedded Ed25519 signature.
 *
 * Security:
 *   - Production usage MUST point --privkey at the offline-stored
 *     production private key. The dev key checked into the repo is for
 *     development licenses only and is paired with the dev pubkey
 *     embedded in `desktop/license.js`.
 *   - Customer obtains `installation_id` from their installed app
 *     (Settings → License → Copy Installation ID) and emails CCL HQ.
 *   - The signed license file is then sent back and applied via
 *     Settings → License → Apply.
 */
import { createPrivateKey, sign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIER_LIMITS = { S: 15, M: 20, L: 50 };
const SIGNED_FIELDS = [
  'version',
  'installation_id',
  'customer',
  'tier',
  'max_users',
  'issued_at',
  'expires_at',
  'features',
];

function canonicalize(payload) {
  const norm = (v) => (Array.isArray(v) ? [...v].sort().join(',') : (v ?? ''));
  return SIGNED_FIELDS.map((k) => `${k}=${norm(payload[k])}`).join('|');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    args[k] = argv[i + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const required = ['installation-id', 'customer', 'tier', 'expires'];
  for (const k of required) {
    if (!args[k]) {
      console.error(`Missing --${k}`);
      console.error('Usage: see file header');
      process.exit(1);
    }
  }
  const tier = args.tier.toUpperCase();
  if (!TIER_LIMITS[tier]) {
    console.error(`Bad tier "${args.tier}". Must be one of: S, M, L.`);
    process.exit(1);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const keyPath = args.privkey || path.join(here, 'dev-private.pem');
  if (!fs.existsSync(keyPath)) {
    console.error(`Private key not found at ${keyPath}`);
    process.exit(1);
  }
  const privateKey = createPrivateKey(fs.readFileSync(keyPath, 'utf8'));

  const features = args.features
    ? args.features
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['costing', 'library', 'sales', 'planning', 'quality', 'mes'];

  const payload = {
    version: 2,
    installation_id: String(args['installation-id']).trim(),
    customer: String(args.customer).trim(),
    tier,
    max_users: TIER_LIMITS[tier],
    issued_at: new Date().toISOString(),
    expires_at: new Date(args.expires + 'T00:00:00Z').toISOString(),
    features,
  };

  const sig = sign(null, Buffer.from(canonicalize(payload)), privateKey).toString('base64');
  const license = { ...payload, signature: sig };

  const out = args.out;
  if (out) {
    fs.writeFileSync(out, JSON.stringify(license, null, 2), 'utf8');
    console.log(`License written to ${out}`);
  } else {
    console.log(JSON.stringify(license, null, 2));
  }
}

main();
